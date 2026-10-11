// Passwordless sign-in: Apple, Google, or a 6-digit email code. No password fields anywhere.
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export async function sendEmailCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
  if (error) throw new Error(error.message.includes('rate') ? 'Please wait a minute before asking for another code.' : error.message);
}

export async function verifyEmailCode(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'email' });
  if (error) throw new Error(/expired|invalid/i.test(error.message) ? "That code didn't work. Check the latest email or ask for a new code." : error.message);
}

export async function appleAvailable() {
  try { return await AppleAuthentication.isAvailableAsync(); } catch { return false; }
}

export async function signInWithApple() {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const cred = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL, AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
    nonce: hashedNonce,
  });
  if (!cred.identityToken) throw new Error('Apple did not return a sign-in token.');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: rawNonce });
  if (error) throw new Error(error.message);
}

/** Google OAuth in an auth session browser. `staffDomain` restricts the account picker to e.g. zcs.org. */
export async function signInWithGoogle(staffDomain?: string) {
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: staffDomain ? { hd: staffDomain, prompt: 'select_account' } : { prompt: 'select_account' } },
  });
  if (error || !data.url) throw new Error(error?.message ?? 'Could not start Google sign-in.');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;
  const code = new URL(result.url).searchParams.get('code');
  if (!code) throw new Error('Google sign-in was cancelled.');
  const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exErr) throw new Error(exErr.message);
  return true;
}

export const isAppleCancel = (e: unknown) => (e as { code?: string })?.code === 'ERR_REQUEST_CANCELED';
