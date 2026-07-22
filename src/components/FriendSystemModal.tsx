import { useState, useEffect } from 'react';
import { Search, UserPlus, Check, X, Clock, Phone, Mail, UserCheck, Share2, Sparkles, RefreshCw, MessageSquare } from 'lucide-react';
import { SearchResultUser, FriendRequest, ContactItem, User } from '../types';
import { getSupabaseClient } from '../lib/supabase';

interface FriendSystemModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onSelectUserForChat: (userId: string) => void;
  onOpenUserProfile?: (user: User) => void;
  socket?: any; // Kept for interface compatibility
}

export default function FriendSystemModal({
  isOpen,
  onClose,
  currentUser,
  onSelectUserForChat,
  onOpenUserProfile,
}: FriendSystemModalProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'requests' | 'contacts'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  // Requests state
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);

  // Contacts state
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const [customPhoneInput, setCustomPhoneInput] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Fetch pending requests from Supabase via backend API
  const fetchRequests = () => {
    setIsLoadingRequests(true);
    fetch('/api/friends/requests', {
      headers: {
        Authorization: `Bearer ${currentUser.id}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setIsLoadingRequests(false);
        if (data.status === 'success') {
          setIncomingRequests(data.incoming || []);
          setOutgoingRequests(data.outgoing || []);
        }
      })
      .catch((err) => {
        setIsLoadingRequests(false);
        console.error('Failed to fetch friend requests:', err);
      });
  };

  // Perform user search by Mobile Number, Email, or Full Name from Supabase users
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    fetch(`/api/friends/search?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${currentUser.id}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setIsSearching(false);
        if (data.status === 'success') {
          setSearchResults(data.results || []);
        }
      })
      .catch(() => setIsSearching(false));
  };

  // Automatically load search results on query change or tab open
  useEffect(() => {
    if (isOpen) {
      fetchRequests();
      if (searchQuery) {
        handleSearch(searchQuery);
      } else {
        setSearchResults([]);
      }
    }
  }, [isOpen]);

  // Handle Supabase Realtime Subscriptions for friend_requests and friends
  useEffect(() => {
    let channel: any = null;
    let isMounted = true;

    async function subscribeRealtime() {
      const client = await getSupabaseClient();
      if (!client || !isMounted) return;

      channel = client
        .channel('supabase-friend-system')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'friend_requests' },
          () => {
            if (isMounted) {
              fetchRequests();
              if (searchQuery) handleSearch(searchQuery);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'friends' },
          () => {
            if (isMounted) {
              fetchRequests();
              if (searchQuery) handleSearch(searchQuery);
            }
          }
        )
        .subscribe();
    }

    if (isOpen) {
      subscribeRealtime();
    }

    return () => {
      isMounted = false;
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [isOpen, currentUser.id, searchQuery]);

  // Send Friend Request
  const handleSendRequest = (receiverId: string) => {
    setLoadingMap((prev) => ({ ...prev, [receiverId]: true }));

    fetch('/api/friends/request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser.id}`,
      },
      body: JSON.stringify({ receiverId }),
    })
      .then((res) => res.json())
      .then((data) => {
        setLoadingMap((prev) => ({ ...prev, [receiverId]: false }));
        if (data.status === 'success') {
          showToast('Friend request sent!');
          setSearchResults((prev) =>
            prev.map((u) =>
              u.id === receiverId ? { ...u, relationship: 'sent_pending' } : u
            )
          );
          fetchRequests();
        } else {
          showToast(data?.error || data?.message || 'Failed to send request');
        }
      })
      .catch(() => {
        setLoadingMap((prev) => ({ ...prev, [receiverId]: false }));
        showToast('Failed to send friend request.');
      });
  };

  // Accept Friend Request
  const handleAcceptRequest = (requestId: string, senderId?: string) => {
    const targetKey = requestId || senderId || '';
    setLoadingMap((prev) => ({ ...prev, [targetKey]: true }));

    fetch('/api/friends/accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser.id}`,
      },
      body: JSON.stringify({ requestId, senderId }),
    })
      .then((res) => res.json())
      .then((data) => {
        setLoadingMap((prev) => ({ ...prev, [targetKey]: false }));
        if (data.status === 'success') {
          showToast('Accepted! Added to your friends list.');
          fetchRequests();
          if (searchQuery) handleSearch(searchQuery);
        } else {
          showToast(data?.error || 'Failed to accept request');
        }
      })
      .catch(() => {
        setLoadingMap((prev) => ({ ...prev, [targetKey]: false }));
        showToast('Error accepting friend request.');
      });
  };

  // Decline Friend Request
  const handleDeclineRequest = (requestId: string, senderId?: string) => {
    const targetKey = requestId || senderId || '';
    setLoadingMap((prev) => ({ ...prev, [targetKey]: true }));

    fetch('/api/friends/decline', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser.id}`,
      },
      body: JSON.stringify({ requestId, senderId }),
    })
      .then((res) => res.json())
      .then(() => {
        setLoadingMap((prev) => ({ ...prev, [targetKey]: false }));
        showToast('Friend request declined.');
        fetchRequests();
        if (searchQuery) handleSearch(searchQuery);
      })
      .catch(() => {
        setLoadingMap((prev) => ({ ...prev, [targetKey]: false }));
      });
  };

  // Cancel Friend Request
  const handleCancelRequest = (requestId: string, receiverId?: string) => {
    const targetKey = requestId || receiverId || '';
    setLoadingMap((prev) => ({ ...prev, [targetKey]: true }));

    fetch('/api/friends/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser.id}`,
      },
      body: JSON.stringify({ requestId, receiverId }),
    })
      .then((res) => res.json())
      .then(() => {
        setLoadingMap((prev) => ({ ...prev, [targetKey]: false }));
        showToast('Friend request cancelled.');
        fetchRequests();
        if (searchQuery) handleSearch(searchQuery);
      })
      .catch(() => {
        setLoadingMap((prev) => ({ ...prev, [targetKey]: false }));
      });
  };

  // Sync Phone Contacts
  const handleSyncContacts = (extraContacts?: ContactItem[]) => {
    setIsSyncingContacts(true);

    const payload = extraContacts || [];

    fetch('/api/friends/sync-contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentUser.id}`,
      },
      body: JSON.stringify({ contacts: payload }),
    })
      .then((res) => res.json())
      .then((data) => {
        setIsSyncingContacts(false);
        if (data.status === 'success') {
          setContacts(data.contacts || []);
          showToast('Phone contacts synced successfully!');
        }
      })
      .catch(() => setIsSyncingContacts(false));
  };

  // Add custom contact phone to sync
  const handleAddCustomContact = () => {
    if (!customPhoneInput.trim()) return;

    const newContact: ContactItem = {
      name: `Contact (${customPhoneInput.trim()})`,
      phone: customPhoneInput.trim(),
      isRegistered: false,
    };

    handleSyncContacts([...contacts, newContact]);
    setCustomPhoneInput('');
  };

  // Auto sync contacts on first opening contacts tab
  useEffect(() => {
    if (activeTab === 'contacts' && contacts.length === 0) {
      handleSyncContacts();
    }
  }, [activeTab]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Toast Notification Banner */}
        {toastMessage && (
          <div className="bg-emerald-500/90 text-white text-xs font-semibold py-2 px-4 text-center animate-in slide-in-from-top duration-150 flex items-center justify-center gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            {toastMessage}
          </div>
        )}

        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Find & Add Friends</h2>
              <p className="text-xs text-slate-400">Search users by phone, email, or name and sync phone contacts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-4 pt-2 gap-2">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'search'
                ? 'border-emerald-500 text-emerald-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Search Users
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'requests'
                ? 'border-emerald-500 text-emerald-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Pending Requests
            {incomingRequests.length > 0 && (
              <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {incomingRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('contacts')}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'contacts'
                ? 'border-emerald-500 text-emerald-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            Sync Contacts
          </button>
        </div>

        {/* TAB 1: SEARCH USERS */}
        {activeTab === 'search' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Mobile Number, Email Address, or Full Name..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                autoFocus
              />
              {isSearching && (
                <RefreshCw className="absolute right-3.5 top-3 w-4 h-4 text-emerald-400 animate-spin" />
              )}
            </div>

            {/* Results Header */}
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>
                {searchQuery ? `Search results for "${searchQuery}"` : 'All Registered Users'}
              </span>
              <span className="font-mono text-[11px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                {searchResults.length} found
              </span>
            </div>

            {/* Results List */}
            <div className="flex flex-col gap-2.5">
              {searchResults.length > 0 ? (
                searchResults.map((user) => {
                  const isLoading = loadingMap[user.id];

                  return (
                    <div
                      key={user.id}
                      className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-slate-700 transition-all"
                    >
                      <div 
                        onClick={() => onOpenUserProfile?.(user as unknown as User)}
                        className="flex items-center gap-3 min-w-0 cursor-pointer group hover:opacity-90"
                        title="Click to view profile"
                      >
                        <div className="relative shrink-0">
                          <img
                            src={user.avatar}
                            alt={user.name}
                            className="w-12 h-12 rounded-full object-cover border border-slate-800"
                            referrerPolicy="no-referrer"
                          />
                          <span
                            className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-slate-950 ${
                              user.isOnline ? 'bg-emerald-500' : 'bg-slate-500'
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                            <span className="truncate">{user.name}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              {user.isOnline ? 'Online' : 'Offline'}
                            </span>
                          </h4>
                          <p className="text-xs text-slate-400 truncate max-w-[220px]">
                            {user.email || user.phone}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate italic mt-0.5">
                            "{user.status || 'Available'}"
                          </p>
                        </div>
                      </div>

                      {/* Action Button States for Search Users tab - NEVER show Accept/Decline here */}
                      <div className="shrink-0 flex items-center gap-1.5">
                        {user.id === currentUser.id ? (
                          <span className="text-slate-400 border border-slate-700 bg-slate-800 px-2.5 py-1 rounded-lg text-xs font-semibold">
                            You
                          </span>
                        ) : user.relationship === 'friend' ? (
                          <div className="flex items-center gap-1">
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" />
                              Friends
                            </span>
                            <button
                              onClick={() => {
                                onSelectUserForChat(user.id);
                                onClose();
                              }}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Chat
                            </button>
                          </div>
                        ) : user.relationship === 'sent_pending' ? (
                          <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 animate-pulse" />
                            Request Sent
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSendRequest(user.id)}
                            disabled={isLoading}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Add Friend
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-10 text-slate-500">
                  <Search className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                  <p className="text-sm font-medium">No users found</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Try searching by phone number (e.g. +1 555-234-5678) or email.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: PENDING REQUESTS */}
        {activeTab === 'requests' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {/* Incoming Requests Section */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                <span>Incoming Friend Requests</span>
                <span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-mono">
                  {incomingRequests.length}
                </span>
              </h3>

              {incomingRequests.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {incomingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="bg-slate-950/80 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={req.sender?.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${req.senderId}`}
                          alt={req.sender?.name}
                          className="w-10 h-10 rounded-full object-cover border border-slate-800 shrink-0"
                        />
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-100 truncate">
                            {req.sender?.name || 'User'}
                          </h4>
                          <p className="text-xs text-slate-400 truncate">
                            {req.sender?.email || req.sender?.phone}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleAcceptRequest(req.id, req.senderId)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Accept
                        </button>
                        <button
                          onClick={() => handleDeclineRequest(req.id, req.senderId)}
                          className="bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-500 bg-slate-950/30 rounded-xl border border-slate-850">
                  <p className="text-xs">No pending incoming friend requests.</p>
                </div>
              )}
            </div>

            {/* Outgoing Requests Section */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                <span>Sent Requests (Pending)</span>
                <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px] font-mono">
                  {outgoingRequests.length}
                </span>
              </h3>

              {outgoingRequests.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {outgoingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="bg-slate-950/40 border border-slate-850 rounded-xl p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={req.receiver?.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${req.receiverId}`}
                          alt={req.receiver?.name}
                          className="w-10 h-10 rounded-full object-cover border border-slate-800 shrink-0"
                        />
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-200 truncate">
                            {req.receiver?.name || 'User'}
                          </h4>
                          <p className="text-xs text-slate-500 truncate">
                            Waiting for acceptance
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 animate-pulse" />
                          Pending
                        </span>
                        <button
                          onClick={() => handleCancelRequest(req.id, req.receiverId)}
                          className="bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-500 bg-slate-950/30 rounded-xl border border-slate-850">
                  <p className="text-xs">No pending outgoing friend requests.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: SYNC PHONE CONTACTS */}
        {activeTab === 'contacts' && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            
            {/* Header / Actions */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  Phone Contact Matcher
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Matches device contacts by mobile number against registered users in Supabase.
                </p>
              </div>
              <button
                onClick={() => handleSyncContacts()}
                disabled={isSyncingContacts}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingContacts ? 'animate-spin' : ''}`} />
                Sync Now
              </button>
            </div>

            {/* Custom Contact Phone Add Input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add phone number to test (e.g. +1 555-234-5678)..."
                value={customPhoneInput}
                onChange={(e) => setCustomPhoneInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustomContact()}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleAddCustomContact}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
              >
                Add & Match
              </button>
            </div>

            {/* Contacts List */}
            <div className="flex flex-col gap-2">
              {contacts.length > 0 ? (
                contacts.map((contact, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold shrink-0">
                        {contact.registeredUser ? (
                          <img
                            src={contact.registeredUser.avatar}
                            alt={contact.name}
                            className="w-full h-full rounded-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          contact.name.charAt(0).toUpperCase()
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-100 truncate">
                            {contact.name}
                          </h4>
                          {contact.isRegistered ? (
                            <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded text-[9px] font-bold tracking-wider uppercase">
                              On Messenger
                            </span>
                          ) : (
                            <span className="bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded text-[9px]">
                              Not Registered
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">
                          {contact.phone} {contact.email ? `• ${contact.email}` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="shrink-0">
                      {contact.isRegistered && contact.registeredUser ? (
                        contact.registeredUser.relationship === 'friend' ? (
                          <button
                            onClick={() => {
                              onSelectUserForChat(contact.registeredUser!.id);
                              onClose();
                            }}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer"
                          >
                            Message
                          </button>
                        ) : (
                          <button
                            onClick={() => handleSendRequest(contact.registeredUser!.id)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Add Friend
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`Join me on secure chat! App link: ${window.location.origin}`);
                            showToast(`Invite link copied for ${contact.name}!`);
                          }}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Share2 className="w-3 h-3 text-emerald-400" />
                          Invite
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-500">
                  <Phone className="w-8 h-8 text-slate-700 mx-auto mb-2 animate-bounce" />
                  <p className="text-xs font-medium">Syncing device phone contacts...</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-3 bg-slate-950 border-t border-slate-850 flex justify-between items-center text-[10px] text-slate-500">
          <span>Supabase PostgreSQL + Socket.IO Realtime Engine</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold transition-colors cursor-pointer text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
