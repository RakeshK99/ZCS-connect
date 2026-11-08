import { router } from 'expo-router';

/** Staff are ZCS employees with an address on the school's domain. */
export const STAFF_DOMAIN = 'zcs.org';

/**
 * Staff sign in with a 6-digit code emailed to their @zcs.org address (no
 * password). The staff sign-in screen also offers Google, limited to the
 * school domain, once Google sign-in is turned on for the build.
 */
export async function staffSignIn(_setBusy?: (b: boolean) => void) {
  router.push({ pathname: '/sign-in', params: { staff: '1' } });
}
