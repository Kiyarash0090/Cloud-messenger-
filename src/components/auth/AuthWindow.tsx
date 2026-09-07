import React, { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { apiLogin, apiSignup } from '../../lib/sqliteApi';
import { ShieldCheck, Zap, AlertCircle, ExternalLink, Mail, Lock, User as UserIcon, ArrowRight, Cloud, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const AuthWindow: React.FC = () => {
  const { t, isRTL } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsLoading(true);

    // Haptic feedback on mobile
    if ('vibrate' in navigator) {
      try { navigator.vibrate(15); } catch (_) {}
    }

    // Inline field validation
    const errors: Record<string, string> = {};
    if (!username.trim()) errors.username = isRTL ? "نام کاربری الزامی است" : "Username is required";
    if (mode === 'signup' && !displayName.trim()) errors.displayName = isRTL ? "نام نمایشی الزامی است" : "Display name is required";
    if (!password) errors.password = isRTL ? "رمز عبور الزامی است" : "Password is required";
    else if (password.length < 6) errors.password = isRTL ? "رمز عبور باید حداقل ۶ کاراکتر باشد" : "Password must be at least 6 characters";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setIsLoading(false);
      return;
    }

    try {
      if (mode === 'signup') {
        const result = await apiSignup(username, displayName || username, password);
        localStorage.setItem('simulated_user_id', result.user.uid);
        window.location.reload();
      } else {
        const result = await apiLogin(username, password);
        localStorage.setItem('simulated_user_id', result.user.uid);
        window.location.reload();
      }
    } catch (err: any) {
      console.error('Auth failed:', err);
      setError(err.message || t.errorGeneral);
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className={`flex h-screen animated-gradient-bg items-center justify-center p-4 ${isRTL ? 'font-farsi' : ''}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white/95 dark:bg-brand-sidebar/95 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-slate-200 dark:border-gray-800 text-slate-900 dark:text-white"
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white mb-6 shadow-xl shadow-blue-600/30">
            <Cloud size={32} />
          </div>
          
          <h1 className="text-3xl font-bold text-slate-900 dark:text-brand-text mb-2">{t.appName}</h1>
          <p className="text-slate-500 dark:text-gray-400 mb-8 text-sm">{t.secureMessaging}</p>

          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="w-full mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-left"
            >
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-[11px] text-red-700 dark:text-red-100 leading-relaxed">{error}</p>
                </div>
              </div>
            </motion.div>
          )}

          <form onSubmit={handleAuth} className="w-full space-y-4 mb-6">
            <AnimatePresence mode="wait">
              {mode === 'signup' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  <div className="relative">
                    <UserIcon className={`absolute ${isRTL ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500`} size={18} />
                    <input
                      type="text"
                      placeholder={t.displayName}
                      required={mode === 'signup'}
                      value={displayName}
                      onChange={(e) => { setDisplayName(e.target.value); setFieldErrors(prev => ({ ...prev, displayName: '' })); }}
                      className={`w-full bg-slate-100 dark:bg-brand-input border ${fieldErrors.displayName ? 'border-red-500/50' : 'border-slate-200 dark:border-brand-border'} rounded-2xl py-3.5 pr-4 text-sm text-slate-900 dark:text-brand-text focus:border-blue-500 outline-none transition-all ${isRTL ? 'pr-12 text-right' : 'pl-12'}`}
                    />
                  </div>
                  {fieldErrors.displayName && (
                    <p className="text-[11px] text-red-500 dark:text-red-400 font-medium mt-1 px-1">{fieldErrors.displayName}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative">
              <span className={`absolute ${isRTL ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 font-bold text-sm`}>@</span>
              <input
                type="text"
                placeholder={t.username}
                required
                value={username}
                onChange={(e) => { setUsername(e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase()); setFieldErrors(prev => ({ ...prev, username: '' })); }}
                className={`w-full bg-slate-100 dark:bg-brand-input border ${fieldErrors.username ? 'border-red-500/50' : 'border-slate-200 dark:border-brand-border'} rounded-2xl py-3.5 pr-4 text-sm text-slate-900 dark:text-brand-text focus:border-blue-500 outline-none transition-all ${isRTL ? 'pr-12 text-right' : 'pl-12'}`}
              />
            </div>
            {fieldErrors.username && (
              <p className="text-[11px] text-red-500 dark:text-red-400 font-medium mt-1 px-1">{fieldErrors.username}</p>
            )}
            
            <div className="relative">
              <Lock className={`absolute ${isRTL ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500`} size={18} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder={t.password}
                required
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldErrors(prev => ({ ...prev, password: '' })); }}
                className={`w-full bg-slate-100 dark:bg-brand-input border ${fieldErrors.password ? 'border-red-500/50' : 'border-slate-200 dark:border-brand-border'} rounded-2xl py-3.5 pr-4 text-sm text-slate-900 dark:text-brand-text focus:border-blue-500 outline-none transition-all ${isRTL ? 'pr-12 pl-12 text-right' : 'pl-12 pr-12'}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute ${isRTL ? 'left-4' : 'right-4'} top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors cursor-pointer`}
                aria-label={showPassword ? (isRTL ? "پنهان کردن رمز" : "Hide password") : (isRTL ? "نمایش رمز" : "Show password")}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="text-[11px] text-red-500 dark:text-red-400 font-medium mt-1 px-1">{fieldErrors.password}</p>
            )}
            
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? t.processing : (mode === 'login' ? t.signIn : t.signUp)}
              {!isLoading && <ArrowRight size={18} className={isRTL ? 'rotate-180' : ''} />}
            </button>
          </form>

          <div className="flex items-center gap-4 w-full mb-6">
            <div className="h-px flex-1 bg-slate-200 dark:bg-gray-800"></div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-gray-600 uppercase tracking-widest">{t.appName}</span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-gray-800"></div>
          </div>

          <div className="text-center">
            <button 
              type="button"
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer"
            >
              {mode === 'login' ? t.joinNow : t.alreadyMember}
            </button>
          </div>

          <p className="mt-6 text-[11px] text-slate-400 dark:text-gray-600">
            Self-hosted • Private • Open source
          </p>
        </div>
      </motion.div>
    </div>
  );
};
