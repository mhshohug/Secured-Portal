import React, { useState } from 'react';
import { useAuth } from '../contexts/Auth'; // We'll export Context from auth context
import { ShieldCheck, Mail, Lock, User as UserIcon, Camera, AlertCircle, ArrowLeft, RefreshCw, KeyRound, Sparkles, Phone, Video } from 'lucide-react';

const AVATAR_TEMPLATES = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
];

export default function AuthScreen() {
  const { login, register, resetPassword, uploadProfilePhoto, error, setError } = useAuth();
  
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATAR_TEMPLATES[0]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Web camera snapshot states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const cameraVideoRef = React.useRef<HTMLVideoElement | null>(null);

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
            setUploading(true);
            stopWebCamera();
            try {
              const url = await uploadProfilePhoto(file);
              setSelectedAvatar(url);
            } catch (err: any) {
              setError('Failed to upload captured picture. Please try again.');
            } finally {
              setUploading(false);
            }
          }
        }, 'image/jpeg', 0.9);
      }
    } catch (e) {
      console.error("Failed capturing snapshot:", e);
    }
  };

  React.useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadProfilePhoto(file);
      setSelectedAvatar(url);
    } catch (err: any) {
      setError('Failed to upload profile picture. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!email.trim() || !password.trim()) {
      setError('Please provide both email and password.');
      return;
    }

    if (!validateEmail(email)) {
      setError('The email address format is invalid.');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      // Handled inside AuthContext
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError('Please provide both email and password.');
      return;
    }

    if (!validateEmail(email)) {
      setError('The email address format is invalid.');
      return;
    }

    if (password.length < 6) {
      setError('The password is too weak. It must be at least 6 characters.');
      return;
    }

    if (!phone.trim()) {
      setError('Please enter your mobile phone number.');
      return;
    }

    setLoading(true);
    try {
      await register(email, password, name, selectedAvatar, phone);
      setSuccessMsg('Account created successfully!');
    } catch (err: any) {
      // Handled inside AuthContext
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    if (!validateEmail(email)) {
      setError('The email address format is invalid.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email);
      setSuccessMsg('A password reset link has been dispatched to your inbox!');
    } catch (err: any) {
      // Handled inside AuthContext
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-y-auto text-slate-100 font-sans select-none">
      
      {/* Visual background ambient glow container */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-10 right-10 w-72 h-72 bg-teal-500/5 rounded-full blur-[80px]" />
      </div>

      {/* Main Container Card */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800/80 rounded-2xl shadow-2xl p-5 sm:p-8 relative z-10 my-auto">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-3.5 shadow-inner">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-1.5 justify-center">
            Secure Portal
            <span className="text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
              v2.1
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-[280px]">
            {mode === 'login' && 'Sign in to access your secure encrypted chats.'}
            {mode === 'register' && 'Create your enterprise chat profile credentials.'}
            {mode === 'forgot' && 'Reset your password securely via Firebase Auth.'}
          </p>
        </div>

        {/* Dynamic Alerts */}
        {error && (
          <div className="mb-4 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-start gap-2.5 animate-in slide-in-from-top-1 duration-150">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="text-xs text-slate-300 leading-normal font-medium">{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-start gap-2.5 animate-in slide-in-from-top-1 duration-150">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span className="text-xs text-slate-300 leading-normal font-medium">{successMsg}</span>
          </div>
        )}

        {/* LOGIN MODE */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-baseline mb-1.5">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                    setMode('forgot');
                  }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-50 font-semibold py-2.5 px-4 rounded-xl shadow-lg hover:shadow-emerald-900/10 active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Sign In Securely'
              )}
            </button>

            <div className="pt-4 text-center border-t border-slate-800/60 mt-4 text-xs text-slate-400">
              New to secure messaging?{' '}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccessMsg(null);
                  setMode('register');
                }}
                className="text-emerald-400 hover:text-emerald-300 font-bold transition-colors cursor-pointer"
              >
                Register an account
              </button>
            </div>
          </form>
        )}

        {/* REGISTER MODE */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Full Name</label>
              <div className="relative">
                <UserIcon className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Password (min 6 characters)</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Mobile Number</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="tel"
                  placeholder="+1 (555) 019-2834"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  required
                />
              </div>
            </div>

            {/* Custom Photo Upload Button */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-emerald-400" />
                  Profile Picture
                </span>
                <span className="text-[10px] text-slate-500 font-normal">Custom upload or select default below</span>
              </label>
              <div className="flex gap-3 items-center bg-slate-950 p-3 rounded-xl border border-slate-850">
                <div className="relative shrink-0 w-16 h-16 rounded-full border-2 border-emerald-500/30 overflow-hidden bg-slate-900 flex items-center justify-center">
                  {uploading ? (
                    <RefreshCw className="w-5 h-5 text-emerald-500 animate-spin" />
                  ) : (
                    <img src={selectedAvatar} alt="Selected Avatar" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 flex flex-wrap gap-2 items-center">
                  <div className="w-full">
                    <p className="text-xs text-slate-400 mb-1.5 font-medium">Use your own picture</p>
                  </div>
                  <input
                    type="file"
                    id="avatar-upload"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <label
                    htmlFor="avatar-upload"
                    className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:text-slate-100 text-slate-300 text-xs py-1.5 px-3 rounded-lg cursor-pointer transition-all font-semibold"
                  >
                    <Camera className="w-3.5 h-3.5 text-emerald-500" />
                    {uploading ? 'Uploading...' : 'Upload Photo'}
                  </label>
                  <button
                    type="button"
                    onClick={isCameraActive ? stopWebCamera : startWebCamera}
                    className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 hover:text-slate-100 text-slate-300 text-xs py-1.5 px-3 rounded-lg cursor-pointer transition-all font-semibold"
                  >
                    <Video className="w-3.5 h-3.5 text-blue-500" />
                    {isCameraActive ? 'Close Camera' : 'Use Camera'}
                  </button>
                </div>
              </div>

              {/* Web Camera Snapshot Preview Area */}
              {isCameraActive && (
                <div className="mt-3 border border-emerald-500/30 rounded-xl overflow-hidden bg-slate-950 flex flex-col items-center p-3 animate-in slide-in-from-top-4 duration-200">
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-40 h-40 rounded-lg object-cover transform -scale-x-100 mb-2 border border-slate-850"
                  />
                  {cameraError ? (
                    <p className="text-[11px] text-rose-400 mb-2">{cameraError}</p>
                  ) : (
                    <div className="flex gap-2 w-full max-w-[200px]">
                      <button
                        type="button"
                        onClick={captureSnapshot}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                      >
                        Take Snapshot
                      </button>
                      <button
                        type="button"
                        onClick={stopWebCamera}
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Avatar Selector */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Select Predefined Avatar (Optional)
              </label>
              <div className="grid grid-cols-6 gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                {AVATAR_TEMPLATES.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedAvatar(url)}
                    className={`relative rounded-full overflow-hidden aspect-square border-2 transition-all cursor-pointer hover:opacity-90 ${
                      selectedAvatar === url 
                        ? 'border-emerald-500 scale-105' 
                        : 'border-transparent opacity-60'
                    }`}
                  >
                    <img src={url} alt={`Avatar ${idx}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-50 font-semibold py-2.5 px-4 rounded-xl shadow-lg hover:shadow-emerald-900/10 active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Register Secure Profile'
              )}
            </button>

            <div className="pt-4 text-center border-t border-slate-800/60 mt-4 text-xs text-slate-400">
              Already have credentials?{' '}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccessMsg(null);
                  setMode('login');
                }}
                className="text-emerald-400 hover:text-emerald-300 font-bold transition-colors cursor-pointer"
              >
                Sign In
              </button>
            </div>
          </form>
        )}

        {/* FORGOT PASSWORD MODE */}
        {mode === 'forgot' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="flex items-center gap-1 bg-emerald-950/20 border border-emerald-900/20 rounded-xl p-3 mb-2">
              <KeyRound className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="text-[11px] text-slate-300 leading-normal pl-1">
                Provide your registered email address and we will securely dispatch a reset credentials link.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-50 font-semibold py-2.5 px-4 rounded-xl shadow-lg hover:shadow-emerald-900/10 active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Dispatching Link...
                </>
              ) : (
                'Dispatch Reset Credentials Link'
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setSuccessMsg(null);
                setMode('login');
              }}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-2 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 mt-1.5 text-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
