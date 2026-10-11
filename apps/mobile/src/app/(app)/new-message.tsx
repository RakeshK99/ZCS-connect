import { useQuery } from '@tanstack/react-query';
import { api, initials, isParent, isStaff } from '@zcs/core';
import { router } from 'expo-router';
import { MessageCircle, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { Avatar, Chip, EmptyState, Group, H, IconButton, Row, SectionLabel } from '@/components/ui';
import { useContacts } from '@/lib/hooks';
import { useLinked } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';

/** Start (or reopen) a conversation about a specific child. */
export default function NewMessage() {
  const { c } = useTheme();
  const { context } = useLinked();
  const parent = isParent(context) ? context : null;
  const staff = isStaff(context) ? context : null;
  const [studentId, setStudentId] = useState<string | null>(parent?.children[0]?.id ?? null);
  const [classId, setClassId] = useState<string | null>(staff?.classes[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);

  const roster = useQuery({ queryKey: ['roster', classId], queryFn: () => api.classRoster(supabase, classId!), enabled: !!staff && !!classId });
  const contacts = useContacts(studentId, context.key);

  const start = async (personId: string) => {
    if (!studentId) return;
    try {
      setBusy(personId);
      const threadId = await api.startThread(supabase, studentId, personId, context.key);
      router.replace(`/thread/${threadId}`);
    } catch (e) {
      Alert.alert('Message', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16 }}>
        <H size={24}>New message</H>
        <IconButton icon={X} label="Close" color={c.tx2} onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {parent ? (
          <>
            <SectionLabel>About</SectionLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {parent.children.map((k) => <Chip key={k.id} label={`${k.name} · ${k.grade ?? ''}`} active={studentId === k.id} onPress={() => setStudentId(k.id)} />)}
            </View>
          </>
        ) : null}
        {staff ? (
          <>
            <SectionLabel>Class</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {staff.classes.map((k) => <Chip key={k.id} label={k.code} active={classId === k.id} onPress={() => { setClassId(k.id); setStudentId(null); }} />)}
            </ScrollView>
            <SectionLabel>Student</SectionLabel>
            {roster.isLoading ? <ActivityIndicator color={c.link} /> : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(roster.data ?? []).map((s) => <Chip key={s.student_id} label={s.name} active={studentId === s.student_id} onPress={() => setStudentId(s.student_id)} />)}
              </View>
            )}
          </>
        ) : null}

        {studentId ? (
          <>
            <SectionLabel>{parent ? `${parent.children.find((k) => k.id === studentId)?.name}'s teachers` : 'Family'}</SectionLabel>
            {contacts.isLoading ? <ActivityIndicator color={c.link} /> : (contacts.data ?? []).length === 0 ? (
              <EmptyState icon={MessageCircle} title="No one to message yet" body="When classes are set up for the year, teachers appear here." />
            ) : (
              <Group>
                {(contacts.data ?? []).map((p, i, arr) => (
                  <Row key={p.person_id} last={i === arr.length - 1} onPress={() => start(p.person_id)} accessibilityLabel={`Message ${p.name}, ${p.role}`}>
                    <Avatar text={initials(p.name)} size={40} tone="tint" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: c.tx }}>{p.name}</Text>
                      <Text style={{ fontSize: 13, color: c.tx2 }}>{p.role}</Text>
                    </View>
                    {busy === p.person_id ? <ActivityIndicator color={c.link} /> : (
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.tint, alignItems: 'center', justifyContent: 'center' }}>
                        <MessageCircle size={20} color={c.link} />
                      </View>
                    )}
                  </Row>
                ))}
              </Group>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
