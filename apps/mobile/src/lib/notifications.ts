// Push registration + deep links from notification taps.
import { api, type ContextKey } from '@zcs/core';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const TOKEN_KEY = 'zcs.push-token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', { name: 'Announcements', importance: Notifications.AndroidImportance.HIGH, lightColor: '#F1C400' });
  await Notifications.setNotificationChannelAsync('messages', { name: 'Messages', importance: Notifications.AndroidImportance.HIGH });
  await Notifications.setNotificationChannelAsync('emergency', {
    name: 'Emergency alerts', importance: Notifications.AndroidImportance.MAX, bypassDnd: true, lightColor: '#B3261E',
  });
}

export async function notificationStatus() {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/** Ask for permission (call only after the in-app explainer) and register this device. */
export async function enableNotifications(): Promise<boolean> {
  if (!Device.isDevice || Platform.OS === 'web') return false;
  await ensureChannels();
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return false;
  await registerThisDevice();
  return true;
}

export async function registerThisDevice() {
  if (!Device.isDevice || Platform.OS === 'web') return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('Push disabled: set EAS_PROJECT_ID (run `npx eas-cli init`).');
    return;
  }
  await ensureChannels();
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.registerDevice(supabase, token, Platform.OS === 'ios' ? 'ios' : 'android');
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function unregisterThisDevice() {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) await api.unregisterDevice(supabase, token).catch(() => {});
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

type Payload = { route?: string; context?: ContextKey };

/** Handles taps (cold start and while running). `switchContext` flips Teacher/Parent to match the notification. */
export function listenForNotificationTaps(switchContext: (k: ContextKey) => void) {
  if (Platform.OS === 'web') return () => {};
  const open = (response: Notifications.NotificationResponse | null) => {
    const data = response?.notification.request.content.data as Payload | undefined;
    if (!data?.route) return;
    if (data.context) switchContext(data.context);
    setTimeout(() => router.push(data.route as never), 50);
  };
  const last = Notifications.getLastNotificationResponse();
  if (last) open(last);
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
