import type { ExpoConfig } from 'expo/config';

// Public values only. The Supabase publishable key is safe to ship: every table
// is protected by row-level security and writes go through permission-checked RPCs.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://bymugelbfznkynivvckp.supabase.co';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_urP4CiiM2NU1eojT8bFVdw_VW8Sm-5d';
// EAS project @rakesh.vk/zcs-connect (move to a ZCS-owned Expo account before launch).
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? 'fa7ca4a7-40d6-42f9-9514-e3e09e0e3358';
const EAS_OWNER = process.env.EAS_OWNER ?? 'rakesh.vk';

const config: ExpoConfig = {
  name: 'ZCS Connect',
  slug: 'zcs-connect',
  owner: EAS_OWNER,
  scheme: 'zcsconnect',
  version: '1.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#041E42',
  ios: {
    bundleIdentifier: 'org.zcs.connect',
    supportsTablet: true,
    usesAppleSignIn: true,
    icon: { light: './assets/icon.png', dark: './assets/icon-dark.png', tinted: './assets/icon-tinted.png' },
    infoPlist: {
      UIBackgroundModes: ['remote-notification'],
      ITSAppUsesNonExemptEncryption: false,
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
      ],
    },
  },
  android: {
    package: 'org.zcs.connect',
    adaptiveIcon: {
      backgroundColor: '#041E42',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: ['POST_NOTIFICATIONS'],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: './assets/favicon.png', output: 'single' },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    'expo-apple-authentication',
    'expo-web-browser',
    'expo-localization',
    ['expo-splash-screen', { backgroundColor: '#041E42', image: './assets/splash-icon.png', imageWidth: 220 }],
    ['expo-notifications', { icon: './assets/notification-icon.png', color: '#041E42' }],
    ['expo-image-picker', { photosPermission: 'ZCS Connect uses your photos so you can attach them to posts.', cameraPermission: false, microphonePermission: false }],
    ['expo-calendar', { calendarPermission: 'ZCS Connect adds school events you choose to your calendar.' }],
  ],
  // EXPO_BASE_URL serves the web playground under a sub-path (GitHub Pages).
  experiments: { typedRoutes: true, ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) },
  extra: {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    eas: { projectId: EAS_PROJECT_ID },
  },
};

export default config;
