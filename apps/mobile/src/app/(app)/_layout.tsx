import { Redirect, Stack } from 'expo-router';
import { RoleSwitcherProvider } from '@/features/roles/RoleSwitcher';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';

export default function AppLayout() {
  const { c } = useTheme();
  const { ready, auth, linked } = useSession();
  if (!ready) return null;
  if (!auth || !linked) return <Redirect href="/" />;
  return (
    <RoleSwitcherProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="post/[id]" />
        <Stack.Screen name="thread/[id]" />
        <Stack.Screen name="roster/[id]" />
        <Stack.Screen name="reach/[id]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="new-message" options={{ presentation: 'modal' }} />
        <Stack.Screen name="class-event" options={{ presentation: 'modal' }} />
        <Stack.Screen name="tour" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
    </RoleSwitcherProvider>
  );
}
