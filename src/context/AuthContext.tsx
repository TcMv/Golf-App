import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

interface SignUpResult {
  error: AuthError | null;
  requiresEmailConfirmation: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthError | null>;
  signUp: (email: string, password: string, displayName: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string, authUser?: User | null) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, ghin_number, home_course_id, units_preference, handicap_index, avatar_url, notify_round_reminders, notify_streak_alerts, notify_achievement_unlocks, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      setProfile(data as Profile);
      return;
    }

    if (!authUser || authUser.id !== userId) {
      setProfile(null);
      return;
    }

    const displayName = typeof authUser.user_metadata?.display_name === 'string'
      ? authUser.user_metadata.display_name.trim()
      : '';
    const { data: created } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        display_name: displayName || authUser.email?.split('@')[0] || 'Golfer',
      })
      .select('id, display_name, ghin_number, home_course_id, units_preference, handicap_index, avatar_url, notify_round_reminders, notify_streak_alerts, notify_achievement_unlocks, created_at')
      .single();
    setProfile(created as Profile | null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id, s.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id, s.user);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName.trim() || email.split('@')[0],
        },
      },
    });
    if (!error && data.user && data.session) {
      await fetchProfile(data.user.id, data.user);
    }
    return {
      error,
      requiresEmailConfirmation: !error && !data.session,
    };
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id, user);
  }, [user, fetchProfile]);

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
