import { isStaff, relativeTime } from '@zcs/core';
import { router } from 'expo-router';
import { ChevronRight, SquarePen, Users } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, EmptyState, ScreenTitle } from '@/components/ui';
import { useLinked } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { font } from '@/theme/tokens';

export default function Classes() {
  const { c, strong, strongTx, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { context } = useLinked();
  const classes = isStaff(context) ? context.classes : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: insets.bottom + 120 }}>
        <View style={{ alignItems: 'flex-end', minHeight: 44, justifyContent: 'center' }}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/compose')} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 }}>
            <SquarePen size={20} color={c.link} />
            <Text style={{ color: c.link, fontSize: 17, fontWeight: '600' }}>New post</Text>
          </Pressable>
        </View>
        <ScreenTitle style={{ marginBottom: 14 }}>Classes</ScreenTitle>
        {classes.length === 0 ? <EmptyState icon={Users} title="No classes yet" body="The office assigns classes and groups at the start of each term." /> : null}
        <View style={{ gap: 10 }}>
          {classes.map((k, i) => (
            <Card key={k.id} onPress={() => router.push(`/roster/${k.id}`)} accessibilityLabel={`${k.name}, ${k.families} students`}
              style={{ padding: 14, flexDirection: 'row', gap: 14, alignItems: 'center', minHeight: 72 }}>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: i === 0 ? strong : c.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: font.heading, fontSize: 16, color: i === 0 ? (isDark ? strongTx : '#F1C400') : c.link }}>{k.code}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.heading, fontSize: 17, color: c.tx }}>{k.name}</Text>
                <Text style={{ fontSize: 13, color: c.tx2, marginTop: 2 }}>
                  {k.kind === 'class' ? 'Class' : 'Group'} · {k.families} {k.kind === 'class' ? 'students' : 'families'}{k.last_post_at ? ` · last post ${relativeTime(k.last_post_at)}` : ''}
                </Text>
              </View>
              <ChevronRight size={18} color={c.tx3} />
            </Card>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
