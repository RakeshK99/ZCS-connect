// Teachers add a field trip, theme day or other class event. Only that class's
// families and staff see it (enforced by upsert_class_event and calendar RLS).
import { useQueryClient } from '@tanstack/react-query';
import { api, isStaff, isoDay, parseIsoDay, parseTimeInput, timeOfDay, type CalendarEvent } from '@zcs/core';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, H, IconButton, SectionLabel, Toggle } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useLinked } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';

const shift = (day: string, n: number) => { const d = parseIsoDay(day); d.setDate(d.getDate() + n); return isoDay(d); };
const hm = (t: string | null | undefined) => (t ? timeOfDay(t) : '');

export default function ClassEvent() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const { context } = useLinked();
  const params = useLocalSearchParams<{ date?: string; event?: string }>();
  const editing = params.event ? (JSON.parse(params.event) as CalendarEvent & { class_id?: string }) : null;
  const staff = isStaff(context) ? context : null;
  const classes = staff?.classes ?? [];

  const [classId, setClassId] = useState(editing?.class_id ?? classes[0]?.id ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [day, setDay] = useState(editing?.starts_on ?? params.date ?? isoDay(new Date()));
  const [allDay, setAllDay] = useState(editing ? !editing.start_time : false);
  const [start, setStart] = useState(hm(editing?.start_time) || '9:00 AM');
  const [end, setEnd] = useState(hm(editing?.end_time));
  const [location, setLocation] = useState(editing?.location ?? '');
  const [busy, setBusy] = useState(false);

  if (!staff || !classes.length) return <Redirect href="/calendar" />;

  const save = async () => {
    if (!title.trim()) return Alert.alert('Class event', 'Give the event a name, like "Field trip to the Outdoor Discovery Center".');
    const startT = allDay ? null : parseTimeInput(start);
    const endT = allDay || !end.trim() ? null : parseTimeInput(end);
    if (!allDay && !startT) return Alert.alert('Class event', 'Enter a start time like 9:00 AM, or turn on All day.');
    if (!allDay && end.trim() && !endT) return Alert.alert('Class event', 'Enter an end time like 11:30 AM, or leave it blank.');
    try {
      setBusy(true);
      await api.saveClassEvent(supabase, { id: editing?.id, classId, title: title.trim(), startsOn: day, startTime: startT, endTime: endT, location });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      toast(editing ? 'Event updated' : `Added to ${classes.find((k) => k.id === classId)?.code ?? 'your class'} calendar`);
      router.back();
    } catch (e) {
      Alert.alert('Class event', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = { height: 50, borderRadius: 12, borderWidth: 1, borderColor: c.bdS, backgroundColor: c.sf, color: c.tx, paddingHorizontal: 14, fontSize: 17 } as const;
  const label = parseIsoDay(day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16 }}>
        <H size={24}>{editing ? 'Edit class event' : 'Add class event'}</H>
        <IconButton icon={X} label="Close" color={c.tx2} onPress={() => router.back()} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
        <SectionLabel>Class</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {classes.map((k) => <Chip key={k.id} label={`${k.code} · ${k.name}`} active={classId === k.id} onPress={() => setClassId(k.id)} />)}
        </View>
        <Text style={{ fontSize: 13, color: c.tx2, marginTop: 8 }}>Only families in this class will see it.</Text>

        <SectionLabel>What</SectionLabel>
        <TextInput value={title} onChangeText={setTitle} placeholder="Field trip, apple day, class party…" placeholderTextColor={c.tx3}
          accessibilityLabel="Event name" maxLength={120} style={field} />

        <SectionLabel>When</SectionLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.sf, borderWidth: 1, borderColor: c.bdS, borderRadius: 12, paddingHorizontal: 4 }}>
          <IconButton icon={ChevronLeft} label="Day before" onPress={() => setDay(shift(day, -1))} />
          <Text accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: c.tx }}>{label}</Text>
          <IconButton icon={ChevronRight} label="Day after" onPress={() => setDay(shift(day, 1))} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 }}>
          <Text style={{ fontSize: 16, color: c.tx }}>All day</Text>
          <Toggle on={allDay} label="All day" onPress={() => setAllDay((v) => !v)} />
        </View>
        {allDay ? null : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.tx2 }}>Starts</Text>
              <TextInput value={start} onChangeText={setStart} placeholder="9:00 AM" placeholderTextColor={c.tx3} accessibilityLabel="Start time" style={field} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.tx2 }}>Ends (optional)</Text>
              <TextInput value={end} onChangeText={setEnd} placeholder="11:30 AM" placeholderTextColor={c.tx3} accessibilityLabel="End time" style={field} />
            </View>
          </View>
        )}

        <SectionLabel>Where (optional)</SectionLabel>
        <TextInput value={location} onChangeText={setLocation} placeholder="Outdoor Discovery Center" placeholderTextColor={c.tx3}
          accessibilityLabel="Location" maxLength={120} style={field} />

        <Button label={editing ? 'Save changes' : 'Add to calendar'} loading={busy} onPress={save} style={{ marginTop: 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
