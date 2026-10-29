import { clockTime, initials, relativeTime } from '@zcs/core';
import { router, useLocalSearchParams } from 'expo-router';
import { BarChart3, Bookmark, Check, CircleCheck, Pin, Share2, Siren, Users } from 'lucide-react-native';
import { useEffect } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, BackButton, Button, EmptyState, IconButton, NavBar, Pill } from '@/components/ui';
import { AttachmentStrip } from '@/features/feed/Attachments';
import { useAcknowledge, useCachedPost, useMarkRead, useSetSaved } from '@/lib/hooks';
import { LinkedText } from '@/components/LinkedText';
import { useLinked } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { font, MAIZE, NAVY, RED } from '@/theme/tokens';

export default function PostDetail() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { contextKey } = useLinked();
  const { post, loading } = useCachedPost(id, contextKey);
  const markRead = useMarkRead();
  const ack = useAcknowledge();
  const save = useSetSaved();

  useEffect(() => { if (post && !post.read && !post.mine) markRead.mutate(post.id); }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!post) {
    return (
      <View style={{ flex: 1, backgroundColor: c.sf }}>
        <NavBar left={<BackButton label="Home" onPress={() => router.back()} />} />
        {loading ? null : <EmptyState icon={Users} title="Post not available" body="It may have been removed, or it isn't for this role." />}
      </View>
    );
  }

  const emergency = post.priority === 'emergency';
  const important = post.priority === 'important';
  const fg = emergency ? '#fff' : c.link;
  const showAck = post.require_ack && !post.mine;

  return (
    <View style={{ flex: 1, backgroundColor: c.sf }}>
      <View style={{ backgroundColor: emergency ? RED : c.sf }}>
        <NavBar left={<BackButton label="Home" color={fg} onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />}
          right={
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon={Bookmark} label={post.saved ? 'Saved. Tap to remove from Saved' : 'Save this post'} color={fg} size={20}
                fill={post.saved ? fg : undefined} onPress={() => save.mutate({ postId: post.id, saved: !post.saved })} />
              <IconButton icon={Share2} label="Share" color={fg} size={20} onPress={() => Share.share({ message: `${post.title}\n\n${post.body}` })} />
            </View>
          } />
        {emergency ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 20, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Siren size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>Emergency alert</Text>
            </View>
            <Text accessibilityRole="header" style={{ color: '#fff', fontFamily: font.heading, fontSize: 28, lineHeight: 32 }}>{post.title}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 140, gap: 14 }}>
        {!emergency ? (
          <>
            <Pill label={important ? 'Important · Pinned' : post.audience.some((a) => a.type === 'class') ? 'Class post' : 'Announcement'}
              icon={important ? Pin : Users} bg={important ? MAIZE : c.tint} fg={important ? NAVY : c.link} />
            <Text accessibilityRole="header" style={{ fontFamily: font.heading, fontSize: 28, lineHeight: 32, color: c.tx }}>{post.title}</Text>
          </>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar text={initials(post.author)} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.tx }}>{post.mine ? `You · ${post.author}` : post.author}</Text>
            <Text style={{ fontSize: 13, color: c.tx2 }}>{post.audience_label} · {relativeTime(post.sent_at)}</Text>
          </View>
          {post.edited_at ? (
            <View style={{ borderWidth: 1, borderColor: c.bd, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: c.tx2 }}>Edited {clockTime(post.edited_at)}</Text>
            </View>
          ) : null}
        </View>
        <LinkedText selectable style={{ fontSize: 17, lineHeight: 26, color: c.tx }} linkColor={c.link}>{post.body}</LinkedText>
        <AttachmentStrip attachments={post.attachments} />
        {post.mine ? <Button label="See who's been reached" icon={BarChart3} variant="secondary" onPress={() => router.push(`/reach/${post.id}`)} /> : null}
      </ScrollView>

      {showAck ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12,
          backgroundColor: c.bar, borderTopWidth: 1, borderTopColor: c.bd }}>
          {post.acked ? (
            <View accessibilityLiveRegion="polite" style={{ height: 54, borderRadius: 14, backgroundColor: c.okBg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <CircleCheck size={20} color={c.ok} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: c.tx }}>You confirmed you read this</Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, color: c.tx2, textAlign: 'center' }}>{post.author} asked families to confirm they've read this.</Text>
              <Button label="I've read this" icon={Check} height={54} loading={ack.isPending} onPress={() => ack.mutate(post.id)} />
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
