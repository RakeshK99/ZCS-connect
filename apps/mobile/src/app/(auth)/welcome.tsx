import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { ZcsIcon } from '@/components/ZcsIcon';
import { staffSignIn } from '@/lib/staff';
import { font, MAIZE, NAVY } from '@/theme/tokens';

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: NAVY, paddingTop: insets.top + 42, paddingBottom: insets.bottom + 24, paddingHorizontal: 28 }}>
      <View style={{ flex: 1, gap: 20 }}>
        <View style={{ padding: 22, marginLeft: -22, alignSelf: 'flex-start' }}><ZcsIcon size={88} /></View>
        <Text style={{ fontFamily: font.heading, fontSize: 13, letterSpacing: 1.6, color: MAIZE }}>ZCS BURNS BRIGHT</Text>
        <Text accessibilityRole="header" style={{ fontFamily: font.heading, fontSize: 34, lineHeight: 38, color: '#fff' }}>Stay close to every school day.</Text>
        <Text style={{ fontSize: 17, lineHeight: 25, color: 'rgba(255,255,255,0.82)' }}>
          Announcements, messages from teachers and the school calendar from Zeeland Christian School, in one place.
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        <Button label="Get started" variant="maize" height={56} onPress={() => router.push('/sign-in')} />
        <Button label="I work at ZCS" variant="onNavy" height={56} loading={busy} onPress={() => staffSignIn(setBusy)} />
        <Text style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>Preschool – 8th grade · Zeeland, Michigan</Text>
      </View>
    </View>
  );
}
