import React, { useState } from 'react';
import { Play, Pause, X, Music, Mic, FastForward, SkipBack, SkipForward, ListMusic } from 'lucide-react';
import { useAudioPlayer, PlaylistItem } from '../../contexts/AudioPlayerContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';

export type { PlaylistItem };

interface GlobalAudioPlayerProps {
  playlist?: PlaylistItem[];
}

export const GlobalAudioPlayer: React.FC<GlobalAudioPlayerProps> = ({ playlist: propPlaylist }) => {
  const { isRTL } = useLanguage();
  const [showPlaylist, setShowPlaylist] = useState(false);
  
  const {
    currentTrack,
    trackTitle,
    isPlaying,
    currentTime,
    duration,
    speed,
    playlist: contextPlaylist,
    playTrack,
    pauseTrack,
    resumeTrack,
    seek,
    setSpeed,
    closeTrack,
  } = useAudioPlayer();

  if (!currentTrack) return null;

  const playlist = propPlaylist && propPlaylist.length > 0 ? propPlaylist : contextPlaylist;
  const currentTrackIndex = playlist.findIndex(t => t.url === currentTrack);
  const actualHasNext = currentTrackIndex > 0;
  const actualHasPrev = currentTrackIndex !== -1 && currentTrackIndex < playlist.length - 1;

  const goNext = () => {
    if (actualHasNext) {
      const next = playlist[currentTrackIndex - 1];
      playTrack(next.url, next.title);
    }
  };

  const goPrev = () => {
    if (actualHasPrev) {
      const prev = playlist[currentTrackIndex + 1];
      playTrack(prev.url, prev.title);
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      pauseTrack();
    } else {
      resumeTrack();
    }
  };

  const handleSpeedToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const speeds = [1, 1.5, 2];
    const nextIndex = (speeds.indexOf(speed) + 1) % speeds.length;
    setSpeed(speeds[nextIndex]);
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const isVoice = trackTitle.includes('Voice') || trackTitle.includes('صوتی') || trackTitle.includes('webm');
  const isPlaylistValid = playlist && playlist.length > 1;
  const progressRatio = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="w-full z-40 relative border-0 select-none">
      {/* Top Thin Interactive Scrubber Line (Mobile & Desktop) */}
      <div className="w-full h-1 bg-black/40 relative cursor-pointer group/scrub">
        <input
          type="range"
          dir="ltr"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={(e) => seek(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div 
          className="h-full bg-brand-accent transition-all duration-100 relative"
          style={{ width: `${progressRatio}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-sm opacity-0 group-hover/scrub:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Main Glass Floating Bar */}
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 54, opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 280 }}
        className="w-full shrink-0 bg-brand-player-bg border-b border-brand-border backdrop-blur-2xl flex items-center justify-between px-3 sm:px-5 shadow-lg relative z-50 overflow-hidden"
      >
        <div className={`flex items-center gap-2 sm:gap-3 w-full max-w-4xl min-w-0 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
          {/* Controls: Prev, Play/Pause, Next */}
          <div className={`flex items-center gap-1 sm:gap-1.5 shrink-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
            {isPlaylistValid && (
              <button 
                id="global-audio-prev-btn"
                onClick={goPrev} 
                disabled={!actualHasPrev}
                className={`p-1.5 rounded-full transition-all cursor-pointer ${
                  actualHasPrev ? 'text-white/80 hover:text-white hover:bg-white/10 active:scale-95' : 'text-white/20 pointer-events-none'
                }`}
                title="Previous track"
              >
                <SkipBack size={15} className={isRTL ? 'rotate-180' : ''} />
              </button>
            )}

            <button
              id="global-audio-play-btn"
              onClick={handleToggle}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-brand-accent hover:brightness-110 active:brightness-90 text-white flex items-center justify-center transition-all shadow-md active:scale-90 hover:scale-105 cursor-pointer shrink-0"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={14} className="fill-white" /> : <Play size={14} className="fill-white translate-x-0.5" />}
            </button>

            {isPlaylistValid && (
              <button 
                id="global-audio-next-btn"
                onClick={goNext} 
                disabled={!actualHasNext}
                className={`p-1.5 rounded-full transition-all cursor-pointer ${
                  actualHasNext ? 'text-white/80 hover:text-white hover:bg-white/10 active:scale-95' : 'text-white/20 pointer-events-none'
                }`}
                title="Next track"
              >
                <SkipForward size={15} className={isRTL ? 'rotate-180' : ''} />
              </button>
            )}
          </div>

          {/* Track Info Card */}
          <div 
            className={`flex items-center gap-2 min-w-0 flex-1 max-w-sm px-2 py-1 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div className="w-7 h-7 rounded-lg bg-brand-accent/15 text-brand-accent-text border border-brand-accent/25 flex items-center justify-center shrink-0">
              {isVoice ? <Mic size={13} /> : <Music size={13} />}
            </div>

            <div className={`${isRTL ? 'text-right' : 'text-left'} leading-tight truncate min-w-0 flex-1`}>
              <div className="text-[11px] sm:text-xs font-semibold text-white truncate">
                {trackTitle}
              </div>
              <div className="text-[9px] sm:text-[10px] font-mono text-slate-400">
                {formatTime(currentTime)} <span className="text-white/30">/</span> {formatTime(duration)}
              </div>
            </div>
          </div>

          {/* Speed Multiplier Pill */}
          <button
            id="global-audio-speed-btn"
            onClick={handleSpeedToggle}
            className="flex items-center gap-0.5 px-2 py-1 rounded-full bg-white/10 hover:bg-white/15 active:bg-white/20 text-[10px] font-mono font-bold text-white transition-all active:scale-95 cursor-pointer shrink-0"
            title={isRTL ? 'سرعت پخش' : 'Playback speed'}
          >
            <FastForward size={10} />
            <span>{speed}x</span>
          </button>
        </div>

        {/* Action icons right: Playlist toggle & Close */}
        <div className={`flex items-center gap-1 shrink-0 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
          {isPlaylistValid && (
            <button
              id="global-audio-playlist-btn"
              onClick={() => setShowPlaylist(!showPlaylist)}
              className={`p-1.5 rounded-full transition-all active:scale-95 cursor-pointer ${
                showPlaylist ? 'bg-brand-accent text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
              title={isRTL ? 'لیست پخش' : 'Playlist'}
            >
              <ListMusic size={15} />
            </button>
          )}

          <button
            id="global-audio-close-btn"
            onClick={closeTrack}
            className="p-1.5 rounded-full hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-all active:scale-95 cursor-pointer"
            title={isRTL ? 'بستن پخش' : 'Close player'}
          >
            <X size={15} />
          </button>
        </div>
      </motion.div>

      {/* Dropdown Playlist Drawer */}
      <AnimatePresence>
        {showPlaylist && isPlaylistValid && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="absolute top-[58px] left-0 right-0 bg-brand-panel/98 border-b border-brand-border backdrop-blur-2xl z-40 overflow-hidden shadow-2xl"
          >
            <div className="max-h-60 overflow-y-auto custom-scrollbar p-2 space-y-1">
              {playlist.map((item) => {
                const isSelected = currentTrack === item.url;
                return (
                  <button
                    key={item.id}
                    onClick={() => playTrack(item.url, item.title)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all cursor-pointer ${
                      isSelected ? 'bg-brand-accent/20 text-brand-accent-text border border-brand-accent/30' : 'hover:bg-white/5 text-slate-300'
                    } ${isRTL ? 'flex-row-reverse' : ''}`}
                  >
                    <div className={`flex items-center gap-2.5 min-w-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center ${
                        isSelected ? 'bg-brand-accent/20 text-brand-accent-text' : 'bg-white/5 text-slate-400'
                      }`}>
                        {item.type.includes('audio') ? <Music size={13} /> : <Mic size={13} />}
                      </div>
                      <div className="truncate text-[12px] font-medium text-left">
                        {item.title}
                      </div>
                    </div>

                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-brand-accent animate-ping shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
