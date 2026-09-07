import React, { useEffect, useState, useRef } from 'react';
import {
  apiGetUsers,
  apiGetChats,
  apiGetChat,
  apiSearchChats,
  apiLookupChat,
  apiCreateChat,
  apiUpdateChat,
  apiDeleteChat,
  apiUpdateUserProfile,
  apiGetUserProfile,
  apiUploadMedia,
} from '../../lib/sqliteApi';
import { subscribe } from '../../lib/realtime';
import { useAuth, isUserOnline } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Chat, UserProfile } from '../../types';
import { Search, Plus, UserPlus, Hash, Check, Users, Megaphone, Menu, Cloud, Pin, PinOff, Trash2, CheckSquare, Square, X, AlertTriangle, MessageSquare } from 'lucide-react';
import { parseFlags, LION_AND_SUN_FLAG_URL } from '../../lib/emoji';
import { GlobalAudioPlayer } from './GlobalAudioPlayer';
import { motion, AnimatePresence } from 'motion/react';

const formatChatTimestamp = (dateInput: string | number | Date | undefined, isRTL: boolean): string => {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (isRTL) {
    if (diffMinutes < 1) return 'همین الان';
    if (diffMinutes < 60) return `${diffMinutes} دقیقه پیش`;
    if (diffHours < 24) return `${diffHours} ساعت پیش`;
    if (diffDays === 1) return 'دیروز';
    if (diffDays < 7) return `${diffDays} روز پیش`;
    return date.toLocaleDateString('fa-IR', { month: 'numeric', day: 'numeric' });
  }

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

interface SidebarProps {
  activeChat: Chat | null;
  onSelectChat: (chat: Chat | null) => void;
  showNewChatPanel: boolean;
  setShowNewChatPanel: (show: boolean) => void;
  onOpenMenu?: () => void;
  onTotalUnreadChange?: (count: number) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeChat, onSelectChat, showNewChatPanel, setShowNewChatPanel, onOpenMenu, onTotalUnreadChange }) => {
  const { user, profile, refreshProfile } = useAuth();
  const { t, isRTL } = useLanguage();
  const [chats, setChats] = useState<Chat[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [globalResults, setGlobalResults] = useState<{ users: UserProfile[], chats: Chat[] }>({ users: [], chats: [] });
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Multi-select & Batch Actions state
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  // Memoized so effects depending on it don't resubscribe on every render.
  const pinnedKey = (profile?.pinnedChatIds || []).join(',');
  const pinnedChatIds = React.useMemo(() => (pinnedKey ? pinnedKey.split(',') : []), [pinnedKey]);
  const isPinned = (chatId: string) => pinnedChatIds.includes(chatId);
  const isSelectionMode = selectedChatIds.length > 0;

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const rawTerm = searchTerm.trim();
    if (!rawTerm) {
      setGlobalResults({ users: [], chats: [] });
      setIsSearchingGlobal(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingGlobal(true);
      try {
        const cleanTerm = rawTerm.toLowerCase().replace(/^@/, '');
        const foundUsersMap = new Map<string, UserProfile>();
        const foundChatsMap = new Map<string, Chat>();

        const [users, publicChats, exactChat] = await Promise.all([
          apiGetUsers(cleanTerm).catch(() => []),
          apiSearchChats(cleanTerm).catch(() => []),
          apiLookupChat(cleanTerm).catch(() => null),
        ]);

        users.forEach((u: any) => {
          if (u?.uid && u.uid !== user?.uid) foundUsersMap.set(u.uid, u as UserProfile);
        });

        const addChat = (c: any) => {
          if (!c?.id) return;
          if (chats.some((existing) => existing.id === c.id)) return;
          foundChatsMap.set(c.id, c as Chat);
        };
        publicChats.forEach(addChat);
        addChat(exactChat);

        setGlobalResults({
          users: Array.from(foundUsersMap.values()),
          chats: Array.from(foundChatsMap.values())
        });
      } catch (error) {
        console.error("Global search error:", error);
      } finally {
        setIsSearchingGlobal(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchTerm, user, chats]);

  const [usersList, setUsersList] = useState<UserProfile[]>([]);

  const sortChats = (list: Chat[], pinned: string[]) =>
    [...list].sort((a, b) => {
      const aPinned = pinned.includes(a.id);
      const bPinned = pinned.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      const stamp = (c: Chat) => {
        const t = c.lastMessage?.createdAt || c.createdAt;
        return t ? new Date(t).getTime() || 0 : 0;
      };
      return stamp(b) - stamp(a);
    });

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const load = async () => {
      try {
        const list = await apiGetChats();
        if (!cancelled) {
          setChats(sortChats(list, pinnedChatIds));
          setIsInitialLoading(false);
        }
      } catch (e) {
        console.error("Failed to load chats:", e);
        setIsInitialLoading(false);
      }
    };

    load();

    const upsert = (incoming: Chat) =>
      setChats((prev) => {
        const next = prev.some((c) => c.id === incoming.id)
          ? prev.map((c) => (c.id === incoming.id ? { ...c, ...incoming } : c))
          : [...prev, incoming];
        return sortChats(next, pinnedChatIds);
      });

    const unsubs = [
      subscribe('chat.created', upsert),
      subscribe('chat.updated', upsert),
      subscribe('chat.removed', ({ id }) => setChats((prev) => prev.filter((c) => c.id !== id))),
      // lastMessage and unreadCount live on the chat row, so a new message reorders the list
      subscribe('message.created', load),
      subscribe('messages.read', load),
      subscribe('reconnect', load),
    ];

    return () => {
      cancelled = true;
      unsubs.forEach((off) => off());
    };
  }, [user, pinnedChatIds]);

  // Notify parent of total unread count changes
  useEffect(() => {
    const total = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    onTotalUnreadChange?.(total);
  }, [chats, onTotalUnreadChange]);

  // Listen for direct deletion events from ChatWindow to immediately
  // remove the chat from the list without waiting for SSE broadcast.
  useEffect(() => {
    const handleChatDeleted = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id) {
        setChats((prev) => prev.filter((c) => c.id !== detail.id));
      }
    };
    window.addEventListener('chat.deleted', handleChatDeleted);
    return () => window.removeEventListener('chat.deleted', handleChatDeleted);
  }, []);

  const [isGroupMode, setIsGroupMode] = useState(true);
  const [newChatType, setNewChatType] = useState<'group' | 'channel'>('group');
  const [newChatVisibility, setNewChatVisibility] = useState<'public' | 'private'>('public');
  const [groupName, setGroupName] = useState('');
  const [chatHandle, setChatHandle] = useState('');
  const [chatBio, setChatBio] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [chatPhotoURL, setChatPhotoURL] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [newChatError, setNewChatError] = useState<string | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);

  const handleChatPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    try {
      const res = await apiUploadMedia(file);
      setChatPhotoURL(res.url);
    } catch (err) {
      console.error("Chat photo upload error:", err);
      alert(isRTL ? "آپلود تصویر با خطا مواجه شد." : "Failed to upload image.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // `forMemberSelection` is true only for the contact list inside the new-chat panel,
  // where tapping a person toggles them into the pending group instead of opening a DM.
  const startNewChat = async (targetUser: UserProfile, forMemberSelection = false) => {
    if (forMemberSelection && isGroupMode) {
      if (selectedUsers.includes(targetUser.uid)) {
        setSelectedUsers(prev => prev.filter(id => id !== targetUser.uid));
      } else {
        setSelectedUsers(prev => [...prev, targetUser.uid]);
      }
      return;
    }

    if (!user) return;
    
    // 1. Check local state first for existing DM
    const existingChat = chats.find(c => c.type === 'dm' && (c.memberUids || []).includes(targetUser.uid));
    if (existingChat) {
      onSelectChat(existingChat);
      setShowNewChatPanel(false);
      setSearchTerm('');
      return;
    }

    // 2. Ask the server — the DM may exist but not be in the loaded list yet
    try {
      const serverChats = await apiGetChats();
      const found = serverChats.find(
        (c: Chat) => c.type === 'dm' && (c.memberUids || []).includes(targetUser.uid)
      );

      if (found) {
        onSelectChat(found);
        setShowNewChatPanel(false);
        setSearchTerm('');
        return;
      }

      // 3. Create NEW DM if none found
      const created = await apiCreateChat({
        type: 'dm',
        memberUids: [user.uid, targetUser.uid],
      });

      onSelectChat(created as Chat);
      setShowNewChatPanel(false);
      setSearchTerm('');
    } catch (e: any) {
      console.error("Error starting DM:", e);
      setNewChatError(e?.message || (isRTL ? "شروع گفتگو با خطا مواجه شد." : "Failed to start the chat."));
    }
  };

  // Opening a public chat from search results only previews it. ChatWindow shows a
  // join screen for non-members, so membership stays an explicit choice.
  const openSearchResult = async (chat: Chat) => {
    try {
      const full = await apiGetChat(chat.id).catch(() => null);
      onSelectChat((full || chat) as Chat);
      setSearchTerm('');
    } catch (e: any) {
      console.error("Failed to open chat:", e);
      setNewChatError(e?.message || (isRTL ? "باز کردن این گفتگو ممکن نبود." : "Could not open this chat."));
    }
  };

  const createGroup = async () => {
    if (!user || !groupName || !chatHandle) return;
    
    const cleanHandle = chatHandle.toLowerCase().replace(/[^a-z0-9_]/gi, '');
    if (!cleanHandle) {
      setNewChatError(isRTL ? "لطفا یک شناسه معتبر وارد کنید." : "Please enter a valid handle.");
      return;
    }

    setIsCreatingChat(true);
    setNewChatError(null);

    try {
      // The server owns handle uniqueness — usernames and chat handles share one
      // namespace, so a collision with either comes back as an error here.
      const created = await apiCreateChat({
        type: newChatType,
        name: groupName,
        handle: cleanHandle,
        visibility: newChatVisibility,
        description: chatBio,
        photoURL: chatPhotoURL || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + encodeURIComponent(groupName),
        memberUids: [user.uid, ...selectedUsers],
      });

      onSelectChat(created as Chat);
      setShowNewChatPanel(false);
      setIsGroupMode(false);
      setSelectedUsers([]);
      setGroupName('');
      setChatHandle('');
      setChatBio('');
      setChatPhotoURL('');
    } catch (err: any) {
      console.error("Failed to create chat:", err);
      const message = String(err?.message || '');
      if (message.includes('handle already taken')) {
        setNewChatError(isRTL ? "این شناسه قبلا گرفته شده است." : "This handle is already taken.");
      } else if (message.includes('reserved')) {
        setNewChatError(isRTL ? "این شناسه رزرو شده است." : "This handle is reserved.");
      } else if (message.includes('Invalid chat handle')) {
        setNewChatError(isRTL ? "شناسه باید ۳ تا ۳۲ حرف انگلیسی، عدد یا _ باشد." : "Handle must be 3-32 letters, digits or underscore.");
      } else {
        setNewChatError(message || (isRTL ? "خطایی رخ داد، لطفا دوباره تلاش کنید." : "An error occurred, please try again."));
      }
    } finally {
      setIsCreatingChat(false);
    }
  };

  const [memberSearchTerm, setMemberSearchTerm] = useState('');

  const fetchUsers = async () => {
    if (!user) return;

    // Collect all unique user UIDs that the current logged-in user has interacted with across all chats
    const interactedUids: string[] = Array.from(
      new Set(
        chats
          .flatMap(c => c.memberUids || [])
          .filter((id): id is string => Boolean(id) && id !== user.uid)
      )
    );

    if (interactedUids.length === 0) {
      setUsersList([]);
      return;
    }

    try {
      const fetchedMap = new Map<string, UserProfile>();

      const profiles = await Promise.all(
        interactedUids.map((uid) => apiGetUserProfile(uid).catch(() => null))
      );
      profiles.forEach((u: any) => {
        if (u?.uid) fetchedMap.set(u.uid, u as UserProfile);
      });

      // Fallback for any user the server could not resolve
      interactedUids.forEach((uid: string) => {
        if (!fetchedMap.has(uid)) {
          fetchedMap.set(uid, {
            uid,
            username: uid.substring(0, 8),
            displayName: `کاربر (${uid.substring(0, 5)})`,
            photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
            bio: null,
            lastSeen: null,
            isOnline: false,
          });
        }
      });

      setUsersList(Array.from(fetchedMap.values()));
    } catch (err) {
      console.error("Error fetching interacted users:", err);
    }
  };

  useEffect(() => {
    if (showNewChatPanel) fetchUsers();
  }, [showNewChatPanel, chats]);

  const filteredChats = chats.filter(c => {
    // Hide DM chats that have no messages yet (empty conversations)
    // to keep the chat list clean. Still show them during search.
    if (c.type === 'dm' && !c.lastMessage && !searchTerm) return false;

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase().trim();
    const cleanTerm = term.replace(/^@/, '');
    
    // Match Chat Name
    if (c.name?.toLowerCase().includes(cleanTerm)) return true;
    // Match Channel/Group Handle
    if (c.handle?.toLowerCase().includes(cleanTerm)) return true;
    // Match Chat ID
    if (c.id?.toLowerCase().includes(cleanTerm)) return true;
    
    // For DM chats, match partner's username, displayName, or UID
    if (c.type === 'dm' && c.memberUids) {
      const partnerUid = c.memberUids.find(id => id !== user?.uid);
      if (partnerUid) {
        if (partnerUid.toLowerCase().includes(cleanTerm)) return true;
        const partner = usersList.find(u => u.uid === partnerUid);
        if (partner) {
          if (partner.username?.toLowerCase().includes(cleanTerm)) return true;
          if (partner.displayName?.toLowerCase().includes(cleanTerm)) return true;
        }
      }
    }
    
    return false;
  });

  // Multi-select handlers
  const handleToggleSelectChat = (chatId: string) => {
    setSelectedChatIds(prev => 
      prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId]
    );
  };

  const handleLongPressChat = (chatId: string) => {
    if (!selectedChatIds.includes(chatId)) {
      setSelectedChatIds(prev => [...prev, chatId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedChatIds.length === filteredChats.length) {
      setSelectedChatIds([]);
    } else {
      setSelectedChatIds(filteredChats.map(c => c.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedChatIds([]);
  };

  // Pin / Unpin Selected
  const allSelectedArePinned = selectedChatIds.length > 0 && selectedChatIds.every(id => pinnedChatIds.includes(id));

  const handleTogglePinSelected = async () => {
    if (!user || selectedChatIds.length === 0) return;
    try {
      let nextPinned: string[];
      if (allSelectedArePinned) {
        // Unpin all selected
        nextPinned = pinnedChatIds.filter(id => !selectedChatIds.includes(id));
      } else {
        // Pin selected
        nextPinned = Array.from(new Set([...pinnedChatIds, ...selectedChatIds]));
      }

      await apiUpdateUserProfile(user.uid, { pinnedChatIds: nextPinned });
      await refreshProfile();
      setSelectedChatIds([]);
    } catch (err) {
      console.error("Error pinning/unpinning chats:", err);
    }
  };

  // Delete Selected Chats. Server-side deletion is a permanent cascade, so this is
  // gated behind the confirm dialog rather than an undo window.
  const handleConfirmDelete = async () => {
    if (!user || selectedChatIds.length === 0) return;
    setIsProcessingBatch(true);

    const targets = chats.filter(c => selectedChatIds.includes(c.id));

    try {
      for (const targetChat of targets) {
        if (targetChat.ownerUid === user.uid) {
          // I'm the owner — permanent delete
          await apiDeleteChat(targetChat.id);
        } else {
          // Not the owner (includes DMs where the other party is owner):
          // leave the chat instead of deleting it.
          await apiUpdateChat(targetChat.id, {
            memberUids: (targetChat.memberUids || []).filter(uid => uid !== user.uid)
          });
        }

        if (activeChat?.id === targetChat.id) {
          onSelectChat(null);
        }
      }

      const nextPinned = pinnedChatIds.filter(id => !selectedChatIds.includes(id));
      if (nextPinned.length !== pinnedChatIds.length) {
        await apiUpdateUserProfile(user.uid, { pinnedChatIds: nextPinned });
        await refreshProfile();
      }

      setChats(prev => prev.filter(c => !selectedChatIds.includes(c.id)));
      setSelectedChatIds([]);
      setIsDeleteDialogOpen(false);
    } catch (err) {
      console.error("Error deleting chats:", err);
    } finally {
      setIsProcessingBatch(false);
    }
  };

  return (
    <div className={`w-full h-full flex flex-col bg-brand-sidebar shrink-0 ${isRTL ? 'border-l' : 'border-r'} border-brand-border relative pb-28 md:pb-0 select-none`}>
      {/* Header Bar */}
      <div className="p-3.5 border-b border-brand-border relative overflow-hidden">
        <AnimatePresence mode="wait">
          {isSelectionMode ? (
            /* Multi-Select Action Bar */
            <motion.div 
              key="selection-bar"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={`flex items-center justify-between gap-2 py-1 ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              {/* Close Selection & Count */}
              <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <button
                  onClick={handleClearSelection}
                  className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.12] active:scale-95 text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer"
                  title={isRTL ? "انصراف" : "Cancel"}
                >
                  <X size={16} />
                </button>
                <div className={`flex flex-col ${isRTL ? 'text-right' : 'text-left'}`}>
                  <span className="text-xs font-bold text-brand-accent-text flex items-center gap-1.5">
                    <span>{selectedChatIds.length}</span>
                    <span>{isRTL ? "گفتگو انتخاب شد" : "selected"}</span>
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className={`flex items-center gap-1.5 ${isRTL ? 'flex-row-reverse' : ''}`}>
                {/* Select All */}
                <button
                  onClick={handleSelectAll}
                  className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.12] active:scale-95 text-gray-400 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer"
                  title={selectedChatIds.length === filteredChats.length ? (isRTL ? "لغو انتخاب همه" : "Deselect all") : (isRTL ? "انتخاب همه" : "Select all")}
                >
                  <CheckSquare size={16} className={selectedChatIds.length === filteredChats.length ? "text-brand-accent-text" : ""} />
                </button>

                {/* Pin / Unpin */}
                <button
                  onClick={handleTogglePinSelected}
                  className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.12] active:scale-95 text-gray-400 dark:text-gray-300 hover:text-brand-accent-text flex items-center justify-center transition-all cursor-pointer"
                  title={allSelectedArePinned ? (isRTL ? "برداشتن سنجاق" : "Unpin") : (isRTL ? "سنجاق کردن" : "Pin")}
                >
                  {allSelectedArePinned ? <PinOff size={16} /> : <Pin size={16} />}
                </button>

                {/* Delete */}
                <button
                  onClick={() => setIsDeleteDialogOpen(true)}
                  className="w-8 h-8 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 active:scale-95 text-rose-400 hover:text-rose-300 flex items-center justify-center transition-all cursor-pointer border border-rose-500/20"
                  title={isRTL ? "حذف گفتگوهای انتخاب‌شده" : "Delete selected"}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ) : (
            /* Normal Header (App Logo + Search) */
            <motion.div
              key="normal-header"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              {/* App Logo Header */}
              <div className="flex items-center gap-2 mb-2.5">
                <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center text-white shadow-md shrink-0 transition-all duration-300 ${isOnline ? 'bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-blue-500/25' : 'bg-gradient-to-tr from-amber-600 to-orange-600 shadow-orange-500/25'}`}>
                  <Cloud size={15} className={isOnline ? "animate-pulse shadow-sm" : "animate-bounce text-amber-100"} />
                </div>
                <div className="flex flex-col min-w-0">
                  {isOnline ? (
                    <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-gray-100 truncate" style={{ color: 'var(--logo-text)' }}>
                      {isRTL ? "کلودمسنجر" : "CloudMessenger"}
                    </h1>
                  ) : (
                    <div className="flex flex-col animate-in fade-in duration-300">
                      <h1 className="text-xs font-black tracking-tight text-amber-500 animate-pulse flex items-center gap-1 leading-none">
                        <span className="w-1 h-1 rounded-full bg-amber-500 animate-ping shrink-0" />
                        {isRTL ? "درحال اتصال..." : "Connecting..."}
                      </h1>
                      <span className="text-[8px] text-gray-500 font-extrabold mt-0.5 leading-none">
                        {isRTL ? "منتظر اینترنت" : "Waiting for network"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Improved glassmorphic search bar with menu button next to it on mobile */}
              <div className="flex items-center gap-2">
                {onOpenMenu && (
                  <button 
                    onClick={onOpenMenu}
                    className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl bg-gray-100 dark:bg-white/[0.04] hover:bg-gray-200 dark:hover:bg-white/[0.08] border border-gray-200/60 dark:border-white/[0.08] text-gray-400 hover:text-gray-900 dark:hover:text-white active:scale-95 transition-all shadow-sm shrink-0 cursor-pointer"
                    title={isRTL ? "منو" : "Menu"}
                  >
                    <Menu size={18} />
                  </button>
                )}

                <div className="relative flex-1">
                  <input 
                    id="sidebar-search-input"
                    type="text" 
                    placeholder="" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`w-full bg-gray-100 dark:bg-white/[0.03] backdrop-blur-md border border-gray-200/60 dark:border-white/[0.08] rounded-xl py-2 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/40 text-transparent caret-brand-accent fancy-transparent-input transition-all text-sm shadow-[inset_0_1px_2px_rgba(255,255,255,0.03)] ${isRTL ? 'pr-9 pl-24 text-right' : 'pl-9 pr-24 text-left'}`}
                  />
                  {/* Custom Emoji Visual Overlay */}
                  <div className={`absolute inset-y-0 flex items-center pointer-events-none text-sm text-brand-text whitespace-nowrap overflow-hidden select-none ${isRTL ? 'right-0 text-right pr-9 pl-24 w-full' : 'left-0 text-left pl-9 pr-4 w-full'}`}>
                    {searchTerm ? (
                      <span>{parseFlags(searchTerm)}</span>
                    ) : (
                      <span className="opacity-40">{t.searchPlaceholder}</span>
                    )}
                  </div>
                  {searchTerm.includes('🇮🇷') && (
                    <div dir="ltr" className={`absolute ${isRTL ? 'left-2' : 'right-2'} top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-brand-accent/20 border border-brand-accent/30 text-white animate-in zoom-in duration-200 select-none pointer-events-none`}>
                      <img src={LION_AND_SUN_FLAG_URL} className="w-4 h-3 object-cover rounded-sm" alt="Lion & Sun" />
                      <span className="text-[9px] font-bold text-brand-accent-text">{isRTL ? "شیر و خورشید" : "Lion & Sun"}</span>
                    </div>
                  )}
                  <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none`} size={15} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Global Audio Mini Player - Positioned right below the main header in conversation list */}
      <div className={activeChat ? "block md:hidden" : "block"}>
        <GlobalAudioPlayer />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar animate-in fade-in duration-300">
        {/* Searching loading indicator */}
        {searchTerm && isSearchingGlobal && (
          <div className="px-4 py-3 flex items-center justify-center gap-2 text-xs text-brand-accent-text">
            <div className="w-3.5 h-3.5 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
            <span>{isRTL ? "در حال جستجوی آیدی..." : "Searching ID..."}</span>
          </div>
        )}

        {/* Global Results Section */}
        {searchTerm && (globalResults.users.length > 0 || globalResults.chats.length > 0) && (
          <div className="px-4 py-2">
            <div className={`flex items-center justify-between mb-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-brand-accent-text opacity-90 flex items-center gap-1">
                <Search size={12} />
                <span>{isRTL ? "نتایج جستجوی آیدی و جهانی" : "ID & Global Results"}</span>
              </h3>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-accent/15 text-brand-accent-text font-mono">
                {globalResults.users.length + globalResults.chats.length} {isRTL ? "نتیجه" : "found"}
              </span>
            </div>

            {/* Global Channels & Groups */}
            {globalResults.chats.map(chat => (
              <div key={chat.id} className="relative group">
                <ChatItem
                  chat={chat}
                  active={activeChat?.id === chat.id}
                  isPinned={isPinned(chat.id)}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedChatIds.includes(chat.id)}
                  onClick={() => {
                    if (isSelectionMode) {
                      handleToggleSelectChat(chat.id);
                    } else {
                      openSearchResult(chat);
                    }
                  }}
                  onToggleSelect={handleToggleSelectChat}
                  onLongPress={handleLongPressChat}
                />
              </div>
            ))}

            {/* Global Users */}
            {globalResults.users.map(u => (
              <button 
                key={u.uid}
                onClick={() => startNewChat(u)}
                className={`w-full p-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/5 active:bg-gray-100 dark:active:bg-white/10 rounded-xl transition-all mb-1 group border border-transparent hover:border-gray-200/60 dark:hover:border-white/5 ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-brand-input ring-2 ring-gray-200/60 dark:ring-white/10 group-hover:ring-brand-accent/40 transition-all">
                  <img src={u.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + u.uid} alt="" className="w-full h-full object-cover" />
                </div>
                <div className={`flex-1 min-w-0 ${isRTL ? 'text-right' : 'text-left'}`}>
                  <div className="flex items-center gap-1.5 justify-between">
                    <div className="text-sm font-bold truncate text-brand-text group-hover:text-brand-accent-text transition-colors">
                      {parseFlags(u.displayName || u.username)}
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium shrink-0">
                      {isRTL ? "کاربر" : "User"}
                    </span>
                  </div>
                  <div className="text-[11px] text-brand-accent-text font-mono flex items-center gap-1 mt-0.5">
                    <span>@{u.username}</span>
                    <span className="text-[9px] text-gray-500 font-mono truncate max-w-[120px]">({u.uid})</span>
                  </div>
                </div>
              </button>
            ))}
            <div className="h-px bg-gray-200/60 dark:bg-white/10 my-3" />
          </div>
        )}

        {/* Local Filtered Chats */}
        {isInitialLoading && filteredChats.length === 0 && !searchTerm ? (
          <div className="p-3 space-y-3 animate-in fade-in duration-300">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className="w-11 h-11 rounded-full skeleton shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 skeleton w-2/3" />
                  <div className="h-2.5 skeleton w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredChats.length === 0 && !searchTerm ? (
          <div className="p-8 text-center text-gray-500 text-sm flex flex-col items-center gap-4 animate-in fade-in duration-300">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-600/15 to-indigo-600/15 border border-blue-500/20 flex items-center justify-center shadow-inner">
              <MessageSquare size={36} className="text-blue-400 opacity-70" />
            </div>
            <div className="space-y-1.5">
              <p className="font-bold text-brand-text text-sm">{isRTL ? "هنوز گفتگویی ندارید" : "No conversations yet"}</p>
              <p className="text-[11px] text-gray-500 max-w-[220px] mx-auto leading-relaxed">{isRTL ? "اولین گفتگوی خود را با دوستان یا گروه‌ها شروع کنید." : "Start your first conversation with friends or groups."}</p>
            </div>
            <button
              onClick={() => { setShowNewChatPanel(true); setIsGroupMode(true); setNewChatType('group'); }}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <Plus size={16} />
              <span>{isRTL ? "شروع اولین چت" : "Start First Chat"}</span>
            </button>
          </div>
        ) : filteredChats.length === 0 && searchTerm && globalResults.users.length === 0 && globalResults.chats.length === 0 && !isSearchingGlobal ? (
          <div className="p-8 text-center text-gray-400 text-xs flex flex-col items-center gap-2">
            <Search size={28} className="text-gray-600 opacity-60 stroke-1" />
            <p className="font-medium text-gray-600 dark:text-gray-300">
              {isRTL ? "موردی با این آیدی یا مشخصات یافت نشد." : "No account, group, or channel found with this ID."}
            </p>
            <p className="text-[10px] text-gray-500">
              {isRTL ? "لطفاً آیدی را همراه با @ یا شناسه دقیق وارد کنید." : "Try searching with @username or exact handle."}
            </p>
          </div>
        ) : (
          filteredChats.map(chat => (
            <ChatItem 
              key={chat.id} 
              chat={chat} 
              active={activeChat?.id === chat.id} 
              isPinned={isPinned(chat.id)}
              isSelectionMode={isSelectionMode}
              isSelected={selectedChatIds.includes(chat.id)}
              onClick={() => {
                if (isSelectionMode) {
                  handleToggleSelectChat(chat.id);
                } else {
                  onSelectChat(chat);
                }
              }} 
              onToggleSelect={handleToggleSelectChat}
              onLongPress={handleLongPressChat}
            />
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-brand-sidebar border border-brand-border rounded-2xl p-5 max-w-sm w-full shadow-2xl overflow-hidden"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-500 mb-3 shadow-inner">
                  <AlertTriangle size={24} />
                </div>
                <h3 className="text-base font-bold text-brand-text mb-1">
                  {isRTL ? (selectedChatIds.length > 1 ? `حذف ${selectedChatIds.length} گفتگو` : "حذف گفتگو") : (selectedChatIds.length > 1 ? `Delete ${selectedChatIds.length} Chats` : "Delete Chat")}
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-5">
                  {isRTL 
                    ? `آیا از حذف ${selectedChatIds.length > 1 ? `${selectedChatIds.length} گفتگوی انتخاب‌شده` : "این گفتگو"} اطمینان دارید؟ پیام‌ها و محتوای این گفتگو پاک خواهد شد.` 
                    : `Are you sure you want to delete ${selectedChatIds.length > 1 ? `${selectedChatIds.length} selected chats` : "this chat"}? This action cannot be undone.`}
                </p>
                <div className="flex gap-2.5 w-full">
                  <button
                    onClick={() => setIsDeleteDialogOpen(false)}
                    disabled={isProcessingBatch}
                    className="flex-1 py-2.5 rounded-xl border border-brand-border hover:bg-gray-50 dark:hover:bg-white/5 active:scale-95 text-xs font-semibold text-gray-500 dark:text-gray-300 transition-all cursor-pointer"
                  >
                    {isRTL ? "انصراف" : "Cancel"}
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    disabled={isProcessingBatch}
                    className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-xs font-semibold text-white shadow-lg shadow-rose-600/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isProcessingBatch && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                    <span>{isRTL ? "حذف گفتگو" : "Delete"}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showNewChatPanel && (
        <div className={`absolute inset-0 z-50 bg-brand-sidebar flex flex-col animate-in ${isRTL ? 'slide-in-from-left' : 'slide-in-from-right'} duration-300 overflow-hidden`}>
          <div className="p-4 md:p-6 border-b border-gray-200/60 dark:border-gray-800 flex items-center justify-between bg-brand-sidebar/80 backdrop-blur-md shrink-0">
            <div className={isRTL ? 'text-right' : ''}>
              <h2 className="text-lg font-bold tracking-tight">
                {newChatType === 'group' 
                  ? (isRTL ? "گروه جدید" : 'New Group') 
                  : (isRTL ? "کانال جدید" : 'New Channel')}
              </h2>
              <p className="text-[10px] text-blue-400 font-medium font-mono">{selectedUsers.length} {isRTL ? "کاربر انتخاب شدند" : "users selected"}</p>
            </div>
            <button 
              onClick={() => { setShowNewChatPanel(false); setIsGroupMode(true); setSelectedUsers([]); }} 
              className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
            >
              {isRTL ? "لغو" : "Cancel"}
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 pb-20 md:pb-6">
            <div className="flex gap-2 mb-6 p-1 bg-brand-input rounded-2xl">
              <button 
                onClick={() => { setIsGroupMode(true); setNewChatType('group'); }}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all ${newChatType === 'group' ? 'bg-brand-accent text-white shadow-lg' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              >
                {isRTL ? "گروه" : "Group"}
              </button>
              <button 
                onClick={() => { setIsGroupMode(true); setNewChatType('channel'); }}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all ${newChatType === 'channel' ? 'bg-brand-accent text-white shadow-lg' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              >
                {isRTL ? "کانال" : "Channel"}
              </button>
            </div>

            {isGroupMode && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 mb-6">
                {/* Chat Profile Photo Selector */}
                <div className="flex flex-col items-center mb-4">
                  <div 
                    onClick={() => chatFileInputRef.current?.click()}
                    className="w-20 h-20 rounded-2xl bg-brand-input hover:bg-brand-input/80 border border-dashed border-gray-300 dark:border-gray-700 hover:border-blue-500 overflow-hidden flex flex-col items-center justify-center cursor-pointer transition-all relative group shadow-sm shrink-0"
                  >
                    {chatPhotoURL ? (
                      <img src={chatPhotoURL} alt="Group profile preview" className="w-full h-full object-cover animate-in fade-in duration-200" />
                    ) : (
                      <div className="flex flex-col items-center text-center p-2">
                        <Plus className="text-blue-500 group-hover:text-blue-400 group-hover:scale-110 transition-all" size={24} />
                        <span className="text-[10px] text-gray-400 mt-1">{isUploadingPhoto ? (isRTL ? "درحال آپلود..." : "Uploading...") : (isRTL ? "تصویر" : "Profile Photo")}</span>
                      </div>
                    )}
                    {chatPhotoURL && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px] font-bold">
                        {isRTL ? "تغییر تصویر" : "Change Photo"}
                      </div>
                    )}
                  </div>
                  <input 
                    type="file" 
                    ref={chatFileInputRef} 
                    className="hidden" 
                    onChange={handleChatPhotoUpload} 
                    accept="image/*" 
                  />
                </div>

                <input 
                  type="text" 
                  placeholder={newChatType === 'group' ? (isRTL ? "نام گروه" : "Group Name") : (isRTL ? "نام کانال" : "Channel Name")} 
                  value={groupName}
                  onChange={(e) => { setGroupName(e.target.value); setNewChatError(null); }}
                  className={`w-full bg-brand-input border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none text-brand-text ${isRTL ? 'text-right' : ''}`}
                />
                <div className="relative">
                  <span className={`absolute ${isRTL ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-gray-500 text-sm`}>@</span>
                  <input 
                    type="text" 
                    placeholder={isRTL ? "شناسه (آیدی)" : "Handle / ID"} 
                    value={chatHandle}
                    onChange={(e) => { setChatHandle(e.target.value); setNewChatError(null); }}
                    className={`w-full bg-brand-input border border-gray-300 dark:border-gray-700 rounded-xl py-3 text-sm focus:border-blue-500 outline-none text-brand-text ${isRTL ? 'pr-8 pl-4 text-right' : 'pl-8 pr-4'}`}
                  />
                </div>
                <textarea
                  placeholder={isRTL ? "توضیحات (بیوگرافی)" : "Bio / Description"}
                  value={chatBio}
                  onChange={(e) => { setChatBio(e.target.value); setNewChatError(null); }}
                  className={`w-full bg-brand-input border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none text-brand-text h-20 resize-none ${isRTL ? 'text-right' : ''}`}
                />
                <div className="space-y-2">
                  {([
                    {
                      value: 'public' as const,
                      label: isRTL ? 'عمومی' : 'Public',
                      hint: isRTL ? 'هر کسی با آیدی پیدا می‌کند و عضو می‌شود' : 'Anyone can find it by ID and join',
                    },
                    {
                      value: 'private' as const,
                      label: isRTL ? 'خصوصی' : 'Private',
                      hint: isRTL ? 'فقط با لینک دعوت' : 'Invite link only',
                    },
                  ]).map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => { setNewChatVisibility(option.value); setNewChatError(null); }}
                      className={`w-full px-4 py-2.5 rounded-xl border text-left transition-all flex items-center gap-3 cursor-pointer ${isRTL ? 'flex-row-reverse text-right' : ''} ${
                        newChatVisibility === option.value
                          ? 'border-brand-accent bg-brand-accent/10'
                          : 'border-gray-300 dark:border-gray-700 bg-brand-input hover:border-gray-400 dark:hover:border-gray-600'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                        newChatVisibility === option.value ? 'border-brand-accent' : 'border-gray-600'
                      }`}>
                        {newChatVisibility === option.value && <span className="w-2 h-2 rounded-full bg-brand-accent" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-brand-text">{option.label}</span>
                        <span className="block text-[10px] text-gray-500 truncate">{option.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {newChatError && (
                  <div className="text-xs font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/20 px-4 py-2.5 rounded-xl animate-in fade-in duration-200 text-center">
                    {newChatError}
                  </div>
                )}
                <button 
                  onClick={createGroup}
                  disabled={!groupName || !chatHandle || isCreatingChat}
                  className="w-full py-4 bg-brand-accent text-white rounded-2xl font-bold text-sm disabled:opacity-50 shadow-lg shadow-brand-accent/25 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isCreatingChat && <span className="w-4 h-4 rounded-full border-2 border-white/35 border-t-white animate-spin" />}
                  <span>{isRTL ? (newChatType === 'group' ? "ایجاد گروه" : "ایجاد کانال") : (newChatType === 'group' ? "Create Group" : "Create Channel")}</span>
                </button>
                <div className="h-px bg-gray-800 w-full my-2" />
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    {isRTL 
                      ? `انتخاب اعضا (${selectedUsers.length} عضو انتخاب شده)` 
                      : `Select Members (${selectedUsers.length} selected)`}
                  </h3>
                  {selectedUsers.length > 0 && (
                    <button 
                      type="button" 
                      onClick={() => setSelectedUsers([])}
                      className="text-[10px] text-rose-400 hover:text-rose-300 font-medium transition-colors cursor-pointer"
                    >
                      {isRTL ? "حذف همه" : "Clear all"}
                    </button>
                  )}
                </div>

                {/* Selected Users Chips */}
                {selectedUsers.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto py-1 scrollbar-none my-1">
                    {selectedUsers.map(uid => {
                      const u = usersList.find(item => item.uid === uid);
                      const displayName = u?.displayName || u?.username || uid.substring(0, 6);
                      return (
                        <div 
                          key={uid} 
                          className="flex items-center gap-1.5 bg-brand-accent/20 border border-brand-accent/40 text-white px-2.5 py-1 rounded-full shrink-0 text-xs animate-in fade-in duration-200"
                        >
                          <img 
                            src={u?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`} 
                            alt="" 
                            className="w-4 h-4 rounded-full object-cover shrink-0" 
                          />
                          <span className="font-medium max-w-[90px] truncate text-[11px]">{displayName}</span>
                          <button 
                            type="button"
                            onClick={() => setSelectedUsers(prev => prev.filter(id => id !== uid))}
                            className="text-gray-400 hover:text-gray-900 dark:hover:text-white p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Member Search filter input */}
                {usersList.length > 0 && (
                  <div className="relative mt-2">
                    <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-gray-500`} size={14} />
                    <input 
                      type="text" 
                      value={memberSearchTerm}
                      onChange={(e) => setMemberSearchTerm(e.target.value)}
                      placeholder={isRTL ? "جستجو در مخاطبین..." : "Search contacts..."}
                      className={`w-full bg-brand-input border border-gray-300 dark:border-gray-800 focus:border-blue-500/50 rounded-xl text-xs py-2 outline-none text-brand-text ${isRTL ? 'pr-8 pl-3 text-right' : 'pl-8 pr-3'}`}
                    />
                  </div>
                )}
              </div>
            )}

            {(() => {
              const displayedUsers = usersList.filter(u => {
                if (!memberSearchTerm.trim()) return true;
                const term = memberSearchTerm.toLowerCase().trim().replace(/^@/, '');
                const name = (u.displayName || '').toLowerCase();
                const username = (u.username || '').toLowerCase();
                return name.includes(term) || username.includes(term);
              });

              if (usersList.length === 0) {
                return (
                  <div className="p-8 text-center text-gray-500 text-xs leading-relaxed space-y-2">
                    <Users className="mx-auto text-gray-600 opacity-60" size={32} />
                    <p className="font-medium text-gray-400">
                      {isRTL 
                        ? "هیچ مخاطبی که قبلاً با او تعامل یا گفتگویی داشته باشید یافت نشد." 
                        : "No previously interacted contacts found."}
                    </p>
                    <p className="text-[11px] text-gray-600">
                      {isRTL 
                        ? "تنها کاربرانی که با آنها سابقه گفتگو دارید در این بخش نمایش داده می‌شوند." 
                        : "Only users you have existing conversations with are listed here."}
                    </p>
                  </div>
                );
              }

              if (displayedUsers.length === 0) {
                return (
                  <div className="p-6 text-center text-gray-500 text-xs italic">
                    {isRTL ? "مخاطبی با این مشخصات یافت نشد." : "No contacts matched your search."}
                  </div>
                );
              }

              return displayedUsers.map(u => {
                const isSelected = selectedUsers.includes(u.uid);
                return (
                  <button 
                    key={u.uid} 
                    onClick={() => startNewChat(u, true)}
                    className={`w-full p-3.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-all border-b border-gray-200/60 dark:border-gray-800/60 rounded-xl mb-1 ${isSelected ? 'bg-brand-accent/15 border-brand-accent/30' : ''} ${isRTL ? 'flex-row-reverse' : ''}`}
                  >
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-brand-input border border-gray-300 dark:border-gray-800">
                        <img src={u.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + u.uid} alt="" className="w-full h-full object-cover" />
                      </div>
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 bg-brand-accent text-white rounded-full p-0.5 border-2 border-brand-sidebar">
                          <Check size={11} />
                        </div>
                      )}
                    </div>
                    <div className={`flex-1 min-w-0 ${isRTL ? 'text-right' : ''}`}>
                      <div className="text-xs font-bold truncate text-brand-text">{parseFlags(u.displayName || u.username)}</div>
                      <div className="text-[10px] text-brand-accent-text font-medium font-mono uppercase tracking-tight">@{u.username}</div>
                    </div>
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isSelected ? 'bg-brand-accent border-brand-accent text-white' : 'border-gray-300 dark:border-gray-700 bg-brand-input text-transparent'}`}>
                      <Check size={12} />
                    </div>
                  </button>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB) for starting new chats (hidden during selection mode) */}
      {!showNewChatPanel && !isSelectionMode && (
        <button 
          onClick={() => { setShowNewChatPanel(true); setIsGroupMode(true); setNewChatType('group'); }}
          className={`absolute bottom-20 md:bottom-6 ${isRTL ? 'left-6' : 'right-6'} w-14 h-14 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-[0_8px_24px_rgba(37,99,235,0.4)] hover:shadow-[0_12px_30px_rgba(37,99,235,0.5)] scale-100 hover:scale-105 transition-all duration-300 z-40 active:scale-95 group border border-white/10`}
          title={isRTL ? "گفتگوی جدید" : "New Conversation"}
        >
          <Plus size={24} className="transition-transform duration-300 group-hover:rotate-90 text-white font-bold" />
        </button>
      )}
    </div>
  );
};

interface ChatItemProps {
  chat: Chat;
  active: boolean;
  isPinned: boolean;
  isSelectionMode: boolean;
  isSelected: boolean;
  onClick: () => void;
  onToggleSelect: (chatId: string) => void;
  onLongPress: (chatId: string) => void;
}

const ChatItem: React.FC<ChatItemProps> = ({ 
  chat, 
  active, 
  isPinned, 
  isSelectionMode, 
  isSelected, 
  onClick, 
  onToggleSelect, 
  onLongPress 
}) => {
  const { user } = useAuth();
  const { isRTL } = useLanguage();
  const [partner, setPartner] = useState<UserProfile | null>(null);

  // Long press detection refs
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressedRef = useRef(false);
  const touchStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [swipeOffset, setSwipeOffset] = useState(0);
  const isSwipeActive = useRef(false);
  const swipeStartX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isSelectionMode) return;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    isLongPressedRef.current = false;
    swipeStartX.current = touch.clientX;
    isSwipeActive.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressedRef.current = true;
      if ('vibrate' in navigator) {
        try { navigator.vibrate(50); } catch (_) {}
      }
      onLongPress(chat.id);
    }, 450);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = touch.clientX - swipeStartX.current;
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);

    // If horizontal movement dominates, treat as swipe
    if (!isSwipeActive.current && Math.abs(dx) > 10 && Math.abs(dx) > dy) {
      isSwipeActive.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    if (isSwipeActive.current) {
      const offset = Math.min(0, dx); // only swipe left
      setSwipeOffset(Math.max(-80, offset));
      return;
    }

    if (timerRef.current) {
      const dxAbs = Math.abs(dx);
      if (dxAbs > 10 || dy > 10) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    if (isSwipeActive.current) {
      if (swipeOffset < -50) {
        // trigger delete - put chat into selection and open delete dialog
        onLongPress(chat.id);
      }
      setSwipeOffset(0);
      isSwipeActive.current = false;
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSelectionMode || e.button !== 0) return;
    isLongPressedRef.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressedRef.current = true;
      onLongPress(chat.id);
    }, 450);
  };

  const handleMouseUp = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isLongPressedRef.current) {
      isLongPressedRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (isSelectionMode) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect(chat.id);
      return;
    }
    onClick();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onLongPress(chat.id);
  };

  useEffect(() => {
    if (chat.type !== 'dm' || !user) return;

    const partnerUid = (chat.memberUids || []).find(id => id !== user.uid);
    if (!partnerUid) return;

    let cancelled = false;
    const load = () => {
      apiGetUserProfile(partnerUid)
        .then((p) => { if (!cancelled && p) setPartner(p as UserProfile); })
        .catch(() => {});
    };
    load();

    const offProfile = subscribe('profile.updated', (p: any) => {
      if (p?.uid === partnerUid) setPartner(p as UserProfile);
    });
    const offPresence = subscribe('presence.changed', (p: any) => {
      if (p?.uid === partnerUid) {
        setPartner((prev) => (prev ? { ...prev, isOnline: p.isOnline, lastSeen: p.lastSeen } : prev));
      }
    });

    return () => {
      cancelled = true;
      offProfile();
      offPresence();
    };
  }, [chat.type, chat.memberUids, user]);

  // unreadCount is computed server-side and carried on the chat payload.
  const unreadCount = chat.unreadCount || 0;

  const name = chat.type === 'dm' ? (partner?.displayName || partner?.username || '...') : chat.name;
  const photo = chat.type === 'dm' ? (partner?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + partner?.uid) : chat.photoURL;

  return (
    <div className="relative overflow-hidden rounded-xl mb-1 mx-2">
      {/* Slide-to-delete background */}
      {swipeOffset < -10 && (
        <div className="slide-delete-bg">
          <Trash2 size={18} className="text-white" />
        </div>
      )}
    <div
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={handleContextMenu}
      style={{ transform: `translateX(${swipeOffset}px)`, transition: isSwipeActive.current ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
      className={`relative z-10 p-3 flex items-center gap-3 transition-colors cursor-pointer select-none ${
        isRTL ? 'border-r-4' : 'border-l-4'
      } ${
        isSelected
          ? 'bg-blue-500/15 dark:bg-brand-accent/20 border-blue-600 dark:border-brand-accent rounded-xl shadow-xs'
          : active
            ? 'bg-blue-500/10 dark:bg-brand-accent/15 border-blue-600 dark:border-brand-accent rounded-xl'
            : 'border-transparent hover:bg-slate-500/10 dark:hover:bg-white/5 rounded-xl'
      } group`}
    >
      {/* Selection Checkmark Indicator */}
      <AnimatePresence>
        {isSelectionMode && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className={`shrink-0 flex items-center justify-center ${isRTL ? 'ml-1' : 'mr-1'}`}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
              isSelected 
                ? 'bg-brand-accent text-white shadow-md scale-105' 
                : 'border-2 border-gray-300 dark:border-white/30 bg-gray-100 dark:bg-black/20 hover:border-gray-400 dark:hover:border-white/60'
            }`}>
              {isSelected && <Check size={12} strokeWidth={3} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative shrink-0">
        <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-brand-input border border-black/5 dark:border-white/5">
          {photo ? (
            <img src={photo} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-gray-400 group-hover:text-gray-600 dark:group-hover:text-white transition-colors">
              {chat.type === 'dm' ? <UserPlus size={20} /> : <Users size={20} />}
            </div>
          )}
        </div>
        {chat.type === 'dm' && isUserOnline(partner, user?.uid) && (
          <div className={`absolute bottom-0 ${isRTL ? 'left-0' : 'right-0'} w-3.5 h-3.5 bg-green-500 border-2 border-brand-sidebar rounded-full shadow-[0_0_6px_rgba(34,197,94,0.6)]`}></div>
        )}
      </div>

      <div className={`flex-1 min-w-0 ${isRTL ? 'text-right' : 'text-left'}`}>
        <div className="flex justify-between items-baseline mb-0.5">
          <div className="text-sm font-black truncate pr-1 pl-1 text-[#2c2c2c] dark:text-gray-100 flex items-center gap-1.5 min-w-0">
            {chat.type === 'channel' && <Megaphone size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />}
            {chat.type === 'group' && <Users size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />}
            <span className="truncate text-[#2c2c2c] dark:text-gray-100 font-black">{parseFlags(name)}</span>
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            {isPinned && (
              <Pin size={12} className="text-blue-600 dark:text-blue-400 rotate-45 shrink-0" fill="currentColor" />
            )}
            {chat.lastMessage && (
              <div className="text-[11px] text-slate-500 dark:text-gray-400 font-medium whitespace-nowrap">
                {formatChatTimestamp(chat.lastMessage.createdAt, isRTL)}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center mt-0.5">
          <div className="text-xs text-slate-600 dark:text-gray-300 truncate flex-1 pr-1 pl-1 font-normal flex items-center min-w-0">
            <bdi className="truncate text-slate-700 dark:text-gray-300">
              {parseFlags(chat.lastMessage ? chat.lastMessage.text : (chat.type === 'dm' ? (isRTL ? 'برای گفتگو ضربه بزنید' : 'Tap to start chatting') : (isRTL ? 'گروه ساخته شد' : 'Group created')))}
            </bdi>
          </div>
          {unreadCount > 0 && (
            <span className="min-w-[18px] h-[18px] px-1.5 flex items-center justify-center text-[9px] font-black text-white bg-blue-600 dark:bg-brand-accent rounded-full shrink-0 shadow-xs animate-in zoom-in duration-200">
              {unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
    </div>
  );
};
