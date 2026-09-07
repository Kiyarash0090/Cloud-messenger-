import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLanguage } from './LanguageContext';

export interface UndoAction {
  id: string;
  title: string;
  description?: string;
  durationSeconds?: number;
  onUndo: () => Promise<void> | void;
}

interface UndoContextType {
  showUndo: (action: Omit<UndoAction, 'id'>) => void;
  dismissUndo: () => void;
}

const UndoContext = createContext<UndoContextType | null>(null);

export const useUndo = () => {
  const context = useContext(UndoContext);
  if (!context) {
    throw new Error('useUndo must be used within an UndoProvider');
  }
  return context;
};

export const UndoProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isRTL } = useLanguage();
  const [currentAction, setCurrentAction] = useState<UndoAction | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(5);
  const [totalTime, setTotalTime] = useState<number>(5);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoredSuccess, setRestoredSuccess] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const actionRef = useRef<UndoAction | null>(null);

  actionRef.current = currentAction;

  const dismissUndo = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCurrentAction(null);
    setIsRestoring(false);
    setRestoredSuccess(false);
  };

  const showUndo = (action: Omit<UndoAction, 'id'>) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const duration = action.durationSeconds || 5;
    const newAction: UndoAction = {
      ...action,
      id: Math.random().toString(36).substring(2, 9),
      durationSeconds: duration,
    };

    setTotalTime(duration);
    setTimeLeft(duration);
    setIsRestoring(false);
    setRestoredSuccess(false);
    setCurrentAction(newAction);

    const startTime = Date.now();
    const endTime = startTime + duration * 1000;

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setTimeout(() => {
          setCurrentAction(null);
        }, 200);
      }
    }, 150);
  };

  const handleExecuteUndo = async () => {
    if (!currentAction || isRestoring) return;
    setIsRestoring(true);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    try {
      await currentAction.onUndo();
      setRestoredSuccess(true);
      setTimeout(() => {
        dismissUndo();
      }, 1500);
    } catch (err) {
      console.error('Error executing undo:', err);
      setIsRestoring(false);
    }
  };

  // SVG Circular progress math
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ((timeLeft / (totalTime || 5)) * circumference);

  return (
    <UndoContext.Provider value={{ showUndo, dismissUndo }}>
      {children}

      {/* Floating Undo Notification Toast */}
      <AnimatePresence>
        {currentAction && (
          <div className="fixed bottom-20 md:bottom-7 left-0 right-0 z-[9999] pointer-events-none flex justify-center px-4">
            <motion.div
              initial={{ opacity: 0, y: 35, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 25, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className={`pointer-events-auto max-w-md w-full bg-slate-900/90 dark:bg-slate-900/95 text-white backdrop-blur-xl border border-white/15 rounded-2xl p-3 md:p-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.45)] flex items-center justify-between gap-3 select-none ${
                isRTL ? 'flex-row-reverse text-right' : 'flex-row text-left'
              }`}
            >
              {/* Left/Right Icon & Title */}
              <div className={`flex items-center gap-3 min-w-0 flex-1 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Circular Countdown Timer or Restored Check */}
                <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
                  {restoredSuccess ? (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-emerald-400">
                      <CheckCircle2 size={24} />
                    </motion.div>
                  ) : (
                    <>
                      <svg className="w-8 h-8 -rotate-90 transform" viewBox="0 0 28 28">
                        <circle
                          cx="14"
                          cy="14"
                          r={radius}
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className="text-white/15"
                          fill="none"
                        />
                        <circle
                          cx="14"
                          cy="14"
                          r={radius}
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className="text-brand-accent transition-all duration-150 ease-linear"
                          fill="none"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="absolute text-[10px] font-black text-white">
                        {timeLeft}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex flex-col min-w-0">
                  <span className="text-xs md:text-sm font-bold text-white truncate">
                    {restoredSuccess 
                      ? (isRTL ? 'محتوا با موفقیت بازگردانده شد' : 'Restored successfully') 
                      : currentAction.title}
                  </span>
                  {currentAction.description && !restoredSuccess && (
                    <span className="text-[10px] md:text-xs text-gray-400 truncate">
                      {currentAction.description}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className={`flex items-center gap-1.5 shrink-0 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                {!restoredSuccess && (
                  <button
                    onClick={handleExecuteUndo}
                    disabled={isRestoring}
                    className="px-3 py-1.5 rounded-xl bg-brand-accent hover:bg-brand-accent/90 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-brand-accent/25 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isRestoring ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <RotateCcw size={13} className={isRTL ? 'rotate-180' : ''} />
                    )}
                    <span>{isRTL ? 'بازگردانی' : 'Undo'}</span>
                  </button>
                )}

                <button
                  onClick={dismissUndo}
                  className="w-7 h-7 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title={isRTL ? 'بستن' : 'Dismiss'}
                >
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </UndoContext.Provider>
  );
};
