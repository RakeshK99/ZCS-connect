// Sign-in for the fictional demo school. Rendered only when the build sets
// EXPO_PUBLIC_DEMO_LOGIN=1: the GitHub Pages web playground and the TestFlight
// beta (eas.json "demo" profile). The production profile never sets it, so
// families still sign in without passwords.
import { router } from 'expo-router';
import { FlaskConical } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';

export const DEMO_ENABLED = process.env.EXPO_PUBLIC_DEMO_LOGIN === '1';

const PERSONAS = [
  { email: 'rakesh+sarah@syzygy.services', name: 'Sarah VanDyke', note: 'Parent of Emma (3rd) and Noah (K)' },
  { email: 'rakesh+jen@syzygy.services', name: 'Jennifer Smith', note: '3rd-grade teacher and parent of Lily' },
  { email: 'rakesh+newparent@syzygy.services', name: 'New parent', note: 'Not on the roster yet' },
  { email: 'rakesh+principal@syzygy.services', name: 'David Kuiper', note: 'Middle School principal' },
  { email: 'rakesh+office@syzygy.services', name: 'Linda Brouwer', note: 'Office and emergency sender' },
];

export function DemoSignIn() {
  const { c } = useTheme();
  const [email, setEmail] = useState(PERSONAS[0]!.email);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!DEMO_ENABLED) return null;

  const go = async () => {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError('That demo password didn’t work.');
    else router.replace('/');
  };

  return (
    <View style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: '#F1C400', borderRadius: 16, padding: 14, gap: 10, marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FlaskConical size={18} color={c.tx} />
        <Text style={{ fontWeight: '700', color: c.tx, fontSize: 16 }}>Playground: demo school</Text>
      </View>
      {PERSONAS.map((p) => {
        const on = p.email === email;
        return (
          <Pressable key={p.email} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setEmail(p.email)}
            style={{ borderRadius: 12, borderWidth: 1, borderColor: on ? c.pri : c.bd, backgroundColor: on ? c.tint : c.sf, padding: 10, minHeight: 44 }}>
            <Text style={{ fontWeight: '600', color: c.tx }}>{p.name}</Text>
            <Text style={{ color: c.tx2, fontSize: 13 }}>{p.note}</Text>
          </Pressable>
        );
      })}
      <TextInput accessibilityLabel="Demo password" value={password} onChangeText={setPassword} onSubmitEditing={go} secureTextEntry
        placeholder="Demo password" placeholderTextColor={c.tx3}
        style={{ height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.bdS, color: c.tx, paddingHorizontal: 14, fontSize: 16 }} />
      {error ? <Text style={{ color: c.tx2 }}>{error}</Text> : null}
      <Button label="Enter the demo" loading={busy} onPress={go} />
    </View>
  );
}
