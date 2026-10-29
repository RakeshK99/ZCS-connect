import { initials, relativeTime, type FeedPost } from '@zcs/core';
import { router } from 'expo-router';
import { Bookmark, ChevronRight, CircleAlert, CircleCheck, FileText, Pin, Siren } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { Avatar, Card, Pill, Skeleton } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { font, MAIZE, NAVY, RED } from '@/theme/tokens';
import { AttachmentStrip } from './Attachments';

export function ReachBar({ reached, read, families, height = 6 }: { reached: number; read: number; families: number; height?: number }) {
  const { c } = useTheme();
  const readPct = families ? (read / families) * 100 : 0;
  const delPct = families ? ((reached - read) / families) * 100 : 0;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`${reached} of ${families} families reached, ${read} read`}
      style={{ height, borderRadius: height / 2, backgroundColor: c.sf2, overflow: 'hidden', flexDirection: 'row' }}>
      <View style={{ width: `${readPct}%`, backgroundColor: c.pri }} />
      <View style={{ width: `${Math.max(0, delPct)}%`, backgroundColor: c.pri, opacity: 0.35 }} />
    </View>
  );
}

export function PostCard({ post, viewerIsAuthor }: { post: FeedPost; viewerIsAuthor?: boolean }) {
  const { c } = useTheme();
  const important = post.priority === 'important';
  const mine = viewerIsAuthor ?? post.mine;
  const showAck = post.require_ack && !mine;
  return (
    <Card onPress={() => router.push(`/post/${post.id}`)} borderColor={important ? MAIZE : undefined}
      accessibilityLabel={`${important ? 'Important. ' : ''}${post.saved ? 'Saved. ' : ''}${post.title}, from ${post.author}, ${relativeTime(post.sent_at)}${!post.read && !mine ? ', unread' : ''}`}
      style={{ paddingVertical: 14, paddingHorizontal: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar text={initials(post.author)} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: c.tx }}>{mine ? `You · ${post.author}` : post.author}</Text>
          <Text numberOfLines={1} style={{ fontSize: 13, color: c.tx2 }}>{mine ? `You posted to ${post.audience_label}` : post.audience_label} · {relativeTime(post.sent_at)}</Text>
        </View>
        {post.saved ? <Bookmark accessibilityLabel="Saved" size={18} color={c.link} fill={c.link} /> : null}
        {important ? <Pill label="Important" icon={Pin} bg={MAIZE} fg={NAVY} /> : null}
        {!post.read && !mine && !important ? <View accessibilityLabel="Unread" style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.badge }} /> : null}
      </View>
      <Text style={{ fontFamily: font.heading, fontSize: 18, lineHeight: 22, color: c.tx }}>{post.title}</Text>
      {post.body ? <Text numberOfLines={3} style={{ fontSize: 15, lineHeight: 21, color: c.tx2 }}>{post.body}</Text> : null}
      <AttachmentStrip attachments={post.attachments} compact />
      {showAck ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {post.acked ? <CircleCheck size={15} color={c.ok} /> : <CircleAlert size={15} color={c.link} />}
          <Text style={{ fontSize: 13, fontWeight: '600', color: post.acked ? c.ok : c.link }}>
            {post.acked ? 'You confirmed you read this' : "Please confirm you've read this"}
          </Text>
        </View>
      ) : null}
      {mine && post.reach ? (
        <View style={{ gap: 6 }}>
          <ReachBar {...post.reach} />
          <Text style={{ fontSize: 13, color: c.tx2 }}>{post.reach.reached} of {post.reach.families} families reached · {post.reach.read} read</Text>
        </View>
      ) : null}
    </Card>
  );
}

export function EmergencyBanner({ post }: { post: FeedPost }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Emergency alert: ${post.title}`} onPress={() => router.push(`/post/${post.id}`)}
      style={({ pressed }) => ({ marginHorizontal: 16, marginTop: 12, backgroundColor: RED, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 12,
        opacity: pressed ? 0.9 : 1, shadowColor: RED, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 4 })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
        <Siren size={22} color="#fff" />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' }}>
          Emergency · {post.author} · {relativeTime(post.sent_at)}
        </Text>
        <Text style={{ color: '#fff', fontFamily: font.heading, fontSize: 18, lineHeight: 22, marginVertical: 3 }}>{post.title}</Text>
        {post.body ? <Text numberOfLines={2} style={{ color: '#fff', opacity: 0.92, fontSize: 14, lineHeight: 19 }}>{post.body}</Text> : null}
      </View>
      <ChevronRight size={20} color="#fff" style={{ alignSelf: 'center' }} />
    </Pressable>
  );
}

export function FeedSkeleton() {
  const { c } = useTheme();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }} accessibilityLabel="Loading posts">
      {[1, 2, 3].map((k) => (
        <View key={k} style={{ backgroundColor: c.sf, borderWidth: 1, borderColor: c.bd, borderRadius: 16, padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Skeleton w={36} h={36} r={18} />
            <View style={{ flex: 1, gap: 6 }}><Skeleton w="45%" /><Skeleton w="30%" h={10} tone={1} /></View>
          </View>
          <Skeleton w="80%" h={16} />
          <Skeleton h={11} tone={1} />
          <Skeleton w="70%" h={11} tone={1} />
        </View>
      ))}
    </View>
  );
}

export { FileText };
