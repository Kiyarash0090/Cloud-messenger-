import React, { useMemo, useRef } from 'react';
import { Play, Pause, FastForward, Download, Mic, Music } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAudioPlayer } from '../../contexts/AudioPlayerContext';
import { startDownload } from '../../utils/downloadHelper';

interface CustomAudioPlayerProps {
  src: string;
  fileName?: string;
  senderName?: string;
}

export const CustomAudioPlayer: React.FC<CustomAudioPlayerProps> = ({ src, fileName, senderName }) => {
  const { isRTL } = useLanguage();
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    speed,
    playTrack,
    seek,
    setSpeed,
  } = useAudioPlayer();

  const waveContainerRef = useRef<HTMLDivElement>(null);

  // Check if this player is currently playing in the global audio context
  const isActive = currentTrack === src;

  // Determine if it's a voice message or audio track
  const isVoice = fileName === 'voice_message.webm' || !fileName || fileName.endsWith('.webm') || fileName.endsWith('.ogg');

  const displayTitle = useMemo(() => {
    if (isVoice) {
      if (senderName) {
        return isRTL ? `پیام صوتی • ${senderName}` : `Voice Note • ${senderName}`;
      }
      return isRTL ? 'پیام صوتی' : 'Voice Message';
    }
    return fileName || (isRTL ? 'فایل صوتی' : 'Audio Track');
  }, [isVoice, fileName, senderName, isRTL]);

  // Generate an aesthetically balanced, realistic soundwave pattern (32 bars)
  const waveHeights = useMemo(() => {
    // Deterministic pseudo-random sequence based on string hash for consistency per file
    let hash = 0;
    for (let i = 0; i < src.length; i++) {
      hash = (hash << 5) - hash + src.charCodeAt(i);
      hash |= 0;
    }
    const pseudoRand = (seed: number) => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    return Array.from({ length: 32 }, (_, i) => {
      const r = pseudoRand(Math.abs(hash) + i);
      // Smooth bell-like envelope with organic variation
      const bell = Math.sin((i / 31) * Math.PI);
      const height = Math.floor(4 + (bell * 14) + (r * 10));
      return Math.min(Math.max(height, 5), 24);
    });
  }, [src]);

  const isCurrentlyPlaying = isActive && isPlaying;
  const activeCurrentTime = isActive ? currentTime : 0;
  const activeDuration = isActive ? duration : 0;
  const activeSpeed = isActive ? speed : 1;
  const progressRatio = activeDuration > 0 ? activeCurrentTime / activeDuration : 0;

  const togglePlay = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    playTrack(src, displayTitle);
  };

  const handleSpeedToggle = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (!isActive) {
      playTrack(src, displayTitle);
      return;
    }
    const speeds = [1, 1.5, 2];
    const nextIndex = (speeds.indexOf(speed) + 1) % speeds.length;
    setSpeed(speeds[nextIndex]);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    startDownload(src, fileName || (isVoice ? 'voice_message.webm' : 'audio.mp3'));
  };

  // Interactive scrubbing directly on waveform (Touch and Click support)
  const handleWaveSeek = (clientX: number) => {
    if (!waveContainerRef.current) return;
    const rect = waveContainerRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const ratio = clickX / rect.width;
    
    if (!isActive) {
      playTrack(src, displayTitle);
      setTimeout(() => {
        if (activeDuration) {
          seek(ratio * activeDuration);
        }
      }, 100);
    } else if (activeDuration > 0) {
      seek(ratio * activeDuration);
    }
  };

  const onWavePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    handleWaveSeek(e.clientX);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onWavePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons > 0) {
      e.stopPropagation();
      handleWaveSeek(e.clientX);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div 
      dir="ltr" 
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      className={`w-full min-w-[210px] sm:min-w-[290px] max-w-sm p-3 sm:p-3.5 rounded-2xl border transition-all duration-300 select-none custom-media-container ${
        isActive 
          ? 'bg-brand-accent/15 border-brand-accent/30 shadow-sm' 
          : 'bg-black/20 border-white/10 shadow-xs'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Play/Pause Tactile Circle Button */}
        <button 
          id="audio-play-btn"
          onClick={togglePlay}
          className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 hover:scale-105 shadow-md cursor-pointer ${
            isCurrentlyPlaying
              ? 'bg-brand-accent hover:brightness-110 text-white ring-4 ring-brand-accent/25 animate-pulse'
              : 'bg-brand-accent hover:brightness-110 text-white'
          }`}
          title={isCurrentlyPlaying ? 'Pause' : 'Play'}
        >
          {isCurrentlyPlaying ? (
            <Pause size={17} className="fill-white" />
          ) : (
            <Play size={17} className="fill-white translate-x-0.5" />
          )}
        </button>

        {/* Core Audio Details & Interactive Soundwave */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          {/* Header Row: Title & Action Pills */}
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-brand-accent-text shrink-0 opacity-80">
                {isVoice ? <Mic size={12} /> : <Music size={12} />}
              </span>
              <span className="text-[11px] font-semibold text-slate-200 truncate">
                {displayTitle}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Speed Button (Only shows when active or clicked) */}
              <button 
                id="audio-speed-btn"
                onClick={handleSpeedToggle}
                className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold transition-all active:scale-95 cursor-pointer ${
                  activeSpeed > 1
                    ? 'bg-brand-accent text-white shadow-xs'
                    : 'bg-white/10 text-slate-300 hover:bg-white/20'
                }`}
                title={isRTL ? 'تغییر سرعت پخش' : 'Toggle speed'}
              >
                {activeSpeed}x
              </button>

              {/* Download Button */}
              <button 
                id="audio-download-btn"
                onClick={handleDownload}
                className="w-6 h-6 rounded-full hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                title={isRTL ? 'دانلود فایل صوتی' : 'Download audio'}
              >
                <Download size={12} />
              </button>
            </div>
          </div>

          {/* Interactive Scrubbable Waveform Bars */}
          <div 
            ref={waveContainerRef}
            onPointerDown={onWavePointerDown}
            onPointerMove={onWavePointerMove}
            className="flex items-end gap-[2px] h-6 py-0.5 cursor-pointer touch-none select-none group/wave relative"
          >
            {waveHeights.map((h, i) => {
              const barRatio = i / waveHeights.length;
              const isPlayed = barRatio <= progressRatio;
              
              return (
                <div 
                  key={i} 
                  className={`flex-1 rounded-full transition-all duration-150 ${
                    isPlayed 
                      ? 'bg-brand-accent' 
                      : 'bg-white/20 group-hover/wave:bg-white/30'
                  }`}
                  style={{ 
                    height: `${h}px`,
                    opacity: isCurrentlyPlaying && isPlayed ? 1 : isPlayed ? 0.95 : 0.45 
                  }}
                />
              );
            })}
          </div>

          {/* Time Metadata Display */}
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>
              {formatTime(activeCurrentTime)}
            </span>
            <span className="text-slate-400">
              {activeDuration > 0 ? formatTime(activeDuration) : '0:00'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
