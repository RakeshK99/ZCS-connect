import { api, initials, isStaff } from '@zcs/core';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { EyeOff, MessageCircle, Phone, SquarePen } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, BackButton, Button, Group, H, NavBar, Skeleton } from '@/components/ui';
import { useRoster } from '@/lib/hooks';
import { useLinked } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';

export default function Roster() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { context } = useLinked();
  const cls = isStaff(context) ? context.classes.find((k) => k.id === id) : undefined;
  const roster = useRoster(id);
  const [open, setOpen] = useState<string | null>(null);
  const students = roster.data ?? [];
  const families = new Set(students.flatMap((s) => s.guardians.map((g) => g.person_id))).size;

  const message = async (studentId: string, personId: string) => {
    try {
      const thread = await api.startThread(supabase, studentId, personId, 'staff');
      router.push(`/thread/${thread}`);
    } catch (e) {
      Alert.alert('Message', (e as Error).message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <NavBar left={<BackButton label="Classes" onPress={() => router.back()} />} />
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>
        <H size={28}>{cls?.name ?? 'Class'}</H>
        <Text style={{ fontSize: 14, color: c.tx2 }}>{cls?.code} · {students.length} students · {families} family contacts</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <Button label="Post to class" icon={SquarePen} height={44} style={{ flex: 1 }} onPress={() => router.push({ pathname: '/compose', params: { classId: id } })} />
          <Button label="Messages" icon={MessageCircle} variant="secondary" height={44} style={{ flex: 1 }} onPress={() => router.push('/messages')} />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
        <Text style={{ fontSize: 13, color: c.tx2, paddingHorizontal: 4, paddingBottom: 8 }}>Tap a student to see family contacts</Text>
        <Group>
          {roster.isLoading ? [1, 2, 3, 4].map((k) => (
            <View key={k} style={{ flexDirection: 'row', gap: 12, padding: 14, alignItems: 'center' }}>
              <Skeleton w={36} h={36} r={18} /><View style={{ flex: 1, gap: 6 }}><Skeleton w="50%" /><Skeleton w="70%" h={10} tone={1} /></View>
            </View>
          )) : null}
          {students.map((s, i) => {
            const expanded = open === s.student_id;
            const noApp = s.guardians.length > 0 && s.guardians.every((g) => !g.has_app);
            return (
              <View key={s.student_id} style={{ borderBottomWidth: i === students.length - 1 ? 0 : 1, borderBottomColor: c.bd }}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen(expanded ? null : s.student_id)}
                  style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, minHeight: 60 }}>
                  <Avatar text={initials(s.name)} size={36} tone="tint" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: c.tx }}>{s.name}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 13, color: c.tx2 }}>{s.guardians.map((g) => g.name).join(' & ') || 'No family contacts on file'}</Text>
                  </View>
                  {noApp ? (
                    <View style={{ backgroundColor: c.sf2, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: c.tx }}>Email only</Text>
                    </View>
                  ) : null}
                </Pressable>
                {expanded ? (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 8 }}>
                    {s.guardians.map((g) => (
                      <View key={g.person_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.bg, borderRadius: 12, padding: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: c.tx }}>{g.name}</Text>
                          {g.contact_hidden ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><EyeOff size={12} color={c.tx2} /><Text style={{ fontSize: 12, color: c.tx2 }}>Contact details hidden by the office</Text></View>
                          ) : <Text style={{ fontSize: 13, color: c.tx2 }}>{g.email}{g.phone ? ` · ${g.phone}` : ''}</Text>}
                        </View>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Message ${g.name}`} onPress={() => message(s.student_id, g.person_id)}
                          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.pri, alignItems: 'center', justifyContent: 'center' }}>
                          <MessageCircle size={18} color={c.priTx} />
                        </Pressable>
                        {g.phone ? (
                          <Pressable accessibilityRole="button" accessibilityLabel={`Call ${g.name}`} onPress={() => Linking.openURL(`tel:${g.phone}`)}
                            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' }}>
                            <Phone size={18} color={c.link} />
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Group>
      </ScrollView>
    </View>
  );
}
