import React, { useState, useRef, useEffect } from 'react';
import { 
  Phone, Video, Send, Image as ImageIcon, Mic, Play, Pause, 
  Check, CheckCheck, Smile, Paperclip, MoreVertical, Eye, 
  Volume2, Trash2, Edit3, CornerUpLeft, Clock, FileText, 
  Film, Download, X, Square, AlertCircle, Sparkles, Ban, Camera, ArrowLeft
} from 'lucide-react';
import { User, Message, MessageType, ReplyToPayload } from '../types';

interface ChatAreaProps {
  partner: User;
  currentUser: User;
  messages: Message[];
  onSendMessage: (
    content: string, 
    type: MessageType, 
    mediaUrl?: string, 
    duration?: string, 
    replyTo?: ReplyToPayload, 
    fileName?: string, 
    fileSize?: string
  ) => void;
  onOpenProfile: (user: User) => void;
  onInitiateCall: (type: 'audio' | 'video') => void;
  onTyping?: (isTyping: boolean) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onDeleteForMe?: (messageId: string) => void;
  onDeleteForEveryone?: (messageId: string) => void;
  onMarkRead?: (partnerId: string) => void;
  onBack?: () => void;
}

export default function ChatArea({
  partner,
  currentUser,
  messages,
  onSendMessage,
  onOpenProfile,
  onInitiateCall,
  onTyping,
  onEditMessage,
  onDeleteForMe,
  onDeleteForEveryone,
  onMarkRead,
  onBack,
}: ChatAreaProps) {
  const [inputText, setInputText] = useState('');
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioPlaybackProgress, setAudioPlaybackProgress] = useState<Record<string, number>>({});
  
  // Feature states
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  const [activeMenuMsgId, setActiveMenuMsgId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Voice recording state
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const voiceSecondsRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Audio HTML elements map
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Trigger mark read when partner chat is active
  useEffect(() => {
    if (onMarkRead && partner?.id) {
      onMarkRead(partner.id);
    }
  }, [partner?.id, messages.length]);

  // Handle Typing indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (onTyping) {
      onTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 2000);
    }
  };

  const handleSend = () => {
    if (!inputText.trim()) return;
    
    if (editingMessage && onEditMessage) {
      onEditMessage(editingMessage.id, inputText.trim());
      setEditingMessage(null);
      setInputText('');
      return;
    }

    const replyPayload: ReplyToPayload | undefined = replyToMessage ? {
      id: replyToMessage.id,
      content: replyToMessage.content,
      senderName: replyToMessage.senderId === currentUser.id ? currentUser.name : partner.name,
      type: replyToMessage.type
    } : undefined;

    onSendMessage(inputText.trim(), 'text', undefined, undefined, replyPayload);
    setInputText('');
    setReplyToMessage(null);
    setShowEmojiPicker(false);

    if (onTyping) {
      onTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
  };

  // Upload file handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentUser.id}` },
        body: formData,
      });
      const data = await res.json();
      setIsUploading(false);

      if (data.status === 'success') {
        let msgType: MessageType = 'file';
        if (file.type.startsWith('image/')) msgType = 'image';
        else if (file.type.startsWith('video/')) msgType = 'video';
        else if (file.type.startsWith('audio/')) msgType = 'audio';

        const replyPayload: ReplyToPayload | undefined = replyToMessage ? {
          id: replyToMessage.id,
          content: replyToMessage.content,
          senderName: replyToMessage.senderId === currentUser.id ? currentUser.name : partner.name,
          type: replyToMessage.type
        } : undefined;

        onSendMessage(
          file.name,
          msgType,
          data.mediaUrl,
          undefined,
          replyPayload,
          data.fileName || file.name,
          data.fileSize || `${(file.size / 1024).toFixed(1)} KB`
        );
        setReplyToMessage(null);
      }
    } catch (err) {
      setIsUploading(false);
      console.error("Failed to upload media:", err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Start Voice note recording
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());

        const formData = new FormData();
        formData.append('file', audioBlob, 'voicenote.webm');

        try {
          setIsUploading(true);
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { Authorization: `Bearer ${currentUser.id}` },
            body: formData,
          });
          const data = await res.json();
          setIsUploading(false);

          if (data.status === 'success') {
            const durationSecs = voiceSecondsRef.current;
            const mins = Math.floor(durationSecs / 60);
            const secs = durationSecs % 60;
            const formattedDuration = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

            onSendMessage('Voice Message', 'audio', data.mediaUrl, formattedDuration);
          }
        } catch (err) {
          setIsUploading(false);
        }
      };

      mediaRecorder.start();
      setIsRecordingVoice(true);
      setVoiceSeconds(0);
      voiceSecondsRef.current = 0;

      recordingTimerRef.current = setInterval(() => {
        setVoiceSeconds((prev) => {
          const next = prev + 1;
          voiceSecondsRef.current = next;
          return next;
        });
      }, 1000);
    } catch (err) {
      alert("Microphone access is required to record voice messages.");
    }
  };

  const stopVoiceRecording = (cancel = false) => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    setIsRecordingVoice(false);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      if (cancel) {
        audioChunksRef.current = [];
        mediaRecorderRef.current.stop();
      } else {
        mediaRecorderRef.current.stop();
      }
    }
  };

  // Quick Emoji picker items
  const emojis = ['😊', '❤️', '👍', '🔥', '🎉', '😂', '👏', '🚀', '🙌', '😍', '✨', '💯'];

  const handleSelectEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
  };

  // Audio Playback handler
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (playingAudioId) {
      interval = setInterval(() => {
        setAudioPlaybackProgress((prev) => {
          const current = prev[playingAudioId] || 0;
          if (current >= 100) {
            setPlayingAudioId(null);
            return { ...prev, [playingAudioId]: 0 };
          }
          return { ...prev, [playingAudioId]: current + 5 };
        });
      }, 200);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [playingAudioId]);

  const toggleAudioPlayback = (messageId: string, mediaUrl?: string) => {
    if (playingAudioId === messageId) {
      setPlayingAudioId(null);
      if (audioRefs.current[messageId]) {
        audioRefs.current[messageId]?.pause();
      }
    } else {
      if (playingAudioId && audioRefs.current[playingAudioId]) {
        audioRefs.current[playingAudioId]?.pause();
      }
      setPlayingAudioId(messageId);
      if (mediaUrl && audioRefs.current[messageId]) {
        audioRefs.current[messageId]?.play().catch(() => {});
      }
    }
  };

  return (
    <div className="w-full h-full absolute inset-0 bg-slate-950 flex flex-col overflow-hidden text-slate-100">
      
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept="image/*"
        capture="environment"
      />
      <input
        type="file"
        ref={galleryInputRef}
        onChange={handleFileUpload}
        className="hidden"
        accept="image/*"
      />

      {/* Header with profile toggle and calling features */}
      <div className="px-3 py-3 border-b border-slate-800 bg-slate-900 flex items-center justify-between gap-2 shadow-md z-10 w-full overflow-hidden">
        
        {/* Profile details navigation */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 -ml-1 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title="Back to Inbox"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div 
            onClick={() => onOpenProfile(partner)}
            className="relative cursor-pointer hover:opacity-90 transition-opacity shrink-0"
            id={`header-avatar-${partner.id}`}
          >
            <img
              src={partner.avatar}
              alt={partner.name}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border border-slate-750"
              referrerPolicy="no-referrer"
            />
            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
              partner.isOnline ? 'bg-emerald-500' : 'bg-slate-500'
            }`} />
          </div>

          <div className="min-w-0 flex-1 pr-1">
            <h3 
              onClick={() => onOpenProfile(partner)}
              className="text-sm font-bold text-slate-100 hover:text-emerald-400 transition-colors cursor-pointer select-none truncate block w-full"
              id={`header-username-${partner.id}`}
            >
              {partner.name}
            </h3>
            
            <p className="text-xs text-slate-400 truncate select-none">
              {partner.typingTo === currentUser.id ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                  typing...
                </span>
              ) : partner.isOnline ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  online
                </span>
              ) : (
                `last active ${partner.lastSeen || 'recently'}`
              )}
            </p>
          </div>
        </div>

        {/* Calling action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onInitiateCall('audio')}
            className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Audio Voice Call"
            id={`audio-call-${partner.id}`}
          >
            <Phone className="w-4 h-4 text-emerald-400" />
          </button>

          <button
            onClick={() => onInitiateCall('video')}
            className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Video Camera Call"
            id={`video-call-${partner.id}`}
          >
            <Video className="w-4 h-4 text-emerald-400" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div 
        onClick={() => setActiveMenuMsgId(null)}
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900/60 via-slate-950 to-slate-950"
      >
        <div className="flex justify-center mb-4">
          <span className="text-[10px] bg-slate-900/90 text-slate-400 border border-slate-800 px-3 py-1 rounded-full text-center">
            🔐 Messages are end-to-end encrypted. Socket.IO + Supabase Realtime Storage.
          </span>
        </div>

        {messages
          .filter((m) => !m.deletedFor?.includes(currentUser.id))
          .map((message) => {
            const isMe = message.senderId === currentUser.id;
            const isMenuOpen = activeMenuMsgId === message.id;

            return (
              <div
                key={message.id}
                className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-150 group relative`}
                id={`message-${message.id}`}
              >
                {!isMe && (
                  <img
                    src={partner.avatar}
                    alt={partner.name}
                    onClick={() => onOpenProfile(partner)}
                    className="w-7 h-7 rounded-full object-cover cursor-pointer hover:opacity-85 transition-opacity mb-1 border border-slate-800 shrink-0"
                  />
                )}

                {/* Context Menu Trigger for Desktop / Mobile */}
                <div className={`relative max-w-[75%] rounded-2xl px-4 py-3 shadow-md flex flex-col ${
                  isMe
                    ? 'bg-emerald-600/90 text-slate-50 border border-emerald-500/10 rounded-br-sm'
                    : 'bg-slate-900/90 text-slate-200 border border-slate-800 rounded-bl-sm'
                }`}>

                  {/* Message Context Options Trigger */}
                  {!message.isDeletedForEveryone && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuMsgId(isMenuOpen ? null : message.id);
                      }}
                      className="absolute top-2 right-2 p-1 text-slate-400 hover:text-white rounded bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
                      title="Options"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Options Dropdown Menu */}
                  {isMenuOpen && (
                    <div 
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-8 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1.5 z-30 min-w-[150px] flex flex-col gap-1 text-xs"
                    >
                      <button
                        onClick={() => {
                          setReplyToMessage(message);
                          setActiveMenuMsgId(null);
                        }}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 cursor-pointer text-left"
                      >
                        <CornerUpLeft className="w-3.5 h-3.5 text-emerald-400" />
                        Reply
                      </button>

                      {isMe && message.type === 'text' && !message.isDeletedForEveryone && (
                        <button
                          onClick={() => {
                            setEditingMessage(message);
                            setInputText(message.content);
                            setActiveMenuMsgId(null);
                          }}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 cursor-pointer text-left"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                          Edit Message
                        </button>
                      )}

                      <button
                        onClick={() => {
                          if (onDeleteForMe) onDeleteForMe(message.id);
                          setActiveMenuMsgId(null);
                        }}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-rose-300 cursor-pointer text-left"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete for Me
                      </button>

                      {isMe && !message.isDeletedForEveryone && (
                        <button
                          onClick={() => {
                            if (onDeleteForEveryone) onDeleteForEveryone(message.id);
                            setActiveMenuMsgId(null);
                          }}
                          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-950/60 text-rose-300 cursor-pointer text-left font-semibold"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Delete for Everyone
                        </button>
                      )}
                    </div>
                  )}

                  {!isMe && (
                    <span 
                      onClick={() => onOpenProfile(partner)}
                      className="text-[10px] font-bold text-emerald-400 hover:underline cursor-pointer select-none mb-1 block"
                    >
                      {partner.name}
                    </span>
                  )}

                  {/* Replied Message Quote Header */}
                  {message.replyTo && !message.isDeletedForEveryone && (
                    <div className="mb-2 p-2 rounded-lg bg-slate-950/50 border-l-3 border-emerald-400 text-xs">
                      <span className="font-bold text-emerald-400 block text-[10px]">
                        {message.replyTo.senderName || 'Replied Message'}
                      </span>
                      <p className="text-slate-300 truncate text-[11px] mt-0.5">
                        {message.replyTo.content}
                      </p>
                    </div>
                  )}

                  {/* DELETED FOR EVERYONE STATE */}
                  {message.isDeletedForEveryone ? (
                    <div className="flex items-center gap-1.5 text-xs italic text-slate-400 py-1">
                      <Ban className="w-3.5 h-3.5 text-slate-500" />
                      <span>This message was deleted</span>
                    </div>
                  ) : (
                    <>
                      {/* TEXT TYPE */}
                      {message.type === 'text' && (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap pr-4">
                          {message.content}
                        </p>
                      )}

                      {/* IMAGE TYPE */}
                      {message.type === 'image' && message.mediaUrl && (
                        <div className="space-y-1">
                          <div className="relative group rounded-lg overflow-hidden border border-slate-950/25 bg-slate-950/40">
                            <img 
                              src={message.mediaUrl} 
                              alt="Shared photo" 
                              className="max-h-60 w-full object-cover rounded-lg hover:scale-102 transition-transform duration-300"
                              referrerPolicy="no-referrer"
                            />
                            <a 
                              href={message.mediaUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              className="absolute bottom-2 right-2 bg-slate-950/60 p-1.5 rounded-md hover:bg-slate-950/80 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5 text-white" />
                            </a>
                          </div>
                          {message.content && message.content !== 'Photo attachment from gallery' && (
                            <p className="text-xs text-slate-300 mt-1">{message.content}</p>
                          )}
                        </div>
                      )}

                      {/* VIDEO TYPE */}
                      {message.type === 'video' && message.mediaUrl && (
                        <div className="space-y-1">
                          <video 
                            src={message.mediaUrl} 
                            controls 
                            className="max-h-60 w-full rounded-lg bg-black border border-slate-800"
                          />
                          {message.content && (
                            <p className="text-xs text-slate-300 mt-1">{message.content}</p>
                          )}
                        </div>
                      )}

                      {/* FILE TYPE */}
                      {message.type === 'file' && (
                        <div className="flex items-center gap-3 bg-slate-950/60 border border-slate-800 p-2.5 rounded-xl">
                          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
                            <FileText className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-200 truncate">
                              {message.fileName || message.content || 'Attached File'}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {message.fileSize || 'Document'}
                            </p>
                          </div>
                          {message.mediaUrl && (
                            <a
                              href={message.mediaUrl}
                              download
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      )}

                      {/* AUDIO VOICE MESSAGE TYPE */}
                      {message.type === 'audio' && (
                        <div className="flex items-center gap-3.5 min-w-[200px] py-1">
                          {message.mediaUrl && (
                            <audio
                              ref={(el) => (audioRefs.current[message.id] = el)}
                              src={message.mediaUrl}
                              onEnded={() => setPlayingAudioId(null)}
                              className="hidden"
                            />
                          )}

                          <button
                            onClick={() => toggleAudioPlayback(message.id, message.mediaUrl)}
                            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-colors shadow-sm ${
                              isMe 
                                ? 'bg-white text-emerald-700 hover:bg-slate-100' 
                                : 'bg-emerald-600 text-slate-100 hover:bg-emerald-500'
                            }`}
                          >
                            {playingAudioId === message.id ? (
                              <Pause className="w-4 h-4 fill-current" />
                            ) : (
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            )}
                          </button>

                          <div className="flex-1 flex flex-col gap-1.5">
                            <div className="flex items-end gap-0.5 h-6">
                              {[30, 60, 45, 90, 75, 40, 60, 80, 50, 70, 40, 60].map((height, i) => {
                                const progress = audioPlaybackProgress[message.id] || 0;
                                const isActive = playingAudioId === message.id && (i / 12) * 100 <= progress;
                                return (
                                  <span 
                                    key={i} 
                                    className={`w-0.75 rounded-full transition-colors ${
                                      isActive 
                                        ? (isMe ? 'bg-amber-300' : 'bg-emerald-400') 
                                        : (isMe ? 'bg-emerald-700/60' : 'bg-slate-700')
                                    }`}
                                    style={{ height: `${height}%` }}
                                  />
                                );
                              })}
                            </div>

                            <div className="relative h-1 w-full bg-slate-950/20 rounded-full overflow-hidden">
                              <div 
                                className={`absolute h-full left-0 top-0 transition-all duration-200 ${isMe ? 'bg-amber-300' : 'bg-emerald-500'}`}
                                style={{ width: `${audioPlaybackProgress[message.id] || 0}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex flex-col items-end justify-between self-stretch shrink-0">
                            <span className={`text-[10px] font-semibold ${isMe ? 'text-emerald-200' : 'text-slate-400'}`}>
                              {message.duration || '0:12'}
                            </span>
                            <Mic className={`w-3 h-3 ${isMe ? 'text-emerald-200' : 'text-slate-500'}`} />
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Timestamp & Status Ticks */}
                  <div className="flex items-center justify-end gap-1 mt-1.5">
                    {message.isEdited && !message.isDeletedForEveryone && (
                      <span className="text-[9px] text-amber-300/80 italic mr-1">(edited)</span>
                    )}
                    <span className={`text-[9px] ${isMe ? 'text-emerald-200/80' : 'text-slate-500'}`}>
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isMe && (
                      <span className="text-emerald-200 ml-0.5">
                        {message.status === 'sending' && <Clock className="w-3 h-3 text-emerald-200/60 animate-spin" />}
                        {message.status === 'sent' && <Check className="w-3 h-3" />}
                        {message.status === 'delivered' && <CheckCheck className="w-3 h-3 text-slate-300" />}
                        {(message.status === 'read' || message.status === 'seen') && (
                          <CheckCheck className="w-3 h-3 text-amber-300 font-bold" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Banner */}
      {replyToMessage && (
        <div className="bg-slate-900 border-t border-emerald-500/30 px-4 py-2 flex items-center justify-between text-xs animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 min-w-0">
            <CornerUpLeft className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-emerald-400 text-[11px] block">
                Replying to {replyToMessage.senderId === currentUser.id ? 'yourself' : partner.name}
              </span>
              <p className="text-slate-300 truncate text-xs">{replyToMessage.content}</p>
            </div>
          </div>
          <button
            onClick={() => setReplyToMessage(null)}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Editing Banner */}
      {editingMessage && (
        <div className="bg-slate-900 border-t border-amber-500/30 px-4 py-2 flex items-center justify-between text-xs animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 min-w-0">
            <Edit3 className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-amber-400 text-[11px] block">
                Editing message
              </span>
              <p className="text-slate-300 truncate text-xs">{editingMessage.content}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingMessage(null);
              setInputText('');
            }}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Voice Recording Overlay Bar */}
      {isRecordingVoice ? (
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between shadow-inner">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
            <span className="text-xs font-bold text-rose-400">
              Recording Voice Note ({Math.floor(voiceSeconds / 60)}:{(voiceSeconds % 60).toString().padStart(2, '0')})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => stopVoiceRecording(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-rose-300 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => stopVoiceRecording(false)}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow cursor-pointer flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Send Voice Note
            </button>
          </div>
        </div>
      ) : (
        /* Production Message Composer: Attachment, Camera, Gallery, Voice record, Text input, Send button */
        <div className="px-2 py-3 sm:p-4 bg-slate-900 border-t border-slate-800 flex items-center gap-1.5 sm:gap-3 shadow-inner w-full overflow-hidden">
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-slate-200 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            title="Attachment"
          >
            <Paperclip className={`w-4.5 h-4.5 sm:w-5 sm:h-5 ${isUploading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button 
            onClick={() => cameraInputRef.current?.click()}
            disabled={isUploading}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-slate-200 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            title="Camera"
          >
            <Camera className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
          </button>

          <button 
            onClick={() => galleryInputRef.current?.click()}
            disabled={isUploading}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-slate-200 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            title="Gallery"
          >
            <ImageIcon className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
          </button>

          <button
            onClick={startVoiceRecording}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer shrink-0"
            title="Voice Record"
          >
            <Mic className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
          </button>
          
          <input
            type="text"
            placeholder={editingMessage ? "Edit message..." : "Type a message..."}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            className="flex-1 min-w-0 bg-slate-950 border border-slate-800/80 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />

          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isUploading}
            className="p-2 sm:p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-50 font-semibold shadow-lg transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0"
            title="Send"
          >
            <Send className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>
        </div>
      )}
    </div>
  );
}
