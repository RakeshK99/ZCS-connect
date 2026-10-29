import { useMutationState } from '@tanstack/react-query';
import { api, clockTime, dayLabel, initials } from '@zcs/core';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowUp, CheckCheck, ChevronLeft, Clock, ShieldCheck } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui';
import { useSendMessage, useThreadMessages, useThreads } from '@/lib/hooks';
import { useOnline } from '@/lib/query';
import { useLinked } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { LinkedText } from '@/components/LinkedText';
import { useTheme } from '@/theme/ThemeProvider';

export default function Thread() {
  const { c, strong, strongTx } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { linked, contextKey } = useLinked();
  const me = linked.person.id;
  const summary = useThreads(contextKey).data?.find((t) => t.id === id);
  const messages = useThreadMessages(id);
  const send = useSendMessage(id, me);
  const pending = useMutationState({ filters: { mutationKey: ['send', id], status: 'pending' } }).length;
  const [draft, setDraft] = useState('');
  const list = useRef<FlatList>(null);

  useEffect(() => { api.markThreadRead(supabase, id).catch(() => {}); }, [id, messages.data?.length]);

  const items = messages.data ?? [];
  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    send.mutate(body);
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: c.bar, borderBottomWidth: 1, borderBottomColor: c.bd }}>
        <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={26} color={c.link} />
          </Pressable>
          <Avatar text={initials(summary?.with ?? '')} size={36} tone="tint" />
          <View style={{ flex: 1, paddingLeft: 6 }}>
            <Text accessibilityRole="header" numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: c.tx }}>{summary?.with ?? 'Conversation'}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12, color: c.tx2 }}>{summary ? `${summary.with_sub} · about ${summary.student_first}` : ''}</Text>
          </View>
        </View>
      </View>

      <FlatList
        ref={list}
        data={items}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 10, gap: 6 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={
          <View style={{ alignSelf: 'center', flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: c.sf2, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginBottom: 8 }}>
            <ShieldCheck size={13} color={c.tx2} />
            <Text style={{ fontSize: 12, color: c.tx2 }}>ZCS administration may review messages.</Text>
          </View>
        }
        renderItem={({ item: m, index: i }) => {
          const mine = m.sender_id === me;
          const showDay = i === 0 || dayLabel(items[i - 1]!.created_at) !== dayLabel(m.created_at);
          const isLast = i === items.length - 1;
          const queued = m.id.startsWith('local-') && (!online || pending > 0);
          return (
            <View>
              {showDay ? <Text style={{ alignSelf: 'center', fontSize: 12, fontWeight: '600', color: c.tx3, marginTop: 8, marginBottom: 2 }}>{dayLabel(m.created_at)}</Text> : null}
              <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%', backgroundColor: mine ? strong : c.sf, paddingVertical: 10, paddingHorizontal: 14,
                borderRadius: 18, borderBottomRightRadius: mine ? 6 : 18, borderBottomLeftRadius: mine ? 18 : 6 }}>
                <LinkedText selectable style={{ fontSize: 16, lineHeight: 22, color: mine ? strongTx : c.tx }} linkColor={mine ? strongTx : c.link}>{m.body}</LinkedText>
              </View>
              {isLast || queued ? (
                <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 4, marginTop: 2 }}>
                  {queued ? <Clock size={12} color={c.tx3} /> : mine ? <CheckCheck size={12} color={c.tx3} /> : null}
                  <Text style={{ fontSize: 11, color: c.tx3 }}>{queued ? 'Waiting to send' : mine ? `Delivered · ${clockTime(m.created_at)}` : clockTime(m.created_at)}</Text>
                </View>
              ) : null}
            </View>
          );
        }}
      />

      {summary?.office_hours ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: c.sf, borderWidth: 1, borderColor: c.bd, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 }}>
            <Clock size={16} color={c.link} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: c.tx2 }}>{summary.office_hours}</Text>
          </View>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: insets.bottom + 8, backgroundColor: c.bar, borderTopWidth: 1, borderTopColor: c.bd, flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
        <TextInput value={draft} onChangeText={setDraft} placeholder={online ? 'Message' : "Will send when you're online"} placeholderTextColor={c.tx3}
          multiline accessibilityLabel="Message" maxLength={5000}
          style={{ flex: 1, minHeight: 44, maxHeight: 140, borderRadius: 22, borderWidth: 1, borderColor: c.bdS, backgroundColor: c.sf, color: c.tx,
            paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 16 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={submit} disabled={!draft.trim()}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.pri, alignItems: 'center', justifyContent: 'center', opacity: draft.trim() ? 1 : 0.5 }}>
          <ArrowUp size={22} color={c.priTx} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
