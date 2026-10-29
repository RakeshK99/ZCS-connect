// Sign-in methods that need provider setup in Supabase (Google OAuth client,
// Apple Services ID). Each is shown only when the build turns it on, so testers
// never see a button that can't work yet. Email codes always work.
export const GOOGLE_SIGN_IN = process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN === '1';
export const APPLE_SIGN_IN = process.env.EXPO_PUBLIC_APPLE_SIGN_IN === '1';
