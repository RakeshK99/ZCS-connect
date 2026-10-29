import { canCompose, childrenPossessive, isParent, isStaff, type FeedPost } from '@zcs/core';
import { router } from 'expo-router';
import { Bookmark, ChevronDown, Newspaper, Pin, Search, SquarePen, WifiOff } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, EmptyState, Notice, SectionLabel } from '@/components/ui';
import { ZcsIcon } from '@/components/ZcsIcon';
import { EmergencyBanner, FeedSkeleton, PostCard } from '@/features/feed/PostCard';
import { useRoleSwitcher } from '@/features/roles/RoleSwitcher';
import { useFeed } from '@/lib/hooks';
import { useOnline } from '@/lib/query';
import { useLinked } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';
import { font, MAIZE, NAVY } from '@/theme/tokens';

export default function Home() {
  const { c, strong, strongTx } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const { linked, context } = useLinked();
  const switcher = useRoleSwitcher();
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const saved = filter === 'saved';
  const feed = useFeed(context.key, filter === 'all' || saved ? null : filter, query.trim() || undefined, saved);
  const multi = linked.contexts.length > 1;

  const chips = isParent(context)
    ? [{ id: 'all', label: 'All' }, ...context.children.map((k) => ({ id: k.id, label: `${k.name} · ${k.grade ?? ''}` }))]
    : [{ id: 'all', label: 'All' }, ...(isStaff(context) ? context.classes.filter((k) => k.kind === 'class').map((k) => ({ id: k.id, label: `${k.code} · My class` })) : [])];
  chips.splice(1, 0, { id: 'saved', label: 'Saved' });

  const { emergency, pinned, latest } = useMemo(() => {
    const posts = feed.data ?? [];
    if (saved) return { emergency: undefined, pinned: [], latest: posts };
    const emergency = posts.find((p) => p.priority === 'emergency' && p.pinned);
    return {
      emergency,
      pinned: posts.filter((p) => p.priority === 'important' && p.pinned),
      latest: posts.filter((p) => p.id !== emergency?.id && !(p.priority === 'important' && p.pinned)),
    };
  }, [feed.data, saved]);

  const initialsText = linked.person.full_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const empty = !feed.isLoading && (feed.data?.length ?? 0) === 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ backgroundColor: NAVY, paddingTop: insets.top, paddingHorizontal: 16, paddingBottom: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
          <View style={{ padding: 7 }}><ZcsIcon size={28} /></View>
          <Text accessibilityRole="header" style={{ fontFamily: font.heading, fontSize: 20, color: '#fff', flex: 1 }}>ZCS Connect</Text>
          {multi ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Current role: ${context.label}. Switch role`} onPress={switcher.open}
              style={{ minHeight: 44, paddingLeft: 14, paddingRight: 12, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
                backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 230 }}>
              <Text numberOfLines={1} style={{ color: '#fff', fontSize: 14, fontWeight: '600', flexShrink: 1 }}>{context.label}</Text>
              <ChevronDown size={16} color="#fff" />
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.push('/profile')}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: MAIZE, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: font.heading, fontSize: 15, color: NAVY }}>{initialsText}</Text>
            </Pressable>
          )}
        </View>
        <View style={{ height: 40, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
          <Search size={17} color="rgba(255,255,255,0.7)" />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search posts" placeholderTextColor="rgba(255,255,255,0.6)" accessibilityLabel="Search posts"
            returnKeyType="search" style={{ flex: 1, color: '#fff', fontSize: 16 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => feed.refetch()} tintColor={c.tx2} />}>
        {!online ? (
          <View style={{ backgroundColor: c.sf2, paddingVertical: 10, paddingHorizontal: 16, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <WifiOff size={18} color={c.tx} />
            <Text style={{ color: c.tx, fontSize: 14, flex: 1 }}>You're offline. Showing saved posts.</Text>
          </View>
        ) : null}
        {emergency ? <EmergencyBanner post={emergency} /> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
          {chips.map((ch) => <Chip key={ch.id} label={ch.label} active={filter === ch.id} onPress={() => setFilter(ch.id)} />)}
        </ScrollView>

        {feed.isLoading && !feed.data ? <FeedSkeleton /> : null}
        {feed.isError && !feed.data ? <Notice icon={WifiOff} style={{ margin: 16 }}>We couldn't load posts. Pull down to try again.</Notice> : null}
        {empty ? (
          <EmptyState icon={saved ? Bookmark : Newspaper} title={query ? 'No matching posts' : saved ? 'Nothing saved yet' : 'No posts yet'}
            body={query ? 'Try a different word.' : saved ? 'Tap Save on any post to keep it here, like a permission slip or a supply list.' : isParent(context)
              ? `When ${childrenPossessive(context)} teachers or the school office post, you'll see it here.`
              : 'Posts to your classes and the school will show up here.'} />
        ) : null}

        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
          {pinned.length ? <SectionLabel icon={Pin} style={{ paddingTop: 8, paddingBottom: 0, paddingHorizontal: 2 }}>Pinned</SectionLabel> : null}
          {pinned.map((p: FeedPost) => <PostCard key={p.id} post={p} />)}
          {latest.length ? <SectionLabel icon={saved ? Bookmark : Newspaper} style={{ paddingTop: 8, paddingBottom: 0, paddingHorizontal: 2 }}>{saved ? 'Saved' : 'Latest'}</SectionLabel> : null}
          {latest.map((p: FeedPost) => <PostCard key={p.id} post={p} />)}
        </View>
      </ScrollView>

      {canCompose(context) ? (
        <Pressable accessibilityRole="button" accessibilityLabel="New post" onPress={() => router.push('/compose')}
          style={({ pressed }) => ({ position: 'absolute', right: 18, bottom: insets.bottom + 92, height: 54, paddingHorizontal: 20, borderRadius: 27,
            backgroundColor: strong, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.85 : 1,
            shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 5 })}>
          <SquarePen size={20} color={strongTx} />
          <Text style={{ color: strongTx, fontFamily: font.heading, fontSize: 16 }}>New post</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
