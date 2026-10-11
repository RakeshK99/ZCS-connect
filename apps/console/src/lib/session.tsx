'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { api, isStaff, type LinkedSession, type StaffContext } from '@zcs/core';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

interface ConsoleSession {
  ready: boolean;
  auth: Session | null;
  me: LinkedSession | null;
  staff: StaffContext | null;
  error: string | null;
  signOut: () => Promise<void>;
}

const Ctx = createContext<ConsoleSession>({ ready: false, auth: null, me: null, staff: null, error: null, signOut: async () => {} });

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1, refetchOnWindowFocus: true } } }));
  const [state, setState] = useState<Omit<ConsoleSession, 'signOut'>>({ ready: false, auth: null, me: null, staff: null, error: null });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session) return setState({ ready: event !== 'TOKEN_REFRESHED', auth: null, me: null, staff: null, error: null });
      if (event === 'TOKEN_REFRESHED') return setState((s) => ({ ...s, auth: session }));
      try {
        const info = await api.linkAccount(supabase);
        const me = info.linked ? info : null;
        const staff = (me?.contexts.find(isStaff) as StaffContext | undefined) ?? null;
        setState({ ready: true, auth: session, me, staff, error: me && !staff ? 'not-staff' : !me ? 'not-linked' : null });
      } catch (e) {
        setState({ ready: true, auth: session, me: null, staff: null, error: (e as Error).message });
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); qc.clear(); };
  return (
    <QueryClientProvider client={qc}>
      <Ctx.Provider value={{ ...state, signOut }}>{children}</Ctx.Provider>
    </QueryClientProvider>
  );
}

export const useConsole = () => useContext(Ctx);

export function useStaff() {
  const s = useContext(Ctx);
  if (!s.me || !s.staff) throw new Error('useStaff outside a staff session');
  const roles = s.staff.roles;
  return {
    ...s, me: s.me, staff: s.staff,
    isAdmin: s.me.is_admin, isOffice: s.me.is_office,
    isPrincipal: roles.includes('principal'),
    canEmergency: s.me.can_send_emergency,
  };
}
