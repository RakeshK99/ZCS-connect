// A teacher adds a student who is already on the school's list to one of their
// classes (mid-semester changes). Only names and grades are searchable here;
// families are linked by the office, never by teachers.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, initials, isStaff } from '@zcs/core';
import { router, useLocalSearchParams } from 'expo-router';
import { Search, UserPlus, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Avatar, EmptyState, Group, H, IconButton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { keys } from '@/lib/hooks';
import { useLinked } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';

export default function RosterAdd() {
  const { c } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { classId } = useLocalSearchParams<{ classId: string }>();
  const { context } = useLinked();
  const cls = isStaff(context) ? context.classes.find((k) => k.id === classId) : undefined;
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const term = q.trim();
  const results = useQuery({
    queryKey: ['candidates', classId, term],
    queryFn: () => api.classStudentCandidates(supabase, classId, term),
    enabled: term.length >= 2,
  });

  const add = async (studentId: string, name: string) => {
    try {
      setBusy(studentId);
      await api.classAddStudent(supabase, classId, studentId);
      qc.invalidateQueries({ queryKey: keys.roster(classId) });
      qc.invalidateQueries({ queryKey: ['candidates', classId] });
      toast(`${name} added to ${cls?.code ?? 'your class'}`);
    } catch (e) {
      Alert.alert('Class list', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16 }}>
        <H size={24}>Add to {cls?.code ?? 'class'}</H>
        <IconButton icon={X} label="Close" color={c.tx2} onPress={() => router.back()} />
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
        <View style={{ height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.bdS, backgroundColor: c.sf, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
          <Search size={18} color={c.tx3} />
          <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Student's first or last name" placeholderTextColor={c.tx3}
            accessibilityLabel="Search students" autoCorrect={false} style={{ flex: 1, fontSize: 17, color: c.tx }} />
        </View>
        <Text style={{ fontSize: 13, color: c.tx2 }}>
          Students already on the school&apos;s list. New students and family contacts are added by the office.
        </Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {results.isFetching ? <ActivityIndicator color={c.link} /> : null}
        {term.length >= 2 && results.data?.length === 0 ? (
          <EmptyState icon={Search} title="No students found" body="Check the spelling, or ask the office if the student is new to ZCS." />
        ) : null}
        {results.data?.length ? (
          <Group>
            {results.data.map((s, i) => (
              <Pressable key={s.student_id} accessibilityRole="button" accessibilityLabel={`Add ${s.name}`} disabled={busy === s.student_id}
                onPress={() => add(s.student_id, s.name)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 56,
                  borderBottomWidth: i === results.data.length - 1 ? 0 : 1, borderBottomColor: c.bd }}>
                <Avatar text={initials(s.name)} size={36} tone="tint" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: c.tx }}>{s.name}</Text>
                  {s.grade ? <Text style={{ fontSize: 13, color: c.tx2 }}>{s.grade}</Text> : null}
                </View>
                {busy === s.student_id ? <ActivityIndicator color={c.link} /> : <UserPlus size={20} color={c.link} />}
              </Pressable>
            ))}
          </Group>
        ) : null}
      </ScrollView>
    </View>
  );
}
