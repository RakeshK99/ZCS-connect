// A short first-run tour (requested by ZCS on Oct 23) so new families and staff
// see what the app does without anyone walking them through it. Shown once
// after onboarding; reopen any time from Profile → Take the tour.
import { isParent, isStaff } from '@zcs/core';
import { router, useLocalSearchParams } from 'expo-router';
import {
  BarChart3, Bell, Bookmark, CalendarDays, CalendarPlus, MessageCircle, Newspaper, Repeat, SquarePen, Users, type LucideIcon,
} from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { useLinked } from '@/lib/session';
import { font, MAIZE, NAVY } from '@/theme/tokens';

type Slide = { icon: LucideIcon; title: string; body: string };

const PARENT: Slide[] = [
  { icon: Newspaper, title: 'Everything from school, in one place', body: 'Posts from your children\'s teachers and the school office land on Home. Tap a child\'s name at the top to see only theirs.' },
  { icon: Bookmark, title: 'Confirm, save and search', body: 'When a teacher asks, tap "I\'ve read this" so they know. Tap Save on a post to keep it under Saved, and search to find anything again.' },
  { icon: MessageCircle, title: 'Message your child\'s teachers', body: 'Messages keeps a private conversation with each teacher, grouped by child. Each teacher shows when they usually reply.' },
  { icon: CalendarDays, title: 'Never miss a date', body: 'Calendar shows school events, no-school days and your child\'s class events. Tap the calendar button on any event to add it to your phone.' },
  { icon: Bell, title: 'Choose what reaches you', body: 'In Profile, pick which notifications you get and set quiet hours. Emergency alerts always come through.' },
];

const STAFF: Slide[] = [
  { icon: SquarePen, title: 'Post to your class in seconds', body: 'Tap New post, pick the class and write. The first line becomes the title. Add photos, ask families to confirm they read it, or schedule it for 7:00 AM.' },
  { icon: BarChart3, title: 'See who it reached', body: 'After you send, you\'ll see how many families got it and read it. Remind the ones who haven\'t with one tap.' },
  { icon: Users, title: 'Your classes and families', body: 'Classes shows each roster with the guardians you can reach. Message a family from there or from Messages.' },
  { icon: CalendarPlus, title: 'Add class events', body: 'Field trip or theme day? In Calendar, tap Add class event. Only that class\'s families see it.' },
];

export default function Tour() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { first } = useLocalSearchParams<{ first?: string }>();
  const { linked, context } = useLinked();
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);

  const slides = useMemo(() => {
    const parent = linked.contexts.some(isParent), staff = linked.contexts.some(isStaff);
    const list = context.key === 'staff' ? [...STAFF] : [...PARENT];
    if (parent && staff) list.push({ icon: Repeat, title: 'Switch between your roles', body: 'You\'re both staff and a parent. Tap your name at the top of Home to switch. Each role has its own feed, messages and alerts.' });
    return list;
  }, [linked, context.key]);

  const done = () => (first === '1' || !router.canGoBack() ? router.replace('/home') : router.back());
  const go = (i: number) => { scroller.current?.scrollTo({ x: i * width, animated: true }); setPage(i); };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  const last = page === slides.length - 1;

  return (
    <View style={{ flex: 1, backgroundColor: NAVY, paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Skip the tour" onPress={done} hitSlop={6}
          style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16 }}>Skip</Text>
        </Pressable>
      </View>
      <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} style={{ flex: 1 }}>
        {slides.map((s, i) => (
          <View key={s.title} accessible accessibilityLabel={`Step ${i + 1} of ${slides.length}. ${s.title}. ${s.body}`}
            style={{ width, paddingHorizontal: 32, justifyContent: 'center', gap: 22 }}>
            <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(241,196,0,0.14)', alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: MAIZE, alignItems: 'center', justifyContent: 'center' }}>
                <s.icon size={40} color={NAVY} />
              </View>
            </View>
            <Text style={{ fontFamily: font.heading, fontSize: 30, lineHeight: 35, color: '#fff' }}>{s.title}</Text>
            <Text style={{ fontSize: 17, lineHeight: 25, color: 'rgba(255,255,255,0.85)' }}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={{ paddingHorizontal: 24, gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }} importantForAccessibility="no-hide-descendants">
          {slides.map((s, i) => (
            <View key={s.title} style={{ width: i === page ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === page ? MAIZE : 'rgba(255,255,255,0.3)' }} />
          ))}
        </View>
        <Button label={last ? (first === '1' ? 'Get started' : 'Done') : 'Next'} variant="maize" height={56} onPress={() => (last ? done() : go(page + 1))} />
      </View>
    </View>
  );
}
