/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth, isUserOnline } from './contexts/AuthContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { AudioPlayerProvider } from './contexts/AudioPlayerContext';
import { UndoProvider } from './contexts/UndoContext';
import { AuthWindow } from './components/auth/AuthWindow';
import { Sidebar } from './components/chat/Sidebar';
import { ChatWindow } from './components/chat/ChatWindow';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { GlobalAudioPlayer } from './components/chat/GlobalAudioPlayer';
import { Chat } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, 
  MessageSquare, 
  Users, 
  Cloud, 
  Plus, 
  Menu, 
  X, 
  LogOut, 
  Copy, 
  Check, 
  Palette, 
  ShieldCheck, 
  Search, 
  Share2,
  Command,
  Keyboard,
  Info,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { apiGetUsers, apiGetChats, apiGetChat, apiLookupChat, apiCreateChat } from './lib/sqliteApi';
import { UserProfile } from './types';
import { parseFlags } from './lib/emoji';
import { applyGlobalTheme } from './lib/chatDoodle';
import { AdminPanelModal } from './components/admin/AdminPanelModal';

export interface EnhancedToast {
  id: number;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  action?: {
    label: string;
    onClick: () => void;
  };
}

function MessengerApp() {
  const { user, profile, loading } = useAuth();
  const { t, isRTL } = useLanguage();
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [view, setView] = useState<'chats' | 'settings'>('chats');
  const [showNewChatPanel, setShowNewChatPanel] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<EnhancedToast[]>([]);
  const toastIdRef = useRef(0);

  const showToast = (msg: string, action?: { label: string; onClick: () => void }, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message: msg, action, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing inside text inputs, except for Esc or modifier keys
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Escape key
      if (e.key === 'Escape') {
        if (isShortcutsModalOpen) {
          setIsShortcutsModalOpen(false);
          e.preventDefault();
        } else if (isProfileModalOpen) {
          setIsProfileModalOpen(false);
          e.preventDefault();
        } else if (isDrawerOpen) {
          setIsDrawerOpen(false);
          e.preventDefault();
        } else if (isAdminPanelOpen) {
          setIsAdminPanelOpen(false);
          e.preventDefault();
        } else if (showNewChatPanel) {
          setShowNewChatPanel(false);
          e.preventDefault();
        } else if (activeChat && window.innerWidth < 768) {
          setActiveChat(null);
          e.preventDefault();
        }
        return;
      }

      // Ctrl+K / Cmd+K -> Focus Search
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setView('chats');
        if (window.innerWidth < 768) {
          setActiveChat(null);
        }
        setTimeout(() => {
          const searchInput = document.getElementById('sidebar-search-input') as HTMLInputElement | null;
          if (searchInput) {
            searchInput.focus();
            searchInput.select();
          }
        }, 80);
        return;
      }

      // Ctrl+N / Cmd+N -> New Chat/Group Modal
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        setView('chats');
        if (window.innerWidth < 768) {
          setActiveChat(null);
        }
        setShowNewChatPanel(prev => !prev);
        return;
      }

      // Ctrl+/ or Cmd+/ -> Shortcuts Help Modal
      if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.key === '?')) {
        e.preventDefault();
        setIsShortcutsModalOpen(prev => !prev);
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isShortcutsModalOpen, isProfileModalOpen, isDrawerOpen, isAdminPanelOpen, showNewChatPanel, activeChat]);

  useEffect(() => {
    setIsInfoPanelOpen(false);
  }, [activeChat?.id]);

  // Synchronize entire app theme with user's selected theme preset
  useEffect(() => {
    applyGlobalTheme(profile?.chatWallpaper || localStorage.getItem('app_theme_id') || 'cloud-telegram');
  }, [profile?.chatWallpaper]);

  const handleCopyUsername = () => {
    if (!profile?.username) return;
    navigator.clipboard.writeText(`@${profile.username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChatsClick = () => {
    setView('chats');
    setShowNewChatPanel(false);
  };

  const handleSettingsClick = () => {
    setView('settings');
    setShowNewChatPanel(false);
  };

  const handleNewChatClick = () => {
    setView('chats');
    if (window.innerWidth < 768) {
      setActiveChat(null);
    }
    setShowNewChatPanel(prev => !prev);
  };

  const handleNavigateToHandle = async (handle: string) => {
    if (!user) return;
    const cleanHandle = handle.toLowerCase().replace('@', '');

    try {
      // 1. Try to find a user with this username
      const matches = await apiGetUsers(cleanHandle).catch(() => []);
      const targetUser = matches.find((u: UserProfile) => u.username?.toLowerCase() === cleanHandle);

      if (targetUser && targetUser.uid !== user.uid) {
        const myChats = await apiGetChats().catch(() => []);
        const existingChat = myChats.find(
          (c: Chat) => c.type === 'dm' && (c.memberUids || []).includes(targetUser.uid)
        );

        if (existingChat) {
          setActiveChat(existingChat);
        } else {
          // Create a new DM conversation
          const created = await apiCreateChat({
            type: 'dm',
            memberUids: [user.uid, targetUser.uid],
          });
          setActiveChat(created as Chat);
        }
        return;
      }

      // 2. Try to find a public group or channel with this handle. Opening it is a
      // preview only — ChatWindow shows a join screen for non-members.
      const chat = await apiLookupChat(cleanHandle).catch(() => null);
      if (chat) {
        const full = await apiGetChat(chat.id).catch(() => chat);
        setActiveChat(full as Chat);
      } else {
        showToast(isRTL ? `آیدی @${cleanHandle} معتبر نیست یا وجود ندارد` : `ID @${cleanHandle} is invalid or does not exist`);
      }
    } catch (error: any) {
      console.error("Navigation error:", error);
      showToast(error?.message || (isRTL ? 'خطا در باز کردن این آیدی' : 'Failed to open that ID'));
    }
  };

  // History and navigation handled cleanly via UI state

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-brand-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthWindow />;
  }

  return (
    <div className={`flex h-[100dvh] overflow-hidden bg-brand-bg text-brand-text font-sans ${isRTL ? 'font-farsi' : ''}`}>
      {/* Stacked Enhanced Toast Notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className="bg-white/95 dark:bg-gray-800/95 text-gray-900 dark:text-white px-4 py-3 rounded-2xl shadow-2xl border border-gray-200 dark:border-white/15 backdrop-blur-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top duration-300 min-w-[260px] max-w-sm"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                t.type === 'success' ? 'bg-emerald-400' :
                t.type === 'error' ? 'bg-red-400' :
                t.type === 'warning' ? 'bg-amber-400' : 'bg-blue-400'
              }`} />
              <span className="text-xs font-medium truncate">{t.message}</span>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    removeToast(t.id);
                  }}
                  className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold transition-all cursor-pointer"
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-white/10 transition-all cursor-pointer"
                title={isRTL ? 'بستن' : 'Close'}
              >
                <X size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Glassmorphic Left Navigation Rail - Desktop */}
      <nav className={`hidden md:flex flex-col items-center justify-between py-6 w-16 my-4 ${isRTL ? 'mr-4 ml-2' : 'ml-4 mr-2'} rounded-3xl bg-brand-sidebar/45 backdrop-blur-xl border border-gray-200/60 dark:border-white/[0.06] shadow-[0_16px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.25)] shrink-0 z-40`}>
        <div className="flex flex-col items-center gap-5">
          <div className="flex flex-col gap-5 items-center">
            {/* Chats Button */}
            <button
              onClick={handleChatsClick}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95 relative group"
              data-tooltip={isRTL ? "گفتگوها" : "Chats"}
              data-tooltip-dir={isRTL ? 'rtl' : 'ltr'}
              aria-label={isRTL ? "گفتگوها" : "Chats"}
              role="tab"
              aria-selected={view === 'chats' && !showNewChatPanel}
            >
              <div className={`absolute inset-0 rounded-xl transition-all duration-300 ${view === 'chats' && !showNewChatPanel ? 'bg-blue-600 opacity-100 scale-100' : 'bg-transparent opacity-0 scale-90 group-hover:scale-100 group-hover:bg-brand-input/40 group-hover:opacity-100'}`} />
              {view === 'chats' && !showNewChatPanel && <div className="nav-active-indicator" />}
              <MessageSquare size={18} className={`relative z-10 transition-colors ${view === 'chats' && !showNewChatPanel ? 'text-white' : 'text-gray-400 group-hover:text-brand-text'}`} />
            </button>

            {/* Divider */}
            <div className="w-8 h-px bg-gray-200 dark:bg-white/[0.08]" />

            {/* Settings Button */}
            <button
               onClick={handleSettingsClick}
               className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95 relative group"
               data-tooltip={isRTL ? "تنظیمات" : "Settings"}
               data-tooltip-dir={isRTL ? 'rtl' : 'ltr'}
               aria-label={isRTL ? "تنظیمات" : "Settings"}
               role="tab"
               aria-selected={view === 'settings'}
            >
              <div className={`absolute inset-0 rounded-xl transition-all duration-300 ${view === 'settings' ? 'bg-blue-600 opacity-100 scale-100' : 'bg-transparent opacity-0 scale-90 group-hover:scale-100 group-hover:bg-brand-input/40 group-hover:opacity-100'}`} />
              {view === 'settings' && <div className="nav-active-indicator" />}
              <Settings size={18} className={`relative z-10 transition-colors ${view === 'settings' ? 'text-white' : 'text-gray-400 group-hover:text-brand-text'}`} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-5 items-center">
          <div
            onClick={() => setIsProfileModalOpen(true)}
            className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 p-[1.5px] shadow-lg cursor-pointer overflow-hidden active:scale-95 transition-all duration-300 hover:scale-110 hover:shadow-[0_0_20px_rgba(99,102,241,0.5)] hover:ring-2 hover:ring-indigo-400/50"
            role="button"
            aria-label={isRTL ? "پروفایل" : "Profile"}
            tabIndex={0}
          >
            <img src={profile?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + profile?.uid} alt="Profile" className="w-full h-full object-cover rounded-[10px]" referrerPolicy="no-referrer" />
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden h-full">
        <div className="flex-1 flex overflow-hidden h-full">
          <AnimatePresence mode="wait">
            {view === 'chats' ? (
              <motion.div 
                key="chats"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex w-full h-full overflow-hidden"
              >
                {/* Sidebar: hidden on mobile when a chat is active */}
                <div className={`${activeChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 shrink-0 h-full flex-col`}>
                  <Sidebar
                    activeChat={activeChat}
                    onSelectChat={setActiveChat}
                    showNewChatPanel={showNewChatPanel}
                    setShowNewChatPanel={setShowNewChatPanel}
                    onOpenMenu={() => setIsDrawerOpen(true)}
                    onTotalUnreadChange={setTotalUnreadCount}
                  />
                </div>
                
                {/* ChatWindow: hidden on mobile when no chat is active */}
                <div className={`${activeChat ? 'flex' : 'hidden md:flex'} flex-1 h-full flex-col overflow-hidden`}>
                  <ChatWindow 
                    chat={activeChat} 
                    onClose={() => setActiveChat(null)} 
                    onNavigateToHandle={handleNavigateToHandle}
                    isInfoPanelOpen={isInfoPanelOpen}
                    setIsInfoPanelOpen={setIsInfoPanelOpen}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, x: isRTL ? -30 : 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: isRTL ? -30 : 30 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="w-full h-full flex flex-col overflow-hidden"
              >
                <GlobalAudioPlayer />
                <SettingsPanel 
                  onClose={() => setView('chats')} 
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Glassmorphic Mobile Bottom Dock - Hidden in settings view */}
      {!activeChat && view === 'chats' && (
        <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 h-14 w-auto px-4 max-w-max bg-brand-sidebar/70 backdrop-blur-2xl border border-gray-200/60 dark:border-white/[0.08] flex items-center justify-center gap-5 z-50 rounded-full shadow-[0_16px_36px_rgba(0,0,0,0.15)] dark:shadow-[0_16px_36px_rgba(0,0,0,0.4)] animate-in slide-in-from-bottom duration-300 safe-area-bottom">
           {/* Chats Button */}
           <button
             onClick={handleChatsClick}
             className={`p-2.5 rounded-full transition-all relative ripple-container ${view === 'chats' ? 'text-blue-500 bg-blue-500/10 scale-105' : 'text-gray-400 bg-transparent hover:text-gray-900 dark:hover:text-white'}`}
             aria-label={isRTL ? "گفتگوها" : "Chats"}
           >
             <MessageSquare size={18} />
             {totalUnreadCount > 0 && (
               <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full shadow-lg shadow-red-500/40 animate-in zoom-in duration-200">
                 {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
               </span>
             )}
           </button>

           {/* Settings Button */}
           <button
             onClick={handleSettingsClick}
             className={`p-2.5 rounded-full transition-all relative ripple-container ${view === 'settings' ? 'text-blue-500 bg-blue-500/10 scale-105' : 'text-gray-400 bg-transparent hover:text-gray-900 dark:hover:text-white'}`}
             aria-label={isRTL ? "تنظیمات" : "Settings"}
           >
             <Settings size={18} />
           </button>

           {/* User Avatar Button */}
           <button
             onClick={() => setIsProfileModalOpen(true)}
             className="w-8.5 h-8.5 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 p-[1.5px] shadow-sm overflow-hidden active:scale-95 transition-all focus:outline-none shrink-0"
             aria-label={isRTL ? "پروفایل" : "Profile"}
           >
             <img src={profile?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + profile?.uid} alt="Profile" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
           </button>
        </div>
      )}

      {/* Sliding Glassmorphic Side Drawer */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-md cursor-pointer"
            />

            {/* Drawer Sheet */}
            <motion.div
              initial={{ x: isRTL ? '100%' : '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: isRTL ? '100%' : '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 240 }}
              className={`fixed top-0 bottom-0 ${isRTL ? 'right-0' : 'left-0'} w-[285px] max-w-[85vw] bg-brand-sidebar/95 backdrop-blur-2xl z-50 flex flex-col shadow-2xl ${isRTL ? 'border-l' : 'border-r'} border-brand-border`}
            >
              {/* Header Profile Info */}
              <div className="p-5 bg-gradient-to-br from-brand-accent/20 to-transparent border-b border-brand-border relative">
                <button 
                  onClick={() => setIsDrawerOpen(false)}
                  className={`absolute top-4 ${isRTL ? 'left-4' : 'right-4'} p-1.5 rounded-full text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-all cursor-pointer`}
                  title={isRTL ? "بستن" : "Close"}
                >
                  <X size={16} />
                </button>
                
                <div 
                  onClick={() => { setIsDrawerOpen(false); setIsProfileModalOpen(true); }}
                  className="w-14 h-14 rounded-2xl bg-brand-accent p-[2px] shadow-lg overflow-hidden mb-3 cursor-pointer active:scale-95 transition-transform"
                >
                  <img 
                    src={profile?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + profile?.uid} 
                    alt="Profile" 
                    className="w-full h-full object-cover rounded-[14px]" 
                    referrerPolicy="no-referrer" 
                  />
                </div>

                <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">{parseFlags(profile?.displayName || 'User')}</h3>
                <p className="text-[11px] text-brand-accent-text font-mono tracking-wide truncate mt-0.5">@{profile?.username || 'username'}</p>
                {profile?.bio && (
                  <p className="text-[11px] text-gray-400 truncate mt-1.5 italic">
                    {parseFlags(profile.bio)}
                  </p>
                )}
              </div>

              {/* Body Options */}
              <div className="flex-1 p-3 space-y-1.5 overflow-y-auto">
                {/* Option: Chats */}
                <button
                  onClick={() => {
                    handleChatsClick();
                    setIsDrawerOpen(false);
                  }}
                  className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-all cursor-pointer ${view === 'chats' ? 'bg-brand-accent text-white font-bold shadow-lg shadow-brand-accent/20' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'}`}
                >
                  <MessageSquare size={18} />
                  <span className="text-xs font-semibold">{isRTL ? 'گفتگوها' : 'Chats'}</span>
                </button>

                {/* Option: Profile */}
                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setIsProfileModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-all cursor-pointer text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white"
                >
                  <Users size={18} className="text-gray-400" />
                  <span className="text-xs font-semibold">{isRTL ? 'مشاهده حساب کاربری' : 'My Profile'}</span>
                </button>

                {/* Option: Settings */}
                <button
                  onClick={() => {
                    handleSettingsClick();
                    setIsDrawerOpen(false);
                  }}
                  className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-all cursor-pointer ${view === 'settings' ? 'bg-brand-accent text-white font-bold shadow-lg shadow-brand-accent/20' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'}`}
                >
                  <Settings size={18} />
                  <span className="text-xs font-semibold">{isRTL ? 'تنظیمات' : 'Settings'}</span>
                </button>

                {/* Option: Admin Section (Only for admin) */}
                {(profile?.username === 'admin' || profile?.isAdmin) && (
                  <button
                    onClick={() => {
                      setIsDrawerOpen(false);
                      setIsAdminPanelOpen(true);
                    }}
                    className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-all cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 shadow-lg shadow-amber-500/5 mt-2"
                  >
                    <ShieldCheck size={18} className="text-amber-400" />
                    <span className="text-xs font-bold">{isRTL ? 'بخش ادمین و مدیریت' : 'Admin Control Center'}</span>
                  </button>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-brand-border text-center">
                <span className="text-[10px] font-bold tracking-wider text-gray-400 font-mono uppercase bg-brand-input/40 px-3.5 py-1.5 rounded-full border border-brand-border">
                  CloudMessenger v2.4.2
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Admin Panel Modal */}
      <AdminPanelModal isOpen={isAdminPanelOpen} onClose={() => setIsAdminPanelOpen(false)} />

      {/* Profile Details Modal */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsProfileModalOpen(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-md cursor-pointer"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="relative w-full max-w-sm bg-brand-sidebar/95 backdrop-blur-2xl border border-gray-200/60 dark:border-white/[0.08] rounded-3xl shadow-2xl overflow-hidden z-[101]"
            >
              {/* Close Button */}
              <button
                onClick={() => setIsProfileModalOpen(false)}
                className={`absolute top-4 ${isRTL ? 'left-4' : 'right-4'} p-1.5 rounded-full text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-all z-20`}
                title={isRTL ? "بستن" : "Close"}
                aria-label={isRTL ? "بستن" : "Close"}
              >
                <X size={16} />
              </button>

              {/* Cover Photo with parallax effect */}
              <div
                className="relative h-28 overflow-hidden parallax-cover"
                ref={(el) => {
                  if (!el) return;
                  const modal = el.closest('.overflow-hidden');
                  if (modal) {
                    modal.addEventListener('scroll', () => {
                      const scrollY = modal.scrollTop;
                      const img = el.querySelector('.parallax-img') as HTMLElement;
                      if (img) img.style.transform = `translateY(${scrollY * 0.3}px) scale(1.1)`;
                    }, { passive: true });
                  }
                }}
              >
                {profile?.photoURL ? (
                  <img
                    src={profile.photoURL}
                    alt="Cover"
                    className="parallax-img w-full h-[140%] object-cover absolute top-0 left-0 opacity-40"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-600/40 via-indigo-600/30 to-purple-600/40" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-sidebar/40 to-brand-sidebar" />
              </div>

              {/* Profile Main Section */}
              <div className="relative px-6 -mt-12 flex flex-col items-center text-center z-10">
                {/* Large Avatar */}
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 p-[2px] shadow-xl overflow-hidden mb-3 relative ring-4 ring-brand-sidebar">
                  <img
                    src={profile?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + profile?.uid}
                    alt="Profile"
                    className="w-full h-full object-cover rounded-xl"
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* Display Name */}
                <h3 className="text-md font-bold text-gray-900 dark:text-white tracking-tight">{parseFlags(profile?.displayName || 'User')}</h3>

                {/* Online Status + Last Seen */}
                <div className="flex items-center gap-1.5 mt-1">
                  <div className={`w-2 h-2 rounded-full ${isUserOnline(profile, user?.uid) ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-gray-500'}`} />
                  <span className={`text-[10px] font-medium ${isUserOnline(profile, user?.uid) ? 'text-emerald-400' : 'text-gray-400'}`}>
                    {isUserOnline(profile, user?.uid) ? (isRTL ? "آنلاین" : "Online") : (isRTL ? "آفلاین" : "Offline")}
                  </span>
                </div>

                {/* Username + Copy + Share */}
                <div className="flex items-center gap-1.5 mt-2 bg-brand-input/50 backdrop-blur border border-gray-200/60 dark:border-white/5 py-1 px-3 rounded-full">
                  <span className="text-[11px] text-blue-500 dark:text-blue-400 font-mono font-medium">@{profile?.username || 'username'}</span>
                  <button
                    onClick={handleCopyUsername}
                    className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors p-0.5"
                    title={isRTL ? "کپی شناسه" : "Copy Username"}
                    aria-label={isRTL ? "کپی شناسه" : "Copy Username"}
                  >
                    {copied ? (
                      <Check size={12} className="text-emerald-400 checkmark-pop" />
                    ) : (
                      <Copy size={11} />
                    )}
                  </button>
                  <div className="w-px h-3 bg-white/10" />
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}?start=${profile?.username || ''}`;
                      if (navigator.share) {
                        navigator.share({ title: profile?.displayName || 'Profile', url }).catch(() => {});
                      } else {
                        navigator.clipboard.writeText(url);
                      }
                    }}
                    className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors p-0.5"
                    title={isRTL ? "اشتراک‌گذاری پروفایل" : "Share Profile"}
                    aria-label={isRTL ? "اشتراک‌گذاری پروفایل" : "Share Profile"}
                  >
                    <Share2 size={11} />
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="h-[1px] bg-gray-200/60 dark:bg-white/5 my-4 mx-6" />

              {/* Info Details List */}
              <div className="space-y-3 px-6 pb-6">
                {/* Bio */}
                <div>
                  <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-1 text-right">
                    {isRTL ? "درباره من" : "Bio"}
                  </span>
                  <p className={`text-xs text-gray-600 dark:text-gray-300 bg-brand-input/30 p-2.5 rounded-xl border border-gray-200/60 dark:border-white/5 italic ${isRTL ? 'text-right' : 'text-left'}`}>
                    {profile?.bio || (isRTL ? "هنوز بیوگرافی اضافه نشده است..." : "No bio added yet...")}
                  </p>
                </div>

                {/* Email (neatly presented) */}
                <div>
                  <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-1 text-right">
                    {isRTL ? "ایمیل" : "Email"}
                  </span>
                  <div className={`text-xs text-gray-600 dark:text-gray-300 bg-brand-input/30 px-3 py-2 rounded-xl border border-gray-200/60 dark:border-white/5 font-mono ${isRTL ? 'text-right' : 'text-left'}`}>
                    {user?.email || (isRTL ? "نامشخص" : "Unknown")}
                  </div>
                </div>

                {/* Account status info */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-gray-400">{isRTL ? "وضعیت حساب کاربری" : "Account Status"}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20 animate-pulse">
                    {isRTL ? "فعال" : "Active"}
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      handleSettingsClick();
                      setIsProfileModalOpen(false);
                    }}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95 text-center flex items-center justify-center gap-2"
                  >
                    <Settings size={14} />
                    {isRTL ? "ویرایش حساب" : "Edit Profile"}
                  </button>
                  <button
                    onClick={() => setIsProfileModalOpen(false)}
                    className="px-4 py-3 bg-brand-input/60 hover:bg-brand-input hover:text-gray-900 dark:hover:text-white text-gray-400 text-xs font-bold rounded-xl transition-all border border-gray-200/60 dark:border-white/5 active:scale-95"
                  >
                    {isRTL ? "بستن" : "Close"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Keyboard Shortcuts Help Modal (Ctrl + /) */}
      <AnimatePresence>
        {isShortcutsModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsShortcutsModalOpen(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-md cursor-pointer"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', duration: 0.35 }}
              className="relative w-full max-w-md bg-brand-sidebar/95 backdrop-blur-2xl border border-gray-200/60 dark:border-white/[0.08] rounded-3xl shadow-2xl p-6 z-[111] overflow-hidden"
            >
              <div className="flex items-center justify-between pb-4 border-b border-gray-200/60 dark:border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                    <Keyboard size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white">{isRTL ? 'کلیدهای میانبر کیبورد' : 'Keyboard Shortcuts'}</h3>
                    <p className="text-[11px] text-gray-400">{isRTL ? 'دسترسی سریع و بدون نیاز به ماوس' : 'Quick navigation shortcuts'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsShortcutsModalOpen(false)}
                  className="p-1.5 rounded-full text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4 space-y-2.5">
                {[
                  { keys: ['Ctrl', 'K'], label: isRTL ? 'جستجوی سریع چت‌ها و پیام‌ها' : 'Quick Search chats & messages' },
                  { keys: ['Ctrl', 'N'], label: isRTL ? 'شروع گفتگو یا گروه جدید' : 'New chat or group' },
                  { keys: ['Ctrl', '/'], label: isRTL ? 'نمایش راهنمای کلیدهای میانبر' : 'Show keyboard shortcuts help' },
                  { keys: ['Esc'], label: isRTL ? 'بستن مودال‌ها و منوهای باز' : 'Close open modals or menus' },
                  { keys: ['Enter'], label: isRTL ? 'ارسال سریع پیام' : 'Send message' },
                  { keys: ['Shift', 'Enter'], label: isRTL ? 'خط جدید در پیام' : 'New line in composer' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200/60 dark:border-white/5">
                    <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">{item.label}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k, kIdx) => (
                        <kbd key={kIdx} className="px-2 py-1 text-[11px] font-mono font-bold bg-gray-200/60 dark:bg-white/10 text-gray-700 dark:text-gray-200 rounded-md border border-gray-300/60 dark:border-white/10 shadow-sm">
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 pt-3 border-t border-gray-200/60 dark:border-white/10 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsShortcutsModalOpen(false)}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer"
                >
                  {isRTL ? 'متوجه شدم' : 'Got it'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <UndoProvider>
          <AudioPlayerProvider>
            <MessengerApp />
          </AudioPlayerProvider>
        </UndoProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}
