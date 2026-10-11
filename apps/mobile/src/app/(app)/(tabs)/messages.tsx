import { childrenPossessive, initials, isParent, relativeTime, type ThreadSummary } from '@zcs/core';
import { router } from 'expo-router';
import { MessageCircle, ShieldCheck, SquarePen, WifiOff } from 'lucide-react-native';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, EmptyState, Group, IconButton, Notice, Row, ScreenTitle, SectionLabel, Skeleton } from '@/components/ui';
import { useThreads } from '@/lib/hooks';
import { useOnline } from '@/lib/query';
import { useLinked } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';

function ThreadRow({ t, last }: { t: ThreadSummary; last: boolean }) {
  const { c } = useTheme();
  return (
    <Row last={last} onPress={() => router.push(`/thread/${t.id}`)} style={{ minHeight: 68 }}
      accessibilityLabel={`${t.with}, ${t.with_sub}. ${t.last_message ?? ''}. ${relativeTime(t.last_message_at)}${t.unread ? ', unread' : ''}`}>
      <Avatar text={initials(t.with)} size={44} tone="tint" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: t.unread ? '700' : '600', color: c.tx, flexShrink: 1 }}>{t.with}</Text>
          <Text style={{ fontSize: 13, color: c.tx2 }}>{relativeTime(t.last_message_at)}</Text>
        </View>
        <Text numberOfLines={1} style={{ fontSize: 13, color: c.tx3 }}>{t.with_sub}</Text>
        <Text numberOfLines={1} style={{ fontSize: 14, color: c.tx2, marginTop: 2 }}>{t.last_message}</Text>
      </View>
      {t.unread ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.badge }} /> : null}
    </Row>
  );
}

export default function Messages() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const { context } = useLinked();
  const threads = useThreads(context.key);
  const list = threads.data ?? [];

  const groups: { label: string; items: ThreadSummary[] }[] = isParent(context)
    ? context.children.map((k) => ({ label: `${k.name} · ${k.grade ?? ''}`, items: list.filter((t) => t.student_id === k.id) })).filter((g) => g.items.length)
    : Object.values(list.reduce<Record<string, { label: string; items: ThreadSummary[] }>>((acc, t) => {
        (acc[t.student_id] ??= { label: t.student_name, items: [] }).items.push(t);
        return acc;
      }, {}));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={{ alignItems: 'flex-end', minHeight: 44, justifyContent: 'center' }}>
          <IconButton icon={SquarePen} label="New message" onPress={() => router.push('/new-message')} />
        </View>
        <ScreenTitle>Messages</ScreenTitle>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 110 }}
        refreshControl={<RefreshControl refreshing={threads.isRefetching} onRefresh={() => threads.refetch()} tintColor={c.tx2} />}>
        {!online ? <Notice icon={WifiOff} style={{ marginVertical: 8 }}>You're offline. New messages will send when you reconnect.</Notice> : null}
        {threads.isLoading && !threads.data ? (
          <Group style={{ marginTop: 20 }}>
            {[1, 2, 3].map((k) => (
              <Row key={k} last={k === 3}>
                <Skeleton w={44} h={44} r={22} />
                <View style={{ flex: 1, gap: 8 }}><Skeleton w="50%" h={13} /><Skeleton w="85%" h={10} tone={1} /></View>
              </Row>
            ))}
          </Group>
        ) : null}
        {!threads.isLoading && list.length === 0 ? (
          <EmptyState icon={MessageCircle} title="No messages yet"
            body={isParent(context) ? `You can message ${childrenPossessive(context)} teachers any time. They'll reply during school hours.` : 'Messages with families will show up here.'}
            action={<Button label={isParent(context) ? 'Message a teacher' : 'Message a family'} height={48} style={{ marginTop: 6 }} onPress={() => router.push('/new-message')} />} />
        ) : null}
        {groups.map((g) => (
          <View key={g.label}>
            <SectionLabel>{g.label}</SectionLabel>
            <Group>{g.items.map((t, i) => <ThreadRow key={t.id} t={t} last={i === g.items.length - 1} />)}</Group>
          </View>
        ))}
        {list.length ? (
          <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 16, paddingHorizontal: 6 }}>
            <ShieldCheck size={16} color={c.tx2} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: c.tx2 }}>ZCS administration may review messages to keep students and families safe.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
