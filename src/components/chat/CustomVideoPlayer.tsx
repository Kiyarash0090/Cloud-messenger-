import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  X, 
  Download, 
  FastForward, 
  RotateCw
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { startDownload } from '../../utils/downloadHelper';

interface CustomVideoPlayerProps {
  src: string;
  title?: string;
}

export const CustomVideoPlayer: React.FC<CustomVideoPlayerProps> = ({ src, title = '' }) => {
  const { isRTL } = useLanguage();

  // Unified Video and Lightbox State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [dismissProgress, setDismissProgress] = useState(0);
  const [skipFeedback, setSkipFeedback] = useState<{ type: 'forward' | 'rewind'; visible: boolean }>({
    type: 'forward',
    visible: false,
  });

  const compactVideoRef = useRef<HTMLVideoElement>(null);
  const fullscreenVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const skipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Touch gesture tracking for mobile
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const touchStartYRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const isSwipingDownRef = useRef(false);

  // Active video reference depending on mode
  const activeVideoRef = isFullscreen ? fullscreenVideoRef : compactVideoRef;

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Synchronize compact video stats
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const vid = e.currentTarget;
    setCurrentTime(vid.currentTime);
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const vid = e.currentTarget;
    setDuration(vid.duration || 0);
  };

  // Playback actions
  const togglePlay = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    const vid = activeVideoRef.current;
    if (!vid) return;

    if (isPlaying) {
      vid.pause();
    } else {
      vid.play().catch(() => {});
    }
  }, [isPlaying, activeVideoRef]);

  const handleSeek = useCallback((newTime: number) => {
    const vid = activeVideoRef.current;
    if (!vid) return;
    vid.currentTime = newTime;
    setCurrentTime(newTime);
  }, [activeVideoRef]);

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const newTime = parseFloat(e.target.value);
    handleSeek(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    const muted = newVol === 0;
    setIsMuted(muted);

    if (compactVideoRef.current) {
      compactVideoRef.current.volume = newVol;
      compactVideoRef.current.muted = muted;
    }
    if (fullscreenVideoRef.current) {
      fullscreenVideoRef.current.volume = newVol;
      fullscreenVideoRef.current.muted = muted;
    }
  };

  const toggleMute = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (compactVideoRef.current) compactVideoRef.current.muted = nextMuted;
    if (fullscreenVideoRef.current) fullscreenVideoRef.current.muted = nextMuted;
  };

  const cyclePlaybackSpeed = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const speeds = [1, 1.25, 1.5, 2];
    const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    setPlaybackSpeed(nextSpeed);

    if (compactVideoRef.current) compactVideoRef.current.playbackRate = nextSpeed;
    if (fullscreenVideoRef.current) fullscreenVideoRef.current.playbackRate = nextSpeed;
  };

  const skipSeconds = useCallback((delta: number) => {
    const vid = activeVideoRef.current;
    if (!vid) return;
    const newTime = Math.min(Math.max(vid.currentTime + delta, 0), duration || 100);
    vid.currentTime = newTime;
    setCurrentTime(newTime);

    // Visual feedback
    setSkipFeedback({
      type: delta > 0 ? 'forward' : 'rewind',
      visible: true,
    });
    if (skipTimeoutRef.current) clearTimeout(skipTimeoutRef.current);
    skipTimeoutRef.current = setTimeout(() => {
      setSkipFeedback(prev => ({ ...prev, visible: false }));
    }, 600);
  }, [activeVideoRef, duration]);

  const handleDownload = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    startDownload(src, title || 'video.mp4');
  };

  // Fullscreen transition management
  const openFullscreen = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    const compactVid = compactVideoRef.current;
    const currentT = compactVid ? compactVid.currentTime : currentTime;
    const wasPlaying = compactVid ? !compactVid.paused : isPlaying;

    if (compactVid) compactVid.pause();

    setCurrentTime(currentT);
    setIsFullscreen(true);
    setShowControls(true);
    setDismissProgress(0);

    setTimeout(() => {
      const fullVid = fullscreenVideoRef.current;
      if (fullVid) {
        fullVid.currentTime = currentT;
        fullVid.volume = volume;
        fullVid.muted = isMuted;
        fullVid.playbackRate = playbackSpeed;
        if (wasPlaying) {
          fullVid.play().catch(() => {});
        }
      }
    }, 50);
  };

  const closeFullscreen = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.stopPropagation();
    const fullVid = fullscreenVideoRef.current;
    const currentT = fullVid ? fullVid.currentTime : currentTime;
    const wasPlaying = fullVid ? !fullVid.paused : isPlaying;

    if (fullVid) fullVid.pause();

    setIsFullscreen(false);
    setDismissProgress(0);
    isSwipingDownRef.current = false;

    setTimeout(() => {
      const compactVid = compactVideoRef.current;
      if (compactVid) {
        compactVid.currentTime = currentT;
        compactVid.volume = volume;
        compactVid.muted = isMuted;
        compactVid.playbackRate = playbackSpeed;
        if (wasPlaying) {
          compactVid.play().catch(() => {});
        }
      }
    }, 50);
  }, [currentTime, isPlaying, volume, isMuted, playbackSpeed]);

  // Mobile Tap / Double Tap on Fullscreen Stage
  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const now = Date.now();

    if (now - lastTapRef.current.time < 300) {
      // Double tap detected
      if (clickX < width * 0.35) {
        // Double tap left -> Rewind 10s
        skipSeconds(-10);
      } else if (clickX > width * 0.65) {
        // Double tap right -> Forward 10s
        skipSeconds(10);
      } else {
        // Double tap center -> Toggle Play
        togglePlay();
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      lastTapRef.current = { time: now, x: clickX };
      // Single tap -> Toggle controls
      setShowControls(prev => !prev);
    }
  };

  // Mobile Touch Swipe Down to Dismiss in Fullscreen
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartYRef.current = e.touches[0].clientY;
      touchStartXRef.current = e.touches[0].clientX;
      isSwipingDownRef.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && touchStartYRef.current !== null && touchStartXRef.current !== null) {
      const deltaY = e.touches[0].clientY - touchStartYRef.current;
      const deltaX = Math.abs(e.touches[0].clientX - touchStartXRef.current);

      if (deltaY > 15 && deltaY > deltaX * 1.5) {
        isSwipingDownRef.current = true;
        const progress = Math.min(Math.max(deltaY / 220, 0), 1);
        setDismissProgress(progress);
      }
    }
  };

  const handleTouchEnd = () => {
    if (isSwipingDownRef.current) {
      if (dismissProgress > 0.35) {
        closeFullscreen();
      } else {
        setDismissProgress(0);
      }
      isSwipingDownRef.current = false;
    }
    touchStartYRef.current = null;
    touchStartXRef.current = null;
  };

  // Control bar auto-hide
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      resetControlsTimer();
    } else {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, resetControlsTimer]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isFullscreen) return;
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          closeFullscreen();
          break;
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          skipSeconds(-10);
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          skipSeconds(10);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          closeFullscreen();
          break;
        case 'd':
        case 'D':
          e.preventDefault();
          handleDownload();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, closeFullscreen, togglePlay, skipSeconds, toggleMute]);

  // Prevent background scroll when in fullscreen
  useEffect(() => {
    if (isFullscreen) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [isFullscreen]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/* 1. Sleek Minimal Compact Player View */}
      <div 
        ref={containerRef}
        dir="ltr"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          if (isPlaying) setShowControls(false);
        }}
        onMouseMove={resetControlsTimer}
        onClick={(e) => e.stopPropagation()}
        className="group relative rounded-2xl overflow-hidden bg-slate-950 border border-black/5 dark:border-white/10 shadow-md select-none flex flex-col justify-center transition-all duration-300 min-w-[200px] sm:min-w-[280px] max-w-sm mb-1.5 custom-media-container"
      >
        <div className="relative w-full flex items-center justify-center bg-black/90 aspect-video max-h-[260px] overflow-hidden">
          <video
            ref={compactVideoRef}
            src={src}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onClick={togglePlay}
            className="w-full h-full object-contain cursor-pointer"
            playsInline
            preload="metadata"
          />

          {/* Central Play/Pause Minimal Overlay Button */}
          <div 
            onClick={togglePlay}
            className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-300 ${
              !isPlaying || isHovered ? 'bg-black/30 opacity-100' : 'opacity-0'
            }`}
          >
            <button 
              onClick={togglePlay}
              className="w-12 h-12 rounded-full bg-blue-600/90 hover:bg-blue-500 active:bg-blue-700 text-white flex items-center justify-center shadow-xl transform active:scale-90 hover:scale-105 transition-all pointer-events-auto border border-white/20 backdrop-blur-md cursor-pointer"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={18} className="fill-white" /> : <Play size={18} className="fill-white translate-x-0.5" />}
            </button>
          </div>

          {/* Compact Top-Right Expand Button */}
          <button 
            onClick={openFullscreen}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 active:bg-black text-white/90 hover:text-white backdrop-blur-md border border-white/15 flex items-center justify-center shadow-lg transition-all active:scale-95 cursor-pointer opacity-80 hover:opacity-100"
            title={isRTL ? 'تمام‌صفحه' : 'Fullscreen'}
          >
            <Maximize2 size={13} />
          </button>

          {/* Duration Badge Bottom-Right (when controls hidden) */}
          <div className={`absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono text-white/90 transition-opacity duration-200 pointer-events-none ${
            showControls || isHovered ? 'opacity-0' : 'opacity-100'
          }`}>
            {formatTime(duration - currentTime > 0 ? duration - currentTime : duration)}
          </div>
        </div>

        {/* Minimal Bottom Bar */}
        <div 
          className={`px-3 py-2 bg-slate-900/95 border-t border-white/5 flex flex-col gap-1.5 transition-all duration-200`}
        >
          {/* Scrubber */}
          <div className="relative flex items-center w-full group/scrubber">
            <input
              type="range"
              dir="ltr"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeekChange}
              className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-blue-500 transition-all hover:h-1.5"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progressPercent}%, rgba(255,255,255,0.15) ${progressPercent}%, rgba(255,255,255,0.15) 100%)`
              }}
            />
          </div>

          <div className="flex items-center justify-between text-white/80">
            <div className="flex items-center gap-2">
              <button 
                onClick={togglePlay}
                className="p-1 hover:text-white active:scale-90 transition-all cursor-pointer"
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>

              <button 
                onClick={toggleMute}
                className="p-1 hover:text-white active:scale-90 transition-all cursor-pointer"
              >
                {isMuted ? <VolumeX size={14} className="text-red-400" /> : <Volume2 size={14} />}
              </button>

              <span className="text-[10px] font-mono text-white/70 select-none">
                {formatTime(currentTime)} <span className="text-white/30">/</span> {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={cyclePlaybackSpeed}
                className="px-1.5 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-[9px] font-mono font-bold text-white transition-all cursor-pointer"
                title="Playback Speed"
              >
                {playbackSpeed}x
              </button>

              <button 
                onClick={openFullscreen}
                className="p-1 hover:text-white active:scale-90 transition-all cursor-pointer"
                title={isRTL ? 'تمام‌صفحه' : 'Fullscreen'}
              >
                <Maximize2 size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Ultra-Minimal Lightbox Video Player */}
      {isFullscreen && createPortal(
        <AnimatePresence>
          <motion.div 
            id="custom-video-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 - dismissProgress * 0.7 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[99999] flex flex-col justify-between bg-black/95 backdrop-blur-2xl select-none touch-none overflow-hidden"
            onClick={closeFullscreen}
            onMouseMove={resetControlsTimer}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Top Bar (Header Pills) */}
            <div 
              className={`w-full px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3 flex items-center justify-between z-30 transition-all duration-300 ${
                showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
              } ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Title Pill */}
              <div className="flex items-center gap-2 max-w-[55%] sm:max-w-[70%]">
                <div className="px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-2xl border border-white/15 text-white/90 text-xs font-medium truncate shadow-lg">
                  {title || (isRTL ? 'ویدیو' : 'Video Player')}
                </div>
              </div>

              {/* Action Buttons */}
              <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Close Button */}
                <button 
                  id="video-close-btn"
                  onClick={closeFullscreen}
                  className="w-10 h-10 rounded-full bg-white/15 hover:bg-red-500/80 active:bg-red-600 text-white backdrop-blur-2xl border border-white/20 flex items-center justify-center transition-all shadow-lg active:scale-95 cursor-pointer"
                  title={isRTL ? 'بستن (Esc یا کشیدن به پایین)' : 'Close (Esc or swipe down)'}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Central Video Viewport Stage */}
            <div 
              className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden"
              onClick={handleStageClick}
            >
              <video
                ref={fullscreenVideoRef}
                src={src}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={handleTimeUpdate}
                className="max-h-[82vh] max-w-[96vw] object-contain select-none rounded-lg sm:rounded-xl shadow-2xl"
                playsInline
                autoPlay
              />

              {/* Skip Feedback Animation (+10s / -10s) */}
              <AnimatePresence>
                {skipFeedback.visible && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute z-20 pointer-events-none flex items-center gap-1.5 px-4 py-2 rounded-full bg-black/75 backdrop-blur-xl border border-white/20 text-white text-sm font-medium shadow-2xl"
                  >
                    {skipFeedback.type === 'forward' ? (
                      <>
                        <span>+10s</span>
                        <RotateCw size={16} />
                      </>
                    ) : (
                      <>
                        <RotateCcw size={16} />
                        <span>-10s</span>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom Floating Control Dock */}
            <div 
              className={`w-full pb-[max(env(safe-area-inset-bottom),16px)] pt-2 px-4 flex flex-col items-center gap-2 z-30 transition-all duration-300 ${
                showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Glass Floating Control Capsule */}
              <div className="w-full max-w-xl flex flex-col gap-2 p-3 sm:p-3.5 rounded-3xl bg-black/60 backdrop-blur-2xl border border-white/15 shadow-2xl">
                {/* Full-width Scrubber */}
                <div className="flex items-center gap-3 w-full px-1">
                  <span className="text-[11px] font-mono text-white/70 min-w-[36px] text-right">
                    {formatTime(currentTime)}
                  </span>
                  
                  <div className="relative flex-1 flex items-center">
                    <input
                      type="range"
                      dir="ltr"
                      min={0}
                      max={duration || 100}
                      step={0.1}
                      value={currentTime}
                      onChange={handleSeekChange}
                      className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500 transition-all hover:h-2"
                      style={{
                        background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%, rgba(255,255,255,0.2) 100%)`
                      }}
                    />
                  </div>

                  <span className="text-[11px] font-mono text-white/70 min-w-[36px] text-left">
                    {formatTime(duration)}
                  </span>
                </div>

                {/* Bottom Row Controls */}
                <div className="flex items-center justify-between pt-1">
                  {/* Left: Volume & Speed */}
                  <div className="flex items-center gap-2">
                    {/* Volume Slider Block */}
                    <div className="flex items-center gap-1.5 group/volume">
                      <button 
                        onClick={toggleMute}
                        className="w-8 h-8 rounded-full hover:bg-white/10 text-white/90 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                        title={isMuted ? 'Unmute' : 'Mute'}
                      >
                        {isMuted ? <VolumeX size={16} className="text-red-400" /> : <Volume2 size={16} />}
                      </button>
                      <input
                        type="range"
                        dir="ltr"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-0 sm:w-16 overflow-hidden group-hover/volume:w-16 sm:group-hover/volume:w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-400 transition-all duration-300"
                      />
                    </div>

                    {/* Speed Selector */}
                    <button 
                      onClick={cyclePlaybackSpeed}
                      className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white text-[11px] font-mono font-semibold transition-all cursor-pointer"
                      title={isRTL ? 'سرعت پخش' : 'Playback speed'}
                    >
                      {playbackSpeed}x
                    </button>
                  </div>

                  {/* Center: Rewind, Big Play, Forward */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button 
                      onClick={() => skipSeconds(-10)}
                      className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                      title="-10s"
                    >
                      <RotateCcw size={15} />
                    </button>

                    <button 
                      onClick={togglePlay}
                      className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white flex items-center justify-center transition-all shadow-lg active:scale-95 hover:scale-105 cursor-pointer"
                      title={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? <Pause size={18} className="fill-white" /> : <Play size={18} className="fill-white translate-x-0.5" />}
                    </button>

                    <button 
                      onClick={() => skipSeconds(10)}
                      className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                      title="+10s"
                    >
                      <RotateCw size={15} />
                    </button>
                  </div>

                  {/* Right: Download & Exit Fullscreen */}
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={handleDownload}
                      className="w-8 h-8 rounded-full hover:bg-white/10 text-white/90 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                      title={isRTL ? 'دانلود ویدیو (D)' : 'Download video (D)'}
                    >
                      <Download size={16} />
                    </button>

                    <button 
                      onClick={closeFullscreen}
                      className="w-8 h-8 rounded-full hover:bg-white/10 text-white/90 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                      title={isRTL ? 'خروج از تمام‌صفحه' : 'Exit fullscreen'}
                    >
                      <Minimize2 size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Mobile Gesture Helper */}
              <div className="hidden sm:block text-[10px] text-white/40 tracking-wider font-medium text-center select-none">
                {isRTL 
                  ? 'دوبار ضربه چپ/راست: ۱۰ ثانیه جلو/عقب • کشیدن به پایین: بستن • ضربه روی صفحه: پنهان‌سازی دکمه‌ها' 
                  : 'Double tap left/right: -/+10s • Swipe down: close • Tap: toggle controls'}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
