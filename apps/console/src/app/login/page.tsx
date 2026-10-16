'use client';
import { Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, ErrorNote, Input, Label } from '@/components/ui';
import { useConsole } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { DemoSignIn } from '@/components/DemoSignIn';

const STAFF_DOMAIN = 'zcs.org';

export default function Login() {
  const router = useRouter();
  const { ready, auth, error: sessionError, signOut } = useConsole();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'start' | 'code'>('start');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => { if (ready && auth && !sessionError) router.replace('/'); }, [ready, auth, sessionError, router]);

  const google = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/auth/callback`, queryParams: { hd: STAFF_DOMAIN, prompt: 'select_account' } },
    });
    if (error) setError(error);
  };

  const sendCode = async () => {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) setError(new Error('We couldn’t send a code to that address. Staff accounts are created by a ZCS admin.'));
    else setStep('code');
  };

  const verify = async () => {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError(new Error('That code didn’t work. Check the latest email or request a new one.'));
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <section className="bg-navy text-white p-10 lg:p-16 flex flex-col justify-between">
        <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/zcs-icon-maize.svg`} alt="Zeeland Christian School" className="size-16" />
        <div className="max-w-md">
          <p className="font-heading font-bold text-maize tracking-[0.14em] text-sm">ZCS CONNECT</p>
          <h1 className="text-4xl leading-tight font-bold mt-3">Staff console</h1>
          <p className="text-white/80 mt-4 text-lg">Send announcements, see who&apos;s been reached, keep the roster current and manage who can do what.</p>
        </div>
        <p className="text-white/60 text-sm">Zeeland Christian School · Preschool – 8th grade</p>
      </section>
      <section className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-5">
          <h2 className="text-3xl font-bold">Sign in</h2>
          <DemoSignIn />
          {sessionError === 'not-staff' || sessionError === 'not-linked' ? (
            <div className="rounded-xl bg-sf2 p-4 text-sm space-y-2">
              <p>This account doesn&apos;t have staff access. Families use the ZCS Connect app on their phone.</p>
              <button className="text-navy font-semibold" onClick={signOut}>Sign out and try another account</button>
            </div>
          ) : null}
          <Button className="w-full h-12" onClick={google}>
            <span className="font-heading text-lg">G</span> Sign in with Google (@{STAFF_DOMAIN})
          </Button>
          <div className="flex items-center gap-3 text-tx3 text-sm"><div className="h-px bg-bd flex-1" />or use a code<div className="h-px bg-bd flex-1" /></div>
          {step === 'start' ? (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); sendCode(); }}>
              <div><Label htmlFor="email">Staff email</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <Button variant="secondary" icon={Mail} className="w-full h-11" loading={busy} type="submit">Email me a 6-digit code</Button>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); verify(); }}>
              <div><Label htmlFor="code">Code sent to {email}</Label>
                <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required className="tracking-[0.4em] text-lg" />
              </div>
              <Button className="w-full h-11" loading={busy} type="submit">Sign in</Button>
              <button type="button" className="text-sm text-navy font-semibold" onClick={() => setStep('start')}>Use a different email</button>
            </form>
          )}
          <ErrorNote error={error} />
        </div>
      </section>
    </main>
  );
}
