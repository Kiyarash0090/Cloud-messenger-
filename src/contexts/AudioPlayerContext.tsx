import React, { createContext, useContext, useState, useRef, useEffect } from 'react';

export interface PlaylistItem {
  id: string;
  url: string;
  title: string;
  type: string;
}

interface AudioPlayerContextType {
  currentTrack: string | null;
  trackTitle: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  playlist: PlaylistItem[];
  playTrack: (src: string, title?: string, playlist?: PlaylistItem[]) => void;
  setPlaylist: (playlist: PlaylistItem[]) => void;
  pauseTrack: () => void;
  resumeTrack: () => void;
  seek: (time: number) => void;
  setSpeed: (speed: number) => void;
  closeTrack: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export const AudioPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<string | null>(null);
  const [trackTitle, setTrackTitle] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [speed, setSpeedState] = useState<number>(1);
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playlistRef = useRef<PlaylistItem[]>([]);
  playlistRef.current = playlist;

  const currentTrackRef = useRef<string | null>(null);
  currentTrackRef.current = currentTrack;

  const playTrack = (src: string, title: string = '', newPlaylist?: PlaylistItem[]) => {
    if (newPlaylist && newPlaylist.length > 0) {
      setPlaylist(newPlaylist);
      playlistRef.current = newPlaylist;
    }

    if (!audioRef.current) return;
    
    if (currentTrack === src) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        const p = audioRef.current.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      }
      return;
    }

    audioRef.current.pause();
    setCurrentTrack(src);
    setTrackTitle(title);
    setCurrentTime(0);
    setDuration(0);
    
    audioRef.current.src = src;
    audioRef.current.playbackRate = speed;
    audioRef.current.load();
    const p = audioRef.current.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {});
    }
  };

  const pauseTrack = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const resumeTrack = () => {
    if (audioRef.current && currentTrack) {
      const p = audioRef.current.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    }
  };

  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const setSpeed = (newSpeed: number) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
    setSpeedState(newSpeed);
  };

  const closeTrack = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setCurrentTrack(null);
    setTrackTitle('');
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  };

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack,
        trackTitle,
        isPlaying,
        currentTime,
        duration,
        speed,
        playlist,
        playTrack,
        setPlaylist,
        pauseTrack,
        resumeTrack,
        seek,
        setSpeed,
        closeTrack,
      }}
    >
      {children}
      <audio
        ref={audioRef}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (e.currentTarget.duration) {
            setDuration(e.currentTarget.duration);
          }
        }}
        onEnded={() => {
          const list = playlistRef.current;
          const curr = currentTrackRef.current;
          if (list && list.length > 1 && curr) {
            const currentIndex = list.findIndex(t => t.url === curr);
            // In chat message lists (newest at bottom, oldest at top), moving forward is index - 1 or + 1 depending on sort
            if (currentIndex > 0) {
              const nextTrack = list[currentIndex - 1];
              playTrack(nextTrack.url, nextTrack.title);
              return;
            }
          }
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        style={{ display: 'none' }}
        preload="auto"
        playsInline
      />
    </AudioPlayerContext.Provider>
  );
};

export const useAudioPlayer = () => {
  const context = useContext(AudioPlayerContext);
  if (context === undefined) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
};
