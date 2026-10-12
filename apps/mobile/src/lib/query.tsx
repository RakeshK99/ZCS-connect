// React Query with an on-device cache so the last 30 days of feed and messages
// stay readable offline, and mutations (e.g. a message) wait until reconnect.
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, onlineManager, QueryClient, useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

// On web, NetInfo's reachability probe is a HEAD request to the site root, which
// 404s on static hosts (and reads as "offline"), so trust navigator.onLine there.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((s) => setOnline(s.isConnected !== false && (Platform.OS === 'web' || s.isInternetReachable !== false))),
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 30 * 24 * 3600_000, retry: 1, networkMode: 'offlineFirst' },
    mutations: { networkMode: 'offlineFirst' },
  },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'zcs.query-cache', throttleTime: 2000 });

export function QueryProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
    return () => sub.remove();
  }, []);
  return (
    <PersistQueryClientProvider client={queryClient}
      persistOptions={{ persister, maxAge: 30 * 24 * 3600_000, buster: 'v1',
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && ['feed', 'threads', 'thread', 'calendar'].includes(String(q.queryKey[0])) } }}>
      {children}
    </PersistQueryClientProvider>
  );
}

export function useOnline() {
  const [online, setOnline] = useState(onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setOnline), []);
  return online;
}

export { useIsRestoring };
