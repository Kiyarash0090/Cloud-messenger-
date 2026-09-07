import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  Download, 
  RotateCw, 
  RefreshCw, 
  Maximize2, 
  Minimize2, 
  Expand
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { startDownload } from '../../utils/downloadHelper';

interface CustomImagePlayerProps {
  src: string;
  alt?: string;
}

export const CustomImagePlayer: React.FC<CustomImagePlayerProps> = ({ src, alt = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [dismissProgress, setDismissProgress] = useState(0); // 0 to 1 for swipe-down to dismiss
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { isRTL } = useLanguage();
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Gesture state refs (to avoid stale closures during high-frequency touch/pointer events)
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartScaleRef = useRef<number>(1);
  const lastTapRef = useRef<number>(0);
  const swipeDownStartRef = useRef<{ y: number; x: number } | null>(null);
  const isSwipingDownRef = useRef(false);

  // Prevent background scrolling when lightbox is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleClose = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setIsOpen(false);
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
    setDismissProgress(0);
    isSwipingDownRef.current = false;
  }, []);

  const handleReset = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setDismissProgress(0);
  }, []);

  const handleZoomIn = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setScale((prev) => Math.min(Number((prev + 0.35).toFixed(2)), 4.5));
  }, []);

  const handleZoomOut = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setScale((prev) => {
      const next = Math.max(Number((prev - 0.35).toFixed(2)), 0.6);
      if (next <= 1) {
        setOffset({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const handleRotate = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleDownload = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    startDownload(src, alt || 'image.png');
  }, [src, alt]);

  const toggleFullscreen = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      if (!document.fullscreenElement) {
        if (containerRef.current?.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch {
      // Ignore full screen permission errors
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
        case '_':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          handleReset();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handleRotate();
          break;
        case 'd':
        case 'D':
          e.preventDefault();
          handleDownload();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'ArrowLeft':
          if (scale > 1) {
            e.preventDefault();
            setOffset(prev => ({ ...prev, x: prev.x + 40 }));
          }
          break;
        case 'ArrowRight':
          if (scale > 1) {
            e.preventDefault();
            setOffset(prev => ({ ...prev, x: prev.x - 40 }));
          }
          break;
        case 'ArrowUp':
          if (scale > 1) {
            e.preventDefault();
            setOffset(prev => ({ ...prev, y: prev.y + 40 }));
          }
          break;
        case 'ArrowDown':
          if (scale > 1) {
            e.preventDefault();
            setOffset(prev => ({ ...prev, y: prev.y - 40 }));
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, scale, handleClose, handleZoomIn, handleZoomOut, handleReset, handleRotate, handleDownload, toggleFullscreen]);

  // Desktop Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setScale((prev) => {
      const next = Math.min(Math.max(Number((prev + delta).toFixed(2)), 0.6), 4.5);
      if (next <= 1) {
        setOffset({ x: 0, y: 0 });
      }
      return next;
    });
  };

  // Pointer Down (Desktop Drag Pan)
  const handlePointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if (scale <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - offset.x,
      y: e.clientY - offset.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!isDragging || scale <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;

    const maxBoundX = (window.innerWidth * (scale - 1)) / 2;
    const maxBoundY = (window.innerHeight * (scale - 1)) / 2;

    setOffset({
      x: Math.min(Math.max(newX, -maxBoundX), maxBoundX),
      y: Math.min(Math.max(newY, -maxBoundY), maxBoundY),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLImageElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Safe fallback
    }
  };

  // Mobile Touch Gestures: Pinch to Zoom, Swipe Down to Dismiss, Double Tap
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch to Zoom start
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartScaleRef.current = scale;
      isSwipingDownRef.current = false;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (scale <= 1) {
        // Prepare swipe down to dismiss
        swipeDownStartRef.current = { y: touch.clientY, x: touch.clientX };
        isSwipingDownRef.current = false;
      } else {
        // Pan
        setIsDragging(true);
        dragStartRef.current = {
          x: touch.clientX - offset.x,
          y: touch.clientY - offset.y,
        };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      // Pinching
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / touchStartDistRef.current;
      const nextScale = Math.min(Math.max(Number((touchStartScaleRef.current * ratio).toFixed(2)), 0.6), 4.5);
      setScale(nextScale);
      if (nextScale <= 1) {
        setOffset({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (scale <= 1 && swipeDownStartRef.current) {
        const deltaY = touch.clientY - swipeDownStartRef.current.y;
        const deltaX = Math.abs(touch.clientX - swipeDownStartRef.current.x);

        // Only trigger vertical dismiss swipe if downward movement dominates
        if (deltaY > 10 && deltaY > deltaX) {
          isSwipingDownRef.current = true;
          const progress = Math.min(Math.max(deltaY / 220, 0), 1);
          setDismissProgress(progress);
          setOffset({ x: 0, y: deltaY });
        }
      } else if (scale > 1 && isDragging) {
        const newX = touch.clientX - dragStartRef.current.x;
        const newY = touch.clientY - dragStartRef.current.y;
        const maxBoundX = (window.innerWidth * (scale - 1)) / 2;
        const maxBoundY = (window.innerHeight * (scale - 1)) / 2;

        setOffset({
          x: Math.min(Math.max(newX, -maxBoundX), maxBoundX),
          y: Math.min(Math.max(newY, -maxBoundY), maxBoundY),
        });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      touchStartDistRef.current = null;

      if (isSwipingDownRef.current) {
        if (dismissProgress > 0.4) {
          handleClose();
        } else {
          // Snap back
          setDismissProgress(0);
          setOffset({ x: 0, y: 0 });
        }
        isSwipingDownRef.current = false;
        swipeDownStartRef.current = null;
      }

      if (scale < 1) {
        // Snap back to 1x
        setScale(1);
        setOffset({ x: 0, y: 0 });
      }

      setIsDragging(false);
    }
  };

  // Double Tap / Click detection
  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      // Double tap toggles zoom
      if (scale > 1.05) {
        handleReset();
      } else {
        setScale(2.4);
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      // Single tap toggles controls visibility for immersive viewing
      setShowControls(prev => !prev);
    }
  };

  const handleOpen = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
    setDismissProgress(0);
    setShowControls(true);
    setIsOpen(true);
  };

  return (
    <>
      {/* 1. Sleek Minimal Thumbnail View */}
      <div 
        id="custom-image-thumbnail"
        onClick={handleOpen}
        className="group relative rounded-2xl overflow-hidden mb-1.5 min-w-[180px] max-w-full border border-black/5 dark:border-white/10 cursor-pointer bg-slate-200/60 dark:bg-slate-900/60 shadow-sm hover:shadow-md transition-all duration-300 select-none active:scale-[0.99]"
      >
        {/* Loading skeleton placeholder */}
        {!isLoaded && (
          <div className="w-full h-44 bg-slate-300/40 dark:bg-slate-800/40 animate-pulse flex items-center justify-center">
            <Expand size={20} className="text-slate-400 dark:text-slate-600 animate-pulse" />
          </div>
        )}

        <img 
          src={src} 
          alt={alt} 
          onLoad={() => setIsLoaded(true)}
          className={`w-full h-auto max-h-[240px] sm:max-h-[300px] object-cover transition-transform duration-500 group-hover:scale-[1.02] ${
            isLoaded ? 'opacity-100' : 'opacity-0 h-0'
          }`}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        
        {/* Floating Minimal Expand Badge on Hover/Touch */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-between p-2.5">
          <span className="text-[11px] text-white/90 font-medium truncate max-w-[180px] drop-shadow-md">
            {alt || (isRTL ? 'تصویر' : 'Photo')}
          </span>
          <div className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center shadow-lg border border-white/20">
            <Maximize2 size={13} />
          </div>
        </div>
      </div>

      {/* 2. Ultra-Minimal Lightbox Portal */}
      {isOpen && createPortal(
        <AnimatePresence>
          <motion.div 
            ref={containerRef}
            id="custom-image-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 - dismissProgress * 0.7 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[99999] flex flex-col justify-between bg-black/92 backdrop-blur-xl select-none touch-none overflow-hidden"
            onClick={handleClose}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Ambient subtle glow behind image */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
              <div className="w-[500px] h-[500px] rounded-full bg-blue-500/30 blur-[140px]" />
            </div>

            {/* Top Bar (Floating Minimalist Pills) */}
            <div 
              className={`w-full px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3 flex items-center justify-between z-30 transition-all duration-300 ${
                showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
              } ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Image Info Pill */}
              <div className="flex items-center gap-2 max-w-[55%] sm:max-w-[70%]">
                <div className="px-3 py-1.5 rounded-full bg-white/10 dark:bg-white/10 backdrop-blur-2xl border border-white/15 text-white/90 text-xs font-medium truncate shadow-lg">
                  {alt || (isRTL ? 'تصویر ضمیمه' : 'Attached Photo')}
                </div>
              </div>

              {/* Top Action Buttons (Fullscreen, Close) */}
              <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Fullscreen Button */}
                <button 
                  id="image-fullscreen-btn"
                  onClick={toggleFullscreen}
                  className="hidden sm:flex w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white/90 hover:text-white backdrop-blur-2xl border border-white/15 items-center justify-center transition-all shadow-lg active:scale-95 cursor-pointer"
                  title={isFullscreen ? (isRTL ? 'خروج از تمام‌صفحه' : 'Exit fullscreen') : (isRTL ? 'تمام‌صفحه' : 'Fullscreen')}
                >
                  {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>

                {/* Close Button */}
                <button 
                  id="image-close-btn"
                  onClick={handleClose}
                  className="w-10 h-10 rounded-full bg-white/15 hover:bg-red-500/80 active:bg-red-600 text-white backdrop-blur-2xl border border-white/20 flex items-center justify-center transition-all shadow-lg active:scale-95 cursor-pointer"
                  title={isRTL ? 'بستن (Esc یا کشیدن به پایین)' : 'Close (Esc or swipe down)'}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Central Interactive Viewport */}
            <div 
              className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden"
              onWheel={handleWheel}
              onClick={handleClose}
            >
              <div
                className="w-full h-full flex items-center justify-center select-none"
                style={{
                  transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale}) rotate(${rotation}deg)`,
                  transformOrigin: 'center center',
                  transition: isDragging || isSwipingDownRef.current ? 'none' : 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
                  willChange: 'transform'
                }}
                onClick={handleImageClick}
              >
                <img 
                  ref={imageRef}
                  src={src} 
                  alt={alt}
                  draggable={false}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className={`max-h-[82vh] max-w-[94vw] object-contain select-none rounded-lg sm:rounded-xl shadow-2xl transition-opacity duration-200 ${
                    scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                  }`}
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

            {/* Bottom Floating Control Capsule */}
            <div 
              className={`w-full pb-[max(env(safe-area-inset-bottom),16px)] pt-2 flex flex-col items-center gap-2 z-30 transition-all duration-300 ${
                showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Minimal floating glass dock */}
              <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-full bg-white/10 dark:bg-black/60 backdrop-blur-2xl border border-white/15 shadow-2xl">
                {/* Zoom Out */}
                <button 
                  id="image-zoom-out-btn"
                  onClick={handleZoomOut}
                  disabled={scale <= 0.6}
                  className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 active:bg-white/25 text-white/90 hover:text-white flex items-center justify-center transition-all disabled:opacity-30 disabled:pointer-events-none active:scale-95 cursor-pointer"
                  title={isRTL ? 'کوچکنمایی (-)' : 'Zoom Out (-)'}
                >
                  <ZoomOut size={16} />
                </button>

                {/* Scale Reset Pill */}
                <button
                  id="image-scale-indicator-btn"
                  onClick={() => handleReset()}
                  className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white text-[11px] font-mono font-semibold tracking-wide transition-all select-none cursor-pointer"
                  title={isRTL ? 'بازنشانی مقیاس (0)' : 'Reset scale (0)'}
                >
                  {Math.round(scale * 100)}%
                </button>

                {/* Zoom In */}
                <button 
                  id="image-zoom-in-btn"
                  onClick={handleZoomIn}
                  disabled={scale >= 4.5}
                  className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 active:bg-white/25 text-white/90 hover:text-white flex items-center justify-center transition-all disabled:opacity-30 disabled:pointer-events-none active:scale-95 cursor-pointer"
                  title={isRTL ? 'بزرگنمایی (+)' : 'Zoom In (+)'}
                >
                  <ZoomIn size={16} />
                </button>

                <div className="w-[1px] h-4 bg-white/15 mx-1 shrink-0" />

                {/* Rotate Button */}
                <button 
                  id="image-rotate-btn"
                  onClick={handleRotate}
                  className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 active:bg-white/25 text-white/90 hover:text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                  title={isRTL ? 'چرخش ۹۰ درجه (R)' : 'Rotate 90° (R)'}
                >
                  <RotateCw size={15} />
                </button>

                {/* Reset Transform Button */}
                {(scale !== 1 || rotation !== 0 || offset.x !== 0 || offset.y !== 0) && (
                  <button 
                    id="image-reset-btn"
                    onClick={() => handleReset()}
                    className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 active:bg-white/25 text-amber-300 hover:text-amber-200 flex items-center justify-center transition-all active:scale-95 cursor-pointer animate-fade-in"
                    title={isRTL ? 'بازنشانی تمام تنظیمات' : 'Reset all'}
                  >
                    <RefreshCw size={14} />
                  </button>
                )}

                <div className="w-[1px] h-4 bg-white/15 mx-1 shrink-0" />

                {/* Download Button */}
                <button 
                  id="image-download-btn"
                  onClick={handleDownload}
                  className="w-9 h-9 rounded-full bg-blue-600/70 hover:bg-blue-600 active:bg-blue-700 text-white flex items-center justify-center transition-all shadow-md active:scale-95 cursor-pointer"
                  title={isRTL ? 'دانلود تصویر (D)' : 'Download (D)'}
                >
                  <Download size={15} />
                </button>
              </div>

              {/* Mobile Gesture Helper Hint (Compact & Elegant) */}
              <div className="hidden sm:block text-[10px] text-white/40 tracking-wider font-medium text-center select-none">
                {isRTL 
                  ? 'دوبار ضربه: زوم • کشیدن به پایین: بستن • کلیک روی صفحه: پنهان‌سازی دکمه‌ها' 
                  : 'Double tap: zoom • Swipe down: close • Tap: toggle controls'}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
