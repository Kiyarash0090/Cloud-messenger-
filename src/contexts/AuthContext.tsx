import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile } from '../types';
import { apiGetMe, apiGetUserProfile, apiPresence, setSessionToken } from '../lib/sqliteApi';

interface User {
  uid: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (uid: string) => {
    try {
      const p = await apiGetUserProfile(uid);
      if (p) {
        setProfile(p);
      }
    } catch (err: any) {
      if (err?.message?.includes('Unauthorized')) {
        setUser(null);
        setProfile(null);
        setSessionToken(null);
        localStorage.removeItem('simulated_user_id');
      } else {
        console.error("Failed to fetch profile from SQLite:", err);
      }
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        const me = await apiGetMe();
        if (me && me.user) {
          setUser({ uid: me.user.uid });
          if (me.profile) {
            setProfile(me.profile);
          }
          localStorage.setItem('simulated_user_id', me.user.uid);
        } else {
          const simulatedUid = localStorage.getItem('simulated_user_id');
          if (simulatedUid) {
            try {
              const p = await apiGetUserProfile(simulatedUid);
              if (p) {
                setUser({ uid: simulatedUid });
                setProfile(p);
              } else {
                setUser(null);
                setProfile(null);
              }
            } catch (_) {
              setUser(null);
              setProfile(null);
            }
          } else {
            setUser(null);
            setProfile(null);
          }
        }
      } catch (_) {
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // Presence heartbeat. Uses the dedicated presence route rather than a profile write,
  // so a beat only touches isOnline/lastSeen and does not bump the profile version.
  useEffect(() => {
    if (!user) return;

    const updatePresence = (isOnline: boolean) => {
      apiPresence(isOnline).catch(() => {});
    };

    updatePresence(true);
    const timer = setInterval(() => updatePresence(true), 5000);

    const handleBeforeUnload = () => {
      updatePresence(false);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleBeforeUnload);

    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleBeforeUnload);
      updatePresence(false);
    };
  }, [user]);

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.uid);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export const isUserOnline = (profile: UserProfile | null, currentUid?: string): boolean => {
  if (!profile) return false;
  if (currentUid && profile.uid === currentUid) return true;
  if (!profile.isOnline) return false;
  
  if (profile.lastSeen) {
    let lastSeenMs = 0;
    if (typeof profile.lastSeen === 'string') {
      const d = new Date(profile.lastSeen);
      lastSeenMs = isNaN(d.getTime()) ? 0 : d.getTime();
    } else if (profile.lastSeen instanceof Date) {
      lastSeenMs = profile.lastSeen.getTime();
    }
    
    if (lastSeenMs > 0) {
      const now = Date.now();
      const difference = Math.abs(now - lastSeenMs);
      return difference < 15000;
    }
  }
  
  return true;
};
