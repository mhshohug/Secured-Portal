import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

// Fallback configuration automatically populated from firebase-applet-config.json
const firebaseConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY || "AIzaSyAQfCOHtxnFXA7kx-QZtFr4cf0au7eOAyM",
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN || "gen-lang-client-0624711073.firebaseapp.com",
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID || "gen-lang-client-0624711073",
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET || "gen-lang-client-0624711073.firebasestorage.app",
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID || "709735969343",
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID || "1:709735969343:web:3ac7e02750387d4a6f7e8a",
  databaseURL: (import.meta as any).env.VITE_FIREBASE_DATABASE_URL || "https://gen-lang-client-0624711073-default-rtdb.firebaseio.com"
};

// Initialize Firebase only once
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const database = getDatabase(app);
const storage = getStorage(app);

export { app, auth, database, storage, firebaseConfig };

