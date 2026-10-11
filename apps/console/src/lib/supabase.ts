'use client';
import { createClient } from '@supabase/supabase-js';

// Publishable key: safe in the browser. Every table is protected by RLS and every
// office/admin action is a permission-checked, audited RPC.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://rajiykcsrybkddbutctb.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_3FdKyAmB2gXG_KqYvxQJDw_IvAyUGQL',
  { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
