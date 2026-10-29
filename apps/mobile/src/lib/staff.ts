import { router } from 'expo-router';
import { Alert } from 'react-native';
import { signInWithGoogle } from './auth';
import { GOOGLE_SIGN_IN } from './flags';

/** Staff accounts sign in with Google restricted to the school's domain. */
export const STAFF_DOMAIN = 'zcs.org';

/** Google with the school domain when it's set up; until then, an emailed code to their @zcs.org address. */
export async function staffSignIn(setBusy: (b: boolean) => void) {
  if (!GOOGLE_SIGN_IN) return router.push({ pathname: '/sign-in', params: { staff: '1' } });
  try {
    setBusy(true);
    if (await signInWithGoogle(STAFF_DOMAIN)) router.replace('/');
  } catch (e) {
    Alert.alert('Staff sign-in', (e as Error).message);
  } finally {
    setBusy(false);
  }
}
