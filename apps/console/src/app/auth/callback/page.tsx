'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Spinner } from '@/components/ui';
import { useConsole } from '@/lib/session';

/** Google OAuth returns here; supabase-js exchanges the PKCE code automatically (detectSessionInUrl). */
export default function Callback() {
  const router = useRouter();
  const { ready, auth } = useConsole();
  useEffect(() => { if (ready) router.replace(auth ? '/' : '/login'); }, [ready, auth, router]);
  return <Spinner />;
}
