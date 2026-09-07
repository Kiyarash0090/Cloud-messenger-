import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  apiGetChat,
  apiGetUserProfile,
  apiGetMessages,
  apiGetUsers,
  apiSendMessage,
  apiUpdateMessage,
  apiDeleteMessage,
  apiRestoreMessage,
  apiRestoreMessages,
  apiToggleReaction,
  apiMarkChatRead,
  apiUpdateChat,
  apiDeleteChat,
  apiJoinChat,
  apiUploadMedia,
  getAuthHeaders,
  getSessionToken,
} from '../../lib/sqliteApi';
import { subscribe } from '../../lib/realtime';
import { useAuth, isUserOnline } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAudioPlayer } from '../../contexts/AudioPlayerContext';
import { useUndo } from '../../contexts/UndoContext';
import { Chat, Message, UserProfile } from '../../types';
import { Send, Image as ImageIcon, Mic, Paperclip, MoreVertical, Search, Smile, Keyboard, Trash2, Edit2, Reply, Check, CheckCheck, X, MessageSquare, Hash, Shield, Plus, ChevronLeft, ChevronRight, Megaphone, Users, ChevronDown, Settings, Copy, CheckSquare, Download, Share2 } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone, DropzoneOptions } from 'react-dropzone';
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react';
import { parseFlags, LION_AND_SUN_FLAG_URL } from '../../lib/emoji';
import { CustomImagePlayer } from './CustomImagePlayer';
import { CustomVideoPlayer } from './CustomVideoPlayer';
import { CustomAudioPlayer } from './CustomAudioPlayer';
import { GlobalAudioPlayer } from './GlobalAudioPlayer';
import { startDownload, DownloadProgressEventDetail } from '../../utils/downloadHelper';
import { getDoodleWallpaperStyle } from '../../lib/chatDoodle';
import { UserProfileCard } from './UserProfileCard';

