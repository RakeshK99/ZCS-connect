import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';

/** Decides where a launch lands: welcome, the unknown-family screen, onboarding, or Home. */
export default function Index() {
  const { ready, auth, info, linked, onboarded, context } = useSession();
  if (!ready) return null;
  if (!auth) return <Redirect href="/welcome" />;
  if (!info) return null;
  if (!linked) return <Redirect href="/not-found" />;
  if (!onboarded) return <Redirect href={context?.key === 'parent' ? '/found' : '/notify'} />;
  return <Redirect href="/home" />;
}
