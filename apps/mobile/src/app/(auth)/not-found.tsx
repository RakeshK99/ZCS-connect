import { api } from '@zcs/core';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheck, SearchX } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton, Button, H, NavBar, Notice, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';

export default function NotFound() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { info, auth, signOut } = useSession();
  const { linked: fromFound } = useLocalSearchParams<{ linked?: string }>();
  const email = (info && !info.linked ? info.email : null) ?? auth?.user.email ?? '';
  const [sent, setSent] = useState(Boolean(info && !info.linked && info.pending_request));
  const [busy, setBusy] = useState(false);

  const request = async () => {
    try {
      setBusy(true);
      await api.requestFamilyLink(supabase, fromFound ? 'Signed in, but a child is missing or wrong.' : undefined);
      setSent(true);
    } catch (e) {
      Alert.alert('Request', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const differentEmail = async () => { await signOut(); router.replace('/sign-in'); };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <NavBar left={fromFound ? <BackButton onPress={() => router.back()} /> : null} />
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' }}>
          <SearchX size={28} color={c.link} />
        </View>
        <H>{fromFound ? 'Let the office know' : "We couldn't find your family"}</H>
        <T tone="tx2" style={{ lineHeight: 24 }}>
          {fromFound ? 'If a child is missing or something looks wrong, the office can fix it on the roster.' : (
            <><Text style={{ color: c.tx, fontWeight: '600' }}>{email}</Text> isn't linked to a student on the ZCS roster yet. The office can connect it for you.</>
          )}
        </T>
        {sent ? (
          <Notice icon={CircleCheck} tone="ok">
            <Text style={{ fontWeight: '700' }}>Request sent to the ZCS office.</Text> We'll let you know when your family is connected, usually within one school day.
          </Notice>
        ) : null}
        <View style={{ flex: 1 }} />
        {!sent ? <Button label={fromFound ? 'Ask the office to check' : 'Ask the office to connect me'} height={56} loading={busy} onPress={request} /> : null}
        {fromFound ? <Button label="Continue" variant="ghost" onPress={() => router.replace('/notify')} />
          : <Button label="Try a different email" variant="ghost" onPress={differentEmail} />}
      </View>
    </View>
  );
}
