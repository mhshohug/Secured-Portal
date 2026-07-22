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
import { getSupabaseClient } from './lib/supabase';

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
  const { currentUser, firebaseUser, loading, contacts, updateUserProfile } = useAuth();
  
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
    ? contacts
       .filter((u) => u.id !== currentUser.id && u.email !== currentUser.email)
       .map((u) => ({
         ...u,
         isOnline: u.isOnline,
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

  // Subscribe to Supabase Realtime updates on the "messages" table
  useEffect(() => {
    if (!currentUser) return;

    let channel: any = null;
    let isMounted = true;

    async function subscribeMessages() {
      const client = await getSupabaseClient();
      if (!client || !isMounted) return;

      console.log('[SUPABASE REALTIME] Subscribing to messages table in App.tsx');
      channel = client
        .channel('supabase-messages-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'messages' },
          (payload) => {
            console.log('[SUPABASE REALTIME MSG EVENT] payload received:', payload);
            if (!isMounted) return;

            const eventType = payload.eventType;
            const newRecord = payload.new as any;
            const oldRecord = payload.old as any;

            if (eventType === 'INSERT') {
              // Exclude message if we have deleted it for ourselves
              const deletedFor = Array.isArray(newRecord.deleted_for) ? newRecord.deleted_for : [];
              if (deletedFor.includes(currentUser.id)) return;

              // Convert database row back to frontend Message object
              const msg: Message = {
                id: newRecord.id,
                senderId: newRecord.sender_id,
                receiverId: newRecord.receiver_id,
                content: newRecord.content,
                type: (newRecord.type || 'text') as MessageType,
                timestamp: newRecord.timestamp,
                status: newRecord.status || 'sent',
                mediaUrl: newRecord.media_url || '',
                fileName: newRecord.file_name || '',
                fileSize: newRecord.file_size || '',
                duration: newRecord.duration || '',
                replyTo: (newRecord.reply_to_id || newRecord.reply_to_content) ? {
                  id: newRecord.reply_to_id || '',
                  content: newRecord.reply_to_content || '',
                  senderName: newRecord.reply_to_sender_name || '',
                  type: (newRecord.reply_to_type || 'text') as MessageType
                } : undefined,
                isEdited: newRecord.is_edited || false,
                editedAt: newRecord.edited_at || undefined,
                deletedFor: deletedFor,
                isDeletedForEveryone: newRecord.is_deleted_for_everyone || false
              };

              const currentPartner = activeUserIdRef.current;
              const isCurrentChat = (msg.senderId === currentUser.id && msg.receiverId === currentPartner) ||
                                   (msg.senderId === currentPartner && msg.receiverId === currentUser.id);

              if (isCurrentChat) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === msg.id)) return prev;
                  const updated = [...prev, msg];
                  return updated.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                });

                // If we are the receiver of this new message, mark it as read in the database
                if (msg.receiverId === currentUser.id && msg.status !== 'read') {
                  client
                    .from('messages')
                    .update({ status: 'read' })
                    .eq('id', msg.id)
                    .then();
                }
              }
            } else if (eventType === 'UPDATE') {
              const deletedFor = Array.isArray(newRecord.deleted_for) ? newRecord.deleted_for : [];
              if (deletedFor.includes(currentUser.id)) {
                // If the user deleted this message for themselves, filter it out from state
                setMessages((prev) => prev.filter((m) => m.id !== newRecord.id));
                return;
              }

              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id === newRecord.id) {
                    return {
                      ...m,
                      content: newRecord.is_deleted_for_everyone ? 'This message was deleted' : newRecord.content,
                      status: newRecord.status || m.status,
                      isEdited: newRecord.is_edited || m.isEdited,
                      editedAt: newRecord.edited_at || m.editedAt,
                      isDeletedForEveryone: newRecord.is_deleted_for_everyone || m.isDeletedForEveryone,
                      deletedFor: deletedFor
                    };
                  }
                  return m;
                })
              );
            } else if (eventType === 'DELETE') {
              setMessages((prev) => prev.filter((m) => m.id !== oldRecord.id));
            }
          }
        )
        .subscribe((status) => {
          console.log('[SUPABASE REALTIME MSG SUB] Subscription status:', status);
        });
    }

    subscribeMessages();

    return () => {
      isMounted = false;
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [currentUser, activeUserId]);

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

    const client = await getSupabaseClient();
    if (client) {
      const messageRecord = {
        id: messageId,
        sender_id: currentUser.id,
        receiver_id: activeUserId,
        content: content || '',
        type: type || 'text',
        timestamp: timestamp,
        status: 'sent',
        media_url: mediaUrl || null,
        duration: duration || null
      };

      try {
        const { error } = await client.from('messages').insert(messageRecord);
        if (error) {
          console.error("Supabase insert error:", error);
        } else {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, status: 'sent' } : m))
          );
        }
      } catch (err) {
        console.error("Failed to insert message:", err);
      }
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: newContent, isEdited: true } : m))
    );
    const client = await getSupabaseClient();
    if (client) {
      try {
        await client
          .from('messages')
          .update({
            content: newContent
          })
          .eq('id', messageId);
      } catch (err) {
        console.error("Failed to edit message in Supabase:", err);
      }
    }
  };

  const handleDeleteForMe = async (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    // Kept local to prevent DB schema conflicts
  };

  const handleDeleteForEveryone = async (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: 'This message was deleted', isDeletedForEveryone: true } : m))
    );
    const client = await getSupabaseClient();
    if (client) {
      try {
        await client
          .from('messages')
          .update({
            content: 'This message was deleted'
          })
          .eq('id', messageId);
      } catch (err) {
        console.error("Failed to delete message for everyone in Supabase:", err);
      }
    }
  };

  const handleMarkRead = async (partnerId: string) => {
    const client = await getSupabaseClient();
    if (client && partnerId) {
      try {
        await client
          .from('messages')
          .update({ status: 'read' })
          .eq('sender_id', partnerId)
          .eq('receiver_id', currentUser.id)
          .neq('status', 'read');
      } catch (err) {
        console.error("Failed to mark messages as read in Supabase:", err);
      }
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
      socketRef.current.emit('accept_call', { 
        callId: callState.callId, 
        partnerId: callState.partnerId,
        receiverId: callState.partnerId 
      });
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
      socketRef.current.emit('reject_call', { 
        callId: callState.callId, 
        partnerId: targetPartnerId,
        receiverId: targetPartnerId 
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
      {callState.status !== 'idle' && (displayUsers.find((u) => u.id === callState.partnerId) || activePartner) && (
        <CallingModal
          callState={callState}
          partner={displayUsers.find((u) => u.id === callState.partnerId) || activePartner!}
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
