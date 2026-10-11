import { router } from 'expo-router';
import { Alert } from 'react-native';
import { signInWithGoogle } from './auth';

/** Staff accounts sign in with Google restricted to the school's domain. */
export const STAFF_DOMAIN = 'zcs.org';

export async function staffSignIn(setBusy: (b: boolean) => void) {
  try {
    setBusy(true);
    if (await signInWithGoogle(STAFF_DOMAIN)) router.replace('/');
  } catch (e) {
    Alert.alert('Staff sign-in', (e as Error).message);
  } finally {
    setBusy(false);
  }
}
