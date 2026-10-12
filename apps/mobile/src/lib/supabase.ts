import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl: string; supabaseKey: string };

// Sessions live in the device keychain/keystore. SecureStore values are limited
// to ~2 KB, so long values are split into chunks.
const CHUNK = 1800;
const secureStorage = {
  async getItem(key: string) {
    const n = await SecureStore.getItemAsync(`${key}.n`);
    if (!n) return SecureStore.getItemAsync(key);
    const parts = await Promise.all(Array.from({ length: Number(n) }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return parts.every((p) => p != null) ? parts.join('') : null;
  },
  async setItem(key: string, value: string) {
    if (value.length <= CHUNK) {
      await SecureStore.setItemAsync(key, value);
      await SecureStore.deleteItemAsync(`${key}.n`);
      return;
    }
    const chunks = value.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? [];
    await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(`${key}.${i}`, c)));
    await SecureStore.setItemAsync(`${key}.n`, String(chunks.length));
  },
  async removeItem(key: string) {
    const n = await SecureStore.getItemAsync(`${key}.n`);
    await SecureStore.deleteItemAsync(key);
    if (n) {
      await Promise.all(Array.from({ length: Number(n) }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)));
      await SecureStore.deleteItemAsync(`${key}.n`);
    }
  },
};

const webStorage = typeof window !== 'undefined' ? window.localStorage : undefined;

export const supabase = createClient(extra.supabaseUrl, extra.supabaseKey, {
  auth: {
    storage: Platform.OS === 'web' ? webStorage : secureStorage,
    // Separate key on web so the app and the staff console can be signed in as
    // different people when served from the same origin (the playground).
    ...(Platform.OS === 'web' ? { storageKey: 'zcs-app-auth' } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Refresh tokens only while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
