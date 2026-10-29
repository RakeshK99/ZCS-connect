import { api, isStaff, isoDay, parseIsoDay, timeOfDay, type CalendarEvent } from '@zcs/core';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, IconButton, ScreenTitle, SectionLabel, Segmented } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { addToPhoneCalendar } from '@/features/calendar/addToCalendar';
import { useCalendar } from '@/lib/hooks';
import { useLinked } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { font } from '@/theme/tokens';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function occursOn(e: CalendarEvent, day: string) {
  return e.starts_on <= day && (e.ends_on ?? e.starts_on) >= day;
}

function eventSub(e: CalendarEvent) {
  if (e.no_school) return 'All ZCS buildings';
  const t = e.start_time ? `${timeOfDay(e.start_time)}${e.end_time ? ` – ${timeOfDay(e.end_time)}` : ''}` : 'All day';
  return e.location ? `${t} · ${e.location}` : t;
}

function dayHeading(day: string, today: string) {
  const d = parseIsoDay(day);
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  return day === today ? `Today · ${label}` : label;
}

export default function CalendarScreen() {
  const { c, strong, strongTx } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const today = isoDay(new Date());
  const [view, setView] = useState<'month' | 'agenda'>('month');
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState(today);
  const qc = useQueryClient();
  const { linked, context } = useLinked();
  const myClasses = isStaff(context) ? context.classes : [];
  const classOf = (e: CalendarEvent) => myClasses.find((k) => e.audience_label?.startsWith(`${k.code} · `));
  const canEdit = (e: CalendarEvent) => !!e.audience_label && (e.created_by === linked.person.id || !!classOf(e));

  const manage = (e: CalendarEvent) => Alert.alert(e.title, e.audience_label ?? undefined, [
    { text: 'Edit', onPress: () => router.push({ pathname: '/class-event', params: { event: JSON.stringify({ ...e, class_id: classOf(e)?.id }) } }) },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await api.deleteClassEvent(supabase, e.id); qc.invalidateQueries({ queryKey: ['calendar'] }); toast('Event deleted'); }
      catch (err) { Alert.alert('Class event', (err as Error).message); }
    } },
    { text: 'Cancel', style: 'cancel' },
  ]);

  const from = view === 'month' ? month : new Date();
  const to = view === 'month' ? new Date(month.getFullYear(), month.getMonth() + 1, 0) : new Date(Date.now() + 120 * 86_400_000);
  const events = useCalendar(from, to).data ?? [];

  const cells = useMemo(() => {
    const first = month.getDay();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array.from({ length: first }, () => null), ...Array.from({ length: days }, (_, i) => isoDay(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  }, [month]);

  const add = async (e: CalendarEvent) => {
    try {
      if (await addToPhoneCalendar(e)) toast(`"${e.title}" added to your calendar`);
      else Alert.alert('Calendar', 'Allow calendar access in Settings to add school events.');
    } catch (err) {
      Alert.alert('Calendar', (err as Error).message);
    }
  };

  const agendaDays = view === 'month' ? [selected]
    : Array.from(new Set(events.flatMap((e) => {
        const out: string[] = [];
        for (let d = parseIsoDay(e.starts_on < today ? today : e.starts_on); isoDay(d) <= (e.ends_on ?? e.starts_on); d.setDate(d.getDate() + 1)) out.push(isoDay(d));
        return out;
      }))).sort();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: 10 }}>
        <View style={{ alignItems: 'flex-end', minHeight: 44, justifyContent: 'center' }}>
          <Pressable accessibilityRole="button" onPress={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(today); setView('month'); }}
            style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }}>
            <Text style={{ color: c.link, fontSize: 17 }}>Today</Text>
          </Pressable>
        </View>
        <ScreenTitle>Calendar</ScreenTitle>
        <View style={{ marginTop: 12 }}>
          <Segmented value={view} onChange={setView} options={[{ id: 'month', label: 'Month' }, { id: 'agenda', label: 'Agenda' }]} />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 110 }}>
        {view === 'month' ? (
          <View style={{ backgroundColor: c.sf, borderWidth: 1, borderColor: c.bd, borderRadius: 18, paddingTop: 12, paddingHorizontal: 10, paddingBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 8 }}>
              <IconButton icon={ChevronLeft} label="Previous month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
              <Text accessibilityRole="header" style={{ fontFamily: font.heading, fontSize: 18, color: c.tx }}>
                {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <IconButton icon={ChevronRight} label="Next month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
            </View>
            <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
              {DOW.map((d, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: c.tx3 }}>{d}</Text>)}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 }}>
              {cells.map((day, i) => {
                if (!day) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 46 }} />;
                const evs = events.filter((e) => occursOn(e, day));
                const noSchool = evs.some((e) => e.no_school);
                const hasEvent = evs.some((e) => !e.no_school);
                const isToday = day === today, isSel = day === selected;
                const wk = [0, 6].includes(parseIsoDay(day).getDay());
                const n = Number(day.slice(8));
                return (
                  <Pressable key={day} onPress={() => setSelected(day)} accessibilityRole="button" accessibilityState={{ selected: isSel }}
                    accessibilityLabel={`${parseIsoDay(day).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${noSchool ? ', no school' : ''}${evs.length ? `, ${evs.length} events` : ''}`}
                    style={{ width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 10, backgroundColor: noSchool ? c.sf2 : 'transparent' }}>
                    <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? strong : 'transparent',
                      borderWidth: isSel && !isToday ? 2 : 0, borderColor: strong }}>
                      <Text style={{ fontSize: 15, fontWeight: isToday || isSel ? '700' : '400', color: isToday ? strongTx : wk ? c.tx3 : c.tx, textDecorationLine: noSchool ? 'line-through' : 'none' }}>{n}</Text>
                    </View>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: hasEvent && !isToday ? c.link : 'transparent' }} />
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 16, paddingTop: 10, paddingHorizontal: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.link }} /><Text style={{ fontSize: 12, color: c.tx2 }}>Event</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 14, height: 10, borderRadius: 3, backgroundColor: c.sf2, borderWidth: 1, borderColor: c.bd }} /><Text style={{ fontSize: 12, color: c.tx2 }}>No school</Text></View>
            </View>
          </View>
        ) : null}

        {myClasses.length ? (
          <Button label={view === 'month' ? `Add class event on ${parseIsoDay(selected).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Add class event'}
            icon={Plus} variant="secondary" height={48} style={{ marginTop: 14 }}
            onPress={() => router.push({ pathname: '/class-event', params: { date: view === 'month' ? selected : today } })} />
        ) : null}

        {agendaDays.map((day) => {
          const evs = events.filter((e) => occursOn(e, day));
          return (
            <View key={day}>
              <SectionLabel>{dayHeading(day, today)}</SectionLabel>
              {evs.length === 0 ? (
                <View style={{ backgroundColor: c.sf, borderWidth: 1, borderColor: c.bd, borderRadius: 14, padding: 18, alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, color: c.tx2 }}>Nothing on the calendar this day.</Text>
                </View>
              ) : evs.map((e) => (
                <Pressable key={e.id} disabled={!canEdit(e)} onPress={() => manage(e)} accessibilityRole={canEdit(e) ? 'button' : undefined}
                  accessibilityHint={canEdit(e) ? 'Edit or delete this class event' : undefined}
                  style={{ backgroundColor: c.sf, borderWidth: 1, borderColor: c.bd, borderRadius: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingVertical: 10, paddingLeft: 14, paddingRight: 8, minHeight: 60 }}>
                  <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: e.no_school ? c.bdS : strong }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: c.tx }}>{e.title.replace(/^No school · /, '')}</Text>
                    <Text style={{ fontSize: 13, color: c.tx2, marginTop: 2 }}>{eventSub(e)}</Text>
                    {e.audience_label ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Users size={12} color={c.link} />
                        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: c.link, flexShrink: 1 }}>{e.audience_label}</Text>
                      </View>
                    ) : null}
                  </View>
                  {e.no_school ? (
                    <View style={{ backgroundColor: c.sf2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: c.tx }}>No school</Text>
                    </View>
                  ) : null}
                  <IconButton icon={CalendarPlus} label={`Add ${e.title} to phone calendar`} bg={c.tint} size={19} onPress={() => add(e)} />
                </Pressable>
              ))}
            </View>
          );
        })}
        {view === 'agenda' && agendaDays.length === 0 ? (
          <Text style={{ textAlign: 'center', color: c.tx2, paddingTop: 30 }}>No upcoming events.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
