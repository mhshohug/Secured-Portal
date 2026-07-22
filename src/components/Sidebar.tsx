import { useState } from 'react';
import { Search, MessageSquare, CircleDot, UserCheck, LogOut, UserPlus } from 'lucide-react';
import { User } from '../types';
import { useAuth } from '../contexts/Auth';

interface SidebarProps {
  users: User[];
  currentUser: User;
  activeUserId: string | null;
  onSelectUser: (id: string) => void;
  onSwitchUser: (id: string) => void;
  onOpenMyProfile: () => void;
  onOpenAddFriend?: () => void;
  pendingRequestsCount?: number;
}

export default function Sidebar({
  users,
  currentUser,
  activeUserId,
  onSelectUser,
  onSwitchUser,
  onOpenMyProfile,
  onOpenAddFriend,
  pendingRequestsCount = 0,
}: SidebarProps) {
  const { logout } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Filter out the currently logged-in user's ID (Strict User Filtering constraint)
  const filteredUsers = users.filter((u) => {
    // Exclude current user
    if (u.id === currentUser.id) return false;
    
    // Filter by search text
    if (searchTerm) {
      return u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
             u.email.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  return (
    <div className="w-full h-full bg-slate-900 flex flex-col shrink-0 overflow-hidden text-slate-100">
      
      {/* Current User Simulator Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div 
            onClick={onOpenMyProfile}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="relative">
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-10 h-10 rounded-full object-cover border-2 border-emerald-500 hover:border-emerald-400 transition-all"
                referrerPolicy="no-referrer"
              />
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-950" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors flex items-center gap-1">
                {currentUser.name}
                <span className="text-[10px] bg-slate-850 px-1.5 py-0.5 rounded text-emerald-400 border border-emerald-500/10 font-normal">You</span>
              </p>
              <p className="text-xs text-slate-400 truncate max-w-[130px]">{currentUser.status}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenAddFriend && (
              <button
                onClick={onOpenAddFriend}
                className="p-2 rounded-xl transition-all border bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white font-bold cursor-pointer relative shadow-sm"
                title="Find & Add Friends / Sync Contacts"
              >
                <UserPlus className="w-4 h-4" />
                {pendingRequestsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-slate-950">
                    {pendingRequestsCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-3.5 border-b border-slate-800 bg-slate-900/40">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800/80 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      {/* Contacts List Header */}
      <div className="px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-widest bg-slate-950/20 border-b border-slate-800/50 flex items-center justify-between">
        <span>Active Contacts</span>
        <span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold font-mono">
          {filteredUsers.length}
        </span>
      </div>

      {/* Contacts Scrollable List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-850/40 bg-slate-900/10">
        {filteredUsers.length > 0 ? (
          filteredUsers.map((user) => {
            const isActive = user.id === activeUserId;
            return (
              <div
                key={user.id}
                onClick={() => onSelectUser(user.id)}
                className={`flex items-center gap-3.5 p-3.5 cursor-pointer transition-all ${
                  isActive
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/15 border-l-4 border-emerald-500 pl-[10px]'
                    : 'hover:bg-slate-850/50 pl-[14px]'
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-11 h-11 rounded-full object-cover border border-slate-800"
                    referrerPolicy="no-referrer"
                  />
                  <span
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${
                      user.isOnline ? 'bg-emerald-500' : 'bg-slate-500'
                    }`}
                  />
                </div>

                {/* Info summary */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <p className="text-sm font-bold text-slate-200 truncate">
                      {user.name}
                    </p>
                    <span className="text-[10px] text-slate-500">
                      {user.isOnline ? 'Active' : 'Offline'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5 italic">
                    "{user.status}"
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-slate-500">
            <MessageSquare className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-xs">No contacts found</p>
            <p className="text-[10px] text-slate-600 mt-1">Logged-in ID is excluded.</p>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-slate-950 border-t border-slate-850 text-[10px] text-slate-500 flex items-center justify-between gap-1.5 font-mono">
        <div className="flex items-center gap-1 min-w-0">
          <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span className="truncate">UID: {currentUser.id}</span>
        </div>
        <button
          onClick={logout}
          className="text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 transition-colors cursor-pointer bg-rose-500/10 hover:bg-rose-500/15 px-2.5 py-1 rounded border border-rose-500/20 font-sans shrink-0"
        >
          <LogOut className="w-3 h-3" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
