import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiDeleteDatabase, apiUploadDatabase, apiUpdateUserProfile, apiPresence, apiLogout, apiUploadMedia } from '../../lib/sqliteApi';
import { ActiveSession } from '../../types';
import { 
  User, 
  Shield, 
  Bell, 
  LogOut, 
  Camera, 
  Save, 
  X, 
  Globe, 
  Palette, 
  MessageSquare, 
  Check, 
  Copy, 
  Sparkles, 
  Lock, 
  Trash2, 
  Key, 
  HardDrive, 
  CornerDownLeft, 
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Volume2,
  VolumeX,
  Smartphone,
  Laptop,
  Info,
  Sun,
  Moon,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseFlags } from '../../lib/emoji';
import { CHAT_THEME_PRESETS, getDoodleWallpaperStyle, applyGlobalTheme } from '../../lib/chatDoodle';

interface SettingsPanelProps {
  onClose: () => void;
}

type TabType = 'profile' | 'chats' | 'privacy' | 'storage';

const EMOJI_CATEGORIES = {
  popular: ['♥️', '👍', '🔥', '😂', '😍', '👏', '🎉', '💩'],
  reactions: ['🫡', '🫥', '🤩', '👎', '👌', '🤚', '🙏', '💯'],
  emotions: ['🥵', '😡', '🤬', '🤪', '🤡', '💀', '😭', '🥺'],
  symbols: ['🇮🇷', '🗿', '⚡', '✨', '🚀', '⭐', '🕊️', '👑']
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ 
  onClose 
}) => {
  const { profile, user, refreshProfile } = useAuth();
  const { t, language, setLanguage, isRTL } = useLanguage();

  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const container = tabsContainerRef.current;
    const activeEl = document.getElementById(`tab-${activeTab}`);
    if (container && activeEl) {
      const containerRect = container.getBoundingClientRect();
      const btnRect = activeEl.getBoundingClientRect();
      setIndicatorStyle({
        left: btnRect.left - containerRect.left + container.scrollLeft,
        width: btnRect.width,
      });
    }
  }, [activeTab]);

  // Profile state
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPublicKey, setCopiedPublicKey] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Dark / Light Theme mode state
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('app_theme_mode') as 'dark' | 'light') || 'dark';
  });

  const handleToggleThemeMode = (mode: 'dark' | 'light') => {
    setThemeMode(mode);
    localStorage.setItem('app_theme_mode', mode);
    if (mode === 'light') {
      applyGlobalTheme('telegram-day-light');
      setLocalWallpaper('telegram-day-light');
      if (user) {
        apiUpdateUserProfile(user.uid, { chatWallpaper: 'telegram-day-light' }).catch(console.error);
        refreshProfile();
      }
    } else {
      applyGlobalTheme('cloud-telegram');
      setLocalWallpaper('cloud-telegram');
      if (user) {
        apiUpdateUserProfile(user.uid, { chatWallpaper: 'cloud-telegram' }).catch(console.error);
        refreshProfile();
      }
    }
  };

  const themeCarouselRef = useRef<HTMLDivElement>(null);
  const scrollThemeCarousel = (direction: 'left' | 'right') => {
    if (themeCarouselRef.current) {
      const scrollAmount = direction === 'left' ? -260 : 260;
      themeCarouselRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Chat settings state
  const [localWallpaper, setLocalWallpaper] = useState(profile?.chatWallpaper || '');
  const [wallpaperUploadProgress, setWallpaperUploadProgress] = useState<number | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedEmojiCategory, setSelectedEmojiCategory] = useState<keyof typeof EMOJI_CATEGORIES>('popular');
  const [sendOnEnter, setSendOnEnter] = useState(() => {
    return localStorage.getItem('chat_send_on_enter') !== 'false';
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('chat_sound_enabled') !== 'false';
  });

  // Storage / Cache state
  const [cacheCleared, setCacheCleared] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Privacy & 2FA state
  const [lastSeenPrivacy, setLastSeenPrivacy] = useState<'everyone' | 'contacts' | 'nobody'>(profile?.lastSeenPrivacy || 'everyone');
  const [is2FAEnabled, setIs2FAEnabled] = useState<boolean>(profile?.is2FAEnabled || false);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [twoFAPinInput, setTwoFAPinInput] = useState(profile?.twoFactorPin || '');
  const [twoFASaving, setTwoFASaving] = useState(false);
  const [twoFASuccess, setTwoFASuccess] = useState(false);

  // Active Sessions state
  const defaultSessions: ActiveSession[] = [
    {
      id: 'session-current',
      deviceName: 'Chrome 122.0 (Windows 11)',
      deviceType: 'desktop',
      location: 'Tehran, Iran',
      ip: '5.120.45.12',
      lastActive: isRTL ? 'هم‌اکنون (این دستگاه)' : 'Online (Current)',
      isCurrent: true,
    }
  ];

  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>(() => {
    return profile?.activeSessions && profile.activeSessions.length > 0 
      ? profile.activeSessions 
      : defaultSessions;
  });

  const handleTerminateSession = async (sessionId: string) => {
    const updated = activeSessions.filter(s => s.id !== sessionId);
    setActiveSessions(updated);
    if (!user) return;
    try {
      await apiUpdateUserProfile(user.uid, { activeSessions: updated });
      await refreshProfile();
    } catch (err) {
      console.error('Failed to terminate session:', err);
    }
  };

  const handleTerminateAllOtherSessions = async () => {
    const updated = activeSessions.filter(s => s.isCurrent);
    setActiveSessions(updated);
    if (!user) return;
    try {
      await apiUpdateUserProfile(user.uid, { activeSessions: updated });
      await refreshProfile();
    } catch (err) {
      console.error('Failed to terminate other sessions:', err);
    }
  };

  // Change Password state & handler
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const handleUpdatePassword = async () => {
    if (!user) return;
    if (newPasswordInput.length < 6) {
      setPasswordError(isRTL ? 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد' : 'New password must be at least 6 characters');
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordError(isRTL ? 'رمزهای عبور جدید مطابقت ندارند' : 'New passwords do not match');
      return;
    }
    setPasswordSaving(true);
    setPasswordError('');
    try {
      // The server rehashes the password and invalidates every other session.
      await apiUpdateUserProfile(user.uid, { password: newPasswordInput });
      setPasswordSuccess(true);
      setTimeout(() => {
        setPasswordSuccess(false);
        setShowPasswordModal(false);
        setNewPasswordInput('');
        setConfirmPasswordInput('');
      }, 1500);
    } catch (err: any) {
      console.error('Password update failed:', err);
      setPasswordError(err.message || (isRTL ? 'خطا در تغییر رمز عبور' : 'Failed to update password'));
    } finally {
      setPasswordSaving(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const dbUploadInputRef = useRef<HTMLInputElement>(null);
  const [dbActionLoading, setDbActionLoading] = useState(false);

  const handleDeleteDatabase = async () => {
    if (!window.confirm(isRTL ? 'آیا از حذف دیتابیس برنامه از سرور اطمینان دارید؟ تمامی داده‌ها بازنشانی خواهند شد.' : 'Are you sure you want to delete the database from the server? All data will be reset.')) return;
    setDbActionLoading(true);
    try {
      await apiDeleteDatabase();
      alert(isRTL ? 'دیتابیس با موفقیت حذف و بازنشانی شد.' : 'Database successfully deleted and reset.');
      localStorage.clear();
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Error deleting database');
    } finally {
      setDbActionLoading(false);
    }
  };

  const handleDownloadDatabase = () => {
    window.location.href = '/api/admin/db/download';
  };

  const handleUploadDatabaseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm(isRTL ? 'آیا از آپلود دیتابیس جدید و جایگزینی آن اطمینان دارید؟' : 'Are you sure you want to upload and replace the database?')) return;
    setDbActionLoading(true);
    try {
      await apiUploadDatabase(file);
      alert(isRTL ? 'دیتابیس با موفقیت آپلود شد.' : 'Database uploaded successfully.');
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Error uploading database');
    } finally {
      setDbActionLoading(false);
    }
  };

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
      setLocalWallpaper(profile.chatWallpaper || '');
      if (profile.lastSeenPrivacy) setLastSeenPrivacy(profile.lastSeenPrivacy);
      if (typeof profile.is2FAEnabled === 'boolean') setIs2FAEnabled(profile.is2FAEnabled);
      if (profile.twoFactorPin) setTwoFAPinInput(profile.twoFactorPin);
      if (profile.activeSessions && profile.activeSessions.length > 0) {
        setActiveSessions(profile.activeSessions);
      }
    }
  }, [profile]);

  const handleUpdateLastSeen = async (opt: 'everyone' | 'contacts' | 'nobody') => {
    setLastSeenPrivacy(opt);
    if (!user) return;
    try {
      await apiUpdateUserProfile(user.uid, { lastSeenPrivacy: opt });
      await refreshProfile();
    } catch (err) {
      console.error('Failed to update lastSeenPrivacy:', err);
    }
  };

  const handleSave2FA = async () => {
    if (!user) return;
    if (twoFAPinInput.trim().length < 4) {
      alert(isRTL ? 'رمز عبور یا پین باید حداقل ۴ رقم باشد' : 'PIN / Password must be at least 4 characters');
      return;
    }
    setTwoFASaving(true);
    try {
      await apiUpdateUserProfile(user.uid, {
        is2FAEnabled: true,
        twoFactorPin: twoFAPinInput.trim()
      });
      await refreshProfile();
      setIs2FAEnabled(true);
      setTwoFASuccess(true);
      setTimeout(() => {
        setTwoFASuccess(false);
        setShow2FAModal(false);
      }, 1200);
    } catch (err) {
      console.error('Failed to save 2FA:', err);
    } finally {
      setTwoFASaving(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!user) return;
    try {
      await apiUpdateUserProfile(user.uid, {
        is2FAEnabled: false,
        twoFactorPin: ''
      });
      await refreshProfile();
      setIs2FAEnabled(false);
      setTwoFAPinInput('');
      setShow2FAModal(false);
    } catch (err) {
      console.error('Failed to disable 2FA:', err);
    }
  };

  const handleUsernameChange = (val: string) => {
    const clean = val.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    setUsername(clean);
    if (clean.length > 0 && clean.length < 3) {
      setUsernameError(isRTL ? 'حداقل ۳ حرف' : 'At least 3 characters');
    } else {
      setUsernameError(null);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    if (username.length > 0 && username.length < 3) {
      setUsernameError(isRTL ? 'حداقل ۳ حرف' : 'At least 3 characters');
      return;
    }

    setIsSaving(true);
    try {
      await apiUpdateUserProfile(user.uid, {
        displayName: displayName.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim()
      });
      await refreshProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (error) {
      console.error('Update failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = (text: string, type: 'id' | 'key') => {
    navigator.clipboard.writeText(text);
    if (type === 'id') {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else {
      setCopiedPublicKey(true);
      setTimeout(() => setCopiedPublicKey(false), 2000);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { url } = await apiUploadMedia(file);
      await apiUpdateUserProfile(user.uid, { photoURL: url });
      await refreshProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Photo upload failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleWallpaperUpload = async (file: File) => {
    if (!user) return;
    setWallpaperUploadProgress(15);
    const interval = setInterval(() => {
      setWallpaperUploadProgress(prev => {
        if (prev === null || prev >= 85) return prev;
        return prev + 15;
      });
    }, 120);

    try {
      const { url } = await apiUploadMedia(file);
      setWallpaperUploadProgress(100);
      clearInterval(interval);
      await apiUpdateUserProfile(user.uid, { chatWallpaper: url });
      await refreshProfile();
      setLocalWallpaper(url);
      setTimeout(() => setWallpaperUploadProgress(null), 500);
    } catch (err) {
      console.error('Wallpaper upload failed:', err);
      clearInterval(interval);
      setWallpaperUploadProgress(null);
    }
  };

  const handleClearWallpaper = async () => {
    if (!user) return;
    await apiUpdateUserProfile(user.uid, { chatWallpaper: '' });
    await refreshProfile();
    setLocalWallpaper('');
  };

  const handleSetDefaultReaction = async (emoji: string) => {
    if (!user) return;
    try {
      await apiUpdateUserProfile(user.uid, { defaultReaction: emoji });
      await refreshProfile();
    } catch (err) {
      console.error("Failed to update reaction:", err);
    } finally {
      setShowEmojiPicker(false);
    }
  };

  const handleToggleSendOnEnter = (enabled: boolean) => {
    setSendOnEnter(enabled);
    localStorage.setItem('chat_send_on_enter', enabled ? 'true' : 'false');
  };

  const handleToggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    localStorage.setItem('chat_sound_enabled', enabled ? 'true' : 'false');
  };

  const handleClearCache = () => {
    // Clear non-essential cached media or temporary localStorage
    try {
      const keysToKeep = ['simulated_user_id', 'app_language', 'chat_send_on_enter', 'chat_sound_enabled'];
      const allKeys = Object.keys(localStorage);
      allKeys.forEach(key => {
        if (!keysToKeep.includes(key)) {
          localStorage.removeItem(key);
        }
      });
      setCacheCleared(true);
      setTimeout(() => setCacheCleared(false), 2500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = async () => {
    if (user) {
      try {
        await apiPresence(false);
      } catch (error) {
        console.error('Logout status update failed:', error);
      }
    }
    try {
      await apiLogout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
    localStorage.removeItem('simulated_user_id');
    window.location.reload();
  };

  const tabs: { id: TabType; label: string; desc: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: 'profile', label: isRTL ? 'حساب کاربری' : 'My Account', desc: isRTL ? 'نام، آیدی و بیوگرافی' : 'Name, ID & Bio', icon: User },
    { id: 'chats', label: isRTL ? 'گفتگو و رسانه' : 'Chats & Media', desc: isRTL ? 'زبان، پوسته، پس‌زمینه و صداها' : 'Language, Themes & Wallpaper', icon: MessageSquare },
    { id: 'privacy', label: isRTL ? 'حریم خصوصی' : 'Privacy & Security', desc: isRTL ? 'رمزنگاری و وضعیت آنلاین' : 'Encryption & Online status', icon: Shield },
    { id: 'storage', label: isRTL ? 'حافظه و نشست‌ها' : 'Storage & Sessions', desc: isRTL ? 'پاکسازی کش و خروج' : 'Cache management & Logout', icon: HardDrive },
  ];

  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  return (
    <div className="w-full h-full bg-brand-bg text-brand-text flex flex-col overflow-hidden select-none">
      
      {/* Top Full-Width Header Bar */}
      <div className={`px-4 sm:px-6 py-3.5 border-b border-brand-border/40 bg-brand-panel/80 backdrop-blur-xl flex items-center justify-between shrink-0 z-30 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={`flex items-center gap-3 sm:gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          {/* Main Return Button */}
          <button 
            id="close-settings-btn"
            onClick={onClose} 
            className="p-2 sm:px-3 sm:py-2 rounded-2xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 border border-blue-500/20 flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-sm"
            title={isRTL ? 'برگشت به گفتگوها' : 'Back to Chats'}
          >
            <BackIcon size={18} />
          </button>

          <div className="h-5 w-[1px] bg-brand-border/40 hidden sm:block" />

          <div className={`flex items-center gap-2 min-w-0 ${isRTL ? 'text-right' : 'text-left'}`}>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-black truncate">{t.settings}</h1>
              <p className="text-[10px] text-gray-400 truncate hidden md:block">
                {tabs.find(t => t.id === activeTab)?.desc}
              </p>
            </div>
          </div>
        </div>

        {/* User Mini Profile Badge */}
        <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className={`hidden sm:flex flex-col ${isRTL ? 'text-left' : 'text-right'}`}>
            <span className="text-xs font-bold truncate max-w-[130px]">{profile?.displayName || profile?.username}</span>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">@{profile?.username}</span>
          </div>
          <div className="w-9 h-9 rounded-xl ring-2 ring-blue-500/20 overflow-hidden bg-brand-input shrink-0 shadow">
            <img 
              src={profile?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.uid || 'user'}`} 
              alt="Avatar" 
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>

      {/* Main Full-Screen Layout Area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden h-full">
        
        {/* Desktop Sidebar / Mobile Top Nav */}
        <div className={`w-full md:w-72 border-b md:border-b-0 ${isRTL ? 'md:border-l border-brand-border/40' : 'md:border-r border-brand-border/40'} bg-brand-panel/30 backdrop-blur-md flex flex-col shrink-0`}>
          
          {/* Navigation Items */}
          <div ref={tabsContainerRef} className="relative p-3 sm:p-4 flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible md:overflow-y-auto custom-scrollbar shrink-0 flex-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-1 md:flex-initial px-4 py-3 flex items-center gap-3 rounded-2xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                      : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                  } ${isRTL ? 'flex-row-reverse text-right' : 'text-left'}`}
                  role="tab"
                  aria-selected={isActive}
                >
                  <Icon size={18} className={isActive ? 'text-white shrink-0' : 'text-slate-500 dark:text-gray-400 shrink-0'} />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{tab.label}</span>
                    <span className={`text-[10px] font-normal truncate hidden md:block ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>
                      {tab.desc}
                    </span>
                  </div>
                </button>
              );
            })}
            {/* Animated indicator - mobile bottom, desktop left */}
            <div className="hidden md:block absolute left-0 right-0 bottom-0 h-[3px] pointer-events-none">
              <div
                className="h-full bg-white rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                style={{ width: indicatorStyle.width, transform: `translateX(${indicatorStyle.left}px)` }}
              />
            </div>
          </div>

          {/* Quick User Summary & Logout Footer on Desktop Sidebar */}
          <div className="hidden md:flex p-4 border-t border-brand-border/30 flex-col gap-3 bg-brand-bg/40">
            <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse text-right' : 'text-left'}`}>
              <div className="w-10 h-10 rounded-2xl overflow-hidden bg-brand-input shrink-0 ring-2 ring-blue-500/20">
                <img src={profile?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.uid}`} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold truncate">{profile?.displayName || profile?.username}</div>
                <div className="text-[10px] text-gray-500 font-mono">@{profile?.username}</div>
              </div>
            </div>

            <button
              id="sidebar-logout-btn"
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
            >
              <LogOut size={15} />
              <span>{t.logout}</span>
            </button>
          </div>
        </div>

        {/* Content Workspace Pane */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 md:p-10 bg-brand-bg/60">
          <div className="max-w-3xl mx-auto space-y-6 pb-12">
          
          {/* TAB 1: Profile & Account */}
          {activeTab === 'profile' && (
            <div className="space-y-6 max-w-xl mx-auto">
              
              {/* Profile Card Header */}
              <div className="relative p-6 rounded-3xl bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 dark:border-white/[0.08] shadow-xl flex flex-col sm:flex-row items-center gap-5 text-center sm:text-start">
                <div className="relative group shrink-0">
                  <div className="w-24 h-24 rounded-full ring-4 ring-blue-500/20 overflow-hidden bg-brand-bg shadow-2xl relative">
                    <img 
                      src={profile?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.uid || 'user'}`} 
                      alt="Avatar" 
                      className="w-full h-full object-cover"
                    />
                    {isSaving && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin" />
                      </div>
                    )}
                  </div>

                  <button
                    id="change-avatar-btn"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer backdrop-blur-xs"
                    title={isRTL ? 'تغییر عکس پروفایل' : 'Change avatar'}
                  >
                    <Camera size={20} />
                    <span className="text-[9px] font-bold uppercase">{isRTL ? 'تغییر' : 'Edit'}</span>
                  </button>

                  <input 
                    ref={fileInputRef}
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file);
                    }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <h3 className="font-extrabold text-lg text-slate-900 dark:text-white truncate max-w-[200px]">
                      {profile?.displayName || profile?.username || 'User'}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {isRTL ? 'آنلاین' : 'Online'}
                    </span>
                  </div>

                  <p className="text-xs text-blue-600 dark:text-blue-400 font-mono mt-0.5">@{profile?.username || 'username'}</p>

                  <div className="flex items-center justify-center sm:justify-start gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => handleCopy(profile?.uid || user?.uid || '', 'id')}
                      className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-[11px] text-slate-700 dark:text-gray-300 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    >
                      {copiedId ? <Check size={12} className="text-emerald-500 dark:text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedId ? (isRTL ? 'شناسه کپی شد' : 'UID Copied') : (isRTL ? 'کپی شناسه' : 'Copy UID')}</span>
                    </button>

                    {profile?.photoURL && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!user) return;
                          await apiUpdateUserProfile(user.uid, { photoURL: null });
                          await refreshProfile();
                        }}
                        className="px-2.5 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-[11px] text-rose-500 dark:text-rose-400 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                        title={isRTL ? 'حذف عکس' : 'Remove photo'}
                      >
                        <Trash2 size={12} />
                        <span>{isRTL ? 'حذف عکس' : 'Reset'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Edit Profile Form */}
              <div className="space-y-4 bg-white/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06] rounded-3xl p-5 md:p-6 shadow-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-gray-400 uppercase tracking-wider mb-2 block">
                    {t.displayName}
                  </label>
                  <input
                    id="input-display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={40}
                    className="w-full bg-slate-100 dark:bg-brand-input border border-slate-200 dark:border-white/10 focus:border-blue-500 rounded-2xl py-3 px-4 text-sm text-slate-900 dark:text-brand-text outline-none transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20"
                    placeholder={isRTL ? 'مثلاً: علی رضایی' : 'e.g. John Smith'}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-gray-400 uppercase tracking-wider block">
                      {t.username} (ID)
                    </label>
                    {usernameError && (
                      <span className="text-[11px] text-rose-500 font-medium flex items-center gap-1">
                        <AlertCircle size={12} />
                        {usernameError}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <span className={`absolute ${isRTL ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-gray-500 font-mono text-sm`}>
                      @
                    </span>
                    <input
                      id="input-username"
                      type="text"
                      value={username}
                      onChange={(e) => handleUsernameChange(e.target.value)}
                      maxLength={24}
                      className={`w-full bg-slate-100 dark:bg-brand-input border ${usernameError ? 'border-rose-500/50' : 'border-slate-200 dark:border-white/10 focus:border-blue-500'} rounded-2xl py-3 text-sm text-slate-900 dark:text-brand-text outline-none transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 font-mono ${
                        isRTL ? 'pr-9 pl-4 text-right' : 'pl-9 pr-4 text-left'
                      }`}
                      placeholder={isRTL ? "نام‌کاربری یکتا" : "unique_username"}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-gray-500 mt-1.5">
                    {isRTL ? 'دیگران می‌توانند با این آیدی به شما پیام ارسال کنند.' : 'Others can search and find you via this handle.'}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-bold text-slate-600 dark:text-gray-400 uppercase tracking-wider block">
                      {t.bio}
                    </label>
                    <span className={`text-[10px] font-mono ${bio.length > 120 ? 'text-amber-500' : bio.length > 135 ? 'text-red-500' : 'text-slate-500 dark:text-gray-500'}`}>{bio.length}/140</span>
                  </div>
                  <textarea
                    id="input-bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={140}
                    rows={3}
                    className="w-full bg-slate-100 dark:bg-brand-input border border-slate-200 dark:border-white/10 focus:border-blue-500 rounded-2xl py-3 px-4 text-sm text-slate-900 dark:text-brand-text outline-none transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 resize-none"
                    placeholder={isRTL ? 'چند خط درباره خودتان بنویسید...' : 'A brief description about yourself...'}
                  />
                </div>

                <div className="pt-2">
                  <button
                    id="save-profile-btn"
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/25 active:scale-[0.99] cursor-pointer"
                  >
                    {saveSuccess ? (
                      <>
                        <CheckCircle2 size={18} className="text-white checkmark-pop" />
                        <span>{isRTL ? 'با موفقیت ذخیره شد' : 'Saved Successfully!'}</span>
                      </>
                    ) : isSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>{t.processing}</span>
                      </>
                    ) : (
                      <>
                        <Save size={18} />
                        <span>{t.saveChanges}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Chats & Media */}
          {activeTab === 'chats' && (
            <div className="space-y-6 max-w-xl mx-auto">
              
              {/* Language Selection */}
              <div className="p-5 rounded-3xl bg-white/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06] space-y-4 shadow-xs">
                <h4 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                  <Globe size={16} className="text-blue-500 dark:text-blue-400" />
                  <span>{t.language}</span>
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    id="lang-fa-btn"
                    type="button"
                    onClick={() => setLanguage('fa')}
                    className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 cursor-pointer ${
                      language === 'fa' 
                        ? 'bg-blue-500/10 dark:bg-blue-600/15 border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 shadow-md shadow-blue-500/10' 
                        : 'bg-slate-100 dark:bg-brand-input border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:border-slate-300 dark:hover:border-white/20'
                    }`}
                  >
                    <span className="text-base font-extrabold text-slate-900 dark:text-white">فارسی</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-white/5 text-slate-600 dark:text-gray-300 uppercase">راست‌چین (RTL)</span>
                  </button>

                  <button
                    id="lang-en-btn"
                    type="button"
                    onClick={() => setLanguage('en')}
                    className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 cursor-pointer ${
                      language === 'en' 
                        ? 'bg-blue-500/10 dark:bg-blue-600/15 border-blue-600 dark:border-blue-500 text-blue-600 dark:text-blue-400 shadow-md shadow-blue-500/10' 
                        : 'bg-slate-100 dark:bg-brand-input border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-gray-300 hover:border-slate-300 dark:hover:border-white/20'
                    }`}
                  >
                    <span className="text-base font-extrabold text-slate-900 dark:text-white">English</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-white/5 text-slate-600 dark:text-gray-300 uppercase">Left-to-Right (LTR)</span>
                  </button>
                </div>
              </div>



              {/* Double-Tap Reaction Card */}
              <div className="p-5 rounded-3xl bg-white/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06] space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                      <Sparkles size={16} className="text-amber-500 dark:text-amber-400" />
                      <span>{isRTL ? 'واکنش سریع با دو ضربه (Double Tap)' : 'Quick Reaction Emoji'}</span>
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">
                      {isRTL ? 'ایموجی ارسال شده هنگام دوبار ضربه زدن سریع روی پیام‌ها' : 'The emoji reaction sent when double-tapping a message.'}
                    </p>
                  </div>

                  <div className="relative">
                    <button
                      id="default-reaction-btn"
                      type="button"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="w-13 h-13 rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 flex items-center justify-center text-2xl transition-all active:scale-95 shadow-md cursor-pointer hover:border-blue-500/40"
                      title={isRTL ? 'انتخاب ایموجی' : 'Choose emoji'}
                    >
                      {parseFlags(profile?.defaultReaction || '♥️')}
                    </button>

                    {/* Emoji Dropdown Picker */}
                    {showEmojiPicker && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
                        <div className={`absolute top-full mt-2 ${isRTL ? 'left-0' : 'right-0'} z-50 w-72 p-3 bg-white dark:bg-brand-sidebar border border-slate-200 dark:border-white/15 rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.2)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl animate-in zoom-in-95 duration-150`}>
                          
                          {/* Category tabs */}
                          <div className="flex items-center justify-around border-b border-slate-200 dark:border-white/10 pb-2 mb-2">
                            {(['popular', 'reactions', 'emotions', 'symbols'] as const).map(cat => (
                              <button
                                key={cat}
                                onClick={() => setSelectedEmojiCategory(cat)}
                                className={`text-xs px-2 py-1 rounded-lg font-bold capitalize transition-all cursor-pointer ${
                                  selectedEmojiCategory === cat 
                                    ? 'bg-blue-600 text-white' 
                                    : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>

                          <div className="grid grid-cols-4 gap-2 p-1">
                            {EMOJI_CATEGORIES[selectedEmojiCategory].map(emoji => (
                              <button
                                key={emoji}
                                onClick={() => handleSetDefaultReaction(emoji)}
                                className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-blue-500/10 dark:hover:bg-blue-600/20 hover:border-blue-500/40 border border-transparent flex items-center justify-center text-2xl transition-all hover:scale-115 active:scale-95 cursor-pointer"
                              >
                                {parseFlags(emoji)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Chat Wallpaper Section */}
              <div className="p-5 rounded-3xl bg-white/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06] space-y-4 shadow-xs">
                <div>
                  <h4 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                    <Palette size={16} className="text-blue-500 dark:text-blue-400" />
                    <span>{isRTL ? 'پس‌زمینه اختصاصی گفتگوها (Chat Wallpaper)' : 'Chat Wallpaper'}</span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">
                    {isRTL ? 'تصویر پس‌زمینه دلخواه خود را آپلود کنید یا لینک آن را قرار دهید.' : 'Personalize your chat background with a custom photo or preset.'}
                  </p>
                </div>

                {/* Wallpaper Preview & Upload */}
                <div 
                  className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-white/10 aspect-video w-full flex items-center justify-center group shadow-inner shrink-0"
                  style={
                    profile?.chatWallpaper && (profile.chatWallpaper.startsWith('http') || profile.chatWallpaper.startsWith('data:') || profile.chatWallpaper.startsWith('/api/'))
                      ? {
                          backgroundImage: `url("${profile.chatWallpaper}")`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat'
                        }
                      : getDoodleWallpaperStyle(profile?.chatWallpaper, true)
                  }
                >
                  {/* Sample Chat Message Bubbles on Preview to look realistic like Telegram */}
                  <div className="absolute inset-0 p-4 flex flex-col justify-center space-y-2 pointer-events-none opacity-85">
                    <div className="self-start max-w-[65%] px-3 py-1.5 rounded-2xl rounded-bl-sm bg-brand-input/90 text-white text-[11px] shadow-sm border border-white/5">
                      {isRTL ? 'سلام! پیام‌رسان ابری چطوره؟ ☁️' : 'Hey! How do you like Cloud Messenger? ☁️'}
                    </div>
                    <div className="self-end max-w-[65%] px-3 py-1.5 rounded-2xl rounded-br-sm bg-blue-600/90 text-white text-[11px] shadow-sm flex items-center gap-1">
                      <span>{isRTL ? 'فوق‌العاده و تمیز مثل تلگرام! 🔥' : 'Looks super clean like Telegram! 🔥'}</span>
                      <Check size={12} className="text-blue-200" />
                    </div>
                  </div>

                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex items-end justify-between p-4 opacity-95 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        id="upload-wallpaper-btn"
                        type="button"
                        onClick={() => wallpaperInputRef.current?.click()}
                        disabled={wallpaperUploadProgress !== null}
                        className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        <Camera size={14} />
                        <span>{isRTL ? 'تصویر دلخواه' : 'Upload Image'}</span>
                      </button>

                      <input 
                        ref={wallpaperInputRef}
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleWallpaperUpload(file);
                        }}
                      />

                      {profile?.chatWallpaper && (
                        <button
                          id="clear-wallpaper-btn"
                          type="button"
                          onClick={handleClearWallpaper}
                          className="h-9 px-3 rounded-xl bg-white/10 hover:bg-rose-500/20 text-white hover:text-rose-300 text-xs font-bold inline-flex items-center gap-1 transition-all active:scale-95 cursor-pointer shrink-0 whitespace-nowrap"
                        >
                          <Trash2 size={13} />
                          <span>{isRTL ? 'حالت پیش‌فرض' : 'Reset'}</span>
                        </button>
                      )}
                    </div>

                    <div className="text-[11px] font-bold text-blue-300 bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10 shrink-0 whitespace-nowrap hidden sm:block">
                      {isRTL ? 'طرح نمادهای ابری فعال' : 'Cloud Doodles Active'}
                    </div>
                  </div>
                </div>

                {/* Preset Wallpapers Carousel Selector */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-gray-400 uppercase tracking-wider block">
                      {isRTL ? 'انتخاب طرح و رنگ‌بندی ابری (کاروسل تم‌ها):' : 'Cloud Doodle Theme Carousel:'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => scrollThemeCarousel('left')}
                        className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer"
                        title={isRTL ? 'بعدی' : 'Previous'}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollThemeCarousel('right')}
                        className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer"
                        title={isRTL ? 'قبلی' : 'Next'}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Horizontal Scrollable Carousel Track */}
                  <div 
                    ref={themeCarouselRef}
                    className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 pt-1 scroll-smooth snap-x snap-mandatory"
                  >
                    {CHAT_THEME_PRESETS.map((preset) => {
                      const isSelected = (!profile?.chatWallpaper && preset.id === 'cloud-telegram') || profile?.chatWallpaper === preset.id;
                      const style = getDoodleWallpaperStyle(preset.id, true);
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={async () => {
                            applyGlobalTheme(preset.id);
                            setLocalWallpaper(preset.id);
                            setThemeMode(preset.isLight ? 'light' : 'dark');
                            if (user) {
                              try {
                                await apiUpdateUserProfile(user.uid, { chatWallpaper: preset.id });
                                await refreshProfile();
                              } catch (e) {
                                console.error('Failed to save theme:', e);
                              }
                            }
                          }}
                          className={`group relative min-w-[150px] sm:min-w-[170px] h-24 rounded-2xl overflow-hidden border-2 transition-all p-3 flex flex-col justify-between text-right cursor-pointer shadow-md box-border shrink-0 snap-start active:scale-95 ${
                            isSelected 
                              ? 'border-blue-500 ring-2 ring-blue-500/50 ring-inset shadow-blue-500/25 opacity-100 scale-[1.02]' 
                              : 'border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30 opacity-80 hover:opacity-100'
                          }`}
                          style={style}
                        >
                          <div className="flex justify-between items-center w-full">
                            <span 
                              className="w-5 h-5 rounded-full shadow-md ring-1 ring-black/20 dark:ring-white/30 flex items-center justify-center transition-all" 
                              style={{ backgroundColor: preset.preview }}
                            >
                              {isSelected && (
                                <Check size={12} className={preset.isLight ? 'text-slate-950 stroke-[3]' : 'text-white stroke-[3]'} />
                              )}
                            </span>
                          </div>
                          <div className="relative z-10 flex flex-col">
                            <span className={`text-[11px] font-extrabold truncate ${preset.isLight ? 'text-slate-900 drop-shadow-sm' : 'text-white drop-shadow'}`}>
                              {isRTL ? preset.faName : preset.name}
                            </span>
                            <span className={`text-[9px] font-mono ${preset.isLight ? 'text-slate-700 font-semibold' : 'text-white/70'}`}>
                              {preset.id.replace('cloud-', '').replace('telegram-', '')}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Upload Progress */}
                {wallpaperUploadProgress !== null && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-bold text-blue-600 dark:text-blue-400">
                      <span>{isRTL ? 'در حال آپلود پس‌زمینه...' : 'Uploading wallpaper...'}</span>
                      <span>{wallpaperUploadProgress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-blue-500 h-full transition-all duration-300 rounded-full" 
                        style={{ width: `${wallpaperUploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}


              </div>

              {/* Behavior & Sound Toggles */}
              <div className="p-5 rounded-3xl bg-white/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06] space-y-3 shadow-xs">
                <div className="flex items-center justify-between py-1">
                  <div>
                    <div className="font-semibold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                      <CornerDownLeft size={16} className="text-purple-500 dark:text-purple-400" />
                      <span>{isRTL ? 'ارسال پیام با کلید Enter' : 'Send message on Enter'}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">
                      {isRTL ? 'با فعال بودن، فشردن Enter پیام را ارسال می‌کند و Shift+Enter خط جدید ایجاد می‌کند.' : 'Press Enter to send, Shift+Enter for a new line.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleSendOnEnter(!sendOnEnter)}
                    className={`w-12 h-6.5 rounded-full p-1 transition-all duration-200 flex items-center cursor-pointer ${
                      sendOnEnter ? 'bg-blue-600 justify-end' : 'bg-slate-200 dark:bg-white/10 justify-start'
                    }`}
                  >
                    <motion.div layout className="w-4.5 h-4.5 bg-white rounded-full shadow-md" />
                  </button>
                </div>

                <div className="border-t border-slate-200/80 dark:border-white/5 my-2" />

                <div className="flex items-center justify-between py-1">
                  <div>
                    <div className="font-semibold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                      {soundEnabled ? <Volume2 size={16} className="text-emerald-500 dark:text-emerald-400" /> : <VolumeX size={16} className="text-gray-400" />}
                      <span>{isRTL ? 'صدای اعلان و ارسال پیام' : 'In-App Sound Effects'}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">
                      {isRTL ? 'پخش صدای ظریف هنگام ارسال و دریافت پیام جدید' : 'Play subtle sound on sending and receiving messages.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleSound(!soundEnabled)}
                    className={`w-12 h-6.5 rounded-full p-1 transition-all duration-200 flex items-center cursor-pointer ${
                      soundEnabled ? 'bg-blue-600 justify-end' : 'bg-slate-200 dark:bg-white/10 justify-start'
                    }`}
                  >
                    <motion.div layout className="w-4.5 h-4.5 bg-white rounded-full shadow-md" />
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: Privacy & Security */}
          {activeTab === 'privacy' && (
            <div className="space-y-6 max-w-xl mx-auto">
              
              {/* E2E Security Badge */}
              <div className="p-5 rounded-3xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-500/30 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                    <Shield size={22} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                      {isRTL ? 'رمزنگاری سرتاسری پیشرفته (E2EE)' : 'End-to-End Encryption'}
                    </h4>
                    <p className="text-xs text-blue-700/80 dark:text-blue-200/70 mt-0.5">
                      {isRTL ? 'پیام‌ها و رسانه‌های شما فقط برای شما و مخاطب بازگشایی می‌شوند.' : 'Your private chats are encrypted and securely stored.'}
                    </p>
                  </div>
                </div>

                {profile?.publicKey && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-gray-400 mb-1 font-mono">
                      <span>{isRTL ? 'اثر انگشت کلید عمومی شما:' : 'Public Key Fingerprint:'}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(profile.publicKey || '', 'key')}
                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {copiedPublicKey ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedPublicKey ? (isRTL ? 'کپی شد' : 'Copied') : (isRTL ? 'کپی کلید' : 'Copy')}</span>
                      </button>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 font-mono text-[10px] text-slate-700 dark:text-gray-300 break-all">
                      {profile.publicKey.substring(0, 48)}...
                    </div>
                  </div>
                )}
              </div>

              {/* Status Visibility Card */}
              <div className="p-5 rounded-3xl bg-white/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06] space-y-3 shadow-xs">
                <div>
                  <h4 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                    <Lock size={16} className="text-emerald-500 dark:text-emerald-400" />
                    <span>{isRTL ? 'وضعیت حضور و آخرین بازدید' : 'Last Seen & Online Status'}</span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">
                    {isRTL ? 'کنترل نمایش آنلاین بودن به دیگر کاربران' : 'Control who sees when you are active on Cloud Messenger.'}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2">
                  {(['everyone', 'contacts', 'nobody'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleUpdateLastSeen(opt)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        lastSeenPrivacy === opt 
                          ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-md ring-1 ring-blue-500/30' 
                          : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {opt === 'everyone' ? (isRTL ? 'همه' : 'Everyone') : opt === 'contacts' ? (isRTL ? 'مخاطبین' : 'Contacts') : (isRTL ? 'هیچ‌کس' : 'Nobody')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Two-Factor Authentication & Cloud Password Card */}
              <div className="p-5 rounded-3xl bg-white/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06] space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                      <Key size={16} className="text-amber-500 dark:text-amber-400" />
                      <span>{isRTL ? 'تأیید دو مرحله‌ای و رمز ابری (2FA)' : 'Two-Step Verification & Cloud Password'}</span>
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">
                      {isRTL ? 'محافظت از حساب با پین امنیتی هنگام ورود به دستگاه‌های جدید' : 'Secure your account with an additional cloud password / PIN.'}
                    </p>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                    is2FAEnabled 
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20'
                  }`}>
                    {is2FAEnabled ? (isRTL ? 'فعال' : 'Enabled') : (isRTL ? 'غیرفعال' : 'Disabled')}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShow2FAModal(true)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Key size={14} className="text-blue-500 dark:text-blue-400" />
                  <span>{is2FAEnabled ? (isRTL ? 'تغییر رمز دو مرحله‌ای / پین' : 'Change 2FA PIN / Password') : (isRTL ? 'فعال‌سازی تأیید دو مرحله‌ای' : 'Enable Two-Step Verification')}</span>
                </button>
              </div>

              {/* Change Account Password Card */}
              <div className="p-5 rounded-3xl bg-white/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06] space-y-4 shadow-xs">
                <div>
                  <h4 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                    <Lock size={16} className="text-purple-500 dark:text-purple-400" />
                    <span>{isRTL ? 'تغییر رمز عبور حساب کاربری' : 'Change Account Password'}</span>
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">
                    {isRTL ? 'رمز عبور ورود به حساب خود را به‌روزرسانی کنید' : 'Update your account login password.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowPasswordModal(true)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Lock size={14} className="text-purple-500 dark:text-purple-400" />
                  <span>{isRTL ? 'تغییر رمز عبور' : 'Change Password'}</span>
                </button>
              </div>

            </div>
          )}

          {/* TAB 5: Storage & Sessions */}
          {activeTab === 'storage' && (
            <div className="space-y-6 max-w-xl mx-auto">
              
              {/* Local Storage & Cache */}
              <div className="p-5 rounded-3xl bg-white/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06] space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                      <HardDrive size={16} className="text-amber-500 dark:text-amber-400" />
                      <span>{isRTL ? 'حافظه موقت مرورگر (Local Cache)' : 'App Cache & Data'}</span>
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">
                      {isRTL ? 'پاکسازی کش موقت فایل‌ها و مدیا برای آزادسازی حافظه' : 'Clear temporary cached items and media without losing messages.'}
                    </p>
                  </div>

                  <button
                    id="clear-cache-btn"
                    type="button"
                    onClick={handleClearCache}
                    className="px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shrink-0"
                  >
                    {cacheCleared ? <Check size={14} /> : <Trash2 size={14} />}
                    <span>{cacheCleared ? (isRTL ? 'کش پاک شد' : 'Cache Cleared') : (isRTL ? 'پاکسازی کش' : 'Clear Cache')}</span>
                  </button>
                </div>
              </div>

              {/* Active Sessions Section */}
              <div className="p-5 rounded-3xl bg-white/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06] space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                      <Globe size={16} className="text-blue-500 dark:text-blue-400" />
                      <span>{isRTL ? 'نشست‌های فعال (Active Sessions)' : 'Active Sessions'}</span>
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">
                      {isRTL ? 'مدیریت دستگاه‌های متصل به حساب کاربری شما' : 'Manage devices connected to your account.'}
                    </p>
                  </div>

                  {activeSessions.filter(s => !s.isCurrent).length > 0 && (
                    <button
                      type="button"
                      onClick={handleTerminateAllOtherSessions}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95"
                    >
                      {isRTL ? 'خاتمه تمام نشست‌های دیگر' : 'Terminate All Other'}
                    </button>
                  )}
                </div>

                <div className="space-y-3 pt-2">
                  {activeSessions.map((session) => {
                    const IconComponent = session.deviceType === 'mobile' ? Smartphone : Laptop;
                    return (
                      <div
                        key={session.id}
                        className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                          session.isCurrent
                            ? 'bg-blue-600/10 border-blue-500/30'
                            : 'bg-slate-50 dark:bg-brand-sidebar/40 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                            session.isCurrent
                              ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/40'
                              : session.deviceType === 'mobile'
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          }`}>
                            <IconComponent size={20} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h5 className="font-bold text-xs text-slate-900 dark:text-white truncate">{session.deviceName}</h5>
                              {session.isCurrent && (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-blue-500 text-white shrink-0">
                                  {isRTL ? 'نشست فعلی' : 'Current'}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-gray-400 flex items-center gap-2 mt-0.5">
                              <span>{session.location}</span>
                              <span>•</span>
                              <span className="font-mono">{session.ip}</span>
                              <span>•</span>
                              <span className="text-slate-500 dark:text-gray-500">{session.lastActive}</span>
                            </div>
                          </div>
                        </div>

                        {!session.isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleTerminateSession(session.id)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-rose-500/20 border border-slate-200 dark:border-white/10 hover:border-rose-500/30 text-slate-600 dark:text-gray-300 hover:text-rose-500 dark:hover:text-rose-400 text-xs font-bold transition-all cursor-pointer shrink-0 active:scale-95"
                          >
                            {isRTL ? 'خاتمه' : 'Terminate'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Version info card */}
              <div className="p-5 rounded-3xl bg-white/80 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.06] flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Smartphone size={20} />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white">Cloud Messenger Web</div>
                    <div className="text-xs text-slate-500 dark:text-gray-500 font-mono">v2.4.2 (Secure Build)</div>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {isRTL ? 'به‌روز است' : 'Up to date'}
                </span>
              </div>

              {/* Danger Zone: Log Out */}
              <div className="p-5 rounded-3xl bg-rose-500/[0.04] border border-rose-500/20 space-y-3">
                <h4 className="font-bold text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2">
                  <LogOut size={16} />
                  <span>{isRTL ? 'خروج از حساب کاربری' : 'Sign Out of Account'}</span>
                </h4>
                <p className="text-xs text-slate-600 dark:text-gray-400">
                  {isRTL ? 'با خروج از حساب، وضعیت شما آفلاین شده و کلیدهای محلی بسته می‌شوند.' : 'Logging out will end your current session and mark you offline.'}
                </p>

                <button
                  id="danger-logout-btn"
                  type="button"
                  onClick={() => setShowLogoutConfirm(true)}
                  className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-600 dark:text-rose-400 font-bold rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer text-xs sm:text-sm"
                >
                  <LogOut size={16} />
                  <span>{t.logout}</span>
                </button>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>

      {/* 2FA Setup Modal */}
      <AnimatePresence>
        {show2FAModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-brand-sidebar border border-slate-200 dark:border-white/15 rounded-3xl p-6 shadow-2xl space-y-4 text-right"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Key size={18} className="text-amber-500 dark:text-amber-400" />
                  <span>{isRTL ? 'تنظیم رمز دو مرحله‌ای (2FA)' : 'Configure 2FA'}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShow2FAModal(false)}
                  className="p-1 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-xs text-slate-600 dark:text-gray-300 leading-relaxed">
                {isRTL
                  ? 'این رمز ابری در هنگام ورود به حساب کاربری از دستگاه‌های جدید درخواست خواهد شد.'
                  : 'This cloud password will be required when logging in from new devices.'}
              </p>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-600 dark:text-gray-400 block">
                  {isRTL ? 'رمز عبور یا پین (حداقل ۴ کاراکتر)' : 'PIN / Password (min 4 chars)'}
                </label>
                <input
                  type="password"
                  value={twoFAPinInput}
                  onChange={(e) => setTwoFAPinInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-brand-input border border-slate-200 dark:border-white/10 focus:border-blue-500 rounded-xl py-2.5 px-3 text-sm text-slate-900 dark:text-white outline-none"
                />
              </div>

              {twoFASuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold text-center flex items-center justify-center gap-1.5">
                  <CheckCircle2 size={16} />
                  <span>{isRTL ? 'تنظیمات با موفقیت ذخیره شد!' : 'Successfully saved!'}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSave2FA}
                  disabled={twoFASaving}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg active:scale-95 disabled:opacity-50"
                >
                  {twoFASaving ? (isRTL ? 'در حال ذخیره...' : 'Saving...') : (isRTL ? 'ذخیره و فعال‌سازی' : 'Save & Enable')}
                </button>

                {is2FAEnabled && (
                  <button
                    type="button"
                    onClick={handleDisable2FA}
                    className="py-2.5 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold transition-all cursor-pointer active:scale-95"
                  >
                    {isRTL ? 'غیرفعال‌سازی' : 'Disable'}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Change Password Modal */}
      <AnimatePresence>
        {showPasswordModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-brand-sidebar border border-slate-200 dark:border-white/15 rounded-3xl p-6 shadow-2xl space-y-4 text-right"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Lock size={18} className="text-purple-500 dark:text-purple-400" />
                  <span>{isRTL ? 'تغییر رمز عبور حساب' : 'Change Account Password'}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="p-1 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-xs text-slate-600 dark:text-gray-300 leading-relaxed">
                {isRTL
                  ? 'رمز عبور جدید خود را وارد کنید (حداقل ۶ کاراکتر).'
                  : 'Enter your new account password (min 6 characters).'}
              </p>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-gray-400 block">
                    {isRTL ? 'رمز عبور جدید' : 'New Password'}
                  </label>
                  <input
                    type="password"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-brand-input border border-slate-200 dark:border-white/10 focus:border-purple-500 rounded-xl py-2.5 px-3 text-sm text-slate-900 dark:text-white outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-gray-400 block">
                    {isRTL ? 'تکرار رمز عبور جدید' : 'Confirm New Password'}
                  </label>
                  <input
                    type="password"
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-brand-input border border-slate-200 dark:border-white/10 focus:border-purple-500 rounded-xl py-2.5 px-3 text-sm text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              {passwordError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold text-center">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold text-center flex items-center justify-center gap-1.5">
                  <CheckCircle2 size={16} />
                  <span>{isRTL ? 'رمز عبور با موفقیت تغییر کرد!' : 'Password updated successfully!'}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleUpdatePassword}
                  disabled={passwordSaving}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg active:scale-95 disabled:opacity-50"
                >
                  {passwordSaving ? (isRTL ? 'در حال تغییر...' : 'Updating...') : (isRTL ? 'تغییر رمز عبور' : 'Update Password')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Logout */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-brand-sidebar border border-slate-200 dark:border-white/15 rounded-3xl p-6 shadow-2xl space-y-4 text-center"
            >
              <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 flex items-center justify-center mx-auto">
                <LogOut size={28} />
              </div>

              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  {isRTL ? 'آیا مطمئن هستید که می‌خواهید خارج شوید؟' : 'Are you sure you want to log out?'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-gray-400 mt-1">
                  {isRTL ? 'برای ورود مجدد به حساب باید شناسه کاربری و رمز خود را وارد کنید.' : 'You can log back in at any time with your credentials.'}
                </p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-gray-300 font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  {isRTL ? 'انصراف' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-rose-600/25"
                >
                  {t.logout}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
