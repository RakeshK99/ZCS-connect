import { api, isParent, timeOfDay, type NotificationPrefs } from '@zcs/core';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Calendar, Check, ChevronRight, CircleHelp, Compass, Languages, MessageCircle, Moon, Newspaper, Pin, Repeat, Siren, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Avatar, Group, H, Row, ScreenTitle, SectionLabel, Toggle } from '@/components/ui';
import { useRoleSwitcher } from '@/features/roles/RoleSwitcher';
import { usePrefs } from '@/lib/hooks';
import { useLinked } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { font } from '@/theme/tokens';

const QUIET: { label: string; start: string | null; end: string | null }[] = [
  { label: 'Off', start: null, end: null },
  { label: '8:00 PM – 7:00 AM', start: '20:00:00', end: '07:00:00' },
  { label: '9:00 PM – 6:30 AM', start: '21:00:00', end: '06:30:00' },
  { label: '10:00 PM – 7:00 AM', start: '22:00:00', end: '07:00:00' },
];

function ToggleRow({ icon: Icon, label, sub, on, locked, onPress, last }: { icon: LucideIcon; label: string; sub?: string; on: boolean; locked?: boolean; onPress: () => void; last?: boolean }) {
  const { c } = useTheme();
  return (
    <Row last={last} onPress={onPress} accessibilityRole="switch" accessibilityLabel={label}>
      <Icon size={20} color={c.link} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, color: c.tx }}>{label}</Text>
        {sub ? <Text style={{ fontSize: 13, color: c.tx2 }}>{sub}</Text> : null}
      </View>
      <Toggle on={on} locked={locked} onPress={onPress} label={label} />
    </Row>
  );
}

