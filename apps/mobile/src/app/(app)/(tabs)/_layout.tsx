import type { ComponentProps } from 'react';
import { hasClasses } from '@zcs/core';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Calendar, CircleUser, House, MessageCircle, Users, type LucideIcon } from 'lucide-react-native';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThreads } from '@/lib/hooks';
import { useLinked } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const META: Record<string, { label: string; icon: LucideIcon }> = {
  home: { label: 'Home', icon: House },
  classes: { label: 'Classes', icon: Users },
  messages: { label: 'Messages', icon: MessageCircle },
  calendar: { label: 'Calendar', icon: Calendar },
  profile: { label: 'Profile', icon: CircleUser },
};

function TabBar({ state, navigation, teacher }: BottomTabBarProps & { teacher: boolean }) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { contextKey } = useLinked();
  const unread = useThreads(contextKey).data?.filter((t) => t.unread).length ?? 0;
  const routes = state.routes.filter((r) => META[r.name] && (teacher || r.name !== 'classes'));

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, borderTopColor: c.bd, overflow: 'hidden' }}>
      {Platform.OS === 'ios' ? <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} /> : null}
      <View style={{ flexDirection: 'row', paddingTop: 6, paddingHorizontal: 4, paddingBottom: Math.max(insets.bottom, 10), backgroundColor: c.bar }}>
        {routes.map((route) => {
          const focused = state.routes[state.index]?.key === route.key;
          const { label, icon: Icon } = META[route.name]!;
          const color = focused ? c.link : c.tx3;
          const badge = route.name === 'messages' ? unread : 0;
          return (
            <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }}
              accessibilityLabel={badge ? `${label}, ${badge} unread` : label}
              onPress={() => {
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={{ flex: 1, alignItems: 'center', gap: 3, minHeight: 48, paddingTop: 2 }}>
              <Icon size={24} color={color} />
              <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 10, fontWeight: '600', color }}>{label}</Text>
              {badge ? (
                <View style={{ position: 'absolute', top: -2, left: '50%', marginLeft: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.badge, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: c.badgeTx, fontSize: 11, fontWeight: '700' }}>{badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { context } = useLinked();
  const teacher = hasClasses(context);
  return (
    <Tabs tabBar={(p) => <TabBar {...p} teacher={teacher} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="classes" options={{ href: teacher ? undefined : null }} />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
