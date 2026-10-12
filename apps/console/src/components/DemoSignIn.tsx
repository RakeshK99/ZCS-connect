'use client';
// Playground-only sign-in for the fictional demo school. Rendered only when the
// build sets NEXT_PUBLIC_DEMO_LOGIN=1 (the GitHub Pages playground); production
// builds never include it, so staff still sign in without passwords.
import { FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { Button, ErrorNote, Input, Label, Select } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_LOGIN === '1';

const PERSONAS = [
  { email: 'rakesh+office@syzygy.services', label: 'Linda Brouwer · office + emergency sender' },
  { email: 'rakesh+principal@syzygy.services', label: 'David Kuiper · Middle School principal' },
  { email: 'rakesh+admin@syzygy.services', label: 'Tom Hoekstra · district admin' },
  { email: 'rakesh+jen@syzygy.services', label: 'Jennifer Smith · 3rd-grade teacher' },
];

export function DemoSignIn() {
  const [email, setEmail] = useState(PERSONAS[0]!.email);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!DEMO_ENABLED) return null;
  const go = async () => {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(new Error('That demo password didn’t work.'));
  };
  return (
    <form className="rounded-2xl border-2 border-dashed border-maize p-4 space-y-3" onSubmit={(e) => { e.preventDefault(); go(); }}>
      <div className="flex items-center gap-2 font-semibold"><FlaskConical className="size-4" /> Playground: demo school</div>
      <div><Label htmlFor="persona">Sign in as</Label>
        <Select id="persona" className="w-full" value={email} onChange={(e) => setEmail(e.target.value)}>
          {PERSONAS.map((p) => <option key={p.email} value={p.email}>{p.label}</option>)}
        </Select></div>
      <div><Label htmlFor="demo-pw">Demo password</Label><Input id="demo-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
      <Button className="w-full h-11" loading={busy} type="submit">Enter the demo</Button>
      <ErrorNote error={error} />
    </form>
  );
}
