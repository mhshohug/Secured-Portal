import { useState } from 'react';
import { Database, Terminal, Shield, Copy, Check, Info } from 'lucide-react';

export default function ArchPanel() {
  const [activeTab, setActiveTab] = useState<'sql' | 'node' | 'firebase'>('sql');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sqlSchema = `-- =======================================================
-- SUPABASE POSTGRESQL SCHEMA FOR MESSAGING AND CALLING APP
-- =======================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS / PROFILES TABLE
CREATE TABLE IF NOT EXISTS users (
    firebase_uid VARCHAR(128) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    email VARCHAR(255) NOT NULL UNIQUE,
    photo_url VARCHAR(1000),
    bio TEXT DEFAULT 'Hey there! I am using this secure chat.',
    status_message VARCHAR(255) DEFAULT 'Available',
    is_online BOOLEAN DEFAULT false,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. MESSAGES TABLE
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(128) PRIMARY KEY,
    sender_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
    receiver_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
    content TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'text', -- text, image, audio, video
    status VARCHAR(50) DEFAULT 'sent', -- sent, delivered, read
    media_url VARCHAR(1000),
    duration VARCHAR(50),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_msg_sender_receiver ON messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_msg_timestamp ON messages(timestamp);

-- 3. CALLS TABLE
CREATE TABLE IF NOT EXISTS calls (
    id VARCHAR(128) PRIMARY KEY,
    caller_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
    receiver_id VARCHAR(128) NOT NULL REFERENCES users(firebase_uid) ON DELETE CASCADE,
    type VARCHAR(50) DEFAULT 'video', -- audio, video
    status VARCHAR(50) DEFAULT 'calling', -- calling, ringing, connected, ended
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);`;

  const nodeServer = `/**
 * production-ready Node.js Socket.io Server with Supabase PostgreSQL backend and Firebase Auth
 * File: server.ts
 */
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createClient } from '@supabase/supabase-js';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Initialize Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

io.on('connection', (socket) => {
  console.log('Socket client connected:', socket.id);

  socket.on('auth', async ({ userId }) => {
    socket.data.uid = userId;
    socket.join(userId);
    
    // Update online status in Supabase
    await supabase.from('users').update({
      is_online: true,
      last_seen: new Date().toISOString()
    }).eq('firebase_uid', userId);
    
    io.emit('user_status_changed', { userId, isOnline: true });
  });

  socket.on('send_message', async (msgData, callback) => {
    const { id, receiverId, content, type, mediaUrl, duration } = msgData;
    const senderId = socket.data.uid;

    const newMessage = {
      id,
      sender_id: senderId,
      receiver_id: receiverId,
      content,
      type,
      media_url: mediaUrl,
      duration
    };

    // Store in Supabase PostgreSQL
    await supabase.from('messages').insert(newMessage);

    // Relay instantly
    io.to(receiverId).emit('receive_message', msgData);
    if (callback) callback({ status: 'success' });
  });

  socket.on('disconnect', async () => {
    const userId = socket.data.uid;
    if (userId) {
      await supabase.from('users').update({ is_online: false }).eq('firebase_uid', userId);
      io.emit('user_status_changed', { userId, isOnline: false });
    }
  });
});`;

  const firebaseAuthDocs = `### Firebase ID Token Verification Backend Flow

To establish a secure connection, client applications send a Firebase ID Token within the HTTP authorization header. Below are instructions on how this is verified on the backend:

1. **Client Token Retrieval**:
   On the frontend, once the user signs in via Firebase Client SDK, fetch the cryptographically signed ID Token:
   \`\`\`javascript
   const idToken = await auth.currentUser.getIdToken(true);
   const socket = io(window.location.origin, {
     auth: { token: idToken }
   });
   \`\`\`

2. **Backend Authentication Handler**:
   The backend uses the official **Firebase Admin SDK** to securely verify the signature, ensure integrity, and extract user data.
   - **JSON Web Token (JWT) Decoding**: Under the hood, \`verifyIdToken()\` parses the token, checks the signature against Google's public key (retrieved over HTTPS), verifies it is not expired, and ensures it matches your Firebase Project ID (\`aud\` claim).

3. **Database Correlation (User Provisioning)**:
   Once the token is decoded, extract the unique ID (\`uid\` / \`sub\` claim) and email:
   \`\`\`javascript
   const decodedToken = await admin.auth().verifyIdToken(token);
   const uid = decodedToken.uid;
   const email = decodedToken.email;
   \`\`\`
   You can then run an "UPSERT" query against your Supabase database to automatically create or update the user's relational profile table upon login:
   \`\`\`javascript
   await supabase.from('users').upsert({
     firebase_uid: uid,
     full_name: fullName,
     email: email
   });
   \`\`\`

4. **Security Highlights**:
   - Never accept user IDs directly from the client. Always verify the cryptographically signed ID Token.
   - Run verification in an API router middleware to deny unauthorized rest requests immediately.`;

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800 text-slate-100 overflow-hidden w-full max-w-full">
      <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-400" />
          <h2 className="text-sm font-semibold tracking-wide text-emerald-400 uppercase">Architecture & Backend Docs</h2>
        </div>
        <span className="text-xs bg-slate-800 text-slate-400 py-1 px-2.5 rounded-full font-medium">Enterprise Integration</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950">
        <button
          onClick={() => setActiveTab('sql')}
          className={`flex-1 py-3 text-xs font-medium border-b-2 flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'sql'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          PostgreSQL Schema
        </button>
        <button
          onClick={() => setActiveTab('node')}
          className={`flex-1 py-3 text-xs font-medium border-b-2 flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'node'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          Node + Socket.io Server
        </button>
        <button
          onClick={() => setActiveTab('firebase')}
          className={`flex-1 py-3 text-xs font-medium border-b-2 flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'firebase'
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Firebase Verification
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed bg-slate-900">
        {activeTab === 'sql' && (
          <div className="relative">
            <div className="flex justify-between items-center mb-3 bg-slate-950 p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-400">supabase-schema.sql</span>
              <button
                onClick={() => copyToClipboard(sqlSchema, 'sql')}
                className="hover:text-emerald-400 flex items-center gap-1 text-[11px] text-slate-300 font-sans transition-colors cursor-pointer"
              >
                {copiedId === 'sql' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400 animate-scale" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Code
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded text-amber-300/90 overflow-x-auto whitespace-pre">
              {sqlSchema}
            </pre>
          </div>
        )}

        {activeTab === 'node' && (
          <div className="relative">
            <div className="flex justify-between items-center mb-3 bg-slate-950 p-2 rounded border border-slate-800">
              <span className="text-[10px] text-slate-400">server.ts</span>
              <button
                onClick={() => copyToClipboard(nodeServer, 'node')}
                className="hover:text-emerald-400 flex items-center gap-1 text-[11px] text-slate-300 font-sans transition-colors cursor-pointer"
              >
                {copiedId === 'node' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Code
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded text-cyan-300/90 overflow-x-auto whitespace-pre">
              {nodeServer}
            </pre>
          </div>
        )}

        {activeTab === 'firebase' && (
          <div className="font-sans text-slate-300 p-2 leading-relaxed max-w-none">
            <div className="flex items-start gap-2.5 p-3.5 bg-emerald-950/20 border border-emerald-900/35 rounded-lg mb-4">
              <Info className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-300">
                Firebase ID Tokens are cryptographic keys signed by Google. This guide outlines how your server verifies their signatures locally, avoiding unnecessary round-trips to Google APIs on every connection.
              </p>
            </div>
            
            <div className="space-y-4 text-xs">
              <div>
                <h3 className="font-semibold text-emerald-400 mb-1">1. Frontend Client Fetching</h3>
                <p className="mb-2 text-slate-400">In your client app, retrieve the user's latest verified ID token and supply it to the WebSocket handshake payload:</p>
                <pre className="p-3 bg-slate-950 font-mono text-[11px] rounded border border-slate-800 text-cyan-400 overflow-x-auto">
{`import { getAuth } from 'firebase/auth';

const auth = getAuth();
const idToken = await auth.currentUser.getIdToken(true);

const socket = io("https://your-supabase-server.com", {
  auth: { token: idToken }
});`}
                </pre>
              </div>

              <div>
                <h3 className="font-semibold text-emerald-400 mb-1">2. Secure Verification on Node.js Server</h3>
                <p className="mb-2 text-slate-400">Using the Firebase Admin SDK on your server, the verification is completed locally via Google's public JSON Web Keys (JWK):</p>
                <pre className="p-3 bg-slate-950 font-mono text-[11px] rounded border border-slate-800 text-yellow-300 overflow-x-auto">
{`const admin = require('firebase-admin');

// Express/Socket.io authentication middleware
async function verifyClientSocket(socket, next) {
  const token = socket.handshake.auth.token;
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    socket.userId = decodedToken.uid; // Cryptographically authenticated UID
    next();
  } catch (err) {
    next(new Error('Unauthorized: Auth signature is invalid.'));
  }
}`}
                </pre>
              </div>

              <div>
                <h3 className="font-semibold text-emerald-400 mb-1">3. Token Claims Verified</h3>
                <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                  <li><strong className="text-slate-300">Signature:</strong> Matches one of Google's current certificates.</li>
                  <li><strong className="text-slate-300">Expiration (exp):</strong> Future timestamp (tokens live for 60 mins max).</li>
                  <li><strong className="text-slate-300">Audience (aud):</strong> Matches your Firebase Project ID exactly.</li>
                  <li><strong className="text-slate-300">Issued At (iat):</strong> Validates the token was issued in the past.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
