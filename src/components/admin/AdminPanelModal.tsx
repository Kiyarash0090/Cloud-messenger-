import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiGetUsers, apiDeleteDatabase, apiUploadDatabase, getSessionToken } from '../../lib/sqliteApi';
import { ShieldCheck, HardDrive, Users, Database, Trash2, CornerDownLeft, RefreshCw, Activity, X, User, Check, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../../types';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({ isOpen, onClose }) => {
  const { user, profile } = useAuth();
  const { isRTL } = useLanguage();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [dbActionLoading, setDbActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'db' | 'users' | 'stats'>('db');
  const dbUploadInputRef = useRef<HTMLInputElement>(null);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await apiGetUsers();
      if (Array.isArray(data)) {
        setUsers(data);
      }
    } catch (e) {
      console.error("Failed to fetch users:", e);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  const handleDownloadDatabase = () => {
    const token = getSessionToken();
    const url = token ? `/api/admin/db/download?token=${encodeURIComponent(token)}` : '/api/admin/db/download';
    window.location.href = url;
  };

  const handleDeleteDatabase = async () => {
    const confirmMsg = isRTL 
      ? 'هشدار جدی: آیا از پاکسازی و ریست کامل دیتابیس سرور اطمینان دارید؟ تمام داده‌ها حذف خواهند شد.' 
      : 'Warning: Are you sure you want to delete and reset the server database?';
    if (!window.confirm(confirmMsg)) return;

    setDbActionLoading(true);
    try {
      await apiDeleteDatabase();
      alert(isRTL ? 'دیتابیس با موفقیت ریست شد.' : 'Database successfully reset.');
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert(isRTL ? 'خطا در حذف دیتابیس.' : 'Failed to delete database.');
    } finally {
      setDbActionLoading(false);
    }
  };

  const handleUploadDatabaseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmMsg = isRTL 
      ? 'آیا از جایگزینی دیتابیس فعلی با فایل پشتیبان اطمینان دارید؟' 
      : 'Are you sure you want to overwrite the database with this backup?';
    if (!window.confirm(confirmMsg)) return;

    setDbActionLoading(true);
    try {
      await apiUploadDatabase(file);
      alert(isRTL ? 'دیتابیس با موفقیت بازنشانی شد. صفحه مجدداً بارگذاری می‌شود.' : 'Database restored successfully.');
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert(isRTL ? 'خطای آپلود فایل.' : 'File upload error.');
    } finally {
      setDbActionLoading(false);
    }
  };

  if (!isOpen) return null;

  const isAdmin = Boolean(profile?.isAdmin);
  if (!isAdmin) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-2xl bg-white dark:bg-brand-sidebar border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-900 dark:text-white"
        >
          {/* Header */}
          <div className="p-6 bg-gradient-to-r from-amber-600/15 via-blue-600/10 to-transparent border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <ShieldCheck size={26} />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {isRTL ? 'پنل مدیریت کل (Admin Center)' : 'Admin Control Center'}
                </h2>
                <p className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">
                  {isRTL ? 'مدیریت سرور، دیتابیس SQLite و کاربران سامانه' : 'Server SQLite database & user management'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full text-slate-500 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Sub Nav Tabs */}
          <div className="flex border-b border-slate-200 dark:border-white/10 px-6 gap-2 bg-slate-100/80 dark:bg-brand-input/30">
            <button
              type="button"
              onClick={() => setActiveTab('db')}
              className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'db' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <HardDrive size={15} />
              <span>{isRTL ? 'مدیریت دیتابیس سرور' : 'Database Storage'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'users' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Users size={15} />
              <span>{isRTL ? `کاربران (${users.length})` : `Users (${users.length})`}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('stats')}
              className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'stats' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Activity size={15} />
              <span>{isRTL ? 'وضعیت سامانه' : 'System Status'}</span>
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            
            {activeTab === 'db' && (
              <div className="space-y-6">
                <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 space-y-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-sm text-amber-800 dark:text-amber-300">
                        {isRTL ? 'پشتیبان‌سازی و مدیریت فایل دیتابیس سرور' : 'Server Database Backup & Restore'}
                      </h4>
                      <p className="text-xs text-amber-700/80 dark:text-amber-200/70 mt-1 leading-relaxed">
                        {isRTL 
                          ? 'شما به عنوان مدیر کل می‌توانید از تمام پیام‌ها، حساب‌های کاربری و تنظیمات دیتابیس SQLite پشتیبان بگیرید یا آن را بازنشانی کنید.' 
                          : 'As admin, you can download, restore, or reset the server SQLite database.'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <button
                      type="button"
                      disabled={dbActionLoading}
                      onClick={handleDownloadDatabase}
                      className="py-3 px-4 rounded-2xl bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/40 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50 shadow-sm"
                    >
                      <HardDrive size={16} />
                      <span>{isRTL ? 'دانلود فایل دیتابیس' : 'Download DB'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={dbActionLoading}
                      onClick={() => dbUploadInputRef.current?.click()}
                      className="py-3 px-4 rounded-2xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50 shadow-sm"
                    >
                      <CornerDownLeft size={16} className="rotate-180" />
                      <span>{isRTL ? 'آپلود و بازنشانی دیتابیس' : 'Restore DB'}</span>
                    </button>
                    <input 
                      type="file" 
                      ref={dbUploadInputRef} 
                      onChange={handleUploadDatabaseFile} 
                      accept=".db" 
                      className="hidden" 
                    />

                    <button
                      type="button"
                      disabled={dbActionLoading}
                      onClick={handleDeleteDatabase}
                      className="py-3 px-4 rounded-2xl bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50 shadow-sm"
                    >
                      <Trash2 size={16} />
                      <span>{isRTL ? 'پاکسازی کامل دیتابیس' : 'Reset Database'}</span>
                    </button>
                  </div>
                </div>

                <div className="p-5 rounded-3xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 space-y-3 shadow-xs">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <Database size={16} className="text-blue-500 dark:text-blue-400" />
                    <span>{isRTL ? 'اطلاعات فنی موتور ذخیره‌سازی' : 'Storage Engine Specs'}</span>
                  </h4>
                  <ul className="text-xs text-slate-600 dark:text-gray-300 space-y-2 list-disc list-inside">
                    <li>{isRTL ? 'موتور دیتابیس: SQLite محلی در مسیر `data/app.db`' : 'Database Engine: Local SQLite at `data/app.db`'}</li>
                    <li>{isRTL ? 'رمزنگاری ارتباطات و نشست‌های فعال' : 'Active sessions & secure communication enabled'}</li>
                    <li>{isRTL ? 'پشتیبانی از آپلود رسانه‌ها در پوشه `public/uploads`' : 'Media uploads stored in `public/uploads`'}</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'users' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    {isRTL ? 'لیست کاربران ثبت‌نام شده در سامانه' : 'Registered System Users'}
                  </h4>
                  <button
                    type="button"
                    onClick={fetchUsers}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-gray-300 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer border border-slate-200 dark:border-white/5"
                  >
                    <RefreshCw size={14} className={loadingUsers ? 'animate-spin' : ''} />
                    <span>{isRTL ? 'بارگذاری مجدد' : 'Refresh'}</span>
                  </button>
                </div>

                {loadingUsers ? (
                  <div className="py-12 text-center text-slate-500 dark:text-gray-400 text-xs">
                    {isRTL ? 'در حال دریافت اطلاعات کاربران...' : 'Loading users...'}
                  </div>
                ) : users.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 dark:text-gray-400 text-xs">
                    {isRTL ? 'هیچ کاربری یافت نشد.' : 'No users found.'}
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                    {users.map((u) => (
                      <div key={u.uid} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 flex items-center justify-between gap-3 shadow-xs">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-blue-600 overflow-hidden shrink-0">
                            <img 
                              src={u.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + u.uid} 
                              alt={u.displayName} 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900 dark:text-white truncate">{u.displayName}</span>
                              {u.username === 'admin' && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold uppercase">
                                  {isRTL ? 'مدیر کل' : 'Admin'}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 dark:text-gray-400 font-mono truncate block">@{u.username}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className={`inline-block w-2 h-2 rounded-full ${u.isOnline ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-slate-400 dark:bg-gray-500'}`} />
                          <span className="text-[10px] text-slate-500 dark:text-gray-400 block mt-0.5 font-mono">
                            {u.isOnline ? (isRTL ? 'آنلاین' : 'Online') : (isRTL ? 'آفلاین' : 'Offline')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'stats' && (
              <div className="space-y-4">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  {isRTL ? 'آمار کلان و سلامت سامانه' : 'System Telemetry & Health'}
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-1">
                    <span className="text-xs text-blue-700 dark:text-blue-300 font-semibold">{isRTL ? 'تعداد کل کاربران' : 'Total Users'}</span>
                    <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">{users.length}</h3>
                  </div>

                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                    <span className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">{isRTL ? 'وضعیت سرور' : 'Server Status'}</span>
                    <h3 className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">Online 🟢</h3>
                  </div>

                  <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-1">
                    <span className="text-xs text-purple-700 dark:text-purple-300 font-semibold">{isRTL ? 'نسخه برنامه' : 'App Version'}</span>
                    <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">v2.4.2</h3>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-brand-input/30 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-6 rounded-xl bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-800 dark:text-white font-bold text-xs transition-colors cursor-pointer border border-slate-300/50 dark:border-white/5"
            >
              {isRTL ? 'بستن' : 'Close'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
