import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '@/components/Toast';
import { listenForNotificationTaps } from '@/lib/notifications';
import { QueryProvider } from '@/lib/query';
import { SessionProvider, useSession } from '@/lib/session';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell() {
  const { c, isDark } = useTheme();
  const { ready, setContext } = useSession();

  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);
  useEffect(() => (ready ? listenForNotificationTaps(setContext) : undefined), [ready, setContext]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'auto'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="compose" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'Cabin-Regular': require('../../assets/fonts/Cabin-Regular.ttf'),
    'Cabin-Medium': require('../../assets/fonts/Cabin-Medium.ttf'),
    'Cabin-SemiBold': require('../../assets/fonts/Cabin-SemiBold.ttf'),
    'Cabin-Bold': require('../../assets/fonts/Cabin-Bold.ttf'),
  });
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryProvider>
            <SessionProvider>
              <ToastProvider>
                <Shell />
              </ToastProvider>
            </SessionProvider>
          </QueryProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