const reportApiError = (error: unknown, operationType: string, path: string | null) => {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('API Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

const getMessageDateString = (msg: Message, isRTL: boolean) => {
  const date = msg.createdAt ? new Date(msg.createdAt) : new Date();

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  if (isSameDay(date, today)) {
    return isRTL ? 'امروز' : 'Today';
  } else if (isSameDay(date, yesterday)) {
    return isRTL ? 'دیروز' : 'Yesterday';
  } else {
    if (isRTL) {
      try {
        return new Intl.DateTimeFormat('fa-IR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }).format(date);
      } catch (e) {
        return date.toLocaleDateString('fa-IR');
      }
    } else {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(date);
    }
  }
};

const getWallpaperStyle = (wallpaper: string | undefined): React.CSSProperties => {
  // If user provided custom URL image (starts with http, data: or /)
  if (wallpaper && (wallpaper.startsWith('http://') || wallpaper.startsWith('https://') || wallpaper.startsWith('data:') || wallpaper.startsWith('/api/'))) {
    return {
      backgroundImage: `linear-gradient(to bottom, rgba(10, 14, 26, 0.55), rgba(13, 17, 23, 0.75)), url("${wallpaper}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundAttachment: 'fixed',
    };
  }

  // Otherwise, render the Telegram-style Cloud doodle pattern wallpaper
  return getDoodleWallpaperStyle(wallpaper);
};

interface ChatWindowProps {
  chat: Chat | null;
  onClose: () => void;
  onNavigateToHandle: (handle: string) => void;
  isInfoPanelOpen: boolean;
  setIsInfoPanelOpen: (open: boolean) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ chat: initialChat, onClose, onNavigateToHandle, isInfoPanelOpen, setIsInfoPanelOpen }) => {
  const { user, profile } = useAuth();
  const { t, isRTL } = useLanguage();
  const { setPlaylist } = useAudioPlayer();
  const { showUndo } = useUndo();
  const [chat, setChat] = useState<Chat | null>(initialChat);
  const [messages, setMessages] = useState<Message[]>([]);
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [inputText, setInputText] = useState('');
  const [uploadProgress, setUploadProgress] = useState<{ name: string; progress: number }[]>([]);
  const activeUploadXhrsRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const [downloadProgress, setDownloadProgress] = useState<{ id: string; name: string; progress: number }[]>([]);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef(0);

  const toggleMessageSelection = (msgId: string) => {
    setSelectedMessageIds(prev => {
      const next = prev.includes(msgId) ? prev.filter(id => id !== msgId) : [...prev, msgId];
      if (next.length === 0) {
        setIsMultiSelectMode(false);
      }
      return next;
    });
  };

  const handleDeleteSelectedMessages = async () => {
    if (!chat || selectedMessageIds.length === 0) return;
    const confirmDelete = window.confirm(
      isRTL 
        ? "آیا از حذف پیام‌های انتخاب شده اطمینان دارید؟" 
        : "Are you sure you want to delete the selected messages?"
    );
    if (!confirmDelete) return;

    const deletedIds = [...selectedMessageIds];
    const currentChatId = chat.id;

    try {
      await Promise.all(deletedIds.map(id => apiDeleteMessage(currentChatId, id)));
      setIsMultiSelectMode(false);
      setSelectedMessageIds([]);

      // Floating undo notification with countdown timer
      showUndo({
        title: isRTL
          ? `${deletedIds.length} پیام حذف شد`
          : `${deletedIds.length} messages deleted`,
        durationSeconds: 5,
        onUndo: async () => {
          await apiRestoreMessages(currentChatId, deletedIds);
        }
      });
    } catch (error) {
      console.error("Error deleting selected messages:", error);
    }
  };

  const handleCopySelectedMessages = () => {
    if (selectedMessageIds.length === 0) return;
    
    // Sort selected messages based on chronological order
    const selectedMsgs = messages
      .filter(msg => selectedMessageIds.includes(msg.id))
      .sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime() || 0;
        const timeB = new Date(b.createdAt).getTime() || 0;
        return timeA - timeB;
      });

    const copyText = selectedMsgs
      .map(msg => {
        if (msg.type === 'text') return msg.text || '';
        if (msg.type === 'image') return `[${isRTL ? "تصویر" : "Image"}]`;
        if (msg.type === 'video') return `[${isRTL ? "ویدیو" : "Video"}]`;
        if (msg.type === 'audio') return `[${isRTL ? "صدا" : "Audio"}]`;
        if (msg.type === 'file') return `[${isRTL ? "فایل" : "File"}] ${msg.fileName || ''}`;
        return '';
      })
      .filter(t => t !== '')
      .join('\n\n');

    if (copyText) {
      navigator.clipboard.writeText(copyText);
      setIsMultiSelectMode(false);
      setSelectedMessageIds([]);
    }
  };

  const handleForwardSelectedMessages = async () => {
    if (selectedMessageIds.length === 0) return;

    const selectedMsgs = messages
      .filter(msg => selectedMessageIds.includes(msg.id))
      .sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime() || 0;
        const timeB = new Date(b.createdAt).getTime() || 0;
        return timeA - timeB;
      });

    const forwardText = selectedMsgs
      .map(msg => {
        if (msg.type === 'text') return msg.text || '';
        if (msg.type === 'image') return `[${isRTL ? "تصویر" : "Image"}]`;
        if (msg.type === 'video') return `[${isRTL ? "ویدیو" : "Video"}]`;
        if (msg.type === 'audio') return `[${isRTL ? "صدا" : "Audio"}]`;
        if (msg.type === 'file') return `[${isRTL ? "فایل" : "File"}] ${msg.fileName || ''}`;
        return '';
      })
      .filter(t => t !== '')
      .join('\n\n');

    if (forwardText) {
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: isRTL ? 'پیام‌های انتخاب‌شده' : 'Forward Messages',
            text: forwardText,
          });
        } catch (e) {
          // User cancelled share dialog or error, fallback to clipboard
          await navigator.clipboard.writeText(forwardText);
        }
      } else {
        await navigator.clipboard.writeText(forwardText);
      }
      setIsMultiSelectMode(false);
      setSelectedMessageIds([]);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedMessageIds.length === messages.length && messages.length > 0) {
      setSelectedMessageIds([]);
    } else {
      setSelectedMessageIds(messages.map(m => m.id));
    }
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const mobileEmojiPickerRef = useRef<HTMLDivElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [hasScrolledInitial, setHasScrolledInitial] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // Count unread messages that are below our current scroll position or generally unread in this chat
  const unreadCountBelow = messages.filter(
    msg => msg.senderId !== user?.uid && msg.senderId !== 'system' && (!msg.readBy || !msg.readBy.includes(user?.uid || ''))
  ).length;

  const markAllAsRead = async () => {
    if (!messages.length || !chat || !user) return;
    const hasUnread = messages.some(
      msg => msg.senderId !== user.uid && (!msg.readBy || !msg.readBy.includes(user.uid))
    );
    if (!hasUnread) return;

    try {
      await apiMarkChatRead(chat.id);
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  };

  const markVisibleMessagesAsRead = async () => {
    if (!messages.length || !chat || !user || !containerRef.current) return;
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();

    const unreadMessages = messages.filter(
      msg => msg.senderId !== user.uid && msg.senderId !== 'system' && (!msg.readBy || !msg.readBy.includes(user.uid))
    );

    if (unreadMessages.length === 0) return;

    // Deemed viewed once the element top enters the visible container bottom.
    const anyVisible = unreadMessages.some(msg => {
      const el = document.getElementById(`message-${msg.id}`);
      if (!el) return false;
      return el.getBoundingClientRect().top <= containerRect.bottom;
    });

    if (!anyVisible) return;

    try {
      await apiMarkChatRead(chat.id);
    } catch (e) {
      console.error("Error marking visible read:", e);
    }
  };

  const scrollToBottom = (behavior: 'auto' | 'smooth' = 'auto') => {
    const container = containerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior
      });
    }
  };

  const scrollToElement = (elementId: string): boolean => {
    const container = containerRef.current;
    const element = document.getElementById(elementId);
    if (container && element) {
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
      container.scrollTo({
        top: Math.max(0, relativeTop - 100), // Leave nice breathing room at the top
        behavior: 'auto'
      });
      return true;
    }
    return false;
  };

  const scrollToBottomAndMarkRead = async () => {
    scrollToBottom('smooth');
    await markAllAsRead();
  };

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    
    const isScrolledUp = container.scrollHeight - container.scrollTop - container.clientHeight > 200;
    setShowScrollToBottom(isScrolledUp);

    // Telegram-style view recognition: mark only visible/scrolled-past messages as read
    markVisibleMessagesAsRead();
  };

  useEffect(() => {
    if (chat?.id) {
      setFirstUnreadId(null);
      setHasScrolledInitial(false);
      lastMessageIdRef.current = null;
      setMessages([]); // Instant clean slate when switching chat windows
    }
  }, [chat?.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      const isInsideDesktop = emojiPickerRef.current && emojiPickerRef.current.contains(target);
      const isInsideMobile = mobileEmojiPickerRef.current && mobileEmojiPickerRef.current.contains(target);
      if (!isInsideDesktop && !isInsideMobile) {
        setIsEmojiPickerOpen(false);
      }
    };
    if (isEmojiPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isEmojiPickerOpen]);

  useEffect(() => {
    const handleOptionsOutside = (event: MouseEvent | TouchEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) {
        setIsOptionsMenuOpen(false);
      }
    };
    if (isOptionsMenuOpen) {
      document.addEventListener('mousedown', handleOptionsOutside);
      document.addEventListener('touchstart', handleOptionsOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleOptionsOutside);
      document.removeEventListener('touchstart', handleOptionsOutside);
    };
  }, [isOptionsMenuOpen]);

  useEffect(() => {
    setChat(initialChat);
  }, [initialChat]);

  useEffect(() => {
    const handleDownloadStatus = (e: Event) => {
      const detail = (e as CustomEvent<DownloadProgressEventDetail>).detail;
      if (!detail) return;
      const { id, name, progress, status } = detail;
      
      if (status === 'started') {
        setDownloadProgress(prev => {
          if (prev.some(p => p.id === id)) return prev;
          return [...prev, { id, name, progress: 0 }];
        });
      } else if (status === 'progress') {
        setDownloadProgress(prev => 
          prev.map(p => p.id === id ? { ...p, progress } : p)
        );
      } else if (status === 'completed' || status === 'failed') {
        setDownloadProgress(prev => 
          prev.map(p => p.id === id ? { ...p, progress: status === 'completed' ? 100 : 0 } : p)
        );
        setTimeout(() => {
          setDownloadProgress(prev => prev.filter(p => p.id !== id));
        }, 1200);
      }
    };

    window.addEventListener('download-status', handleDownloadStatus);
    return () => {
      window.removeEventListener('download-status', handleDownloadStatus);
    };
  }, []);

  useEffect(() => {
    if (!initialChat) {
      setChat(null);
      return;
    }

    const chatId = initialChat.id;
    let cancelled = false;

    const load = () => {
      apiGetChat(chatId)
        .then((c) => { if (!cancelled && c) setChat(c as Chat); })
        .catch((e) => console.error("Failed to load chat:", e));
    };
    load();

    const unsubs = [
      subscribe('chat.updated', (c: Chat) => { if (c?.id === chatId) setChat(c); }),
      subscribe('reconnect', load),
    ];

    return () => {
      cancelled = true;
      unsubs.forEach((off) => off());
    };
  }, [initialChat?.id]);

  useEffect(() => {
    if (!chat || !user) return;

    // Only load messages if user is a member. Non-member payloads are redacted by the
    // server and carry no memberUids at all.
    if (!(chat.memberUids || []).includes(user.uid)) {
      setMessages([]);
      return;
    }

    const chatId = chat.id;
    let cancelled = false;

    // Clear prior messages to avoid stale flashing
    setMessages([]);

    const load = () => {
      apiGetMessages(chatId)
        .then((list: Message[]) => {
          // Guard against a response arriving after the user switched chats
          if (cancelled) return;
          if (list.length === 0 || list[0].chatId === chatId) setMessages(list);
        })
        .catch((e) => console.error("Failed to load messages:", e));
    };
    load();

    const forThisChat = (m: any) => m?.chatId === chatId;

    const upsert = (incoming: Message) => {
      if (!forThisChat(incoming)) return;
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === incoming.id);
        if (idx === -1) {
          return [...prev, incoming].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        }
        const next = [...prev];
        next[idx] = { ...next[idx], ...incoming };
        return next;
      });
    };

    const unsubs = [
      subscribe('message.created', upsert),
      subscribe('message.updated', upsert),
      subscribe('message.restored', upsert),
      subscribe('messages.restored', (p: any) => {
        if (p?.chatId !== chatId) return;
        // A bulk restore can reintroduce many messages at once; refetch to reorder cleanly.
        load();
      }),
      subscribe('message.deleted', (p: any) => {
        if (!forThisChat(p)) return;
        setMessages((prev) => prev.filter((m) => m.id !== p.id));
      }),
      subscribe('message.reaction', (p: any) => {
        if (!forThisChat(p)) return;
        setMessages((prev) => prev.map((m) => (m.id === p.id ? { ...m, reactions: p.reactions } : m)));
      }),
      subscribe('messages.read', (p: any) => {
        if (p?.chatId !== chatId) return;
        const ids: string[] = p.messageIds || [];
        setMessages((prev) =>
          prev.map((m) =>
            ids.includes(m.id) && !(m.readBy || []).includes(p.uid)
              ? { ...m, readBy: [...(m.readBy || []), p.uid] }
              : m
          )
        );
      }),
      subscribe('reconnect', load),
    ];

    return () => {
      cancelled = true;
      unsubs.forEach((off) => off());
    };
  }, [chat?.id, user?.uid]);

  // Typing indicator - listen for partner typing events
  useEffect(() => {
    if (!chat || !user) return;
    const chatId = chat.id;

    const unsub = subscribe('typing' as any, (p: any) => {
      if (p?.chatId === chatId && p?.uid !== user?.uid) {
        setPartnerTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 3000);
      }
    });

    return () => {
      unsub();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [chat?.id, user?.uid]);

  // Send typing event (debounced to max once per 2 seconds)
  const sendTypingEvent = () => {
    if (!chat || !user) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    fetch(`/api/typing/${chat.id}`, { method: 'POST', credentials: 'include', headers: getAuthHeaders() }).catch(() => {});
  };

  // Handle initial scrolling, marking as read conditions, and unread divider anchoring on load
  useEffect(() => {
    if (!messages.length || !chat || !user) return;

    // Reject processing if the messages array contains items from a previous chat
    if (messages[0].chatId !== chat.id) return;

    const unread = messages.filter(
      msg => msg.senderId !== user.uid && msg.senderId !== 'system' && (!msg.readBy || !msg.readBy.includes(user.uid))
    );

    if (!hasScrolledInitial) {
      if (unread.length > 0) {
        // Find and set the ID of the first unread message to anchor the unread banner divider
        const firstUnread = unread[0];
        setFirstUnreadId(firstUnread.id);

        // Keep attempting container scroll relative to DOM generation
        let scrollAttempts = 0;
        const tryScroll = () => {
          const successValue = scrollToElement(`unread-divider-${firstUnread.id}`) || scrollToElement(`message-${firstUnread.id}`);
          
          if (!successValue && scrollAttempts < 8) {
            scrollAttempts++;
            setTimeout(tryScroll, 50);
          } else {
            // Once scrolled, trigger visibility read scanner
            setTimeout(markVisibleMessagesAsRead, 100);
          }
        };

        setTimeout(tryScroll, 100);
      } else {
        // There are no unread messages. Jump straight to the bottom of the conversation feed.
        let scrollAttempts = 0;
        const tryScrollToBottom = () => {
          const container = containerRef.current;
          if (container) {
            scrollToBottom('auto');
            setTimeout(markVisibleMessagesAsRead, 100);
          } else if (scrollAttempts < 5) {
            scrollAttempts++;
            setTimeout(tryScrollToBottom, 100);
          }
        };
        setTimeout(tryScrollToBottom, 100);
      }
      if (messages.length > 0) {
        lastMessageIdRef.current = messages[messages.length - 1].id;
      }
      setHasScrolledInitial(true);
    } else {
      // Chat has already been initialized. Check if a new message has arrived
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessageIdRef.current !== lastMessage.id) {
        lastMessageIdRef.current = lastMessage.id;
        const isMyMessage = lastMessage.senderId === user.uid;
        const container = containerRef.current;
        let isAtBottom = true;
        
        if (container) {
          isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 250;
        }

        // If I sent the message, or the scroll container was already close to the bottom, auto-scroll to the end of feed
        if (isMyMessage || isAtBottom) {
          setTimeout(() => {
            scrollToBottom('smooth');
            // Allow dynamic view calculation to mark newly visible message as read
            setTimeout(markVisibleMessagesAsRead, 300);
          }, 100);
        }
      }
    }
  }, [messages, chat?.id, user?.uid, hasScrolledInitial]);

  useEffect(() => {
    if (!chat || !user) {
      setPartnerProfile(null);
      setMembers([]);
      return;
    }

    const memberUids = chat.memberUids || [];
    const isDm = chat.type === 'dm';
    const uidsToLoad = isDm ? memberUids.filter(id => id !== user.uid) : memberUids;
    let cancelled = false;

    const load = async () => {
      const loaded = await Promise.all(
        uidsToLoad.map(uid => apiGetUserProfile(uid).catch(() => null))
      );
      if (cancelled) return;

      const profiles = loaded.filter(Boolean) as UserProfile[];
      if (isDm) {
        setPartnerProfile(profiles[0] || null);
        setMembers([]);
      } else {
        setPartnerProfile(null);
        setMembers(profiles);
      }
    };
    load();

    const applyToOne = (uid: string, patch: Partial<UserProfile>) => {
      if (!uidsToLoad.includes(uid)) return;
      if (isDm) {
        setPartnerProfile(prev => (prev && prev.uid === uid ? { ...prev, ...patch } : prev));
      } else {
        setMembers(prev => prev.map(m => (m.uid === uid ? { ...m, ...patch } : m)));
      }
    };

    const unsubs = [
      subscribe('profile.updated', (p: any) => {
        if (p?.uid) applyToOne(p.uid, p);
      }),
      subscribe('presence.changed', (p: any) => {
        if (p?.uid) applyToOne(p.uid, { isOnline: p.isOnline, lastSeen: p.lastSeen });
      }),
      subscribe('reconnect', load),
    ];

    return () => {
      cancelled = true;
      unsubs.forEach(off => off());
    };
  }, [chat?.id, chat?.type, chat?.memberUids, user?.uid]);

  const cancelUpload = (fileName: string) => {
    const xhr = activeUploadXhrsRef.current.get(fileName);
    if (xhr) {
      xhr.abort();
      activeUploadXhrsRef.current.delete(fileName);
    }
    setUploadProgress(prev => prev.filter(p => p.name !== fileName));
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (!chat || !user) return;
    
    // Capture any typed text to use as caption for the first file
    let capturedCaption = inputText.trim();
    if (capturedCaption) {
      setInputText('');
    }
    
    for (const [index, file] of acceptedFiles.entries()) {
      // Add immediately to state
      setUploadProgress(prev => [...prev, { name: file.name, progress: 0 }]);
      let isCancelled = false;
      
      try {
        const url = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          activeUploadXhrsRef.current.set(file.name, xhr);
          xhr.withCredentials = true;
          xhr.open('POST', '/api/upload');
          const token = getSessionToken();
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
          
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              setUploadProgress(prev => 
                prev.map(p => p.name === file.name ? { ...p, progress: percentComplete } : p)
              );
            }
          };
          
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const response = JSON.parse(xhr.responseText);
                resolve(response.url);
              } catch (e) {
                reject(new Error('Failed to parse response'));
              }
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          };
          
          xhr.onabort = () => {
            isCancelled = true;
            reject(new Error('UPLOAD_CANCELLED'));
          };

          xhr.onerror = () => {
            reject(new Error('Network error during upload'));
          };
          
          const formData = new FormData();
          formData.append('file', file);
          xhr.send(formData);
        });

        let type: Message['type'] = 'file';
        if (file.type.startsWith('image/')) type = 'image';
        else if (file.type.startsWith('video/')) type = 'video';
        else if (file.type.startsWith('audio/')) type = 'audio';

        // Add caption only to the first file in the batch
        const caption = index === 0 ? capturedCaption : '';

        // The server derives lastMessage from the inserted row, so no extra write here.
        await apiSendMessage(chat.id, {
          text: caption,
          type,
          mediaUrl: url,
          fileName: file.name,
          replyTo: replyingTo?.id || null,
        });
      } catch (error: any) {
        if (isCancelled || error?.message === 'UPLOAD_CANCELLED') {
          // User intentionally cancelled upload, no alert needed
          console.log(`Upload cancelled for: ${file.name}`);
        } else {
          console.error("Error uploading file:", error);
          alert(isRTL ? "خطا در ارسال فایل" : "Error uploading file");
        }
      } finally {
        activeUploadXhrsRef.current.delete(file.name);
        // Remove file from progress tracking
        setUploadProgress(prev => prev.filter(p => p.name !== file.name));
      }
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputTextRef = useRef<HTMLTextAreaElement>(null);
  const overlayTextRef = useRef<HTMLDivElement>(null);

  const syncInputScroll = () => {
    if (inputTextRef.current && overlayTextRef.current) {
      overlayTextRef.current.scrollTop = inputTextRef.current.scrollTop;
      overlayTextRef.current.scrollLeft = inputTextRef.current.scrollLeft;
    }
  };

  useEffect(() => {
    const tx = inputTextRef.current;
    if (tx) {
      tx.style.height = 'auto';
      tx.style.height = `${Math.min(tx.scrollHeight, 120)}px`;
    }
    const timer = setTimeout(() => {
      syncInputScroll();
    }, 10);
    return () => clearTimeout(timer);
  }, [inputText]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    noClick: true 
  } as unknown as DropzoneOptions);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRecording) {
      setRecordingSeconds(0);
      interval = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  const formatRecordingDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];
      mediaRecorder.current.ondataavailable = (e) => audioChunks.current.push(e.data);
      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const file = new File([audioBlob], 'voice_message.webm', { type: 'audio/webm' });
        onDrop([file]);
      };
      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error recording:', err);
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setIsRecording(false);
  };

  const isAdmin = user && chat?.admins?.includes(user?.uid || '');
  const isOwner = user && chat?.ownerUid === user?.uid;
  const isMuted = chat?.mutedUids?.includes(user?.uid || '');
  const isBanned = chat?.bannedUids?.includes(user?.uid || '');

  const canSendMessages = chat?.type !== 'channel' || isAdmin || isOwner;

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !editingMessage) || !chat || !user) return;

    if (isBanned) return; 

    if (!canSendMessages) {
      alert(isRTL ? "فقط مدیران می‌توانند در کانال پیام بفرستند" : "Only admins can message in channels");
      return;
    }

    if (isMuted && !isAdmin && !isOwner) {
      alert(isRTL ? "دسترسی شما برای ارسال پیام محدود شده است" : "Your messaging access is restricted");
      return;
    }

    const textToSend = inputText.trim();
    setInputText('');
    setReplyingTo(null);
    setEditingMessage(null);

    // Keep focus on input text area so keyboard stays open
    setTimeout(() => {
      if (!isEmojiPickerOpen) {
        inputTextRef.current?.focus();
      }
    }, 10);

    try {
      if (editingMessage) {
        await apiUpdateMessage(chat.id, editingMessage.id, { text: textToSend });
      } else {
        // The server derives lastMessage from the inserted row.
        await apiSendMessage(chat.id, {
          text: textToSend,
          type: 'text',
          replyTo: replyingTo?.id || null,
        });
      }
    } catch (error) {
      reportApiError(error, editingMessage ? 'UPDATE' : 'CREATE', `chats/${chat.id}/messages`);
    }
  };

  const handleJoinChat = async () => {
    if (!chat || !user) return;
    try {
      await apiJoinChat(chat.id);

      // System message for join (Groups only)
      if (chat.type === 'group') {
        await apiSendMessage(chat.id, {
          text: `${profile?.displayName || profile?.username || user.uid} ${isRTL ? 'به گروه پیوست' : 'joined the group'}`,
          type: 'system',
        });
      }

      // The joiner receives chat.created rather than chat.updated, so refetch here to
      // swap the join screen for the conversation.
      const full = await apiGetChat(chat.id);
      if (full) setChat(full as Chat);
    } catch (error) {
      reportApiError(error, 'UPDATE', `chats/${chat.id}`);
    }
  };

  const filteredMessages = messages.filter(m => {
    if (m.deleted) return false;
    if (!searchQuery) return true;
    return m.text?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleClearHistory = async () => {
    if (!chat || !user) return;
    const confirmClear = window.confirm(isRTL ? "آیا از پاک کردن تاریخچه اطمینان دارید؟ تمامی پیام‌ها حذف خواهند شد." : "Are you sure you want to clear history? All messages will be deleted.");
    if (!confirmClear) return;

    try {
      const currentChatId = chat.id;
      const deletedIds = messages.map(m => m.id);
      if (deletedIds.length === 0) {
        setIsOptionsMenuOpen(false);
        return;
      }

      await Promise.all(deletedIds.map(id => apiDeleteMessage(currentChatId, id)));

      showUndo({
        title: isRTL ? "تاریخچه پیام‌ها پاک شد" : "Chat history cleared",
        durationSeconds: 6,
        onUndo: async () => {
          await apiRestoreMessages(currentChatId, deletedIds);
        }
      });
      setIsOptionsMenuOpen(false);
    } catch (e) {
      reportApiError(e, 'DELETE', `chats/${chat.id}/messages`);
    }
  };

  const audioPlaylist = useMemo(() => {
    return messages
      .filter(m => (m.type === 'audio' && m.mediaUrl) || (m.mediaUrl && (m.fileName?.endsWith('.mp3') || m.fileName?.endsWith('.webm') || m.fileName?.endsWith('.ogg') || m.fileName?.endsWith('.wav') || m.fileName?.endsWith('.m4a'))))
      .map(m => ({
        id: m.id,
        url: m.mediaUrl!,
        title: m.fileName || (m.type === 'audio' ? (isRTL ? 'فایل صوتی' : 'Audio Track') : 'Audio Track'),
        type: 'audio/mpeg'
      }));
  }, [messages, isRTL]);

  useEffect(() => {
    if (audioPlaylist.length > 0) {
      setPlaylist(audioPlaylist);
    }
  }, [audioPlaylist, setPlaylist]);

  if (!chat) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center text-slate-400 bg-brand-bg/50 ${isRTL ? 'font-farsi' : ''}`}>
        <div className="w-24 h-24 bg-brand-input rounded-full flex items-center justify-center mb-6">
          <MessageSquare size={48} />
        </div>
        <h2 className="text-xl font-bold text-brand-text opacity-70">{t.startMessaging}</h2>
      </div>
    );
  }

  const isMember = user && chat?.memberUids?.includes(user?.uid);

  if (!isMember && chat?.type !== 'dm') {
    return (
      <div className={`flex-1 flex flex-col bg-brand-bg relative ${isRTL ? 'font-farsi' : ''} text-brand-text`}>
        {/* Header */}
        <header id="non-member-chat-header" className={`h-16 border-b border-slate-200/60 dark:border-gray-800/40 flex items-center px-6 justify-between bg-brand-bg/40 backdrop-blur-xl relative z-[60] shrink-0 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
          <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-brand-input">
               <img src={chat?.photoURL || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + chat?.id} alt="" className="w-full h-full object-cover" />
            </div>
            <div className={isRTL ? 'text-right' : 'text-left'}>
              <div className="text-sm font-bold flex items-center gap-2">
                {chat?.name || (isRTL ? 'گفتگو' : 'Chat')}
                <Hash size={14} className="text-gray-500" />
              </div>
              <div className="text-[10px] text-gray-500">{chat?.memberCount ?? chat?.memberUids?.length ?? 0} {isRTL ? "عضو" : "Members"}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-gray-400">
            <X size={20} />
          </button>
        </header>

        {/* Global Floating Mini Audio Player - Positioned directly below chat header */}
        <GlobalAudioPlayer playlist={audioPlaylist} />

        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center overflow-y-auto">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-32 h-32 rounded-3xl overflow-hidden bg-brand-input mb-8 shadow-2xl ring-4 ring-brand-accent/30"
          >
            <img src={chat?.photoURL || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + chat?.id} alt="" className="w-full h-full object-cover" />
          </motion.div>
          <h2 className="text-3xl font-extrabold mb-2 tracking-tight">{chat?.name}</h2>
          <div className="text-brand-accent-text font-mono text-sm mb-4">@{chat?.handle}</div>
          
          <p className="max-w-md text-slate-500 dark:text-gray-400 mb-10 text-sm leading-relaxed">
            {chat?.bio || (isRTL ? "توضیحاتی برای این گفتگو ثبت نشده است." : "No description available for this group.")}
          </p>

          <button 
            onClick={handleJoinChat}
            className="w-full max-w-xs py-4 bg-brand-accent hover:brightness-110 text-white rounded-2xl font-bold text-lg shadow-xl shadow-brand-accent/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 cursor-pointer"
          >
            <Plus size={24} />
            {isRTL ? "عضویت در گفتگو" : "Join Conversation"}
          </button>
          
          <div className="mt-8 flex items-center gap-2 text-gray-500 text-xs">
            <Shield size={14} />
            <span>{isRTL ? "پیام‌های قبلی برای شما نمایش داده نخواهد شد" : "Previous messages are hidden until you join"}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div {...getRootProps()} className={`flex-1 flex flex-col bg-brand-bg overflow-hidden relative h-full w-full ${isRTL ? 'font-farsi' : ''}`} style={getWallpaperStyle(profile?.chatWallpaper)}>
      <input {...getInputProps()} />
      
      {/* Header */}
      <header id="chat-header" className="h-16 border-b border-brand-border flex items-center bg-brand-header-bg backdrop-blur-xl relative z-[60] shrink-0">
        <AnimatePresence mode="wait">
          {isMultiSelectMode ? (
            <motion.div
              key="selection-header"
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -40, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="w-full h-full px-3 md:px-6 flex items-center justify-between"
            >
              {/* Left Side: Cancel + Selected Count + Select All */}
              <div className="flex items-center gap-2 md:gap-3">
                <button 
                  onClick={() => { setIsMultiSelectMode(false); setSelectedMessageIds([]); }}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer active:scale-90"
                  title={isRTL ? "انصراف" : "Cancel"}
                >
                  <X size={22} />
                </button>
                
                <div className="flex items-center gap-1.5">
                  <span className="text-base md:text-lg font-black text-brand-text min-w-[18px] text-center">
                    {selectedMessageIds.length}
                  </span>
                  <span className="text-xs md:text-sm text-slate-500 dark:text-gray-400 font-medium">
                    {isRTL ? "انتخاب شده" : "selected"}
                  </span>
                </div>


              </div>

              {/* Right Side: Action Buttons (Copy, Forward, Delete) */}
              <div className="flex items-center gap-1.5 md:gap-2.5">
                {/* Copy Button */}
                <button
                  onClick={handleCopySelectedMessages}
                  disabled={selectedMessageIds.length === 0}
                  className={`p-2 md:px-3.5 md:py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer ${
                    selectedMessageIds.length > 0
                      ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-gray-600 border border-slate-200 dark:border-white/5 cursor-not-allowed opacity-50'
                  }`}
                  title={isRTL ? "کپی" : "Copy"}
                >
                  <Copy size={18} />
                  <span className="hidden md:inline">{isRTL ? "کپی" : "Copy"}</span>
                </button>

                {/* Forward Button */}
                <button
                  onClick={handleForwardSelectedMessages}
                  disabled={selectedMessageIds.length === 0}
                  className={`p-2 md:px-3.5 md:py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer ${
                    selectedMessageIds.length > 0
                      ? 'bg-brand-accent/15 hover:bg-brand-accent/25 text-brand-accent-text border border-brand-accent/30 shadow-md shadow-brand-accent/10'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-gray-600 border border-slate-200 dark:border-white/5 cursor-not-allowed opacity-50'
                  }`}
                  title={isRTL ? "فوروارد" : "Forward"}
                >
                  <Share2 size={18} />
                  <span className="hidden md:inline">{isRTL ? "فوروارد" : "Forward"}</span>
                </button>

                {/* Delete Button */}
                <button
                  onClick={handleDeleteSelectedMessages}
                  disabled={selectedMessageIds.length === 0}
                  className={`p-2 md:px-3.5 md:py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer ${
                    selectedMessageIds.length > 0
                      ? 'bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 shadow-md shadow-red-500/10'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-gray-600 border border-slate-200 dark:border-white/5 cursor-not-allowed opacity-50'
                  }`}
                  title={isRTL ? "حذف" : "Delete"}
                >
                  <Trash2 size={18} />
                  <span className="hidden md:inline">{isRTL ? "حذف" : "Delete"}</span>
                </button>
              </div>
            </motion.div>
          ) : isSearchOpen ? (
            <motion.div
              key="search-header"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-full h-full px-4 md:px-6 flex items-center gap-3"
            >
              <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-gray-400"><X size={20} /></button>
              <div className="relative flex-1 flex items-center">
                <input 
                  autoFocus
                  type="text" 
                  placeholder={isRTL ? "جستجو در پیام‌ها..." : "Search messages..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full bg-transparent border-none focus:ring-0 text-sm text-brand-text outline-none ${isRTL ? 'text-right pl-28' : 'text-left pr-28'}`}
                />
                {searchQuery.includes('🇮🇷') && (
                  <div dir="ltr" className={`absolute ${isRTL ? 'left-2' : 'right-2'} top-1 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-brand-accent/20 border border-brand-accent/30 text-white animate-in zoom-in duration-200 select-none pointer-events-none`}>
                    <img src={LION_AND_SUN_FLAG_URL} className="w-5 h-3.5 object-cover rounded-sm" alt="Lion & Sun" />
                    <span className="text-[10px] font-bold text-brand-accent-text">{isRTL ? "شیر و خورشید" : "Lion & Sun"}</span>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="normal-header"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="w-full h-full px-4 md:px-6 flex items-center justify-between"
            >
              <div className="flex items-center gap-1 md:gap-3">
                <button
                  onClick={onClose}
                  className="md:hidden w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-gray-400 active:scale-90 transition-all"
                  aria-label={isRTL ? "بازگشت" : "Back"}
                >
                  {isRTL ? <ChevronRight size={24} /> : <ChevronLeft size={24} />}
                </button>

                <div
                  onClick={() => setIsInfoPanelOpen(true)}
                  className="flex items-center gap-2 md:gap-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 p-1 px-2 rounded-xl transition-all"
                  role="button"
                  tabIndex={0}
                >
                  <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden shrink-0 bg-brand-input ${isUserOnline(partnerProfile, user?.uid) && chat.type === 'dm' ? 'animated-ring' : ''}`}>
                    <img
                      src={(chat.type === 'dm' ? partnerProfile?.photoURL : chat.photoURL) || (chat.type === 'dm' ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + partnerProfile?.uid : 'https://api.dicebear.com/7.x/identicon/svg?seed=' + chat.id)}
                      alt=""
                      className="w-full h-full object-cover rounded-full relative z-10"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold flex items-center gap-2 text-[#2c2c2c] dark:text-gray-100">
                      <span className="truncate max-w-[120px] md:max-w-none text-[#2c2c2c] dark:text-gray-100">
                        {parseFlags(chat.type === 'dm' ? (partnerProfile?.displayName || partnerProfile?.username || (isRTL ? 'گفتگو' : 'Chat')) : chat.name || '')}
                      </span>
                      {chat.type === 'channel' && <Megaphone size={14} className="text-brand-accent-text shrink-0" />}
                      {chat.type === 'group' && <Users size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />}
                    </div>
                    {chat.type === 'dm' ? (
                      <div className="flex items-center gap-1.5">
                        {partnerTyping ? (
                          <>
                            <div className="flex items-center gap-[3px]">
                              {[0,1,2].map(i => (
                                <div key={i} className="w-[4px] h-[4px] rounded-full bg-blue-500 dark:bg-blue-400" style={{ animation: `typing-dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                              ))}
                            </div>
                            <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">{isRTL ? 'در حال نوشتن...' : 'Typing...'}</span>
                          </>
                        ) : (
                          <>
                            <div className={`w-1.5 h-1.5 rounded-full ${isUserOnline(partnerProfile, user?.uid) ? 'bg-green-500 animate-pulse' : 'bg-slate-400 dark:bg-gray-500'}`}></div>
                            <span className={`text-[10px] font-medium ${isUserOnline(partnerProfile, user?.uid) ? 'text-green-600 dark:text-green-500 font-semibold' : 'text-slate-500 dark:text-gray-400'}`}>
                              {isUserOnline(partnerProfile, user?.uid) ? t.online : (isRTL ? 'آفلاین' : 'Offline')}
                            </span>
                          </>
                        )}
                      </div>
                    ) : chat.type === 'group' ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded-full">
                          <Users size={10} className="text-slate-500 dark:text-gray-400" />
                          <span className="text-[10px] text-slate-700 dark:text-gray-300 font-bold">{members.length}</span>
                        </div>
                        {members.filter(m => isUserOnline(m, user?.uid)).length > 0 && (
                          <span className="text-green-600 dark:text-green-400 text-[10px] font-bold">
                            {members.filter(m => isUserOnline(m, user?.uid)).length} {isRTL ? "آنلاین" : "online"}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded-full">
                        <Users size={10} className="text-slate-500 dark:text-gray-400" />
                        <span className="text-[10px] text-slate-700 dark:text-gray-300 font-bold">{chat.memberUids.length}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-slate-500 dark:text-gray-400">
                <button onClick={() => setIsSearchOpen(true)} className="hover:text-slate-900 dark:hover:text-white transition-colors"><Search size={20} /></button>
                <div ref={optionsMenuRef} className="relative">
                  <button
                    id="chat-header-options-btn"
                    onClick={() => setIsOptionsMenuOpen(!isOptionsMenuOpen)}
                    className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
                    title={isRTL ? "گزینه‌ها" : "Options"}
                    aria-label={isRTL ? "گزینه‌ها" : "Options"}
                    aria-expanded={isOptionsMenuOpen}
                  >
                    <MoreVertical size={20} className={`transition-transform duration-300 ${isOptionsMenuOpen ? 'rotate-90' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {isOptionsMenuOpen && (
                      <>
                        {/* Fullscreen transparent backdrop to handle outside click/tap */}
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setIsOptionsMenuOpen(false)} 
                        />
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          className="absolute top-full mt-2 end-0 ltr:origin-top-right rtl:origin-top-left w-48 bg-brand-panel border border-brand-border rounded-2xl shadow-2xl z-[70] overflow-hidden backdrop-blur-2xl"
                        >
                          <button 
                            onClick={() => { setIsOptionsMenuOpen(false); setIsInfoPanelOpen(true); }}
                            className="w-full p-3 text-sm flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer text-brand-text"
                          >
                            <MessageSquare size={18} className="text-slate-500 dark:text-gray-400 shrink-0" />
                            <span>{isRTL ? "اطلاعات" : "Information"}</span>
                          </button>
                          {(isAdmin || isOwner) && (
                            <button 
                              onClick={() => { setIsOptionsMenuOpen(false); handleClearHistory(); }}
                              className="w-full p-3 text-sm flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors text-red-500 dark:text-red-400 cursor-pointer"
                            >
                              <Trash2 size={18} className="shrink-0" />
                              <span>{isRTL ? "پاک کردن تاریخچه" : "Clear History"}</span>
                            </button>
                          )}
                          {chat.type !== 'dm' && (
                            <button 
                              onClick={() => { setIsOptionsMenuOpen(false); setIsInfoPanelOpen(true); }}
                              className="w-full p-3 text-sm flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors text-red-500 border-t border-brand-border cursor-pointer"
                            >
                              <X size={18} className="shrink-0" />
                              <span>{isRTL ? "خروج" : "Leave"}</span>
                            </button>
                          )}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Global Floating Mini Audio Player - Positioned directly below chat header */}
      <GlobalAudioPlayer playlist={audioPlaylist} />

      {isInfoPanelOpen && (
        <ChatInfoPanel
          chat={chat}
          onClose={() => setIsInfoPanelOpen(false)}
          onLeaveChat={() => { setIsInfoPanelOpen(false); onClose(); }}
          onNavigateToHandle={onNavigateToHandle}
        />
      )}

      {/* Messages */}
      <div className="flex-1 relative overflow-hidden flex flex-col">
        <div 
          ref={containerRef}
          onScroll={handleScroll}
          className={`flex-1 overflow-y-auto px-4 ${isEmojiPickerOpen ? 'pb-[390px] md:pb-28' : 'pb-24 md:pb-28'} md:px-6 space-y-4 md:space-y-6 custom-scrollbar transition-all duration-300 bg-transparent`}
        >
          {isDragActive && (
            <div className="absolute inset-0 bg-brand-accent/15 backdrop-blur-sm z-50 flex items-center justify-center border-4 border-dashed border-brand-accent rounded-2xl m-4">
              <div className="text-center">
                <Paperclip size={48} className="text-brand-accent-text mx-auto mb-2 animate-bounce" />
                <div className="text-xl font-bold text-brand-accent-text">{isRTL ? "فایل‌ها را برای ارسال اینجا رها کنید" : "Drop files to send"}</div>
              </div>
            </div>
          )}

          <AnimatePresence>
            {filteredMessages.map((msg, i) => {
              const isFirstUnread = msg.id === firstUnreadId;
              const dateString = getMessageDateString(msg, isRTL);
              const prevMsg = i > 0 ? filteredMessages[i - 1] : null;
              const nextMsg = i < filteredMessages.length - 1 ? filteredMessages[i + 1] : null;
              const isPrevSelected = prevMsg ? selectedMessageIds.includes(prevMsg.id) : false;
              const isNextSelected = nextMsg ? selectedMessageIds.includes(nextMsg.id) : false;
              const prevDateString = prevMsg ? getMessageDateString(prevMsg, isRTL) : null;
              const showDateSeparator = dateString !== prevDateString;

              return (
                <React.Fragment key={msg.id}>
                  {showDateSeparator && (
                    <div className="w-full flex items-center justify-center my-6 opacity-85 select-none">
                      <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent to-brand-border"></div>
                      <span className="px-3.5 py-1 text-[10px] font-bold tracking-wide text-slate-500 dark:text-slate-400 bg-brand-panel/60 border border-brand-border rounded-full shadow-sm mx-4 backdrop-blur-sm">
                        {dateString}
                      </span>
                      <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent to-brand-border"></div>
                    </div>
                  )}

                  {isFirstUnread && (
                    <div id={`unread-divider-${msg.id}`} className="w-full flex items-center justify-center my-4 opacity-90">
                      <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent to-brand-accent/40"></div>
                      <span className="px-4 py-1.5 text-[10px] font-black tracking-wider uppercase text-brand-accent-text bg-brand-accent/15 border border-brand-accent/25 rounded-full shadow-sm mx-4">
                        {isRTL ? "پیام‌های خوانده نشده" : "Unread Messages"}
                      </span>
                      <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent to-brand-accent/40"></div>
                    </div>
                  )}
                  
                  <MessageItem 
                    message={msg} 
                    isMe={msg.senderId === user?.uid} 
                    chatId={chat.id}
                    chat={chat}
                    onReply={() => setReplyingTo(msg)}
                    onNavigateToHandle={onNavigateToHandle}
                    onEdit={() => {
                      setEditingMessage(msg);
                      setInputText(msg.text);
                    }}
                    onDelete={async () => {
                      const currentChatId = chat.id;
                      const messageId = msg.id;
                      await apiDeleteMessage(currentChatId, messageId);
                      showUndo({
                        title: isRTL ? 'پیام حذف شد' : 'Message deleted',
                        durationSeconds: 5,
                        onUndo: async () => {
                          await apiRestoreMessage(currentChatId, messageId);
                        }
                      });
                    }}
                    replyingToMessage={messages.find(m => m.id === msg.replyTo)}
                    isMultiSelectMode={isMultiSelectMode}
                    isSelected={selectedMessageIds.includes(msg.id)}
                    isPrevSelected={isPrevSelected}
                    isNextSelected={isNextSelected}
                    onToggleSelect={() => toggleMessageSelection(msg.id)}
                    onStartMultiSelect={() => {
                      setIsMultiSelectMode(true);
                      setSelectedMessageIds([msg.id]);
                    }}
                  />
                </React.Fragment>
              );
            })}
            {filteredMessages.length === 0 && searchQuery && (
              <div className="text-center p-8 text-gray-500 italic">
                {isRTL ? "پیامی یافت نشد" : "No messages found"}
              </div>
            )}
          </AnimatePresence>
          <div ref={scrollRef} />
        </div>

        {/* Floating Scroll To Bottom Arrow Button */}
        <AnimatePresence>
          {showScrollToBottom && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={scrollToBottomAndMarkRead}
              className={`absolute ${(replyingTo || editingMessage) ? 'bottom-[120px] md:bottom-[130px]' : 'bottom-[72px] md:bottom-[80px]'} ${isRTL ? 'left-6' : 'right-6'} w-11 h-11 rounded-full bg-brand-accent hover:brightness-110 text-white flex items-center justify-center shadow-2xl transition-all duration-350 z-40 border border-brand-accent/30 group backdrop-blur-md active:scale-95 cursor-pointer`}
              title="scroll-to-bottom"
            >
              <ChevronDown size={22} className="group-hover:translate-y-0.5 transition-transform duration-200 text-white" />
              {unreadCountBelow > 0 && (
                <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 text-[10px] font-black bg-emerald-500 rounded-full text-white min-w-[20px] h-[20px] flex items-center justify-center border border-brand-bg shadow-lg animate-in zoom-in duration-200">
                  {unreadCountBelow}
                </span>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      {!isMultiSelectMode && (
        canSendMessages ? (
          <footer className="p-2 md:p-2.5 absolute bottom-0 left-0 right-0 z-40 bg-brand-header-bg backdrop-blur-xl border-t border-brand-border shrink-0">
            <AnimatePresence>
            {(replyingTo || editingMessage) && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className={`bg-brand-panel p-2 px-4 rounded-xl mb-2 flex items-center justify-between border-brand-accent ${isRTL ? 'border-r-4 text-right flex-row-reverse' : 'border-l-4 text-left flex-row'}`}
              >
                <div className={`flex items-center gap-3 overflow-hidden text-brand-text ${isRTL ? 'flex-row-reverse' : ''}`}>
                  {replyingTo ? <Reply size={16} className={`text-brand-accent-text ${isRTL ? 'rotate-180' : ''}`} /> : <Edit2 size={16} className="text-brand-accent-text" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-brand-accent-text text-xs mb-0.5">{replyingTo ? (isRTL ? "در پاسخ به" : 'Replying to') : (isRTL ? "در حال ویرایش" : 'Editing message')}</div>
                    <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      {((replyingTo || editingMessage)?.type === 'image' || (replyingTo || editingMessage)?.type === 'video') && (replyingTo || editingMessage)?.mediaUrl && (
                        <div className="w-8 h-8 rounded overflow-hidden flex-shrink-0 bg-black/10 flex items-center justify-center pointer-events-none">
                          {(replyingTo || editingMessage)?.type === 'image' ? (
                            <img src={(replyingTo || editingMessage)?.mediaUrl} alt="preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <video src={(replyingTo || editingMessage)?.mediaUrl} className="w-full h-full object-cover" muted playsInline />
                          )}
                        </div>
                      )}
                      {((replyingTo || editingMessage)?.type === 'audio' || (replyingTo || editingMessage)?.type === 'voice' || (replyingTo || editingMessage)?.type === 'file') && (
                        <div className="w-8 h-8 rounded flex-shrink-0 flex items-center justify-center bg-brand-accent/15 text-brand-accent-text">
                          {((replyingTo || editingMessage)?.type === 'audio' || (replyingTo || editingMessage)?.type === 'voice') ? <Mic size={14} /> : <Paperclip size={14} />}
                        </div>
                      )}
                      <div className="opacity-80 truncate text-xs">
                        {(replyingTo || editingMessage)?.text ? parseFlags((replyingTo || editingMessage)?.text || '') : (
                          (replyingTo || editingMessage)?.type === 'image' ? (isRTL ? 'عکس' : 'Photo') :
                          (replyingTo || editingMessage)?.type === 'video' ? (isRTL ? 'ویدیو' : 'Video') :
                          ((replyingTo || editingMessage)?.type === 'audio' || (replyingTo || editingMessage)?.type === 'voice') ? (isRTL ? 'صدا' : 'Audio') :
                          (replyingTo || editingMessage)?.type === 'file' ? ((replyingTo || editingMessage)?.fileName || (isRTL ? 'فایل' : 'File')) : ''
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => { setReplyingTo(null); setEditingMessage(null); setInputText(''); }} 
                  className="text-gray-500 hover:text-slate-800 dark:hover:text-gray-300 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {uploadProgress.map((fileProg) => (
              <motion.div
                key={fileProg.name}
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className={`bg-brand-panel/90 backdrop-blur-md p-3 px-4 rounded-xl mb-2 border border-brand-accent/20 flex flex-col gap-2 shadow-lg ${isRTL ? 'text-right' : 'text-left'}`}
              >
                <div className={`flex items-center justify-between text-xs font-semibold ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`flex items-center gap-2 max-w-[65%] overflow-hidden ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className="w-5 h-5 rounded-md bg-brand-accent/15 flex items-center justify-center text-brand-accent-text animate-spin self-center shrink-0">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                    <span className="truncate text-slate-700 dark:text-slate-200">{fileProg.name}</span>
                  </div>
                  <div className={`flex items-center gap-2 shrink-0 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="font-mono text-brand-accent-text font-bold bg-brand-accent/15 px-2 py-0.5 rounded text-[10px]">{fileProg.progress}%</span>
                    <button
                      type="button"
                      onClick={() => cancelUpload(fileProg.name)}
                      className="p-1 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer active:scale-95"
                      title={isRTL ? "لغو آپلود" : "Cancel upload"}
                      aria-label={isRTL ? "لغو آپلود" : "Cancel upload"}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800/80 rounded-full h-1.5 overflow-hidden border border-slate-300/40 dark:border-white/[0.03]">
                  <div
                    className="bg-brand-accent h-1.5 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${fileProg.progress}%` }}
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          <AnimatePresence>
            {downloadProgress.map((fileProg) => (
              <motion.div
                key={fileProg.id}
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className={`bg-brand-panel/90 backdrop-blur-md p-3 px-4 rounded-xl mb-2 border border-emerald-500/10 flex flex-col gap-2 shadow-lg ${isRTL ? 'text-right' : 'text-left'}`}
              >
                <div className={`flex items-center justify-between text-xs font-semibold ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`flex items-center gap-2 max-w-[70%] overflow-hidden ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center text-emerald-500 animate-pulse self-center shrink-0">
                      <Download size={12} className="animate-bounce" />
                    </div>
                    <span className="truncate text-slate-700 dark:text-slate-200">
                      {isRTL ? 'در حال دریافت:' : 'Downloading:'} {fileProg.name}
                    </span>
                  </div>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded text-[10px]">{fileProg.progress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800/80 rounded-full h-1.5 overflow-hidden border border-slate-300/40 dark:border-white/[0.03]">
                  <div 
                    className="bg-gradient-to-r from-emerald-500 to-teal-500 h-1.5 rounded-full transition-all duration-300 ease-out" 
                    style={{ width: `${fileProg.progress}%` }}
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          <div className="flex items-end gap-1.5 w-full">
            <div className="relative shrink-0 mb-0.5" ref={emojiPickerRef}>
              <button 
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const nextState = !isEmojiPickerOpen;
                  setIsEmojiPickerOpen(nextState);
                  if (nextState) {
                    if (document.activeElement instanceof HTMLElement) {
                      document.activeElement.blur();
                    }
                    inputTextRef.current?.blur();
                  } else {
                    inputTextRef.current?.focus();
                  }
                }}
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-yellow-400 transition-colors bg-brand-input/90 backdrop-blur-xl rounded-xl border border-brand-border shadow-lg cursor-pointer active:scale-95"
                title={isEmojiPickerOpen ? (isRTL ? "کیبورد" : "Keyboard") : (isRTL ? "ایموجی" : "Emoji")}
              >
                {isEmojiPickerOpen ? (
                  <Keyboard size={20} className="text-yellow-400 animate-in zoom-in-75 duration-150" />
                ) : (
                  <Smile size={20} />
                )}
              </button>

              {/* Desktop Emoji Picker Popover */}
              {isEmojiPickerOpen && (
                <div className={`hidden md:block absolute bottom-full mb-4 ${isRTL ? 'right-0' : 'left-0'} z-50`}>
                  <div className="relative shadow-2xl border border-brand-border rounded-xl overflow-hidden bg-brand-panel ring-1 ring-white/10">
                    <EmojiPicker 
                      onEmojiClick={(e) => {
                        setInputText(prev => prev + e.emoji);
                        setTimeout(() => {
                          syncInputScroll();
                          inputTextRef.current?.focus();
                        }, 0);
                      }}
                      theme={Theme.DARK}
                      emojiStyle={EmojiStyle.GOOGLE}
                      autoFocusSearch={false}
                      width={350}
                      height={400}
                      searchPlaceHolder={isRTL ? "جستجوی ایموجی..." : "Search emoji..."}
                      previewConfig={{ showPreview: false }}
                    />
                  </div>
                </div>
              )}
            </div>
            
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 shrink-0 mb-0.5 flex items-center justify-center text-gray-400 hover:text-brand-accent-text transition-colors bg-brand-input/90 backdrop-blur-xl rounded-xl border border-brand-border shadow-lg cursor-pointer active:scale-95"
            >
              <Paperclip size={20} />
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={(e) => {
                  if (e.target.files) onDrop(Array.from(e.target.files));
                  e.target.value = '';
                }} 
              />
            </button>

            <div className="flex-1 bg-brand-input/90 backdrop-blur-xl border border-brand-border rounded-xl p-0.5 relative flex flex-col min-w-0 min-h-[40px] h-auto select-none transition-all shadow-lg glow-border justify-center mb-0.5">
              {/* Overlaid Layer with Custom Emojis / Iran Lion and Sun Flag */}
              <div 
                ref={overlayTextRef}
                className={`absolute inset-0 pointer-events-none text-sm px-2.5 py-2 whitespace-pre-wrap break-words overflow-y-auto overflow-x-hidden select-none text-brand-text ${isRTL ? 'text-right' : 'text-left'}`}
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', lineHeight: '1.4' }}
              >
                {inputText ? (
                  <span className="inline">
                    {parseFlags(inputText)}
                  </span>
                ) : (
                  <span className="opacity-40">{t.typeMessage}</span>
                )}
              </div>

              {/* Real Textarea with transparent text and a gorgeous visible brand caret */}
              <textarea
                id="chat-message-input"
                ref={inputTextRef}
                rows={1}
                value={inputText}
                readOnly={isEmojiPickerOpen}
                inputMode={isEmojiPickerOpen ? 'none' : 'text'}
                onClick={() => {
                  if (isEmojiPickerOpen) {
                    setIsEmojiPickerOpen(false);
                    setTimeout(() => {
                      inputTextRef.current?.focus();
                    }, 50);
                  }
                }}
                onChange={(e) => {
                  setInputText(e.target.value);
                  sendTypingEvent();
                  setTimeout(syncInputScroll, 0);
                }}
                onScroll={syncInputScroll}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={""}
                className={`w-full h-full bg-transparent border-none focus:ring-0 text-sm px-2 py-1.5 text-transparent caret-brand-accent outline-none resize-none overflow-y-auto overflow-x-hidden fancy-transparent-input ${isRTL ? 'text-right' : ''}`}
                style={{ 
                  direction: isRTL ? 'rtl' : 'ltr', 
                  lineHeight: '1.4',
                  minHeight: '28px',
                  maxHeight: '120px'
                }}
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0 mb-0.5">
              {isRecording && (
                <div className="flex items-center gap-1 mr-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] text-red-400 font-mono font-bold">{formatRecordingDuration(recordingSeconds)}</span>
                  <div className="flex items-center gap-0.5 mx-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="waveform-bar" style={{ animationDelay: `${i * 0.08}s` }} />
                    ))}
                  </div>
                </div>
              )}
              {!inputText.trim() && !isRecording ? (
                <button
                  type="button"
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  className="w-10 h-10 flex items-center justify-center rounded-xl transition-all shadow-lg cursor-pointer bg-brand-input/90 backdrop-blur-xl border border-brand-border text-gray-400 hover:text-red-400"
                  aria-label={isRTL ? "ضبط صدا" : "Voice Recording"}
                >
                  <Mic size={20} />
                </button>
              ) : !isRecording ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSendMessage}
                  className="w-10 h-10 bg-brand-accent hover:brightness-110 text-white rounded-xl border border-brand-accent/50 flex items-center justify-center shadow-lg shadow-brand-accent/25 transition-all cursor-pointer active:scale-95"
                  aria-label={isRTL ? "ارسال پیام" : "Send Message"}
                >
                  <Send size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  onMouseUp={stopRecording}
                  className="w-10 h-10 flex items-center justify-center rounded-xl transition-all shadow-lg cursor-pointer bg-red-500 border border-red-500 text-white scale-110 animate-pulse"
                  aria-label={isRTL ? "توقف ضبط" : "Stop Recording"}
                >
                  <Mic size={20} />
                </button>
              )}
            </div>
          </div>

          {/* Character Counter */}
          {inputText.length > 100 && (
            <div className={`flex ${isRTL ? 'justify-start' : 'justify-end'} px-1 mt-0.5`}>
              <span className={`text-[9px] font-mono font-bold ${inputText.length > 450 ? 'text-red-400' : inputText.length > 350 ? 'text-amber-400' : 'text-gray-500'}`}>
                {inputText.length}/500
              </span>
            </div>
          )}

          {/* Mobile Telegram-style Emoji Drawer Replacement */}
          <AnimatePresence>
            {isEmojiPickerOpen && (
              <motion.div
                ref={mobileEmojiPickerRef}
                onMouseDown={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.tagName !== 'INPUT' && !target.closest('.epr-search-container')) {
                    e.preventDefault();
                  }
                }}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 320, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="md:hidden w-full overflow-hidden shrink-0 pt-1 border-t border-brand-border/40 mt-1 bg-brand-panel/95 rounded-t-2xl shadow-inner relative z-50"
              >
                <EmojiPicker 
                  onEmojiClick={(e) => {
                    setInputText(prev => prev + e.emoji);
                    setTimeout(() => {
                      syncInputScroll();
                      if (window.innerWidth >= 768) {
                        inputTextRef.current?.focus();
                      }
                    }, 0);
                  }}
                  theme={Theme.DARK}
                  emojiStyle={EmojiStyle.GOOGLE}
                  autoFocusSearch={false}
                  width="100%"
                  height={310}
                  lazyLoadEmojis={true}
                  searchPlaceHolder={isRTL ? "جستجوی ایموجی..." : "Search emoji..."}
                  previewConfig={{ showPreview: false }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </footer>
      ) : chat.type === 'channel' ? (
        <div className="h-4" /> // Hidden bottom section for channels
      ) : (
        <footer className="p-2 md:p-2.5 absolute bottom-0 left-0 right-0 z-40 bg-brand-header-bg backdrop-blur-xl border-t border-brand-border shrink-0">
          <div className="bg-brand-panel/80 border border-brand-border rounded-2xl p-3 flex items-center justify-center text-slate-500 dark:text-gray-400 text-xs gap-2">
            <Shield size={14} className="text-brand-accent-text opacity-70" />
            {isRTL ? "شما نمی‌توانید در این گفتگو پیام بفرستید" : "You cannot send messages to this conversation"}
          </div>
        </footer>
      ))}

    </div>
  );
};

