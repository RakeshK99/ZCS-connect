import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { api, getContext, type AppContext, type ContextKey, type LinkedSession, type SessionInfo } from '@zcs/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

const INFO_KEY = 'zcs.session-info';
const CTX_KEY = 'zcs.context';
const ONBOARDED_KEY = 'zcs.onboarded';

interface SessionState {
  ready: boolean;
  auth: Session | null;
  info: SessionInfo | null;
  linked: LinkedSession | null;
  context: AppContext | null;
  contextKey: ContextKey | null;
  onboarded: boolean;
  setContext: (key: ContextKey) => void;
  refresh: () => Promise<SessionInfo | null>;
  markOnboarded: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<Session | null>(null);
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [contextKey, setContextKey] = useState<ContextKey | null>(null);
  const [onboarded, setOnboarded] = useState(false);

  const load = useCallback(async (): Promise<SessionInfo | null> => {
    try {
      const next = await api.linkAccount(supabase);
      setInfo(next);
      AsyncStorage.setItem(INFO_KEY, JSON.stringify(next)).catch(() => {});
      if (next.linked) {
        const done = await AsyncStorage.getItem(`${ONBOARDED_KEY}.${next.person.id}`);
        setOnboarded(done === '1');
      }
      return next;
    } catch {
      // Offline: fall back to the last known session so cached content stays readable.
      const cached = await AsyncStorage.getItem(INFO_KEY);
      const parsed = cached ? (JSON.parse(cached) as SessionInfo) : null;
      setInfo(parsed);
      if (parsed?.linked) setOnboarded((await AsyncStorage.getItem(`${ONBOARDED_KEY}.${parsed.person.id}`)) === '1');
      return parsed;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(CTX_KEY).then((k) => { if (mounted && (k === 'parent' || k === 'staff')) setContextKey(k); });
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      setAuth(session);
      if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        await load();
      }
      if (!session) setInfo(null);
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') setReady(true);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [load]);

  const linked = info?.linked ? info : null;
  const context = linked ? getContext(linked, contextKey) : null;

  const setContext = useCallback((key: ContextKey) => {
    setContextKey(key);
    AsyncStorage.setItem(CTX_KEY, key).catch(() => {});
  }, []);

  const markOnboarded = useCallback(() => {
    setOnboarded(true);
    if (linked) AsyncStorage.setItem(`${ONBOARDED_KEY}.${linked.person.id}`, '1').catch(() => {});
  }, [linked]);

  const signOut = useCallback(async () => {
    const { unregisterThisDevice } = await import('./notifications');
    await unregisterThisDevice().catch(() => {});
    await supabase.auth.signOut();
    await AsyncStorage.multiRemove([INFO_KEY, CTX_KEY]).catch(() => {});
    qc.clear();
    setInfo(null);
    setContextKey(null);
  }, [qc]);

  const value = useMemo<SessionState>(() => ({
    ready, auth, info, linked, context, contextKey: context?.key ?? null, onboarded, setContext, refresh: load, markOnboarded, signOut,
  }), [ready, auth, info, linked, context, onboarded, setContext, load, markOnboarded, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

/** For screens inside the signed-in area, where a linked session is guaranteed. */
export function useLinked() {
  const s = useSession();
  if (!s.linked || !s.context) throw new Error('useLinked requires a linked session');
  return { ...s, linked: s.linked, context: s.context };
}
