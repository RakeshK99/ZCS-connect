import { isParent } from '@zcs/core';
import { Redirect, router } from 'expo-router';
import { CircleCheck, Users } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, Card, H, T } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { font } from '@/theme/tokens';

export default function Found() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { linked } = useSession();
  const parent = linked?.contexts.find(isParent);
  if (!linked) return <Redirect href="/" />;
  if (!parent) return <Redirect href="/notify" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 56, paddingHorizontal: 24, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' }}>
          <Users size={28} color={c.link} />
        </View>
        <H>We found your children</H>
        <T tone="tx2" style={{ marginBottom: 8 }}>{linked.person.first_name}, these students are linked to your email on the ZCS roster.</T>
        {parent.children.map((k) => (
          <Card key={k.id} style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar text={k.name[0]} size={52} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: font.heading, fontSize: 19 }}>{k.name} {k.last_name}</T>
              <T tone="tx2" size={15}>{[k.grade, k.teacher].filter(Boolean).join(' · ')}</T>
            </View>
            <CircleCheck size={24} color={c.ok} />
          </Card>
        ))}
        <View style={{ flex: 1, minHeight: 24 }} />
        <Button label="Yes, that's my family" height={56} onPress={() => router.replace('/notify')} />
        <Button label="Someone is missing or wrong" variant="ghost" onPress={() => router.push({ pathname: '/not-found', params: { linked: '1' } })} />
      </ScrollView>
    </View>
  );
}
