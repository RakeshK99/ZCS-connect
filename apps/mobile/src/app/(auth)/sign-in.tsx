import { router } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton, Button, H, NavBar, T } from '@/components/ui';
import { appleAvailable, isAppleCancel, sendEmailCode, signInWithApple, signInWithGoogle } from '@/lib/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { font } from '@/theme/tokens';
import { staffSignIn } from '@/lib/staff';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function SignIn() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<null | 'apple' | 'google' | 'code' | 'staff'>(null);
  const [apple, setApple] = useState(false);
  useEffect(() => { appleAvailable().then(setApple); }, []);

  const run = async (kind: 'apple' | 'google', fn: () => Promise<unknown>) => {
    try {
      setBusy(kind);
      const ok = await fn();
      if (ok !== false) router.replace('/');
    } catch (e) {
      if (!isAppleCancel(e)) Alert.alert('Sign in', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const sendCode = async () => {
    if (!EMAIL_RE.test(email.trim())) return Alert.alert('Email', 'Enter the email address the school office has on file.');
    try {
      setBusy('code');
      await sendEmailCode(email);
      router.push({ pathname: '/code', params: { email: email.trim().toLowerCase() } });
    } catch (e) {
      Alert.alert('Email code', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.sf }}>
      <NavBar left={<BackButton onPress={() => router.back()} />} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <H>Sign in</H>
        <T tone="tx2" style={{ marginBottom: 12 }}>Use the email the school office has on file for your family. No password needed.</T>
        {apple ? (
          <Button label="Sign in with Apple" variant="apple" loading={busy === 'apple'} onPress={() => run('apple', signInWithApple)}
            leading={<Text style={{ fontSize: 19, color: c.appleTx }}></Text>} />
        ) : null}
        <Button label="Sign in with Google" variant="secondary" loading={busy === 'google'} onPress={() => run('google', () => signInWithGoogle())}
          leading={<Text style={{ fontFamily: font.heading, fontSize: 18, color: c.tx }}>G</Text>} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: c.bd }} />
          <Text style={{ color: c.tx3, fontSize: 13 }}>or use a code</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: c.bd }} />
        </View>
        <Text nativeID="emailLabel" style={{ fontSize: 13, fontWeight: '600', color: c.tx2 }}>Email</Text>
        <TextInput
          accessibilityLabelledBy="emailLabel" value={email} onChangeText={setEmail} onSubmitEditing={sendCode}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="send"
          placeholder="name@example.com" placeholderTextColor={c.tx3}
          style={{ height: 52, borderRadius: 12, borderWidth: 1, borderColor: c.bdS, backgroundColor: c.sf, color: c.tx, paddingHorizontal: 16, fontSize: 17 }} />
        <Button label="Email me a 6-digit code" icon={Mail} loading={busy === 'code'} onPress={sendCode} />
        <View style={{ flex: 1, minHeight: 24 }} />
        <Button label={`ZCS staff: sign in with Google (@zcs.org)`} variant="ghost" loading={busy === 'staff'}
          onPress={() => staffSignIn((b) => setBusy(b ? 'staff' : null))} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