export default function Profile() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const switcher = useRoleSwitcher();
  const { linked, context, signOut } = useLinked();
  const { prefs, save } = usePrefs(linked.person.id, context.key);
  const [quietOpen, setQuietOpen] = useState(false);
  const parentCtx = linked.contexts.find(isParent);
  const multi = linked.contexts.length > 1;

  const set = (patch: Partial<NotificationPrefs>) => prefs && save({ ...prefs, ...patch });
  const quietLabel = prefs?.quiet_start && prefs.quiet_end ? `${timeOfDay(prefs.quiet_start)} – ${timeOfDay(prefs.quiet_end)}` : 'Off';

  const confirmDelete = () => Alert.alert(
    'Delete your account?',
    'This deletes your ZCS Connect account: your sign-in, devices, notification settings and read history. The school keeps the contact details it has on file for your family and its own records, such as your messages with teachers. You can sign in again later with the same email.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: async () => {
        try { await api.deleteMyAccount(supabase); } catch (e) { return Alert.alert('Delete account', (e as Error).message); }
        await signOut();
        router.replace('/welcome');
      } },
    ],
  );

  const contactOffice = () => {
    const subject = encodeURIComponent('ZCS Connect help');
    Linking.openURL(`mailto:office@zcs.org?subject=${subject}`).catch(() => Alert.alert('Help', 'Email the ZCS office at office@zcs.org.'));
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 44, paddingHorizontal: 16, paddingBottom: insets.bottom + 120 }}>
        <ScreenTitle style={{ marginBottom: 14 }}>Profile</ScreenTitle>
        <View style={{ backgroundColor: c.sf, borderWidth: 1, borderColor: c.bd, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Avatar text={linked.person.full_name.split(' ').map((w) => w[0]).join('').slice(0, 2)} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.heading, fontSize: 19, color: c.tx }}>{linked.person.full_name}</Text>
            <Text style={{ fontSize: 14, color: c.tx2 }}>{linked.person.email}</Text>
            <Text style={{ fontSize: 13, color: c.tx2, marginTop: 2 }}>{context.label}</Text>
          </View>
        </View>
        {multi ? (
          <Group style={{ marginTop: 12 }}>
            <Row last onPress={switcher.open}>
              <Repeat size={20} color={c.link} />
              <Text style={{ flex: 1, fontSize: 16, color: c.tx }}>Switch role</Text>
              <ChevronRight size={18} color={c.tx3} />
            </Row>
          </Group>
        ) : null}

        {parentCtx ? (
          <>
            <SectionLabel>{context.key === 'staff' ? 'Your children (Parent role)' : 'Your children'}</SectionLabel>
            <Group>
              {parentCtx.children.map((k, i) => (
                <Row key={k.id} last={i === parentCtx.children.length - 1}>
                  <Avatar text={k.name[0]} size={36} tone="tint" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: c.tx }}>{k.name} {k.last_name}</Text>
                    <Text style={{ fontSize: 13, color: c.tx2 }}>{[k.grade, k.teacher].filter(Boolean).join(' · ')}</Text>
                  </View>
                </Row>
              ))}
            </Group>
            <Text style={{ fontSize: 13, lineHeight: 18, color: c.tx2, paddingTop: 8, paddingHorizontal: 6 }}>Children come from the school roster. If something looks wrong, contact the office.</Text>
          </>
        ) : null}

        <SectionLabel>Notifications{multi ? ` · ${context.key === 'staff' ? 'Staff' : 'Parent'} role` : ''}</SectionLabel>
        <Group>
          <ToggleRow icon={Siren} label="Emergency alerts" sub="Always on" on locked onPress={() => toast('Emergency alerts stay on for everyone')} />
          <ToggleRow icon={Pin} label="Important announcements" on={prefs?.important ?? true} onPress={() => set({ important: !prefs?.important })} />
          <ToggleRow icon={Newspaper} label="Class posts" on={prefs?.class_posts ?? true} onPress={() => set({ class_posts: !prefs?.class_posts })} />
          <ToggleRow icon={MessageCircle} label="Messages" on={prefs?.messages ?? true} onPress={() => set({ messages: !prefs?.messages })} />
          <ToggleRow icon={Calendar} label="Calendar reminders" on={prefs?.calendar ?? false} onPress={() => set({ calendar: !prefs?.calendar })} />
          <Row last onPress={() => setQuietOpen(true)} accessibilityLabel={`Quiet hours, ${quietLabel}`}>
            <Moon size={20} color={c.link} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, color: c.tx }}>Quiet hours</Text>
              <Text style={{ fontSize: 13, color: c.tx2 }}>{quietLabel}</Text>
            </View>
            <ChevronRight size={18} color={c.tx3} />
          </Row>
        </Group>
        <Text style={{ fontSize: 13, lineHeight: 18, color: c.tx2, paddingTop: 8, paddingHorizontal: 6 }}>Emergency alerts always come through, even during quiet hours.</Text>

        <Group style={{ marginTop: 20 }}>
          <Row onPress={() => Alert.alert('Language', 'Translated posts and messages are coming in the next update. The office will share which languages are available.')}>
            <Languages size={20} color={c.link} />
            <Text style={{ flex: 1, fontSize: 16, color: c.tx }}>Language</Text>
            <Text style={{ fontSize: 15, color: c.tx2 }}>English</Text>
            <ChevronRight size={18} color={c.tx3} />
          </Row>
          <Row onPress={() => router.push('/tour')}>
            <Compass size={20} color={c.link} />
            <Text style={{ flex: 1, fontSize: 16, color: c.tx }}>Take the tour</Text>
            <ChevronRight size={18} color={c.tx3} />
          </Row>
          <Row last onPress={contactOffice}>
            <CircleHelp size={20} color={c.link} />
            <Text style={{ flex: 1, fontSize: 16, color: c.tx }}>Help and contact the office</Text>
            <ChevronRight size={18} color={c.tx3} />
          </Row>
        </Group>

        <Group style={{ marginTop: 20 }}>
          <Pressable accessibilityRole="button" onPress={async () => { await signOut(); router.replace('/welcome'); }}
            style={{ minHeight: 52, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: c.bd }}>
            <Text style={{ color: c.link, fontSize: 16, fontWeight: '600' }}>Sign out</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={confirmDelete} style={{ minHeight: 52, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: c.tx2, fontSize: 16 }}>Delete account</Text>
          </Pressable>
        </Group>
      </ScrollView>

      <Sheet visible={quietOpen} onClose={() => setQuietOpen(false)}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}>
          <H size={20} style={{ paddingHorizontal: 4, paddingBottom: 12 }}>Quiet hours</H>
          <Group>
            {QUIET.map((q, i) => {
              const active = (prefs?.quiet_start ?? null) === q.start && (prefs?.quiet_end ?? null) === q.end;
              return (
                <Row key={q.label} last={i === QUIET.length - 1} onPress={() => { set({ quiet_start: q.start, quiet_end: q.end }); setQuietOpen(false); }}>
                  <Text style={{ flex: 1, fontSize: 16, color: c.tx }}>{q.label}</Text>
                  {active ? <Check size={20} color={c.link} /> : null}
                </Row>
              );
            })}
          </Group>
        </View>
      </Sheet>
    </View>
  );
}
