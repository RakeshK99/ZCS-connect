// One person, many hats: a teacher who is also a parent switches between
// "Mrs. Smith · Teacher" and "Smith family · Parent". Each context has its own
// feed, inbox and badges. Switching is client-side only — the server already
// grants the union of the person's memberships, so there is nothing to escalate.
import { useQueryClient } from '@tanstack/react-query';
import { isParent, type ContextKey } from '@zcs/core';
import { router } from 'expo-router';
import { Check, GraduationCap, House } from 'lucide-react-native';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Badge, H, T } from '@/components/ui';
import { useFeed, useThreads } from '@/lib/hooks';
import { useLinked } from '@/lib/session';
import { useTheme } from '@/theme/ThemeProvider';

const Ctx = createContext<{ open: () => void }>({ open: () => {} });
export const useRoleSwitcher = () => useContext(Ctx);

function useUnread(key: ContextKey, enabled: boolean) {
  const threads = useThreads(enabled ? key : null);
  const feed = useFeed(enabled ? key : null);
  return {
    messages: threads.data?.filter((t) => t.unread).length ?? 0,
    posts: feed.data?.filter((p) => !p.read && !p.mine).length ?? 0,
  };
}

export function RoleSwitcherProvider({ children }: { children: ReactNode }) {
  const { c, strong, strongTx } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const { linked, contextKey, setContext } = useLinked();
  const [visible, setVisible] = useState(false);
  const multi = linked.contexts.length > 1;
  const staffUnread = useUnread('staff', multi && visible);
  const parentUnread = useUnread('parent', multi && visible);

  const pick = useCallback((key: ContextKey, label: string) => {
    setVisible(false);
    if (key === contextKey) return;
    setContext(key);
    qc.invalidateQueries({ queryKey: ['feed'] });
    router.replace('/home');
    toast(`Switched to ${label}`);
  }, [contextKey, setContext, qc, toast]);

  return (
    <Ctx.Provider value={{ open: () => setVisible(true) }}>
      {children}
      <Sheet visible={visible} onClose={() => setVisible(false)}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 }}>
          <H size={20} style={{ paddingHorizontal: 4 }}>Switch role</H>
          <T tone="tx2" size={14} style={{ paddingHorizontal: 4, paddingTop: 4, paddingBottom: 14 }}>Each role has its own feed, messages and alerts.</T>
          <View style={{ gap: 10 }}>
            {linked.contexts.map((ctx) => {
              const active = ctx.key === contextKey;
              const u = ctx.key === 'staff' ? staffUnread : parentUnread;
              const sub = isParent(ctx)
                ? `${ctx.children.map((k) => `${k.name} · ${k.grade ?? ''}`).join(', ')}${u.posts ? ` · ${u.posts} new posts` : ''}`
                : `${ctx.classes.map((k) => k.code).join(', ') || 'Staff'}${u.messages ? ` · ${u.messages} unread messages` : ''}`;
              const badge = active ? 0 : u.messages + u.posts;
              const Icon = ctx.key === 'staff' ? GraduationCap : House;
              return (
                <Pressable key={ctx.key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => pick(ctx.key, ctx.label)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16,
                    borderWidth: active ? 2 : 1, borderColor: active ? strong : c.bd, minHeight: 68, backgroundColor: c.sf }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: active ? strong : c.tint, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={20} color={active ? (strongTx === '#FFFFFF' ? '#F1C400' : strongTx) : c.link} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: c.tx }}>{ctx.label}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 13, color: c.tx2 }}>{sub}</Text>
                  </View>
                  <Badge count={badge} />
                  {active ? <Check size={22} color={c.link} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Sheet>
    </Ctx.Provider>
  );
}
