import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { BackButton, H, NavBar, T } from '@/components/ui';
import { sendEmailCode, verifyEmailCode } from '@/lib/auth';
import { useTheme } from '@/theme/ThemeProvider';

const RESEND_AFTER = 45;

export default function Code() {
  const { c, strong } = useTheme();
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(RESEND_AFTER);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    const t = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const onChange = async (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !busy) {
      try {
        setBusy(true);
        await verifyEmailCode(email, digits);
        router.replace('/');
      } catch (e) {
        Alert.alert('Code', (e as Error).message);
        setCode('');
      } finally {
        setBusy(false);
      }
    }
  };

  const resend = async () => {
    try { await sendEmailCode(email); setWait(RESEND_AFTER); } catch (e) { Alert.alert('Code', (e as Error).message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.sf }}>
      <NavBar left={<BackButton onPress={() => router.back()} />} />
      <View style={{ paddingHorizontal: 24, paddingTop: 12, gap: 12 }}>
        <H>Check your email</H>
        <T tone="tx2">We sent a 6-digit code to <Text style={{ color: c.tx, fontWeight: '600' }}>{email}</Text>.</T>
        <Pressable onPress={() => input.current?.focus()} accessibilityLabel="6-digit code" style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} style={{ flex: 1, height: 60, borderRadius: 12, borderWidth: 2, borderColor: i === code.length ? strong : c.bd,
              backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 26, fontWeight: '600', color: c.tx }}>{code[i] ?? ''}</Text>
            </View>
          ))}
          <TextInput ref={input} value={code} onChangeText={onChange} autoFocus keyboardType="number-pad" textContentType="oneTimeCode"
            autoComplete="one-time-code" maxLength={6} accessibilityLabel="6-digit code"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent' }} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, minHeight: 44 }}>
          {busy ? <ActivityIndicator color={c.link} /> : null}
          {wait > 0 ? (
            <T tone="tx2" size={15}>Didn't get it? You can resend in 0:{String(wait).padStart(2, '0')}.</T>
          ) : (
            <Pressable accessibilityRole="button" onPress={resend} hitSlop={8}><T tone="link" size={15} weight="600">Send a new code</T></Pressable>
          )}
        </View>
        <T tone="tx3" size={13}>Check your spam folder if it hasn't arrived within a minute.</T>
      </View>
    </View>
  );
}
