export type ChatType = 'dm' | 'group' | 'channel';
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'voice' | 'sticker' | 'gif' | 'system';

export interface ActiveSession {
  id: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  location: string;
  ip: string;
  lastActive: string;
  isCurrent: boolean;
}

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string | null;
  photoURL: string | null;
  bio: string | null;
  lastSeen: any;
  isOnline: boolean;
  isAdmin?: number | boolean;
  defaultReaction?: string;
  chatWallpaper?: string;
  pinnedChatIds?: string[];
  lastSeenPrivacy?: 'everyone' | 'contacts' | 'nobody';
  activeSessions?: ActiveSession[];
}

export interface Chat {
  id: string;
  type: ChatType;
  visibility?: 'public' | 'private';
  handle?: string;
  memberUids: string[];
  admins: string[];
  ownerUid: string;
  name?: string;
  photoURL?: string;
  description?: string;
  bio?: string;
  bannedUids?: string[];
  mutedUids?: string[];
  unreadCount?: number;
  memberCount?: number;
  createdAt: any;
  lastMessage?: {
    text: string;
    senderId: string;
    createdAt: any;
  };
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  type: MessageType;
  mediaUrl?: string;
  fileName?: string;
  replyTo?: string;
  deleted: boolean;
  edited: boolean;
  reactions: Record<string, string[]>; // emoji -> [uids]
  createdAt: any;
  readBy?: string[];
}
