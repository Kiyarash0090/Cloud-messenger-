import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { X, Copy, Check, Shield, Crown, MicOff, Ban, MessageSquare } from 'lucide-react';
import { UserProfile, Chat } from '../../types';
import { apiGetUserProfile } from '../../lib/sqliteApi';
import { subscribe } from '../../lib/realtime';
import { useAuth, isUserOnline } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { parseFlags } from '../../lib/emoji';

interface UserProfileCardProps {
  uid: string;
  // Optional already-loaded profile, shown immediately while the fresh copy loads.
  initialProfile?: UserProfile | null;
  // When provided, the card also shows this user's role in that chat.
  chat?: Chat;
  // Opens a DM with this user. Omit to hide the button.
  onStartChat?: (username: string) => void;
  onClose: () => void;
}

export const UserProfileCard: React.FC<UserProfileCardProps> = ({ uid, initialProfile, chat, onStartChat, onClose }) => {
  const { user } = useAuth();
  const { isRTL } = useLanguage();
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile || null);
  const [loading, setLoading] = useState(!initialProfile);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    apiGetUserProfile(uid)
      .then((p) => { if (!cancelled && p) setProfile(p as UserProfile); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    const unsubs = [
      subscribe('profile.updated', (p: any) => {
        if (p?.uid === uid) setProfile(p as UserProfile);
      }),
      subscribe('presence.changed', (p: any) => {
        if (p?.uid === uid) {
          setProfile((prev) => (prev ? { ...prev, isOnline: p.isOnline, lastSeen: p.lastSeen } : prev));
        }
      }),
    ];

    return () => {
      cancelled = true;
      unsubs.forEach((off) => off());
    };
  }, [uid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyUsername = () => {
    if (!profile?.username) return;
    navigator.clipboard.writeText(`@${profile.username}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const online = isUserOnline(profile, user?.uid);
  const isOwner = chat?.ownerUid === uid;
  const isAdmin = !isOwner && (chat?.admins || []).includes(uid);
  const isMuted = (chat?.mutedUids || []).includes(uid);
  const isBanned = (chat?.bannedUids || []).includes(uid);

  const lastSeenLabel = () => {
    if (online) return isRTL ? 'آنلاین' : 'Online';
    if (!profile?.lastSeen) return isRTL ? 'آخرین بازدید نامشخص' : 'Last seen unknown';
    const d = new Date(profile.lastSeen);
    if (isNaN(d.getTime())) return isRTL ? 'آخرین بازدید نامشخص' : 'Last seen unknown';
    return (isRTL ? 'آخرین بازدید ' : 'Last seen ') + d.toLocaleString(isRTL ? 'fa-IR' : undefined);
  };

  const badges = [
    isOwner && { label: isRTL ? 'مالک' : 'Owner', icon: Crown, tone: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
    isAdmin && { label: isRTL ? 'مدیر' : 'Admin', icon: Shield, tone: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    isMuted && { label: isRTL ? 'بی‌صدا' : 'Muted', icon: MicOff, tone: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
    isBanned && { label: isRTL ? 'مسدود' : 'Banned', icon: Ban, tone: 'text-red-400 bg-red-500/10 border-red-500/20' },
  ].filter(Boolean) as { label: string; icon: React.ComponentType<{ size?: number }>; tone: string }[];

  return createPortal(
    <div className={`fixed inset-0 z-[200] flex items-center justify-center p-4 ${isRTL ? 'font-farsi' : ''}`}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-md cursor-pointer"
      />

      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', duration: 0.35 }}
        className="relative w-full max-w-sm bg-white dark:bg-brand-sidebar/95 backdrop-blur-2xl border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-2xl overflow-hidden z-[201] text-slate-900 dark:text-brand-text"
      >
        <button
          onClick={onClose}
          className={`absolute top-4 ${isRTL ? 'left-4' : 'right-4'} p-1.5 rounded-full text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all z-10 cursor-pointer`}
          title={isRTL ? 'بستن' : 'Close'}
        >
          <X size={16} />
        </button>

        <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-r from-blue-600/30 to-indigo-600/30" />

        <div className="relative pt-6 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 p-[2px] shadow-xl overflow-hidden mb-3 ring-4 ring-white dark:ring-brand-sidebar relative">
            <img
              src={profile?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + uid}
              alt=""
              className="w-full h-full object-cover rounded-xl"
              referrerPolicy="no-referrer"
            />
          </div>

          <h3 className="text-md font-bold tracking-tight text-slate-900 dark:text-white">
            {loading && !profile
              ? (isRTL ? 'در حال بارگذاری...' : 'Loading...')
              : parseFlags(profile?.displayName || profile?.username || uid)}
          </h3>

          {profile?.username && (
            <div className="flex items-center gap-1.5 mt-1 bg-slate-100 dark:bg-brand-input/50 backdrop-blur border border-slate-200 dark:border-white/5 py-1 px-3 rounded-full">
              <span className="text-[11px] text-blue-600 dark:text-blue-400 font-mono font-medium">@{profile.username}</span>
              <button
                onClick={copyUsername}
                className="text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white transition-colors p-0.5 cursor-pointer"
                title={isRTL ? 'کپی شناسه' : 'Copy username'}
              >
                {copied ? <Check size={12} className="text-emerald-500 dark:text-emerald-400" /> : <Copy size={11} />}
              </button>
            </div>
          )}

          <div className={`flex items-center gap-1.5 mt-2 text-[11px] font-bold ${online ? 'text-green-600 dark:text-green-500' : 'text-slate-500 dark:text-gray-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-green-500' : 'bg-slate-400 dark:bg-gray-500'}`} />
            <span>{lastSeenLabel()}</span>
          </div>

          {badges.length > 0 && (
            <div className="flex items-center flex-wrap justify-center gap-1.5 mt-3">
              {badges.map(({ label, icon: Icon, tone }) => (
                <span key={label} className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${tone}`}>
                  <Icon size={10} />
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="h-[1px] bg-slate-200 dark:bg-white/5 my-4" />

        <div className="space-y-3">
          <div>
            <span className={`text-[9px] font-bold text-slate-500 dark:text-gray-500 uppercase tracking-widest block mb-1 ${isRTL ? 'text-right' : 'text-left'}`}>
              {isRTL ? 'درباره' : 'Bio'}
            </span>
            <p className={`text-xs text-slate-700 dark:text-gray-300 bg-slate-100 dark:bg-brand-input/30 p-2.5 rounded-xl border border-slate-200 dark:border-white/5 italic ${isRTL ? 'text-right' : 'text-left'}`}>
              {profile?.bio || (isRTL ? 'بیوگرافی ثبت نشده است.' : 'No bio added yet.')}
            </p>
          </div>

          <div>
            <span className={`text-[9px] font-bold text-slate-500 dark:text-gray-500 uppercase tracking-widest block mb-1 ${isRTL ? 'text-right' : 'text-left'}`}>
              {isRTL ? 'شناسه کاربر' : 'User ID'}
            </span>
            <div className={`text-[10px] text-slate-600 dark:text-gray-400 bg-slate-100 dark:bg-brand-input/30 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/5 font-mono break-all ${isRTL ? 'text-right' : 'text-left'}`}>
              {uid}
            </div>
          </div>
        </div>

        {onStartChat && profile?.username && uid !== user?.uid && (
          <button
            onClick={() => { onStartChat(profile.username); onClose(); }}
            className="mt-5 w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-blue-600/25 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageSquare size={14} />
            {isRTL ? 'شروع گفتگوی خصوصی' : 'Send Message'}
          </button>
        )}
      </motion.div>
    </div>,
    document.body
  );
};
