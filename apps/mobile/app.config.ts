import type { ExpoConfig } from 'expo/config';

// Public values only. The Supabase publishable key is safe to ship: every table
// is protected by row-level security and writes go through permission-checked RPCs.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://rajiykcsrybkddbutctb.supabase.co';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_3FdKyAmB2gXG_KqYvxQJDw_IvAyUGQL';
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ?? '';

const config: ExpoConfig = {
  name: 'ZCS Connect',
  slug: 'zcs-connect',
  scheme: 'zcsconnect',
  version: '1.0.0',
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
  web: { favicon: './assets/favicon.png' },
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
  experiments: { typedRoutes: true },
  extra: {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    eas: { projectId: EAS_PROJECT_ID || undefined },
  },
};

export default config;
