import { X, Phone, Mail, Award, Edit3, MessageCircle, ShieldAlert, Camera, RefreshCw, Video } from 'lucide-react';
import { User } from '../types';
import { useState, ChangeEvent, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/Auth';

interface ProfileModalProps {
  user: User;
  isCurrentUser: boolean;
  onClose: () => void;
  onUpdateProfile?: (updatedFields: Partial<User>) => void;
}

export default function ProfileModal({ user, isCurrentUser, onClose, onUpdateProfile }: ProfileModalProps) {
  const { uploadProfilePhoto } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(user.name);
  const [editedEmail, setEditedEmail] = useState(user.email);
  const [editedStatus, setEditedStatus] = useState(user.status);
  const [editedBio, setEditedBio] = useState(user.bio);
  const [editedPhone, setEditedPhone] = useState(user.phone);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [tempAvatar, setTempAvatar] = useState<string | null>(null);

  // Web camera capture states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);

  const startWebCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 300, height: 300, facingMode: 'user' },
        audio: false
      });
      setCameraStream(stream);
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.play().catch(e => console.warn(e));
      }
    } catch (err: any) {
      console.error("Camera access failed:", err);
      setCameraError("Camera permission denied or hardware unavailable.");
    }
  };

  const stopWebCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    setCameraStream(null);
    setIsCameraActive(false);
  };

  const captureSnapshot = () => {
    if (!cameraVideoRef.current) return;
    try {
      const video = cameraVideoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 300;
      canvas.height = video.videoHeight || 300;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1); // mirror preview
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob(async (blob) => {
          if (blob) {
            const file = new File([blob], `avatar_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
            setUploadingPhoto(true);
            stopWebCamera();
            try {
              const downloadUrl = await uploadProfilePhoto(file);
              setTempAvatar(downloadUrl);
              if (onUpdateProfile) {
                onUpdateProfile({ avatar: downloadUrl });
              }
            } catch (err) {
              console.error('Failed to upload captured photo:', err);
            } finally {
              setUploadingPhoto(false);
            }
          }
        }, 'image/jpeg', 0.9);
      }
    } catch (e) {
      console.error("Failed capturing snapshot:", e);
    }
  };

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  useEffect(() => {
    setEditedName(user.name);
    setEditedEmail(user.email);
    setEditedStatus(user.status);
    setEditedBio(user.bio);
    setEditedPhone(user.phone || '');
    setTempAvatar(null);
  }, [user]);

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const downloadUrl = await uploadProfilePhoto(file);
      setTempAvatar(downloadUrl);
      if (onUpdateProfile) {
        onUpdateProfile({ avatar: downloadUrl });
      }
    } catch (err) {
      console.error('Failed to upload profile photo:', err);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (onUpdateProfile) {
      try {
        await onUpdateProfile({
          name: editedName,
          fullName: editedName,
          email: editedEmail,
          status: editedStatus,
          bio: editedBio,
          phone: editedPhone,
        });
      } catch (err) {
        console.error("Failed to update profile:", err);
      }
    }
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in-50 duration-200 flex flex-col max-h-[90vh] md:max-h-none">
        
        {/* Header */}
        <div className="relative h-32 bg-gradient-to-r from-emerald-500/20 to-teal-500/10 p-4 flex items-start justify-between shrink-0">
          <span className="text-xs font-semibold bg-emerald-500/20 text-emerald-400 py-1 px-3 rounded-full">
            {isCurrentUser ? 'Your Profile' : 'Contact Info'}
          </span>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-full bg-slate-950/40 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Avatar and Basic Info */}
        <div className="relative px-6 pb-6 pt-0 flex flex-col items-center overflow-y-auto flex-1 min-h-0">
          <div className="relative mt-6 mb-4">
            <div className="relative w-28 h-28">
              {uploadingPhoto ? (
                <div className="w-28 h-28 rounded-full border-4 border-slate-900 bg-slate-800 flex items-center justify-center shadow-xl">
                  <RefreshCw className="w-6 h-6 text-emerald-500 animate-spin" />
                </div>
              ) : (
                <img 
                  src={tempAvatar || user.avatar} 
                  alt={user.name} 
                  className="w-28 h-28 rounded-full border-4 border-slate-900 object-cover bg-slate-800 shadow-xl"
                  referrerPolicy="no-referrer"
                />
              )}
              {isCurrentUser && (
                <div className="absolute bottom-0 right-0 flex gap-1">
                  <input
                    type="file"
                    id="profile-avatar-upload"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <label
                    htmlFor="profile-avatar-upload"
                    className="p-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 border border-slate-900 text-white cursor-pointer shadow-lg transition-colors flex items-center justify-center"
                    title="Upload Profile Picture"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </label>
                  <button
                    onClick={isCameraActive ? stopWebCamera : startWebCamera}
                    type="button"
                    className="p-1.5 rounded-full bg-blue-600 hover:bg-blue-500 border border-slate-900 text-white cursor-pointer shadow-lg transition-colors flex items-center justify-center animate-in fade-in zoom-in-50 duration-200"
                    title="Capture with Web Camera"
                  >
                    <Video className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            <span className={`absolute bottom-2 right-2 w-4 h-4 rounded-full border-2 border-slate-900 ${
              user.isOnline ? 'bg-emerald-500' : 'bg-slate-500'
            }`} />
          </div>

          {/* Web Camera Capture Interface */}
          {isCameraActive && (
            <div className="relative w-full max-w-xs mx-auto mb-4 border border-emerald-500/30 rounded-xl overflow-hidden bg-slate-950 flex flex-col items-center p-2 animate-in slide-in-from-top-4 duration-200">
              <video
                ref={cameraVideoRef}
                autoPlay
                playsInline
                muted
                className="w-40 h-40 rounded-lg object-cover transform -scale-x-100 mb-2 border border-slate-800"
              />
              {cameraError ? (
                <p className="text-[10px] text-rose-400 mb-2">{cameraError}</p>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={captureSnapshot}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                  >
                    Take Photo
                  </button>
                  <button
                    type="button"
                    onClick={stopWebCamera}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          <h3 className="text-xl font-bold text-slate-100">{user.name}</h3>
          <p className="text-sm text-slate-400 mb-2">{user.email}</p>
          
          <span className="text-xs text-slate-500">
            {user.isOnline ? 'Online Now' : `Last active: ${user.lastSeen}`}
          </span>

          <hr className="w-full border-slate-800 my-5" />

          {/* Details Section */}
          <div className="w-full space-y-4">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Full Name</label>
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editedEmail}
                    onChange={(e) => setEditedEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Status Message</label>
                  <input
                    type="text"
                    value={editedStatus}
                    onChange={(e) => setEditedStatus(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Bio / About</label>
                  <textarea
                    rows={3}
                    value={editedBio}
                    onChange={(e) => setEditedBio(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors resize-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={editedPhone}
                    onChange={(e) => setEditedPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div className="sticky bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800/80 pt-4 pb-4 px-6 -mx-6 mb-[-24px] mt-4 flex gap-2 z-10 shadow-[0_-8px_16px_-6px_rgba(0,0,0,0.8)] pb-[calc(1.2rem+env(safe-area-inset-bottom))] md:relative md:border-t-0 md:shadow-none md:p-0 md:m-0 md:pt-2 md:z-auto">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm py-2.5 rounded-lg font-medium transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-slate-50 text-sm py-2.5 rounded-lg font-medium transition-colors cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-sm text-slate-300">
                {/* Status */}
                <div className="flex items-start gap-3">
                  <MessageCircle className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Status</p>
                    <p className="text-slate-200 mt-0.5 italic">"{user.status}"</p>
                  </div>
                </div>

                {/* About/Bio */}
                <div className="flex items-start gap-3">
                  <Award className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Bio</p>
                    <p className="text-slate-300 mt-0.5 whitespace-pre-wrap">{user.bio}</p>
                  </div>
                </div>

                {/* Phone */}
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Phone</p>
                    <p className="text-slate-300 mt-0.5">{user.phone || ''}</p>
                  </div>
                </div>

                {/* Email */}
                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Email</p>
                    <p className="text-slate-300 mt-0.5">{user.email}</p>
                  </div>
                </div>

                {isCurrentUser && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="w-full mt-4 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2.5 px-4 rounded-xl transition-colors cursor-pointer border border-slate-750"
                  >
                    <Edit3 className="w-4 h-4 text-emerald-400" />
                    Edit Profile Details
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
