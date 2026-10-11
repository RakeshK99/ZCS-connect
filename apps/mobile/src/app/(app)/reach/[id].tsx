import { api, clockTime, initials } from '@zcs/core';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheck } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/components/Toast';
import { Avatar, Group, NavBar, Row, SectionLabel, Skeleton } from '@/components/ui';
import { ReachBar } from '@/features/feed/PostCard';
import { useReach } from '@/lib/hooks';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { font } from '@/theme/tokens';

function LiveDot() {
  const { c } = useTheme();
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 0.4, duration: 800, useNativeDriver: true }), Animated.timing(o, { toValue: 1, duration: 800, useNativeDriver: true })]));
    l.start();
    return () => l.stop();
  }, [o]);
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.ok, opacity: o }} />;
}

export default function Reach() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [live, setLive] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLive(false), 3 * 60_000); return () => clearTimeout(t); }, []);
  const { data } = useReach(id, live);

  const remind = async (studentIds: string[], label: string) => {
    try {
      await api.remindFamilies(supabase, id, studentIds);
      toast(`Reminder emailed to the ${label}`);
    } catch (e) {
      Alert.alert('Remind', (e as Error).message);
    }
  };

  const s = data?.summary;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <NavBar right={
        <Pressable accessibilityRole="button" onPress={() => router.replace('/home')} style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }}>
          <Text style={{ color: c.link, fontSize: 17, fontWeight: '700' }}>Done</Text>
        </Pressable>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 14 }}>
        {!data || !s ? (
          <View style={{ gap: 12 }}><Skeleton w="50%" h={16} /><Skeleton w="90%" h={26} /><Skeleton h={160} r={18} tone={1} /></View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CircleCheck size={20} color={c.ok} />
              <Text style={{ color: c.ok, fontWeight: '600', fontSize: 15 }}>
                Posted to {data.post.audience_label}{data.post.sent_at ? ` · ${clockTime(data.post.sent_at)}` : ''}
              </Text>
            </View>
            <Text accessibilityRole="header" style={{ fontFamily: font.heading, fontSize: 26, lineHeight: 31, color: c.tx }}>{data.post.title}</Text>
            <View style={{ backgroundColor: c.sf, borderWidth: 1, borderColor: c.bd, borderRadius: 18, padding: 16, gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.tx2, textTransform: 'uppercase', letterSpacing: 0.65 }}>Reach</Text>
                {live ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><LiveDot /><Text style={{ fontSize: 12, color: c.tx2 }}>Live</Text></View> : null}
              </View>
              <Text style={{ fontFamily: font.heading, fontSize: 22, lineHeight: 28, color: c.tx }}>
                {s.reached} of {s.families} families reached<Text style={{ color: c.tx2, fontFamily: font.headingSemi }}> · {s.read} read</Text>
              </Text>
              <ReachBar reached={s.reached} read={s.read} families={s.families} height={14} />
              <View style={{ flexDirection: 'row' }}>
                {[
                  { label: 'Read', n: s.read, sw: { backgroundColor: c.pri } },
                  { label: 'Delivered', n: s.reached - s.read, sw: { backgroundColor: c.pri, opacity: 0.35 } },
                  { label: 'Not reached', n: s.families - s.reached, sw: { backgroundColor: c.sf2, borderWidth: 1, borderColor: c.bd } },
                ].map((k) => (
                  <View key={k.label} style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={[{ width: 10, height: 10, borderRadius: 3 }, k.sw]} />
                      <Text style={{ fontSize: 12, color: c.tx2 }}>{k.label}</Text>
                    </View>
                    <Text style={{ fontFamily: font.heading, fontSize: 20, color: c.tx }}>{k.n}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 13, color: c.tx2 }}>{data.by_channel.push} by push notification · {data.by_channel.email} by email</Text>
              {data.post.require_ack ? <Text style={{ fontSize: 13, color: c.tx2 }}>{s.acked} families confirmed they read it</Text> : null}
            </View>

            {data.not_reached.length ? (
              <>
                <SectionLabel style={{ paddingTop: 6, paddingBottom: 0 }}>Not reached yet ({data.not_reached.length})</SectionLabel>
                <Group>
                  {data.not_reached.map((f, i) => (
                    <Row key={f.student_id} last={i === data.not_reached.length - 1}>
                      <Avatar text={initials(f.family)} size={36} tone="neutral" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: c.tx }}>{f.family}</Text>
                        <Text style={{ fontSize: 13, color: c.tx2 }}>{f.child} · {f.reason}</Text>
                      </View>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Remind the ${f.family}`} onPress={() => remind([f.student_id], f.family)}
                        style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: c.bdS, justifyContent: 'center' }}>
                        <Text style={{ color: c.link, fontSize: 14, fontWeight: '600' }}>Remind</Text>
                      </Pressable>
                    </Row>
                  ))}
                </Group>
              </>
            ) : null}

            {data.unread.length ? (
              <>
                <SectionLabel style={{ paddingTop: 6, paddingBottom: 0 }}>Delivered, not read yet ({data.unread.length})</SectionLabel>
                <Group>
                  {data.unread.map((f, i) => (
                    <Row key={f.student_id} last={i === data.unread.length - 1} style={{ minHeight: 52 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: c.tx }}>{f.family}</Text>
                        <Text style={{ fontSize: 13, color: c.tx2 }}>{f.child}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: c.tx3 }}>{f.via}</Text>
                    </Row>
                  ))}
                </Group>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
