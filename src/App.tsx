import { useState, useEffect, useRef } from 'react';
import { User, Message, CallState, MessageType } from './types';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import CallingModal from './components/CallingModal';
import ProfileModal from './components/ProfileModal';
import ArchPanel from './components/ArchPanel';
import FriendSystemModal from './components/FriendSystemModal';
import { Phone, Sparkles, ShieldAlert, KeyRound } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/Auth';
import AuthScreen from './components/AuthScreen';
import { io, Socket } from 'socket.io-client';

const INITIAL_USERS: User[] = [];

const getChatId = (uid1: string, uid2: string) => {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
};

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}

function MainAppContent() {
  const { currentUser, firebaseUser, loading, allUsers, updateUserProfile } = useAuth();
  
  const [activeUserId, setActiveUserId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  
  // Real-time status trackers
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});

  // Calling State
  const [callState, setCallState] = useState<CallState>({
    type: 'video',
    status: 'idle',
    partnerId: '',
    durationSeconds: 0,
    isIncoming: false,
  });

  // Modals state
  const [viewingProfileUser, setViewingProfileUser] = useState<User | null>(null);
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  // Socket.IO Refs & Sync Refs
  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const messageQueueRef = useRef<Message[]>([]);
  const activeUserIdRef = useRef<string>(activeUserId);

  // Sync activeUserIdRef
  useEffect(() => {
    activeUserIdRef.current = activeUserId;
  }, [activeUserId]);

  // Dynamically map list with active/typing status from socket events
  const displayUsers: User[] = currentUser 
    ? allUsers
       .filter((u) => u.id !== currentUser.id && u.email !== currentUser.email)
       .map((u) => ({
         ...u,
         isOnline: onlineUsers[u.id] !== undefined ? onlineUsers[u.id] : u.isOnline,
         typingTo: typingUsers[u.id] ? currentUser.id : undefined
       }))
    : [];

  // Process any queued messages waiting to be sent
  const processMessageQueue = () => {
    if (!socketRef.current || !socketRef.current.connected || messageQueueRef.current.length === 0) return;

    const queue = [...messageQueueRef.current];
    messageQueueRef.current = [];

    queue.forEach((msg) => {
      socketRef.current?.emit('send_message', msg, (response: any) => {
        if (response && response.status === 'success') {
          console.log('Queued message sent successfully:', msg.id);
        } else {
          // Requeue on failure
          messageQueueRef.current.push(msg);
        }
      });
    });
  };

  // Socket.IO Core Connection Loop
  useEffect(() => {
    if (!currentUser?.id) return;

    const socket = io(window.location.origin, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket.IO connected successfully.');
      setSocketConnected(true);

      // Register socket with current logged-in user
      socket.emit('auth', { userId: currentUser.id });

      // Automatically send any pending queued messages
      processMessageQueue();
    });

    socket.on('disconnect', () => {
      console.log('Socket.IO connection dropped.');
      setSocketConnected(false);
    });

    socket.on('receive_message', (msg: Message) => {
      // Prevent duplication
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;

        const currentPartner = activeUserIdRef.current;
        const isCurrentChat = (msg.senderId === currentUser.id && msg.receiverId === currentPartner) ||
                             (msg.senderId === currentPartner && msg.receiverId === currentUser.id);
        if (isCurrentChat) {
          const updated = [...prev, msg];
          return updated.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        }
        return prev;
      });
    });

    socket.on('message_status_update', ({ messageId, status }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status } : m))
      );
    });

    socket.on('message_edited', ({ msgId, newContent, isEdited, editedAt }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, content: newContent, isEdited: true, editedAt } : m))
      );
    });

    socket.on('message_deleted', ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: 'This message was deleted', isDeletedForEveryone: true } : m))
      );
    });

    socket.on('messages_read', ({ readerId }) => {
      if (readerId === activeUserIdRef.current) {
        setMessages((prev) =>
          prev.map((m) => (m.senderId === currentUser.id ? { ...m, status: 'read' } : m))
        );
      }
    });

    socket.on('typing_status', ({ senderId, isTyping }) => {
      setTypingUsers((prev) => ({
        ...prev,
        [senderId]: isTyping
      }));
    });

    socket.on('user_status_changed', ({ userId, isOnline }) => {
      setOnlineUsers((prev) => ({
        ...prev,
        [userId]: isOnline
      }));
    });

    socket.on('incoming_call', (call: any) => {
      setCallState({
        callId: call.id,
        type: call.type,
        status: 'ringing', // Incoming call status: "Ringing"
        partnerId: call.callerId,
        durationSeconds: 0,
        isIncoming: true
      });
    });

    socket.on('call_accepted', ({ callId }) => {
      setCallState((prev) => {
        if (prev.callId === callId || !prev.callId) {
          return { ...prev, status: 'connecting' };
        }
        return prev;
      });
    });

    socket.on('call_busy', ({ callId }) => {
      setCallState((prev) => ({ ...prev, status: 'busy' }));
      setTimeout(() => {
        setCallState({ type: 'video', status: 'idle', partnerId: '', durationSeconds: 0, isIncoming: false });
      }, 2000);
    });

    socket.on('call_rejected', ({ callId }) => {
      setCallState((prev) => ({ ...prev, status: 'rejected' }));
      setTimeout(() => {
        setCallState({ type: 'video', status: 'idle', partnerId: '', durationSeconds: 0, isIncoming: false });
      }, 2000);
    });

    socket.on('call_cancelled', ({ callId }) => {
      setCallState((prev) => ({ ...prev, status: 'cancelled' }));
      setTimeout(() => {
        setCallState({ type: 'video', status: 'idle', partnerId: '', durationSeconds: 0, isIncoming: false });
      }, 2000);
    });

    socket.on('call_missed', ({ callId }) => {
      setCallState((prev) => ({ ...prev, status: 'missed' }));
      setTimeout(() => {
        setCallState({ type: 'video', status: 'idle', partnerId: '', durationSeconds: 0, isIncoming: false });
      }, 2000);
    });

    socket.on('call_ended', ({ callId, durationSeconds }) => {
      setCallState((prev) => ({ ...prev, status: 'ended', durationSeconds: durationSeconds || prev.durationSeconds }));
      setTimeout(() => {
        setCallState({ type: 'video', status: 'idle', partnerId: '', durationSeconds: 0, isIncoming: false });
      }, 1500);
    });

    socket.on('call_status_update', ({ callId, status, durationSeconds }) => {
      if (['ended', 'rejected', 'busy', 'cancelled', 'missed'].includes(status)) {
        setCallState((prev) => ({ ...prev, status, durationSeconds: durationSeconds || prev.durationSeconds }));
        setTimeout(() => {
          setCallState({
            type: 'video',
            status: 'idle',
            partnerId: '',
            durationSeconds: 0,
            isIncoming: false
          });
        }, 1800);
      } else {
        setCallState((prev) => {
          return {
            ...prev,
            callId: callId || prev.callId,
            status: status,
            durationSeconds: durationSeconds !== undefined ? durationSeconds : prev.durationSeconds
          };
        });
      }
    });

    // Auto-reconnect & flush queue on window online or tab visibility change
    const handleOnline = () => {
      if (socketRef.current && !socketRef.current.connected) {
        socketRef.current.connect();
      }
      processMessageQueue();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (socketRef.current && !socketRef.current.connected) {
          socketRef.current.connect();
        }
        processMessageQueue();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [currentUser?.id]);

  // Fetch initial chat history when selection changes
  useEffect(() => {
    if (!currentUser || !activeUserId) return;

    const fetchInitialMessages = async () => {
      try {
        const token = await firebaseUser?.getIdToken();
        if (!token) return;

        const res = await fetch(`/api/messages?partnerId=${activeUserId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'success' && data.messages) {
            setMessages(data.messages);
          }
        }
      } catch (err) {
        console.warn("Failed to fetch messages:", err);
      }
    };

    fetchInitialMessages();
  }, [currentUser, activeUserId, firebaseUser]);

  // Handle local call duration ticking and synchronization
  useEffect(() => {
    let timerInterval: NodeJS.Timeout | null = null;
    if (callState.status === 'connected') {
      const startTime = Date.now() - (callState.durationSeconds * 1000);
      timerInterval = setInterval(async () => {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        setCallState((prev) => {
          // Synchronize back via Socket.IO if caller
          if (!prev.isIncoming && socketRef.current && socketConnected) {
            socketRef.current.emit('update_call', {
              callId: prev.id,
              status: 'connected',
              durationSeconds: elapsedSeconds
            });
          }
          return {
            ...prev,
            durationSeconds: elapsedSeconds,
          };
        });
      }, 1000);
    }
    return () => {
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [callState.status, socketConnected]);

  // If loading user state from Firebase Authentication, display elegant splash screen
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="relative flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6 shadow-inner animate-pulse">
            <KeyRound className="w-8 h-8 text-emerald-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-200 tracking-wide">Syncing Encryption Keys</h3>
          <p className="text-xs text-slate-500 mt-1.5 max-w-[240px]">Establishing secure protocol and reading Firebase authentication token...</p>
          <div className="w-32 h-1 bg-slate-900 rounded-full overflow-hidden mt-4">
            <div className="h-full bg-emerald-500 animate-[loading_1s_infinite]" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    );
  }

  // Redirect to Authentication Screen if no active Firebase profile
  if (!currentUser) {
    return <AuthScreen />;
  }

  const handleSwitchUser = (userId: string) => {
    alert("Secure credentials verified. To switch profiles, please sign out and sign in as another user.");
  };

  const handleUpdateProfile = async (updatedFields: Partial<User>) => {
    try {
      await updateUserProfile(updatedFields);
    } catch (err) {
      console.error("Failed to update Firebase profile:", err);
    }
  };

  // Send message implementation with queue handling and rich attributes
  const handleSendMessage = async (
    content: string,
    type: MessageType = 'text',
    mediaUrl?: string,
    duration?: string,
    replyTo?: any,
    fileName?: string,
    fileSize?: string
  ) => {
    if (!currentUser || !activeUserId) return;

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    const newMessage: Message = {
      id: messageId,
      senderId: currentUser.id,
      receiverId: activeUserId,
      content,
      type,
      mediaUrl: mediaUrl || '',
      fileName: fileName || '',
      fileSize: fileSize || '',
      duration: duration || '',
      replyTo: replyTo || undefined,
      timestamp,
      status: 'sending'
    };

    // Optimistically update frontend state so messages appear instantly!
    setMessages((prev) => {
      if (prev.some(m => m.id === messageId)) return prev;
      return [...prev, newMessage];
    });

    if (socketRef.current && socketConnected) {
      socketRef.current.emit('send_message', newMessage, (response: any) => {
        if (response && response.status === 'success') {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, status: 'sent' } : m))
          );
        } else {
          console.warn('Socket send failed, queuing message:', messageId);
          messageQueueRef.current.push(newMessage);
        }
      });
    } else {
      console.log('Socket disconnected, queuing message:', messageId);
      messageQueueRef.current.push(newMessage);
    }
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: newContent, isEdited: true } : m))
    );
    if (socketRef.current && socketConnected) {
      socketRef.current.emit('edit_message', { messageId, newContent, receiverId: activeUserId });
    }
  };

  const handleDeleteForMe = (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    if (socketRef.current && socketConnected) {
      socketRef.current.emit('delete_message_for_me', { messageId });
    }
  };

  const handleDeleteForEveryone = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: 'This message was deleted', isDeletedForEveryone: true } : m))
    );
    if (socketRef.current && socketConnected) {
      socketRef.current.emit('delete_message_for_everyone', { messageId, receiverId: activeUserId });
    }
  };

  const handleMarkRead = (partnerId: string) => {
    if (socketRef.current && socketConnected && partnerId) {
      socketRef.current.emit('mark_messages_read', { partnerId });
    }
  };

  // Typing state update handler
  const handleTyping = (isTyping: boolean) => {
    if (socketRef.current && socketConnected && activeUserId) {
      socketRef.current.emit('typing', { receiverId: activeUserId, isTyping });
    }
  };

  // Initiate call with proper "Calling" status
  const handleInitiateCall = async (type: 'audio' | 'video') => {
    if (!currentUser || !activeUserId) return;

    const callId = `call_${Date.now()}`;
    
    // Outgoing call status is "calling"
    setCallState({
      callId,
      type,
      status: 'calling',
      partnerId: activeUserId,
      durationSeconds: 0,
      isIncoming: false,
    });

    if (socketRef.current && socketConnected) {
      socketRef.current.emit('initiate_call', { callId, receiverId: activeUserId, type });
    }
  };

  const handleAcceptIncomingCall = async () => {
    if (!currentUser || !callState.callId) return;
    
    setCallState((prev) => ({
      ...prev,
      status: 'connecting',
    }));

    if (socketRef.current && socketConnected) {
      socketRef.current.emit('accept_call', { callId: callState.callId, partnerId: callState.partnerId });
    }
  };

  const handleDeclineIncomingCall = async () => {
    if (!currentUser || !callState.callId) return;

    const targetPartnerId = callState.partnerId;

    setCallState((prev) => ({
      ...prev,
      status: 'rejected',
    }));

    if (socketRef.current && socketConnected) {
      socketRef.current.emit('decline_call', { callId: callState.callId, partnerId: targetPartnerId });
    }

    setTimeout(() => {
      setCallState({
        type: 'video',
        status: 'idle',
        partnerId: '',
        durationSeconds: 0,
        isIncoming: false,
      });
    }, 1200);
  };

  const handleEndCall = async (durationSeconds?: number) => {
    if (!currentUser || !callState.callId) return;

    const targetPartnerId = callState.partnerId;
    const finalDuration = durationSeconds !== undefined ? durationSeconds : (callState.durationSeconds || 0);

    setCallState((prev) => ({
      ...prev,
      status: 'ended',
      durationSeconds: finalDuration,
    }));

    if (socketRef.current && socketConnected) {
      socketRef.current.emit('end_call', {
        callId: callState.callId,
        partnerId: targetPartnerId,
        durationSeconds: finalDuration,
      });
    }

    setTimeout(() => {
      setCallState({
        type: 'video',
        status: 'idle',
        partnerId: '',
        durationSeconds: 0,
        isIncoming: false,
      });
    }, 1000);
  };

  const activePartner = displayUsers.find((u) => u.id === activeUserId) || null;

  return (
    <div className="flex w-full h-[100dvh] bg-slate-950 font-sans text-slate-100 overflow-hidden relative">
      
      {activePartner && activeUserId ? (
        <div className="w-full h-full relative overflow-hidden">
          <ChatArea
            partner={activePartner}
            currentUser={currentUser}
            messages={messages}
            onSendMessage={handleSendMessage}
            onOpenProfile={(user) => setViewingProfileUser(user)}
            onInitiateCall={handleInitiateCall}
            onTyping={handleTyping}
            onEditMessage={handleEditMessage}
            onDeleteForMe={handleDeleteForMe}
            onDeleteForEveryone={handleDeleteForEveryone}
            onMarkRead={handleMarkRead}
            onBack={() => setActiveUserId('')}
          />
        </div>
      ) : (
        <Sidebar
          users={displayUsers}
          currentUser={currentUser}
          activeUserId={activeUserId}
          onSelectUser={(id) => setActiveUserId(id)}
          onSwitchUser={handleSwitchUser}
          onOpenMyProfile={() => setViewingProfileUser(currentUser)}
          onOpenAddFriend={() => setIsAddFriendOpen(true)}
          pendingRequestsCount={pendingRequestsCount}
        />
      )}

      {/* Profile Modal */}
      {viewingProfileUser && (
        <ProfileModal
          user={viewingProfileUser}
          isCurrentUser={viewingProfileUser.id === currentUser.id}
          onClose={() => setViewingProfileUser(null)}
          onUpdateProfile={handleUpdateProfile}
        />
      )}

      {/* Calling Stream Modal */}
      {callState.status !== 'idle' && activePartner && (
        <CallingModal
          callState={callState}
          partner={displayUsers.find((u) => u.id === callState.partnerId) || activePartner}
          currentUser={currentUser}
          socket={socketRef.current}
          onAccept={handleAcceptIncomingCall}
          onDecline={handleDeclineIncomingCall}
          onEndCall={handleEndCall}
        />
      )}

      {/* Friend System Modal (Search, Add, Sync Contacts, Pending Requests) */}
      {currentUser && (
        <FriendSystemModal
          isOpen={isAddFriendOpen}
          onClose={() => setIsAddFriendOpen(false)}
          currentUser={currentUser}
          onSelectUserForChat={(userId) => setActiveUserId(userId)}
          onOpenUserProfile={(user) => setViewingProfileUser(user)}
          socket={socketRef.current}
        />
      )}
    </div>
  );
}