const isMediaContainerEvent = (e: React.MouseEvent | React.TouchEvent | React.UIEvent) => {
  if (!e) return false;
  const target = e.target as HTMLElement;
  if (target && typeof target.closest === 'function' && target.closest('.custom-media-container')) {
    return true;
  }
  if (e.nativeEvent && typeof e.nativeEvent.composedPath === 'function') {
    const path = e.nativeEvent.composedPath();
    for (const node of path) {
      if (node && (node as any).classList && typeof (node as any).classList.contains === 'function') {
        if ((node as HTMLElement).classList.contains('custom-media-container')) {
          return true;
        }
      }
    }
  }
  return false;
};

const MessageItem: React.FC<{ 
  message: Message; 
  isMe: boolean; 
  onReply: () => void; 
  onEdit: () => void; 
  onDelete: () => void;
  onNavigateToHandle: (handle: string) => void;
  replyingToMessage?: Message;
  chatId: string;
  chat: Chat;
  isMultiSelectMode: boolean;
  isSelected: boolean;
  isPrevSelected: boolean;
  isNextSelected: boolean;
  onToggleSelect: () => void;
  onStartMultiSelect: () => void;
}> = ({ message, isMe, onReply, onEdit, onDelete, onNavigateToHandle, replyingToMessage, chatId, chat, isMultiSelectMode, isSelected, isPrevSelected, isNextSelected, onToggleSelect, onStartMultiSelect }) => {
  const [showOptions, setShowOptions] = useState(false);
  const { user, profile } = useAuth();
  const { isRTL } = useLanguage();
  const [showEmojis, setShowEmojis] = useState(false);
  const [senderProfile, setSenderProfile] = useState<UserProfile | null>(null);
  const [showSenderProfile, setShowSenderProfile] = useState(false);
  const [replySenderProfile, setReplySenderProfile] = useState<UserProfile | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [reactionUserProfiles, setReactionUserProfiles] = useState<Record<string, UserProfile>>({});
  const [isReactionsExpanded, setIsReactionsExpanded] = useState(false);
  const lastTapRef = useRef<number>(0);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [isReplyReady, setIsReplyReady] = useState<boolean>(false);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isSwipeActive = useRef<boolean>(false);
  const wasSwipedRef = useRef<boolean>(false);
  const longPressTimerRef = useRef<number | null>(null);
  const isLongPressTriggeredRef = useRef<boolean>(false);
  const pressStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const startLongPressTimer = (clientX: number, clientY: number) => {
    if (message.deleted) return;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    isLongPressTriggeredRef.current = false;
    pressStartPosRef.current = { x: clientX, y: clientY };

    longPressTimerRef.current = window.setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      setContextMenuPos(null);
      if (!isMultiSelectMode) {
        onStartMultiSelect();
      } else {
        onToggleSelect();
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch (e) {
          // ignore iframe vibration policy errors
        }
      }
      // Keep isLongPressTriggeredRef as true for a short window to absorb all trailing touch/click/contextmenu events
      window.setTimeout(() => {
        isLongPressTriggeredRef.current = false;
      }, 800);
    }, 350);
  };

  const cancelLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cancelLongPressTimer();
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (message.deleted) return;
    if (isMediaContainerEvent(e)) return;
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    isSwipeActive.current = false;
    wasSwipedRef.current = false;
    setSwipeOffset(0);
    setIsReplyReady(false);

    startLongPressTimer(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (message.deleted) return;
    if (isMediaContainerEvent(e)) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - touchStartX.current;
    const diffY = touch.clientY - touchStartY.current;

    if (Math.hypot(diffX, diffY) > 10) {
      cancelLongPressTimer();
    }

    if (!isSwipeActive.current && Math.abs(diffX) > 30 && Math.abs(diffX) > Math.abs(diffY) * 2) {
      isSwipeActive.current = true;
      wasSwipedRef.current = true;
    }

    if (isSwipeActive.current) {
      if (diffX < 0) {
        const clampedOffset = Math.max(-100, diffX);
        setSwipeOffset(clampedOffset);
        setIsReplyReady(clampedOffset <= -60);
      } else {
        setSwipeOffset(0);
        setIsReplyReady(false);
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    cancelLongPressTimer();
    if (isSwipeActive.current) {
      if (swipeOffset <= -60) {
        onReply();
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(20);
          } catch (vibrateErr) {
            // ignore sandboxed iframe vibrate exceptions
          }
        }
      }
    }
    
    setSwipeOffset(0);
    setIsReplyReady(false);
    isSwipeActive.current = false;
    setTimeout(() => {
      wasSwipedRef.current = false;
    }, 150);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (message.deleted) return;
    if (e.button !== 0) return;
    if (isMediaContainerEvent(e)) return;
    startLongPressTimer(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (longPressTimerRef.current) {
      const dist = Math.hypot(e.clientX - pressStartPosRef.current.x, e.clientY - pressStartPosRef.current.y);
      if (dist > 10) {
        cancelLongPressTimer();
      }
    }
  };

  const handleMouseUp = () => {
    cancelLongPressTimer();
  };

  useEffect(() => {
    if (!contextMenuPos) {
      setIsReactionsExpanded(false);
    }
  }, [contextMenuPos]);

  const handleDoubleClickAndTap = async (e: React.MouseEvent | React.TouchEvent) => {
    if (message.deleted || isMultiSelectMode) return;
    if (isMediaContainerEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const defaultReact = profile?.defaultReaction || '♥️';
    await addReaction(defaultReact);
    setContextMenuPos(null);
  };

  useEffect(() => {
    if (!message.reactions) return;
    
    // Get all unique user IDs across all reactions
    const uids = Array.from(
      new Set(
        Object.values(message.reactions as Record<string, string[]>).flat()
      )
    );
    
    if (uids.length === 0) return;
    
    const fetchProfiles = async () => {
      const missingUids = uids.filter(uid => !reactionUserProfiles[uid]);
      if (missingUids.length === 0) return;
      
      const newProfiles = { ...reactionUserProfiles };
      let updated = false;
      
      for (const uid of missingUids) {
        try {
          if (uid === user?.uid && profile) {
            newProfiles[uid] = profile as UserProfile;
            updated = true;
          } else {
            const p = await apiGetUserProfile(uid).catch(() => null);
            if (p) {
              newProfiles[uid] = p as UserProfile;
              updated = true;
            }
          }
        } catch (err) {
          console.error("Error fetching reaction profile:", err);
        }
      }
      
      if (updated) {
        setReactionUserProfiles(newProfiles);
      }
    };
    
    fetchProfiles();
  }, [message.reactions, user?.uid, profile, reactionUserProfiles]);

  useEffect(() => {
    if (!isMe && chat.type !== 'channel') {
      apiGetUserProfile(message.senderId)
        .then(p => { if (p) setSenderProfile(p as UserProfile); })
        .catch(() => {});
    }
  }, [message.senderId, isMe, chat.type]);

  useEffect(() => {
    if (replyingToMessage && replyingToMessage.senderId) {
      if (replyingToMessage.senderId === user?.uid) {
        setReplySenderProfile(profile as UserProfile);
      } else {
        apiGetUserProfile(replyingToMessage.senderId)
          .then(p => { if (p) setReplySenderProfile(p as UserProfile); })
          .catch(() => {});
      }
    } else {
      setReplySenderProfile(null);
    }
  }, [replyingToMessage, user?.uid, profile]);

  // The server toggles the reaction and enforces one reaction per user.
  const addReaction = async (emoji: string) => {
    if (!user) return;
    await apiToggleReaction(chatId, message.id, emoji);
    setShowEmojis(false);
  };

  const renderMessageText = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span 
            key={i} 
            className="text-white font-bold underline decoration-blue-400/50 hover:decoration-blue-400 cursor-pointer transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToHandle(part);
            }}
          >
            {part}
          </span>
        );
      }
      return <React.Fragment key={i}>{parseFlags(part)}</React.Fragment>;
    });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isLongPressTriggeredRef.current || longPressTimerRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (message.deleted) return;
    if (isMediaContainerEvent(e)) return;
    if (isMultiSelectMode) {
      e.preventDefault();
      onToggleSelect();
      return;
    }
    
    // Only open context menu on actual desktop right-click (button === 2)
    const nativeEvent = e.nativeEvent as MouseEvent;
    if (nativeEvent && nativeEvent.button === 2) {
      cancelLongPressTimer();
      e.preventDefault();
      e.stopPropagation();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    } else {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleTouchOrClick = (e: React.MouseEvent | React.TouchEvent) => {
    cancelLongPressTimer();

    if (isLongPressTriggeredRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (message.deleted) return;
    if (isMediaContainerEvent(e)) return;
    if (wasSwipedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (isMultiSelectMode) {
      onToggleSelect();
      return;
    }

    // Check if link/handle or inner action button was clicked
    const target = e.target as HTMLElement;
    if (target) {
      if (target.tagName === 'SPAN' && target.className.includes('underline')) {
        return;
      }
      if (target.closest('button') && !target.closest('.message-option-btn')) {
        // Allow inner specific buttons (like reactions) to fire without opening the main menu
        return;
      }
    }

    e.stopPropagation();

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else if ('clientX' in e && (e as React.MouseEvent).clientX) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    if (!clientX || !clientY) {
      const rect = e.currentTarget.getBoundingClientRect();
      clientX = rect.left + rect.width / 2;
      clientY = rect.top + rect.height / 2;
    }

    setContextMenuPos({ x: clientX, y: clientY });
  };

  const handleCopy = () => {
    if (message.text) {
      navigator.clipboard.writeText(message.text);
    }
    setContextMenuPos(null);
  };

  if (message.type === 'system') {
    // Parse system message to extract the name portion and make it clickable
    const nameEndPatterns = isRTL
      ? [' به گروه پیوست', ' گروه را ترک کرد', ' به کانال پیوست', ' از کانال خارج شد', ' حذف شد', ' اضافه شد']
      : [' joined the group', ' left the group', ' joined the channel', ' left the channel', ' was removed', ' was added'];
    let namePart = message.text;
    let actionPart = '';
    for (const pattern of nameEndPatterns) {
      const idx = message.text.indexOf(pattern);
      if (idx > 0) {
        namePart = message.text.substring(0, idx);
        actionPart = message.text.substring(idx);
        break;
      }
    }

    return (
      <div id={`message-${message.id}`} className="flex justify-center w-full my-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 backdrop-blur-md text-[11px] text-blue-400 font-medium shadow-sm flex items-center gap-1"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              // Try to find this user and show their profile
              const cleanName = namePart.trim().replace(/^@/, '');
              apiGetUsers(cleanName).then((users: any[]) => {
                const match = users.find((u: any) =>
                  u.username?.toLowerCase() === cleanName.toLowerCase() ||
                  u.displayName?.toLowerCase() === cleanName.toLowerCase()
                );
                if (match) {
                  // Set senderProfile and show card
                  setSenderProfile(match);
                  setShowSenderProfile(true);
                }
              }).catch(() => {});
            }}
            className="font-bold text-blue-300 hover:text-blue-200 hover:underline cursor-pointer transition-colors"
          >
            {parseFlags(namePart)}
          </button>
          <span>{actionPart}</span>
        </motion.div>

        {showSenderProfile && senderProfile && (
          <UserProfileCard
            uid={senderProfile.uid}
            initialProfile={senderProfile}
            chat={chat}
            onStartChat={(username) => onNavigateToHandle(username)}
            onClose={() => { setShowSenderProfile(false); setSenderProfile(null); }}
          />
        )}
      </div>
    );
  }

  // Stable side determination
  const side = isRTL 
    ? (isMe ? 'left' : 'right') 
    : (isMe ? 'right' : 'left');

  const isAdmin = user && chat.admins?.includes(user?.uid || '');
  const isOwner = user && chat.ownerUid === user?.uid;
  const isNormalChannelMember = chat.type === 'channel' && !(chat.admins?.includes(user?.uid || '') || chat.ownerUid === user?.uid);
  const canEdit = isMe && !isNormalChannelMember;
  const canDelete = (isMe || (chat.type !== 'dm' && (isAdmin || isOwner))) && !isNormalChannelMember;

  return (
    <motion.div 
      id={`message-${message.id}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => isMultiSelectMode ? onToggleSelect() : handleTouchOrClick(e)}
      onContextMenu={handleContextMenu}
      className={`w-full flex items-center gap-3 transition-colors select-none ${
        isMultiSelectMode
          ? isSelected
            ? `bg-brand-accent/20 hover:bg-brand-accent/25 cursor-pointer px-3 border border-brand-accent/30 shadow-sm shadow-brand-accent/10 ${
                isPrevSelected && isNextSelected
                  ? 'rounded-none border-y-0 my-[-1px] py-2'
                  : isPrevSelected
                    ? 'rounded-t-none border-t-0 mt-[-1px] py-2'
                    : isNextSelected
                      ? 'rounded-b-none border-b-0 mb-[-1px] py-2'
                      : 'rounded-xl py-2'
              }`
            : 'px-1.5 py-1 cursor-pointer bg-transparent'
          : `${isNextSelected ? 'msg-group-same' : 'msg-group-diff'} px-1.5 py-0.5 cursor-pointer`
      } ${side === 'right' ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Visual selection indicator (Checkbox) */}
      {isMultiSelectMode && (
        <div className={`flex shrink-0 items-center justify-center w-5 h-5 rounded-full border-2 transition-all duration-200 ${
          isSelected 
            ? 'border-brand-accent bg-brand-accent text-white shadow-md shadow-brand-accent/30' 
            : 'border-white/20 hover:border-brand-accent-text'
        }`}>
          {isSelected && <Check size={12} className="text-white font-black stroke-[3px]" />}
        </div>
      )}

      {/* Message Inner Body */}
      <div className={`flex flex-col max-w-[85%] md:max-w-lg ${side === 'right' ? 'items-end' : 'items-start'} group w-full`}>
        <div className={`flex items-end gap-2 md:gap-3 w-full ${side === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
          {!isMe && (
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 bg-brand-input mb-1 ring-1 ring-white/10 shadow-lg">
              {chat.type === 'channel' ? (
                <img src={chat.photoURL || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + chat.id} alt="" className="w-full h-full object-cover" />
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowSenderProfile(true); }}
                  title={isRTL ? "نمایش اطلاعات کاربر" : "View profile"}
                  className="w-full h-full cursor-pointer"
                >
                  <img src={senderProfile?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + message.senderId} alt="" className="w-full h-full object-cover" />
                </button>
              )}
            </div>
          )}
          <div className={`flex flex-col gap-1 ${side === 'right' ? 'items-end' : 'items-start'} max-w-full`}>
            <div className="relative w-full overflow-visible">
              {/* Swipe reply indicator popping in from behind the message */}
              {swipeOffset < 0 && (
                <div 
                  className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-10"
                  style={{
                    opacity: Math.min(1, Math.abs(swipeOffset) / 45),
                    right: `${Math.max(8, -swipeOffset - 36)}px`,
                  }}
                >
                  <div className={`p-2 rounded-full border shadow-md flex items-center justify-center transition-all duration-150 ${
                    isReplyReady 
                      ? 'bg-brand-accent border-brand-accent text-white scale-110 shadow-brand-accent/20' 
                      : 'bg-brand-panel border-brand-border text-brand-accent-text'
                  }`}>
                    <Reply size={14} className={isRTL ? '' : 'rotate-180'} />
                  </div>
                </div>
              )}

              <div 
                onDoubleClick={handleDoubleClickAndTap}
                style={{
                  transform: `translateX(${swipeOffset}px)`,
                  transition: swipeOffset === 0 ? 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)' : 'none'
                }}
                className={`relative px-3.5 py-2.5 rounded-2xl text-[13px] md:text-sm shadow-md shadow-black/10 border transition-all duration-300 ${
                  isSelected
                    ? 'ring-4 ring-brand-accent/50 border-brand-accent bg-brand-accent/35 shadow-lg shadow-brand-accent/40 text-white'
                    : isMe
                      ? 'bg-brand-bubble-me text-white rounded-br-none shadow-lg shadow-black/25 border-white/5'
                      : 'bg-brand-panel text-brand-text rounded-bl-none border-brand-border shadow-md shadow-black/15'
                } ${isRTL ? 'text-right' : 'text-left'} ${isRTL ? 'msg-anim-rtl' : 'msg-anim-ltr'}`}
              >
              {!isMe && chat.type !== 'dm' && (
                <div className="text-[10px] font-black tracking-widest uppercase text-brand-accent-text mb-1.5 opacity-90">
                  {chat.type === 'channel' ? (
                    parseFlags(chat.name || '')
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowSenderProfile(true);
                      }}
                      title={isRTL ? "نمایش اطلاعات کاربر" : "View profile"}
                      className="hover:underline decoration-brand-accent/60 cursor-pointer"
                    >
                      {parseFlags(senderProfile?.displayName || senderProfile?.username || '...')}
                    </button>
                  )}
                </div>
              )}
              {replyingToMessage && !message.deleted && (
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    const element = document.getElementById(`message-${replyingToMessage.id}`);
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      element.classList.add('bg-brand-accent/20', 'ring-1', 'ring-brand-accent/50', 'rounded-2xl', 'scale-[1.025]', 'px-2');
                      setTimeout(() => {
                        element.classList.remove('bg-brand-accent/20', 'ring-1', 'ring-brand-accent/50', 'rounded-2xl', 'scale-[1.025]', 'px-2');
                      }, 1200);
                    }
                  }}
                  className={`text-[11px] p-2 rounded-xl mb-2 border-l-2 border-brand-accent opacity-90 truncate cursor-pointer hover:opacity-100 duration-150 ${
                    isMe 
                      ? 'bg-black/25 border-white/20 hover:bg-black/35 text-white/90' 
                      : 'bg-brand-sidebar/70 border-brand-border hover:bg-brand-sidebar/90 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <div className={`font-bold flex items-center gap-1 mb-0.5 ${isMe ? 'text-brand-accent-text' : 'text-brand-accent-text'}`}>
                     {replyingToMessage.senderId === user?.uid 
                       ? (isRTL ? 'شما' : 'You') 
                       : parseFlags(replySenderProfile?.displayName || replySenderProfile?.username || (isRTL ? 'مخاطب' : 'Contact'))}
                  </div>
                  <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                     {(replyingToMessage.type === 'image' || replyingToMessage.type === 'video') && replyingToMessage.mediaUrl && (
                       <div className="w-8 h-8 rounded border border-white/10 overflow-hidden flex-shrink-0 bg-black/10 flex items-center justify-center pointer-events-none">
                         {replyingToMessage.type === 'image' ? (
                           <img src={replyingToMessage.mediaUrl} alt="preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                         ) : (
                           <video src={replyingToMessage.mediaUrl} className="w-full h-full object-cover" muted playsInline />
                         )}
                       </div>
                     )}
                     {(replyingToMessage.type === 'audio' || replyingToMessage.type === 'voice' || replyingToMessage.type === 'file') && (
                       <div className={`w-8 h-8 rounded flex-shrink-0 flex items-center justify-center ${isMe ? 'bg-black/30 text-white' : 'bg-brand-accent/15 text-brand-accent-text'}`}>
                         {(replyingToMessage.type === 'audio' || replyingToMessage.type === 'voice') ? <Mic size={14} /> : <Paperclip size={14} />}
                       </div>
                     )}
                    <div className={`truncate opacity-80 ${isMe ? 'text-white/85' : 'text-slate-600 dark:text-gray-300'}`}>
                      {replyingToMessage.text ? parseFlags(replyingToMessage.text) : (
                         replyingToMessage.type === 'image' ? (isRTL ? 'عکس' : 'Photo') :
                         replyingToMessage.type === 'video' ? (isRTL ? 'ویدیو' : 'Video') :
                         (replyingToMessage.type === 'audio' || replyingToMessage.type === 'voice') ? (isRTL ? 'صدا' : 'Audio') :
                         replyingToMessage.type === 'file' ? (replyingToMessage.fileName || (isRTL ? 'فایل' : 'File')) : ''
                      )}
                    </div>
                  </div>
                </div>
              )}

              {message.type === 'text' && (
                <p className={`${message.deleted ? 'italic opacity-60 text-xs' : ''} whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed`}>{renderMessageText(message.text || '')}</p>
              )}

              {message.type === 'image' && (
                <CustomImagePlayer src={message.mediaUrl || ''} alt={message.fileName || ''} />
              )}

              {message.type === 'video' && (
                <CustomVideoPlayer src={message.mediaUrl || ''} />
              )}

              {message.type === 'audio' && (
                <CustomAudioPlayer 
                  src={message.mediaUrl || ''} 
                  fileName={message.fileName}
                  senderName={isMe ? (profile?.displayName || profile?.username || '') : (senderProfile?.displayName || senderProfile?.username || '')}
                />
              )}

              {message.type === 'file' && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    startDownload(message.mediaUrl!, message.fileName || 'file');
                  }} 
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all border group/file active:scale-95 text-left w-fit cursor-pointer outline-none select-none ${
                    isMe 
                      ? 'bg-blue-700/30 hover:bg-blue-700/50 border-white/10 text-white' 
                      : 'bg-brand-sidebar/40 hover:bg-brand-sidebar/60 border-brand-border text-brand-text'
                  }`}
                >
                   <Paperclip size={18} className="text-blue-400 shrink-0 group-hover/file:scale-110 transition-transform" />
                   <div className="flex flex-col min-w-0">
                     <span className={`text-xs font-semibold truncate max-w-[160px] select-none ${isMe ? 'text-white' : 'text-brand-text'}`}>{message.fileName || (isRTL ? 'فایل' : 'File')}</span>
                     <span className={`text-[9px] font-mono select-none ${isMe ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>{isRTL ? 'برای دانلود ضربه بزنید' : 'Tap to download'}</span>
                   </div>
                </button>
              )}

              {message.type !== 'text' && message.text && (
                <p className={`mt-2 ${message.deleted ? 'italic opacity-60 text-xs' : ''} whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed`}>{renderMessageText(message.text)}</p>
              )}

              {/* Reactions */}
              {message.reactions && Object.entries(message.reactions as Record<string, string[]>).filter(([_, uids]) => uids.length > 0).length > 0 && (
                <div className={`flex flex-wrap gap-1.5 mt-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                  {Object.entries(message.reactions as Record<string, string[]>).map(([emoji, uids]) => {
                    const hasReacted = uids.includes(user?.uid || '');
                    return (
                      <button 
                        key={emoji}
                        onClick={(e) => { e.stopPropagation(); addReaction(emoji); }}
                        className={`text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1.5 transition-all shadow-xs cursor-pointer select-none active:scale-95 ${
                          isMe
                            ? hasReacted
                              ? 'bg-black/35 border border-white/40 text-white font-bold ring-1 ring-white/30'
                              : 'bg-black/20 hover:bg-black/30 border border-white/20 text-white font-medium'
                            : hasReacted
                              ? 'bg-brand-accent/20 border border-brand-accent text-brand-accent-text font-bold shadow-xs'
                              : 'bg-brand-panel border border-black/10 dark:border-white/10 text-slate-800 dark:text-slate-100 hover:border-brand-accent/40 font-medium'
                        }`}
                      >
                        <span className="text-[13px] leading-none">{parseFlags(emoji)}</span>
                        <span className={`text-[11px] font-bold font-mono ${isMe ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>
                          {uids.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className={`text-[10px] font-mono mt-1 flex items-center gap-1.5 ${isMe ? 'justify-end text-blue-100/85' : 'justify-start text-slate-500 dark:text-gray-400'}`}>
                <span>{message.createdAt ? format(new Date(message.createdAt), 'HH:mm') : ''}</span>
                {isMe && (message.readBy && message.readBy.length > 1 ? (
                  <CheckCheck size={13} className="text-blue-200" />
                ) : (
                  <Check size={13} className="text-blue-200" />
                ))}
              </div>
            </div>
          </div>
        </div>

          {/* Regular Hover Buttons (Only on desktop md:flex, with pointer-events-none when transparent to prevent invisible button clicks) */}
          {!message.deleted && !isMultiSelectMode && (
            <div className={`hidden md:flex opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto flex gap-1 transition-opacity ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className="relative">
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowEmojis(!showEmojis); }}
                  className="p-1.5 rounded-full bg-brand-panel border border-brand-border shadow-sm text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  title="React"
                >
                  <Smile size={14} />
                </button>
                {showEmojis && (
                  <div className={`absolute bottom-full mb-2 ${isMe ? 'right-0' : 'left-0'} z-50 bg-brand-sidebar p-2 rounded-2xl shadow-xl border border-brand-border flex gap-2 overflow-x-auto max-w-[260px] custom-scrollbar-thin`}>
                    {['😂', '👍', '💩', '🤩', '👎', '👌', '🤚', '👏', '🙏', '♥️', '🫡', '🫥', '😍', '🤗', '🥵', '😡', '🤬', '🤪', '🤡', '💀', '😭', '😹', '😻', '👄', '🫂', '🙋‍♂️', '🤦‍♂️', '🙇‍♂️', '🤷‍♂️', '🏃', '➡️', '🫵', '🗿', '🇮🇷'].map(emoji => (
                      <button key={emoji} onClick={(e) => { e.stopPropagation(); addReaction(emoji); }} className="hover:scale-125 transition-transform text-lg flex-shrink-0 select-none">{parseFlags(emoji)}</button>
                    ))}
                  </div>
                )}
              </div>
              {!isNormalChannelMember && <button onClick={(e) => { e.stopPropagation(); onReply(); }} className="p-1.5 rounded-full bg-brand-panel border border-brand-border shadow-sm text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"><Reply size={14} className={isRTL ? 'rotate-180' : ''} /></button>}
              {isMe && <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1.5 rounded-full bg-brand-panel border border-brand-border shadow-sm text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"><Edit2 size={14} /></button>}
              {canDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1.5 rounded-full bg-brand-panel border border-brand-border shadow-sm text-slate-500 dark:text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>}
            </div>
          )}
        </div>
      </div>

      {/* Sleek Floating Custom Action Overlay (Requirement 2) */}
      {contextMenuPos && (
        <>
          <div 
            className="fixed inset-0 z-50 bg-black/5 backdrop-blur-[0.5px] animate-in fade-in duration-100" 
            onClick={(e) => { e.stopPropagation(); setContextMenuPos(null); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenuPos(null); }}
          />
          <div 
            className="fixed z-[100] w-52 bg-white dark:bg-[#16191c] border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-[0_12px_44px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_44px_rgba(0,0,0,0.6)] overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col font-farsi text-right backdrop-blur-xl animate-out fade-out"
            style={{ 
               top: Math.min(contextMenuPos.y, window.innerHeight - 380), 
               left: isRTL 
                 ? Math.max(16, contextMenuPos.x - 208) 
                 : Math.min(window.innerWidth - 224, contextMenuPos.x)
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Direct reaction emojis picker */}
            <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#111418]/60 select-none flex flex-col gap-1.5">
              <div className={`flex items-center justify-between gap-1 w-full ${isRTL ? 'flex-row-reverse' : ''}`}>
                <div className={`flex items-center gap-1.5 custom-scrollbar-thin ${isReactionsExpanded ? 'flex-wrap py-1 max-h-36 overflow-y-auto w-full' : 'overflow-x-auto overflow-y-hidden flex-nowrap'}`}>
                  {(isReactionsExpanded
                    ? ['😂', '👍', '💩', '🤩', '👎', '👌', '🤚', '👏', '🙏', '♥️', '🫡', '🫥', '😍', '🤗', '🥵', '😡', '🤬', '🤪', '🤡', '💀', '😭', '😹', '😻', '👄', '🫂', '🙋‍♂️', '🤦‍♂️', '🙇‍♂️', '🤷‍♂️', '🏃', '➡️', '🫵', '🗿', '🇮🇷']
                    : ['♥️', '👍', '😂', '🤩', '😭', '🙏']
                  ).map(emoji => {
                    const hadReacted = message.reactions?.[emoji]?.includes(user?.uid || '');
                    return (
                      <button
                        key={emoji}
                        onClick={async (e) => {
                          e.stopPropagation();
                          await addReaction(emoji);
                          setContextMenuPos(null);
                        }}
                        className={`text-lg p-1.5 rounded-lg hover:bg-slate-200/80 dark:hover:bg-white/10 active:scale-95 transition-all select-none flex-shrink-0 ${
                          hadReacted ? 'bg-brand-accent/25 ring-1 ring-brand-accent/50' : ''
                        }`}
                      >
                        {parseFlags(emoji)}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsReactionsExpanded(!isReactionsExpanded);
                  }}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white active:scale-90 transition-all shrink-0"
                  title={isReactionsExpanded ? "Collapse" : "Expand"}
                >
                  <ChevronDown size={14} className={`transition-transform duration-300 ${isReactionsExpanded ? 'rotate-180 text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-gray-400'}`} />
                </button>
              </div>
            </div>
            {/* Reactions breakdown list */}
            {message.reactions && Object.entries(message.reactions as Record<string, string[]>).filter(([_, uids]) => uids?.length > 0).length > 0 && (
              <div className="p-3 bg-slate-50/70 dark:bg-black/20 border-b border-slate-100 dark:border-slate-800/65 font-farsi flex flex-col gap-2">
                <div className={`text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-gray-500 flex items-center gap-1 ${isRTL ? 'flex-row-reverse text-right' : 'text-left'}`}>
                  <span>{isRTL ? "واکنش‌ها" : "Reactions"}</span>
                </div>
                <div className="flex flex-col gap-1.5 max-h-[110px] overflow-y-auto custom-scrollbar-thin">
                  {Object.entries(message.reactions as Record<string, string[]>).map(([emoji, uids]) => {
                    if (!uids || uids.length === 0) return null;
                    const delimiter = isRTL ? '، ' : ', ';
                    const listText = uids.map(uid => {
                      if (uid === user?.uid) return isRTL ? 'شما' : 'You';
                      const prof = reactionUserProfiles[uid];
                      return prof ? (prof.displayName || `@${prof.username}`) : '...';
                    }).join(delimiter);

                    return (
                      <div key={emoji} className={`flex items-start gap-1.5 text-xs text-slate-700 dark:text-gray-300 ${isRTL ? 'flex-row-reverse text-right' : 'text-left'}`}>
                        <span className="text-base select-none leading-none shrink-0" style={{ transform: 'translateY(-1px)' }}>{parseFlags(emoji)}</span>
                        <span className="text-[11px] text-slate-500 dark:text-gray-400 font-medium leading-normal select-text truncate flex-1" title={listText}>
                          {parseFlags(listText)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {!isNormalChannelMember && (
              <button 
                onClick={() => { onReply(); setContextMenuPos(null); }}
                className={`w-full px-4 py-3.5 text-xs md:text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors flex items-center justify-between font-bold text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Reply size={16} className={isRTL ? 'rotate-180 text-blue-500 dark:text-blue-400' : 'text-blue-500 dark:text-blue-400'} />
                  <span>{isRTL ? "پاسخ دادن (ریپلای)" : "Reply"}</span>
                </div>
              </button>
            )}

            {message.type === 'text' && message.text && (
              <button 
                onClick={handleCopy}
                className={`w-full px-4 py-3.5 text-xs md:text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors flex items-center justify-between font-bold text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white border-t border-slate-100 dark:border-slate-800/50 ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Copy size={16} className="text-emerald-500 dark:text-emerald-400" />
                  <span>{isRTL ? "کپی کردن متن" : "Copy Text"}</span>
                </div>
              </button>
            )}

            {message.mediaUrl && (
              <button 
                onClick={() => {
                  setContextMenuPos(null);
                  startDownload(message.mediaUrl!, message.fileName || 'file');
                }}
                className={`w-full px-4 py-3.5 text-xs md:text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors flex items-center justify-between font-bold text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white border-t border-slate-100 dark:border-slate-800/50 ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Download size={16} className="text-blue-500 dark:text-blue-400" />
                  <span>{isRTL ? "دانلود فایل" : "Download"}</span>
                </div>
              </button>
            )}

            <button 
              onClick={() => { onStartMultiSelect(); setContextMenuPos(null); }}
              className={`w-full px-4 py-3.5 text-xs md:text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors flex items-center justify-between font-bold text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white border-t border-slate-100 dark:border-slate-800/50 ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <div className="flex items-center gap-2">
                <CheckSquare size={16} className="text-brand-accent-text" />
                <span>{isRTL ? "انتخاب کردن (چندتایی)" : "Select Message"}</span>
              </div>
            </button>

            {canEdit && (
              <button 
                onClick={() => { onEdit(); setContextMenuPos(null); }}
                className={`w-full px-4 py-3.5 text-xs md:text-sm hover:bg-slate-50 dark:hover:bg-white/5 transition-colors flex items-center justify-between font-bold text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white border-t border-slate-100 dark:border-slate-800/50 ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Edit2 size={16} className="text-amber-500 dark:text-amber-400" />
                  <span>{isRTL ? "ویرایش پیام" : "Edit Message"}</span>
                </div>
              </button>
            )}

            {canDelete && (
              <button 
                onClick={() => { onDelete(); setContextMenuPos(null); }}
                className={`w-full px-4 py-3.5 text-xs md:text-sm hover:bg-slate-100/50 dark:hover:bg-white/5 transition-colors flex items-center justify-between font-bold text-red-500 hover:text-red-600 dark:hover:text-red-350 border-t border-slate-100 dark:border-slate-800/50 ${isRTL ? 'flex-row-reverse' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Trash2 size={16} className="text-red-500" />
                  <span>{isRTL ? "حذف پیام" : "Delete Message"}</span>
                </div>
              </button>
            )}
          </div>
        </>
      )}

      {showSenderProfile && (
        <UserProfileCard
          uid={message.senderId}
          initialProfile={senderProfile}
          chat={chat}
          onStartChat={(username) => onNavigateToHandle(username)}
          onClose={() => setShowSenderProfile(false)}
        />
      )}
    </motion.div>
  );
};

const ChatInfoPanel: React.FC<{ chat: Chat; onClose: () => void; onNavigateToHandle: (handle: string) => void; onLeaveChat: () => void }> = ({ chat, onClose, onNavigateToHandle, onLeaveChat }) => {
  const { user, profile } = useAuth();
  const { isRTL } = useLanguage();
  const { showUndo } = useUndo();
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'members' | 'settings'>('members');
  const [editName, setEditName] = useState(chat.name || '');
  const [editHandle, setEditHandle] = useState(chat.handle || '');
  const [editBio, setEditBio] = useState(chat.bio || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [profileCardUid, setProfileCardUid] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditName(chat.name || '');
    setEditHandle(chat.handle || '');
    setEditBio(chat.bio || '');
  }, [chat]);

  useEffect(() => {
    const memberUids = chat.memberUids || [];
    const isDm = chat.type === 'dm';
    const uidsToLoad = isDm ? memberUids.filter(id => id !== user?.uid) : memberUids;
    let cancelled = false;

    const load = async () => {
      const loaded = await Promise.all(
        uidsToLoad.map(uid => apiGetUserProfile(uid).catch(() => null))
      );
      if (cancelled) return;

      const profiles = loaded.filter(Boolean) as UserProfile[];
      if (isDm) {
        setPartnerProfile(profiles[0] || null);
      } else {
        setMembers(profiles);
      }
    };
    load();

    const applyToOne = (uid: string, patch: Partial<UserProfile>) => {
      if (!uidsToLoad.includes(uid)) return;
      if (isDm) {
        setPartnerProfile(prev => (prev && prev.uid === uid ? { ...prev, ...patch } : prev));
      } else {
        setMembers(prev => prev.map(m => (m.uid === uid ? { ...m, ...patch } : m)));
      }
    };

    const unsubs = [
      subscribe('profile.updated', (p: any) => {
        if (p?.uid) applyToOne(p.uid, p);
      }),
      subscribe('presence.changed', (p: any) => {
        if (p?.uid) applyToOne(p.uid, { isOnline: p.isOnline, lastSeen: p.lastSeen });
      }),
      subscribe('reconnect', load),
    ];

    return () => {
      cancelled = true;
      unsubs.forEach(off => off());
    };
  }, [chat.memberUids, chat.type, user?.uid]);

  const isAdmin = user && chat.admins.includes(user.uid);
  const isOwner = user && chat.ownerUid === user.uid;

  const handleDeleteChat = async () => {
    if (chat.type !== 'dm' && !isOwner) {
      alert(isRTL ? "فقط سازنده (مالک) گروه یا کانال مجاز به حذف کامل آن است." : "Only the group/channel owner is allowed to permanently delete it.");
      return;
    }

    const confirmDelete = window.confirm(isRTL ? "آیا از حذف کامل این گفتگو اطمینان دارید؟ تمامی پیام‌ها و کل گفتگو برای همه اعضا حذف خواهد شد." : "Are you sure you want to PERMANENTLY delete this conversation? It will be completely removed for all members along with all messages.");
    if (!confirmDelete) return;

    const deletedId = chat.id;
    try {
      await apiDeleteChat(deletedId);
      // Emit a custom event so the Sidebar removes the chat immediately,
      // even if the server's SSE broadcast is delayed or missed.
      window.dispatchEvent(new CustomEvent('chat.deleted', { detail: { id: deletedId } }));
      onLeaveChat();
    } catch (error) {
      reportApiError(error, 'DELETE', `chats/${chat.id}`);
    }
  };

  const handleUpdateMetadata = async () => {
    if (!isOwner && !isAdmin) return;
    setIsUpdating(true);
    try {
      await apiUpdateChat(chat.id, {
        name: editName,
        handle: editHandle.toLowerCase().replace(/[^a-z0-9_]/gi, ''),
        description: editBio,
      });
      alert(isRTL ? "تغییرات با موفقیت ذخیره شد" : "Changes saved successfully");
    } catch (error) {
      reportApiError(error, 'UPDATE', `chats/${chat.id}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUpdating(true);
    try {
      const { url } = await apiUploadMedia(file);
      await apiUpdateChat(chat.id, { photoURL: url });
    } catch (error) {
      console.error("Photo upload error:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLeaveChat = async () => {
    if (!user || !chat) return;

    const confirmLeave = window.confirm(isRTL ? "آیا از خروج از این گروه اطمینان دارید؟" : "Are you sure you want to leave this group?");
    if (!confirmLeave) return;

    try {
      // System message goes first — after leaving, posting is no longer permitted.
      if (chat.type === 'group') {
        await apiSendMessage(chat.id, {
          text: `${profile?.displayName || profile?.username || user.uid} ${isRTL ? 'گروه را ترک کرد' : 'left the group'}`,
          type: 'system',
        }).catch(() => {});
      }

      await apiUpdateChat(chat.id, {
        memberUids: chat.memberUids.filter(id => id !== user.uid),
      });
      // Close both the info panel and the chat window immediately
      onLeaveChat();
    } catch (error) {
      reportApiError(error, 'UPDATE', `chats/${chat.id}`);
    }
  };

  const toggleAdmin = async (targetUid: string) => {
    if (!isOwner) return;
    try {
      const newAdmins = chat.admins.includes(targetUid)
        ? chat.admins.filter(id => id !== targetUid)
        : [...chat.admins, targetUid];
      await apiUpdateChat(chat.id, { admins: newAdmins });
    } catch (error) {
      reportApiError(error, 'UPDATE', `chats/${chat.id}`);
    }
  };

  const toggleMute = async (targetUid: string) => {
    if (!isAdmin && !isOwner) return;
    try {
      const currentMuted = chat.mutedUids || [];
      const newMuted = currentMuted.includes(targetUid)
        ? currentMuted.filter(id => id !== targetUid)
        : [...currentMuted, targetUid];
      await apiUpdateChat(chat.id, { mutedUids: newMuted });
    } catch (error) {
      reportApiError(error, 'UPDATE', `chats/${chat.id}`);
    }
  };

  const toggleBan = async (targetUid: string) => {
    if (!isAdmin && !isOwner) return;
    
    try {
      const targetIsAdmin = chat.admins.includes(targetUid);
      const targetIsOwner = chat.ownerUid === targetUid;

      if (targetIsOwner) return; 
      if (targetIsAdmin && !isOwner) return; 

      const currentBanned = chat.bannedUids || [];
      const isBanning = !currentBanned.includes(targetUid);
      const newBanned = isBanning
        ? [...currentBanned, targetUid]
        : currentBanned.filter(id => id !== targetUid);

      // Membership is kept and flagged instead of removed — the server tracks bans on the
      // member row, and dropping the row would leave nothing to flag. Only owners may
      // touch the admin list, so that field is sent only when the caller owns the chat.
      const payload: Record<string, unknown> = { bannedUids: newBanned };
      if (isOwner && isBanning) {
        payload.admins = chat.admins.filter(id => id !== targetUid);
      }

      await apiUpdateChat(chat.id, payload);
    } catch (error) {
      reportApiError(error, 'UPDATE', `chats/${chat.id}`);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-hidden animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative w-full max-w-2xl max-h-[90vh] bg-brand-panel border border-brand-border/60 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-brand-text"
      >
        {/* Modal Header */}
        <div className={`p-4 md:p-5 border-b border-brand-border/40 flex items-center justify-between gap-3 bg-brand-panel/90 backdrop-blur-sm shrink-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className={`flex items-center gap-3 min-w-0 ${isRTL ? 'flex-row-reverse text-right' : 'text-left'}`}>
            <div className="w-10 h-10 rounded-2xl overflow-hidden bg-brand-input shrink-0 ring-2 ring-blue-500/20 shadow-md">
              <img 
                src={(chat.type === 'dm' ? partnerProfile?.photoURL : chat.photoURL) || (chat.type === 'dm' ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + partnerProfile?.uid : 'https://api.dicebear.com/7.x/identicon/svg?seed=' + chat.id)} 
                alt="" 
                className="w-full h-full object-cover" 
              />
            </div>
            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-black truncate flex items-center gap-2 text-[#2c2c2c] dark:text-gray-100">
                <span className="text-[#2c2c2c] dark:text-gray-100">
                  {parseFlags(chat.type === 'dm' ? (partnerProfile?.displayName || partnerProfile?.username || (isRTL ? 'گفتگو' : 'Chat')) : chat.name || '')}
                </span>
                {chat.type === 'channel' && <Megaphone size={16} className="text-brand-accent-text shrink-0" />}
                {chat.type === 'group' && <Users size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />}
              </h2>
              <div className="text-[11px] text-slate-500 dark:text-gray-400 truncate font-mono">
                {chat.type !== 'dm' && chat.handle && `@${chat.handle}`}
                {chat.type === 'dm' && partnerProfile?.username && `@${partnerProfile.username}`}
                {chat.type === 'group' && ` • ${members.length} ${isRTL ? 'عضو' : 'members'}`}
                {chat.type === 'channel' && ` • ${chat.memberUids.length} ${isRTL ? 'عضو' : 'members'}`}
              </div>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-gray-800/80 text-gray-400 hover:text-slate-900 dark:hover:text-white transition-all shrink-0 active:scale-95"
            title={isRTL ? "بستن" : "Close"}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher for Groups & Channels */}
        {chat.type !== 'dm' && (isAdmin || isOwner) && (
          <div className="px-4 pt-3 pb-1 bg-brand-bg/40 border-b border-brand-border/30 shrink-0">
            <div className="flex bg-brand-input p-1 rounded-2xl border border-brand-border/40 gap-1">
              <button
                onClick={() => setActiveTab('members')}
                className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'members'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <Users size={15} />
                <span>{isRTL ? "اعضا و اطلاعات" : "Members & Info"}</span>
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'settings'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <Settings size={15} />
                <span>{chat.type === 'channel' ? (isRTL ? "تنظیمات کانال" : "Channel Settings") : (isRTL ? "تنظیمات گروه" : "Group Settings")}</span>
              </button>
            </div>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 custom-scrollbar">
          {/* Main Info Card */}
          <div className="p-4 md:p-5 rounded-2xl bg-brand-bg/60 border border-brand-border/40 flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-right">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-brand-input shrink-0 shadow-lg ring-4 ring-blue-500/10">
              <img 
                src={(chat.type === 'dm' ? partnerProfile?.photoURL : chat.photoURL) || (chat.type === 'dm' ? 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + partnerProfile?.uid : 'https://api.dicebear.com/7.x/identicon/svg?seed=' + chat.id)} 
                alt="" 
                className="w-full h-full object-cover" 
              />
            </div>
            <div className={`flex-1 min-w-0 ${isRTL ? 'text-right' : 'text-left'}`}>
              <h3 className="text-lg font-bold text-brand-text mb-1 truncate">
                {parseFlags(chat.type === 'dm' ? (partnerProfile?.displayName || partnerProfile?.username || (isRTL ? 'گفتگو' : 'Chat')) : chat.name || '')}
              </h3>
              {chat.type !== 'dm' && chat.handle && <div className="text-blue-500 font-mono text-xs mb-2">@{chat.handle}</div>}
              {chat.type === 'dm' && partnerProfile?.username && <div className="text-blue-500 font-mono text-xs mb-2">@{partnerProfile.username}</div>}
              <p className="text-xs text-slate-500 dark:text-gray-400 leading-relaxed line-clamp-4">
                {parseFlags(chat.type === 'dm' ? (partnerProfile?.bio || (isRTL ? "توضیحاتی ثبت نشده است" : "No bio available.")) : (chat.bio || (isRTL ? "توضیحاتی برای این گفتگو ثبت نشده است." : "No description available.")))}
              </p>

              {/* Action Buttons */}
              <div className="mt-4 flex flex-wrap gap-2">
                {(chat.type === 'dm' || ((chat.type === 'group' || chat.type === 'channel') && isOwner)) && (
                  <button 
                    onClick={handleDeleteChat}
                    className="px-3.5 py-2 bg-red-600/90 hover:bg-red-600 text-white rounded-xl font-bold flex items-center gap-1.5 transition-all text-xs active:scale-95 shadow-sm"
                  >
                    <Trash2 size={14} />
                    <span>{chat.type === 'dm' ? (isRTL ? "حذف گفتگو" : "Delete Chat") : (isRTL ? "حذف کامل" : "Delete All")}</span>
                  </button>
                )}
                {chat.type !== 'dm' && (
                  <button 
                    onClick={handleLeaveChat}
                    className="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl font-bold flex items-center gap-1.5 transition-all text-xs active:scale-95"
                  >
                    <span>{isRTL ? "ترک گفتگو" : "Leave Chat"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Members Content Tab */}
          {activeTab === 'members' && chat.type !== 'dm' && (
            <div className="space-y-3">
              <div className={`flex items-center justify-between text-xs font-bold text-slate-500 dark:text-gray-400 px-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <span>{isRTL ? "اعضای این گفتگو" : "Chat Members"}</span>
                <span className="bg-brand-bg px-2.5 py-0.5 rounded-full border border-brand-border/40 font-mono">{members.length}</span>
              </div>

              <div className="space-y-2">
                {members.map(member => {
                  const mIsOwner = chat.ownerUid === member.uid;
                  const mIsAdmin = chat.admins.includes(member.uid);
                  const mIsMuted = chat.mutedUids?.includes(member.uid);
                  const mIsBanned = chat.bannedUids?.includes(member.uid);

                  return (
                    <div key={member.uid} className={`p-3 bg-brand-bg/50 border border-brand-border/40 rounded-2xl flex items-center gap-3 hover:border-slate-300 dark:hover:border-gray-700 transition-all ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <button
                        onClick={() => setProfileCardUid(member.uid)}
                        title={isRTL ? "نمایش اطلاعات کاربر" : "View profile"}
                        className={`flex items-center gap-3 flex-1 min-w-0 cursor-pointer text-left group ${isRTL ? 'flex-row-reverse text-right' : ''}`}
                      >
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-brand-input shrink-0 shadow-sm ring-2 ring-transparent group-hover:ring-brand-accent/40 transition-all">
                          <img src={member.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + member.uid} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className={`flex-1 min-w-0 ${isRTL ? 'text-right' : ''}`}>
                          <div className="text-xs font-bold truncate flex items-center gap-1.5 group-hover:text-brand-accent-text transition-colors">
                            {parseFlags(member.displayName || member.username)}
                            {mIsOwner && <span className="px-1.5 py-0.2 bg-yellow-500/10 text-yellow-500 text-[9px] rounded font-black uppercase tracking-tighter">Owner</span>}
                            {mIsAdmin && !mIsOwner && <span className="px-1.5 py-0.2 bg-blue-500/10 text-blue-500 text-[9px] rounded font-black uppercase tracking-tighter">Admin</span>}
                          </div>
                          <div className={`flex items-center gap-1.5 mt-0.5 ${isRTL ? 'justify-end flex-row-reverse' : ''}`}>
                            <span className="text-[10px] text-gray-500 font-mono tracking-tight opacity-60">@{member.username}</span>
                            {chat.type === 'group' && (
                              <span className={`text-[10px] font-bold flex items-center gap-1 shrink-0 ${isUserOnline(member, user?.uid) ? 'text-green-500' : 'text-gray-500'}`}>
                                <span>•</span>
                                <span>{isUserOnline(member, user?.uid) ? (isRTL ? 'آنلاین' : 'online') : (isRTL ? 'آفلاین' : 'offline')}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      <div className={`flex items-center gap-1.5 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        {!mIsOwner && isOwner && (
                          <button 
                            onClick={() => toggleAdmin(member.uid)}
                            title={mIsAdmin ? (isRTL ? "عزل مدیر" : "Remove Admin") : (isRTL ? "ارتقا به مدیر" : "Make Admin")}
                            className={`p-2 rounded-xl transition-all ${mIsAdmin ? 'text-blue-500 bg-blue-500/10' : 'text-gray-500 hover:text-blue-400 hover:bg-blue-500/10'}`}
                          >
                            <Shield size={16} />
                          </button>
                        )}
                        
                        {!mIsOwner && (isAdmin || isOwner) && (
                          <>
                            <button 
                              onClick={() => toggleMute(member.uid)}
                              title={mIsMuted ? (isRTL ? "رفع بی‌صدا" : "Unmute") : (isRTL ? "بی‌صدا کردن" : "Mute")}
                              className={`p-2 rounded-xl transition-all ${mIsMuted ? 'text-orange-500 bg-orange-500/10' : 'text-gray-500 hover:text-orange-400 hover:bg-orange-500/10'}`}
                            >
                              <Mic size={16} />
                            </button>
                            <button 
                              onClick={() => toggleBan(member.uid)}
                              title={mIsBanned ? (isRTL ? "رفع مسدودیت" : "Unban") : (isRTL ? "اخراج و مسدودسازی" : "Ban & Remove")}
                              className={`p-2 rounded-xl transition-all ${mIsBanned ? 'text-red-500 bg-red-500/10' : 'text-gray-500 hover:text-red-400 hover:bg-red-500/10'}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && chat.type !== 'dm' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className={`p-4 md:p-5 rounded-2xl bg-brand-bg/60 border border-brand-border/40 ${isRTL ? 'text-right' : ''}`}>
                <h3 className="text-sm font-black mb-4 flex items-center gap-2 text-blue-500">
                  <Shield size={18} />
                  <span>{chat.type === 'channel' ? (isRTL ? "ویرایش کانال" : "Edit Channel") : (isRTL ? "ویرایش گروه" : "Edit Group")}</span>
                </h3>
                
                <div className="space-y-4">
                  {/* Photo Row */}
                  <div className={`flex items-center gap-4 p-3 bg-brand-bg/80 rounded-xl border border-brand-border/30 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-brand-input shrink-0 shadow ring-2 ring-blue-500/20">
                      <img src={chat.photoURL || 'https://api.dicebear.com/7.x/identicon/svg?seed=' + chat.id} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className={`flex-1 ${isRTL ? 'text-right' : ''}`}>
                      <div className="text-xs font-bold mb-0.5">{isRTL ? "تصویر کاور/پروفایل" : "Profile Cover"}</div>
                      <p className="text-[10px] text-gray-500 mb-2">{isRTL ? "یک تصویر جدید برای آواتار گفتگو آپلود کنید" : "Upload a new avatar for this chat"}</p>
                      <input type="file" ref={fileInputRef} className="hidden" onChange={handlePhotoUpload} accept="image/*" />
                      <button 
                        disabled={isUpdating}
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow"
                      >
                        {isUpdating ? (isRTL ? "درحال آپلود..." : "Uploading...") : (isRTL ? "تغییر تصویر" : "Change Photo")}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 dark:text-gray-400 mb-1 block">{isRTL ? "نام گفتگو" : "Chat Name"}</label>
                      <input 
                        type="text" 
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className={`w-full bg-brand-bg border border-brand-border/60 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none transition-all ${isRTL ? 'text-right' : ''}`}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 dark:text-gray-400 mb-1 block">{isRTL ? "آیدی (Handle)" : "Handle (@)"}</label>
                      <div className="relative">
                        <span className={`absolute top-1/2 -translate-y-1/2 text-blue-500 font-mono text-xs ${isRTL ? 'right-3' : 'left-3'}`}>@</span>
                        <input 
                          type="text" 
                          value={editHandle}
                          onChange={(e) => setEditHandle(e.target.value)}
                          placeholder="handle"
                          className={`w-full bg-brand-bg border border-brand-border/60 rounded-xl p-2.5 px-7 text-xs focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono ${isRTL ? 'text-right' : ''}`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-black tracking-widest text-slate-500 dark:text-gray-400 mb-1 block">{isRTL ? "بیوگرافی / توضیحات" : "Bio / Description"}</label>
                      <textarea 
                        rows={3}
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        className={`w-full bg-brand-bg border border-brand-border/60 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none ${isRTL ? 'text-right' : ''}`}
                      />
                    </div>
                  </div>

                  <button 
                    onClick={handleUpdateMetadata}
                    disabled={isUpdating}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold text-xs transition-all shadow-md active:scale-95"
                  >
                    {isUpdating ? (isRTL ? "درحال ذخیره..." : "Saving...") : (isRTL ? "ذخیره تغییرات" : "Save Changes")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* DM Privacy View */}
          {chat.type === 'dm' && partnerProfile && (
            <div className="p-4 rounded-2xl bg-brand-bg/50 border border-brand-border/40 space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-gray-400">{isRTL ? "اطلاعات حساب کاربر" : "User Profile Details"}</h4>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-[10px] text-gray-500 mb-0.5">{isRTL ? "نام نمایش داده شده" : "Display Name"}</div>
                  <div className="font-bold">{parseFlags(partnerProfile.displayName || (isRTL ? "نامشخص" : "Unknown"))}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 mb-0.5">{isRTL ? "آیدی کاربر" : "Username"}</div>
                  <div className="font-mono text-blue-400 font-bold">@{partnerProfile.username}</div>
                </div>
                {partnerProfile.bio && (
                  <div>
                    <div className="text-[10px] text-gray-500 mb-0.5">{isRTL ? "بیوگرافی" : "Bio"}</div>
                    <div className="text-gray-300 leading-relaxed">{parseFlags(partnerProfile.bio)}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {profileCardUid && (
        <UserProfileCard
          uid={profileCardUid}
          initialProfile={members.find(m => m.uid === profileCardUid) || null}
          chat={chat}
          onStartChat={(username) => { onClose(); onNavigateToHandle(username); }}
          onClose={() => setProfileCardUid(null)}
        />
      )}
    </div>
  );
};

