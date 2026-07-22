import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail, 
  onAuthStateChanged,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  ref, 
  set, 
  get, 
  update, 
  onValue, 
  serverTimestamp 
} from 'firebase/database';
import { auth, database, storage } from '../firebase';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { User } from '../types';

interface AuthContextType {
  currentUser: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  error: string | null;
  allUsers: User[];
  register: (email: string, password: string, name: string, avatar: string, phone: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateUserProfile: (fields: Partial<User>) => Promise<void>;
  uploadProfilePhoto: (file: File) => Promise<string>;
  setError: (err: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Map Firebase error codes to user-friendly messages
  const getFriendlyErrorMessage = (code: string) => {
    switch (code) {
      case 'auth/invalid-email':
        return 'The email address format is invalid.';
      case 'auth/user-disabled':
        return 'This user account has been disabled.';
      case 'auth/user-not-found':
        return 'No user found with this email address.';
      case 'auth/wrong-password':
        return 'Incorrect password. Please try again.';
      case 'auth/email-already-in-use':
        return 'This email address is already in use by another account.';
      case 'auth/weak-password':
        return 'The password is too weak. It must be at least 6 characters.';
      case 'auth/operation-not-allowed':
        return 'Email/password sign-in is not enabled for this project.';
      case 'auth/too-many-requests':
        return 'Access to this account has been temporarily disabled due to many failed login attempts.';
      default:
        return 'An error occurred. Please try again.';
    }
  };

  // Listen to Auth State Changes and sync with Node.js backend
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fUser) => {
      setLoading(true);
      if (fUser) {
        setFirebaseUser(fUser);
        try {
          const token = await fUser.getIdToken();
          const syncRes = await fetch('/api/auth/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              fullName: fUser.displayName || '',
              photoURL: fUser.photoURL || '',
              email: fUser.email || ''
            })
          });

          if (syncRes.ok) {
            const data = await syncRes.json();
            if (data.status === 'success' && data.user) {
              setCurrentUser(data.user);
            }
          } else {
            console.warn("Failed to sync profile on auth state change.");
          }
        } catch (err) {
          console.error("Error syncing auth with backend:", err);
        } finally {
          setLoading(false);
        }
      } else {
        setFirebaseUser(null);
        setCurrentUser(null);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // Poll current user profile and directory list from Supabase PostgreSQL backend
  useEffect(() => {
    if (!firebaseUser) {
      setAllUsers([]);
      return;
    }

    const fetchProfiles = async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const headers = { 'Authorization': `Bearer ${token}` };

        // 1. Fetch current profile to sync in real time
        const profileRes = await fetch('/api/user/profile', { headers });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData.status === 'success' && profileData.user) {
            setCurrentUser(profileData.user);
          }
        }

        // 2. Fetch user directory
        const usersRes = await fetch('/api/users', { headers });
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          if (usersData.status === 'success' && usersData.users) {
            setAllUsers(usersData.users);
          }
        }
      } catch (err) {
        console.warn("Error polling profiles from backend:", err);
      }
    };

    fetchProfiles();
    const interval = setInterval(fetchProfiles, 3000);

    return () => clearInterval(interval);
  }, [firebaseUser]);

  // Register user
  const register = async (email: string, password: string, name: string, avatar: string, phone: string) => {
    setError(null);
    try {
      if (!phone || !phone.trim()) {
        throw new Error('Mobile number is required.');
      }

      // Check unique phone number and email address in local cache
      const cleanPhone = phone.replace(/\D/g, '');
      const cleanEmail = email.trim().toLowerCase();
      for (const u of allUsers) {
        const uPhone = (u.phoneNumber || u.phone || '').replace(/\D/g, '');
        const uEmail = (u.email || '').trim().toLowerCase();
        if (uPhone === cleanPhone) {
          throw new Error('This phone number is already registered by another user.');
        }
        if (uEmail === cleanEmail) {
          throw new Error('This email address is already registered by another user.');
        }
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const fUser = userCredential.user;

      // Update Auth Profile
      await updateProfile(fUser, {
        displayName: name,
        photoURL: avatar
      });

      // Save to Supabase PostgreSQL via sync endpoint
      const token = await fUser.getIdToken();
      const syncRes = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fullName: name,
          photoURL: avatar,
          phoneNumber: phone,
          email
        })
      });

      if (syncRes.ok) {
        const data = await syncRes.json();
        if (data.status === 'success' && data.user) {
          setCurrentUser(data.user);
        }
      } else {
        throw new Error('Successfully registered but backend profile synchronization failed.');
      }

    } catch (err: any) {
      const msg = err.code ? getFriendlyErrorMessage(err.code) : err.message;
      setError(msg);
      throw new Error(msg);
    }
  };

  // Login user
  const login = async (email: string, password: string) => {
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const fUser = userCredential.user;

      // Sync with backend on login
      const token = await fUser.getIdToken();
      const syncRes = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: fUser.email || '',
          fullName: fUser.displayName || '',
          photoURL: fUser.photoURL || ''
        })
      });

      if (syncRes.ok) {
        const data = await syncRes.json();
        if (data.status === 'success' && data.user) {
          setCurrentUser(data.user);
        }
      }
    } catch (err: any) {
      const msg = err.code ? getFriendlyErrorMessage(err.code) : err.message;
      setError(msg);
      throw new Error(msg);
    }
  };

  // Logout user
  const logout = async () => {
    setError(null);
    try {
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
        } catch (e) {
          console.error("Error calling backend logout:", e);
        }
      }
      await signOut(auth);
      setCurrentUser(null);
      setFirebaseUser(null);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  // Reset password
  const resetPassword = async (email: string) => {
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      const msg = getFriendlyErrorMessage(err.code);
      setError(msg);
      throw new Error(msg);
    }
  };

  // Update profile in Supabase PostgreSQL database
  const updateUserProfile = async (fields: Partial<User>) => {
    if (!firebaseUser) return;
    setError(null);
    try {
      const token = await firebaseUser.getIdToken();
      const response = await fetch('/api/user/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(fields)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'success' && data.user) {
        setCurrentUser(data.user);
      }

      // Also update Auth profile name/avatar if changed
      if (fields.name || fields.avatar) {
        await updateProfile(firebaseUser, {
          displayName: fields.name || firebaseUser.displayName,
          photoURL: fields.avatar || firebaseUser.photoURL
        });
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const uploadProfilePhoto = async (file: File): Promise<string> => {
    setError(null);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const headers: any = {};
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/user/upload-avatar', {
        method: 'POST',
        headers,
        body: formData
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed with status ${response.status}`);
      }

      const data = await response.json();
      if (data.status === 'success' && data.url) {
        return data.url;
      }
      throw new Error('Upload response did not contain public URL');
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        firebaseUser,
        loading,
        error,
        allUsers,
        register,
        login,
        logout,
        resetPassword,
        updateUserProfile,
        uploadProfilePhoto,
        setError
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
