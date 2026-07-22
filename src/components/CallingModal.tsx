import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Volume2, VolumeX, AlertTriangle, ShieldCheck, SwitchCamera, RefreshCw } from 'lucide-react';
import { User, CallState } from '../types';

interface CallingModalProps {
  callState: CallState;
  partner: User;
  currentUser?: User;
  socket?: any;
  onAccept: () => void;
  onDecline: () => void;
  onEndCall: (durationSeconds?: number) => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

export default function CallingModal({
  callState,
  partner,
  currentUser,
  socket,
  onAccept,
  onDecline,
  onEndCall,
}: CallingModalProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [timerString, setTimerString] = useState('00:00');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [statusText, setStatusText] = useState<string>('');

  const durationRef = useRef(0);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const ringingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Derive target partner ID
  const partnerId = partner?.id || callState.partnerId;

  // Set readable status text
  useEffect(() => {
    switch (callState.status) {
      case 'calling':
        setStatusText('Calling...');
        break;
      case 'ringing':
        setStatusText('Ringing...');
        break;
      case 'connecting':
        setStatusText('Connecting WebRTC...');
        break;
      case 'connected':
        setStatusText('Connected');
        break;
      case 'busy':
        setStatusText('User is Busy');
        break;
      case 'rejected':
        setStatusText('Call Declined');
        break;
      case 'cancelled':
        setStatusText('Call Cancelled');
        break;
      case 'missed':
        setStatusText('Missed Call');
        break;
      case 'ended':
        setStatusText('Call Ended');
        break;
      default:
        setStatusText('');
    }
  }, [callState.status]);

  // Handle call duration timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (callState.status === 'connected') {
      const startTime = Date.now() - (callState.durationSeconds * 1000);
      interval = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        durationRef.current = elapsedSeconds;
        const mins = Math.floor(elapsedSeconds / 60);
        const secs = elapsedSeconds % 60;
        setTimerString(
          `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        );
      }, 1000);
    } else {
      setTimerString('00:00');
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callState.status, callState.durationSeconds]);

  // Ringing/Calling/Connecting Timeouts
  useEffect(() => {
    let connTimeout: NodeJS.Timeout | null = null;

    if (callState.status === 'calling' || callState.status === 'ringing') {
      ringingTimeoutRef.current = setTimeout(() => {
        if (socket && partnerId && callState.callId) {
          if (callState.isIncoming) {
            socket.emit('missed_call', { callId: callState.callId, partnerId });
          } else {
            socket.emit('cancel_call', { callId: callState.callId, partnerId });
          }
        }
        onEndCall(0);
      }, 30000);
    } else {
      if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
    }

    if (callState.status === 'connecting') {
      connTimeout = setTimeout(() => {
        console.warn("WebRTC connection timed out after 15 seconds");
        if (socket && partnerId && callState.callId) {
          socket.emit('end_call', { callId: callState.callId, partnerId, durationSeconds: 0 });
        }
        onEndCall(0);
      }, 15000);
    }

    return () => {
      if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
      if (connTimeout) clearTimeout(connTimeout);
    };
  }, [callState.status, callState.isIncoming, callState.callId, partnerId, socket, onEndCall]);

  // Initialize Media Stream
  const initLocalMedia = useCallback(async (facing: 'user' | 'environment' = 'user') => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: callState.type === 'video' ? { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } } : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      setPermissionError(null);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      return stream;
    } catch (err: any) {
      console.warn('Full media stream failed, trying audio only or canvas fallback:', err);
      try {
        const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setLocalStream(audioOnlyStream);
        setPermissionError(callState.type === 'video' ? 'Camera access unavailable. Using audio only.' : null);
        return audioOnlyStream;
      } catch (err2) {
        // Fallback simulated stream for sandbox environments
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          let angle = 0;
          const intervalId = setInterval(() => {
            ctx.fillStyle = '#090d16';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(160, 120, 30 + Math.sin(angle) * 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.font = 'bold 12px sans-serif';
            ctx.fillStyle = '#10b981';
            ctx.textAlign = 'center';
            ctx.fillText('CAMERA PREVIEW', 160, 180);
            angle += 0.1;
          }, 100);

          const mockStream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : null;
          if (mockStream) {
            setLocalStream(mockStream);
            setPermissionError('Camera is sandboxed. Showing simulated feed.');
            return mockStream;
          }
        }
      }
    }
    return null;
  }, [callState.type]);

  // Create WebRTC PeerConnection
  const createPeerConnection = useCallback((stream: MediaStream) => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    // Add local stream tracks to PC
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // Handle incoming remote tracks
    pc.ontrack = (event) => {
      console.log('WebRTC: Remote track received:', event.track.kind);
      let rStream = remoteStream;
      if (!rStream) {
        rStream = new MediaStream();
        setRemoteStream(rStream);
      }
      rStream.addTrack(event.track);

      if (callState.type === 'video' && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = rStream;
      } else if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = rStream;
      }
    };

    // Handle ICE Candidate generation
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && partnerId) {
        socket.emit('webrtc_ice_candidate', {
          callId: callState.callId,
          candidate: event.candidate,
          targetId: partnerId,
        });
      }
    };

    // Handle Connection State & Auto Reconnect
    pc.onconnectionstatechange = () => {
      console.log('WebRTC Connection State:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setIsReconnecting(false);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setIsReconnecting(true);
        // Attempt ICE restart
        if (pc.signalingState !== 'closed') {
          pc.createOffer({ iceRestart: true })
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              if (socket && partnerId) {
                socket.emit('webrtc_reconnect_request', { callId: callState.callId, targetId: partnerId });
                socket.emit('webrtc_offer', { callId: callState.callId, sdp: pc.localDescription, targetId: partnerId });
              }
            })
            .catch((e) => console.error('ICE restart offer error:', e));
        }
      }
    };

    return pc;
  }, [callState.callId, callState.type, partnerId, socket, remoteStream]);

  // WebRTC Signaling Event Listeners
  useEffect(() => {
    if (!socket || !partnerId) return;

    // Handle WebRTC Offer
    const handleOffer = async ({ sdp, senderId }: any) => {
      if (senderId !== partnerId) return;
      console.log('WebRTC: Received Offer');

      let stream = localStream;
      if (!stream) {
        stream = await initLocalMedia();
      }
      if (!stream) return;

      const pc = createPeerConnection(stream);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Process queued candidates
      while (iceCandidateQueueRef.current.length > 0) {
        const candidate = iceCandidateQueueRef.current.shift();
        if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('webrtc_answer', {
        callId: callState.callId,
        sdp: answer,
        targetId: partnerId,
      });
    };

    // Handle WebRTC Answer
    const handleAnswer = async ({ sdp, senderId }: any) => {
      if (senderId !== partnerId) return;
      console.log('WebRTC: Received Answer');
      const pc = peerConnectionRef.current;
      if (pc && pc.signalingState !== 'closed') {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        // Process queued candidates
        while (iceCandidateQueueRef.current.length > 0) {
          const candidate = iceCandidateQueueRef.current.shift();
          if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      }
    };

    // Handle ICE Candidate
    const handleIceCandidate = async ({ candidate, senderId }: any) => {
      if (senderId !== partnerId) return;
      const pc = peerConnectionRef.current;
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        iceCandidateQueueRef.current.push(candidate);
      }
    };

    // Handle Reconnect Request
    const handleReconnectRequest = async ({ senderId }: any) => {
      if (senderId !== partnerId) return;
      setIsReconnecting(true);
    };

    socket.on('webrtc_offer', handleOffer);
    socket.on('webrtc_answer', handleAnswer);
    socket.on('webrtc_ice_candidate', handleIceCandidate);
    socket.on('webrtc_reconnect_request', handleReconnectRequest);

    return () => {
      socket.off('webrtc_offer', handleOffer);
      socket.off('webrtc_answer', handleAnswer);
      socket.off('webrtc_ice_candidate', handleIceCandidate);
      socket.off('webrtc_reconnect_request', handleReconnectRequest);
    };
  }, [socket, partnerId, callState.callId, localStream, initLocalMedia, createPeerConnection]);

  // Start Call Sequence on Answer / Connect
  useEffect(() => {
    let active = true;

    const setupCall = async () => {
      if (callState.status === 'connecting' || callState.status === 'connected') {
        let stream = localStream;
        if (!stream) {
          stream = await initLocalMedia();
        }
        if (!stream || !active) return;

        const pc = createPeerConnection(stream);

        // Caller initiates the SDP offer
        if (!callState.isIncoming && pc.signalingState === 'stable') {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          socket?.emit('webrtc_offer', {
            callId: callState.callId,
            sdp: offer,
            targetId: partnerId,
          });
        }
      }
    };

    setupCall();

    return () => {
      active = false;
    };
  }, [callState.status, callState.isIncoming, callState.callId, partnerId, socket, localStream, initLocalMedia, createPeerConnection]);

  // Initial media capture for pre-connection status (calling / ringing)
  useEffect(() => {
    if (callState.status === 'calling' || callState.status === 'ringing') {
      initLocalMedia();
    }
  }, [callState.status, initLocalMedia]);

  // Handle Network Disconnect / Online Auto Reconnect
  useEffect(() => {
    const handleOnline = () => {
      setIsReconnecting(false);
      if (socket && partnerId && callState.callId) {
        socket.emit('webrtc_reconnect_request', { callId: callState.callId, targetId: partnerId });
      }
    };

    const handleOffline = () => {
      setIsReconnecting(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [socket, partnerId, callState.callId]);

  // Clean up WebRTC & Media Tracks on Unmount or End
  useEffect(() => {
    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Controls: Mute Audio
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = isMuted;
      });
    }
    setIsMuted(!isMuted);
  };

  // Controls: Camera On/Off
  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = isVideoOff;
      });
    }
    setIsVideoOff(!isVideoOff);
  };

  // Controls: Switch Front/Back Camera
  const switchCamera = async () => {
    const newFacing = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(newFacing);

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: !isMuted,
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack && peerConnectionRef.current) {
        const senders = peerConnectionRef.current.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(newVideoTrack);
        }
      }

      if (localStream) {
        const oldVideoTrack = localStream.getVideoTracks()[0];
        if (oldVideoTrack) oldVideoTrack.stop();
        localStream.removeTrack(oldVideoTrack);
        localStream.addTrack(newVideoTrack);
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
    } catch (err) {
      console.warn('Switch camera error:', err);
    }
  };

  // Controls: Toggle Speaker
  const toggleSpeaker = () => {
    const newSpeaker = !isSpeakerOn;
    setIsSpeakerOn(newSpeaker);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !newSpeaker;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !newSpeaker;
    }
  };

  // Handle Hangup End Call
  const handleEndCallClick = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    onEndCall(durationRef.current);
  };

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-50 p-4 select-none overflow-hidden text-slate-100">
      {/* Background ambient blurring circle */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-[100px] -z-10" />

      {/* Top Header Security details */}
      <div className="absolute top-6 left-6 flex items-center gap-2 text-xs bg-slate-900/60 border border-slate-800/80 backdrop-blur px-3 py-1.5 rounded-full text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>End-to-End Encrypted WebRTC Call</span>
      </div>

      {/* Reconnecting banner */}
      {isReconnecting && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs px-4 py-1.5 rounded-full flex items-center gap-2 backdrop-blur animate-pulse z-20">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Reconnecting media network...</span>
        </div>
      )}

      {/* Status indicator banner */}
      <div className="flex flex-col items-center text-center max-w-sm mt-12 mb-6">
        <div className="relative mb-6">
          <img
            src={partner.avatar || partner.photoURL}
            alt={partner.name}
            className={`w-24 h-24 rounded-full object-cover border-4 border-slate-900 shadow-2xl relative z-10 ${
              callState.status === 'ringing' || callState.status === 'calling' ? 'animate-pulse' : ''
            }`}
            referrerPolicy="no-referrer"
          />
          {(callState.status === 'ringing' || callState.status === 'calling') && (
            <>
              <div className="absolute inset-0 bg-emerald-500/30 rounded-full animate-ping z-0 scale-125" />
              <div className="absolute inset-0 bg-emerald-500/15 rounded-full animate-ping z-0 scale-150 delay-75" />
            </>
          )}
        </div>

        <h2 className="text-2xl font-bold text-slate-100 mb-1">{partner.name}</h2>

        {/* Status badges */}
        <div className="flex items-center gap-2 mt-1">
          {callState.status === 'calling' && (
            <span className="text-sm font-medium text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" />
              Calling...
            </span>
          )}
          {callState.status === 'ringing' && (
            <span className="text-sm font-medium text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Ringing...
            </span>
          )}
          {callState.status === 'connecting' && (
            <span className="text-sm font-medium text-sky-400 uppercase tracking-widest flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Connecting...
            </span>
          )}
          {callState.status === 'connected' && (
            <div className="flex flex-col items-center">
              <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-0.5">Connected</span>
              <span className="text-2xl font-mono font-medium text-slate-100 bg-slate-900/60 border border-slate-800/80 px-3 py-0.5 rounded-lg">
                {timerString}
              </span>
            </div>
          )}
          {['busy', 'rejected', 'cancelled', 'missed', 'ended'].includes(callState.status) && (
            <span className="text-sm font-medium text-rose-400 uppercase tracking-widest">
              {statusText}
            </span>
          )}
        </div>
      </div>

      {/* Video Screens Section */}
      {callState.type === 'video' && (
        <div className="relative w-full max-w-md h-[280px] sm:h-[340px] bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center my-4">
          {/* Remote Feed */}
          {callState.status === 'connected' ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center text-slate-400 p-6">
              <Video className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-xs font-medium">Video feed will start once connected</p>
            </div>
          )}

          {/* Hidden Audio element for remote voice stream fallback */}
          <audio ref={remoteAudioRef} autoPlay playsInline />

          {/* Local User Preview */}
          <div className="absolute bottom-4 right-4 w-28 h-36 bg-slate-950 border-2 border-slate-800 rounded-xl overflow-hidden shadow-2xl flex items-center justify-center">
            {isVideoOff ? (
              <div className="text-center p-2 text-slate-500">
                <VideoOff className="w-5 h-5 mx-auto mb-1" />
                <span className="text-[9px]">Camera Off</span>
              </div>
            ) : permissionError ? (
              <div className="text-center p-2 text-amber-500/80 leading-tight">
                <AlertTriangle className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                <span className="text-[8px] font-sans block">Preview Disabled</span>
              </div>
            ) : (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover transform -scale-x-100"
              />
            )}
            <span className="absolute bottom-1 left-1.5 text-[8px] bg-slate-900/80 px-1 py-0.5 rounded text-slate-300 font-sans">
              You
            </span>
          </div>

          {/* Camera Switch button overlay */}
          {!isVideoOff && !permissionError && (
            <button
              onClick={switchCamera}
              title="Switch Front/Back Camera"
              className="absolute top-3 right-3 p-2 rounded-full bg-slate-900/80 border border-slate-700/80 text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>
          )}

          {/* Permission Error Notice */}
          {permissionError && !isVideoOff && (
            <div className="absolute top-4 left-4 right-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5 backdrop-blur-md flex items-start gap-2 max-w-[90%]">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-semibold text-amber-400">Media Stream Notice</p>
                <p className="text-[9px] text-slate-300 leading-normal">{permissionError}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Voice Call Indicator */}
      {callState.type === 'audio' && (
        <div className="flex-1 flex items-center justify-center my-6">
          <audio ref={remoteAudioRef} autoPlay playsInline />
          <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur rounded-2xl p-6 text-center max-w-sm">
            <Volume2 className="w-12 h-12 text-emerald-400 mx-auto mb-3 animate-pulse" />
            <p className="text-sm font-semibold text-slate-200">Voice Calling Mode Active</p>
            <p className="text-xs text-slate-400 mt-1">Real-time encrypted WebRTC audio stream.</p>
          </div>
        </div>
      )}

      {/* Control Actions Panel */}
      <div className="mt-auto mb-8 flex flex-col items-center gap-6 w-full max-w-md">
        {callState.status === 'ringing' && callState.isIncoming ? (
          <div className="flex items-center gap-12">
            {/* Reject/Decline Button */}
            <button
              onClick={onDecline}
              className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg transform active:scale-95 transition-all cursor-pointer"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            {/* Accept Button */}
            <button
              onClick={onAccept}
              className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white flex items-center justify-center shadow-lg transform hover:scale-105 active:scale-95 transition-all cursor-pointer animate-bounce"
            >
              <Phone className="w-7 h-7" />
            </button>
          </div>
        ) : (
          /* Active / Calling / Connected Controls */
          <div className="flex items-center gap-4 sm:gap-5">
            {/* Mute Audio */}
            <button
              onClick={toggleMute}
              title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
              className={`w-12 h-12 rounded-full flex items-center justify-center border transition-colors cursor-pointer ${
                isMuted
                  ? 'bg-rose-600/20 border-rose-500/30 text-rose-400 hover:bg-rose-600/30'
                  : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Toggle Video */}
            {callState.type === 'video' && (
              <button
                onClick={toggleVideo}
                title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
                className={`w-12 h-12 rounded-full flex items-center justify-center border transition-colors cursor-pointer ${
                  isVideoOff
                    ? 'bg-rose-600/20 border-rose-500/30 text-rose-400 hover:bg-rose-600/30'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            )}

            {/* Toggle Speaker */}
            <button
              onClick={toggleSpeaker}
              title={isSpeakerOn ? 'Speaker Off' : 'Speaker On'}
              className={`w-12 h-12 rounded-full flex items-center justify-center border transition-colors cursor-pointer ${
                isSpeakerOn
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>

            {/* Switch Camera (if video) */}
            {callState.type === 'video' && !isVideoOff && (
              <button
                onClick={switchCamera}
                title="Switch Camera"
                className="w-12 h-12 rounded-full flex items-center justify-center border bg-slate-900/80 border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <SwitchCamera className="w-5 h-5" />
              </button>
            )}

            {/* End Call Button */}
            <button
              onClick={handleEndCallClick}
              title="End Call"
              className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg hover:rotate-135 transition-all duration-300 active:scale-95 cursor-pointer ml-2"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </div>
        )}

        {/* Footer text */}
        <p className="text-[10px] text-slate-500 text-center uppercase tracking-wider">
          {callState.status === 'connected' ? 'Session Active' : 'Establishing Peer Connection'}
        </p>
      </div>
    </div>
  );
}
