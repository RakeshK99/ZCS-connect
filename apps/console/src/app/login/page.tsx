'use client';
import { ChevronDown, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, ErrorNote, Input, Label } from '@/components/ui';
import { useConsole } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { DEMO_ENABLED, DemoSignIn } from '@/components/DemoSignIn';

const STAFF_DOMAIN = 'zcs.org';
// Google sign-in shows only once it's set up in Supabase (see docs/SIGN_IN_SETUP.md).
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN === '1';

export default function Login() {
  const router = useRouter();
  const { ready, auth, error: sessionError, signOut } = useConsole();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'start' | 'code'>('start');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [demoOpen, setDemoOpen] = useState(false);

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
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setError(new Error('We couldn’t send a code to that address. Check the spelling, or wait a minute and try again.'));
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
          {sessionError === 'not-staff' || sessionError === 'not-linked' ? (
            <div className="rounded-xl bg-sf2 p-4 text-sm space-y-2">
              <p>This account doesn&apos;t have staff access. Families use the ZCS Connect app on their phone.</p>
              <button className="text-navy font-semibold" onClick={signOut}>Sign out and try another account</button>
            </div>
          ) : null}
          {step === 'start' ? (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); sendCode(); }}>
              <p className="text-tx2">No password needed. We&apos;ll email you a 6-digit code.</p>
              <div><Label htmlFor="email">Your work email</Label><Input id="email" type="email" autoComplete="email" placeholder={`name@${STAFF_DOMAIN}`} value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <Button icon={Mail} className="w-full h-12" loading={busy} type="submit">Email me a code</Button>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); verify(); }}>
              <div><Label htmlFor="code">Code sent to {email}</Label>
                <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required className="tracking-[0.4em] text-lg" />
              </div>
              <Button className="w-full h-11" loading={busy} type="submit">Sign in</Button>
              <div className="flex justify-between text-sm">
                <button type="button" className="text-navy font-semibold" onClick={() => setStep('start')}>Use a different email</button>
                <button type="button" className="text-navy font-semibold" disabled={busy} onClick={sendCode}>Send a new code</button>
              </div>
            </form>
          )}
          <ErrorNote error={error} />
          {GOOGLE_ENABLED && step === 'start' ? (
            <>
              <div className="flex items-center gap-3 text-tx3 text-sm"><div className="h-px bg-bd flex-1" />or<div className="h-px bg-bd flex-1" /></div>
              <Button variant="secondary" className="w-full h-11" onClick={google}>
                <span className="font-heading text-lg">G</span> Continue with Google (@{STAFF_DOMAIN})
              </Button>
            </>
          ) : null}
          {DEMO_ENABLED ? (
            <div className="pt-4 border-t border-bd">
              <button type="button" aria-expanded={demoOpen} className="flex items-center gap-1 text-sm text-tx2 font-semibold" onClick={() => setDemoOpen((v) => !v)}>
                Try the demo school <ChevronDown className={`size-4 transition-transform ${demoOpen ? 'rotate-180' : ''}`} />
              </button>
              {demoOpen ? <div className="mt-3"><DemoSignIn /></div> : null}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
