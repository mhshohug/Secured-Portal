export type MessageType = 'text' | 'image' | 'video' | 'file' | 'audio';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'seen';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  status: string;
  bio: string;
  phone: string;
  lastSeen: string;
  isOnline: boolean;
  typingTo?: string;
  createdAt?: string;
  uid?: string;
  fullName?: string;
  phoneNumber?: string;
  photoURL?: string;
}

export interface ReplyToPayload {
  id: string;
  content: string;
  senderName?: string;
  type?: MessageType;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: MessageType;
  timestamp: string;
  status: MessageStatus;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: string;
  duration?: string; // e.g. "0:12" for audio messages
  replyTo?: ReplyToPayload;
  isEdited?: boolean;
  editedAt?: string;
  deletedFor?: string[];
  isDeletedForEveryone?: boolean;
}

export type CallStatus = 
  | 'idle' 
  | 'calling' 
  | 'ringing' 
  | 'connecting' 
  | 'connected' 
  | 'ended' 
  | 'rejected' 
  | 'busy' 
  | 'missed' 
  | 'cancelled';

export type CallType = 'audio' | 'video';

export interface CallState {
  callId?: string;
  type: CallType;
  status: CallStatus;
  partnerId: string;
  durationSeconds: number;
  isIncoming: boolean;
  sdpOffer?: any;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';
export type RelationshipStatus = 'friend' | 'sent_pending' | 'received_pending' | 'none';

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendRequestStatus;
  createdAt: string;
  sender?: User;
  receiver?: User;
}

export interface SearchResultUser extends User {
  relationship: RelationshipStatus;
  requestId?: string;
}

export interface ContactItem {
  name: string;
  phone: string;
  email?: string;
  isRegistered: boolean;
  registeredUser?: SearchResultUser;
}

