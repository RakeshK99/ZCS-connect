import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, isoDay, type ContextKey, type FeedPost, type Message, type NotificationPrefs } from '@zcs/core';
import { supabase } from './supabase';

export const keys = {
  feed: (ctx: ContextKey | null, student?: string | null, q?: string, saved = false) => ['feed', ctx, student ?? 'all', q ?? '', saved ? 'saved' : 'all'] as const,
  threads: (ctx: ContextKey | null) => ['threads', ctx] as const,
  thread: (id: string) => ['thread', id] as const,
  calendar: (from: string, to: string) => ['calendar', from, to] as const,
  reach: (id: string) => ['reach', id] as const,
  roster: (id: string) => ['roster', id] as const,
  audiences: () => ['audiences'] as const,
  prefs: (ctx: ContextKey | null) => ['prefs', ctx] as const,
  contacts: (student: string, ctx: ContextKey) => ['contacts', student, ctx] as const,
};

export function useFeed(ctx: ContextKey | null, studentId?: string | null, query?: string, saved = false) {
  return useQuery({
    queryKey: keys.feed(ctx, studentId, query, saved),
    queryFn: () => api.feed(supabase, ctx!, { studentId, query, limit: 60, saved }),
    enabled: !!ctx,
    refetchInterval: 60_000,
  });
}

/** Look up a post from any cached feed (detail screen opens instantly and offline). */
export function useCachedPost(id: string, ctx: ContextKey | null) {
  const qc = useQueryClient();
  const all = useFeed(ctx);
  const fromCache = () => {
    for (const [, data] of qc.getQueriesData<FeedPost[]>({ queryKey: ['feed'] })) {
      const hit = data?.find((p) => p.id === id);
      if (hit) return hit;
    }
    return undefined;
  };
  return { post: all.data?.find((p) => p.id === id) ?? fromCache(), loading: all.isLoading };
}

export function useThreads(ctx: ContextKey | null) {
  return useQuery({ queryKey: keys.threads(ctx), queryFn: () => api.myThreads(supabase, ctx!), enabled: !!ctx, refetchInterval: 30_000 });
}

export function useThreadMessages(id: string) {
  return useQuery({ queryKey: keys.thread(id), queryFn: () => api.threadMessages(supabase, id), refetchInterval: 10_000 });
}

export function useSendMessage(threadId: string, me: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['send', threadId],
    mutationFn: (body: string) => api.sendMessage(supabase, threadId, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: keys.thread(threadId) });
      const optimistic: Message = { id: `local-${Date.now()}`, thread_id: threadId, sender_id: me, body, created_at: new Date().toISOString() };
      qc.setQueryData<Message[]>(keys.thread(threadId), (old) => [...(old ?? []), optimistic]);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.thread(threadId) });
      qc.invalidateQueries({ queryKey: ['threads'] });
    },
  });
}

export function useCalendar(from: Date, to: Date) {
  const f = isoDay(from), t = isoDay(to);
  return useQuery({ queryKey: keys.calendar(f, t), queryFn: () => api.calendar(supabase, f, t), staleTime: 10 * 60_000 });
}

export function useReach(id: string, live = false) {
  return useQuery({ queryKey: keys.reach(id), queryFn: () => api.postReach(supabase, id), refetchInterval: live ? 3000 : 30_000 });
}

export function useRoster(classId: string) {
  return useQuery({ queryKey: keys.roster(classId), queryFn: () => api.classRoster(supabase, classId) });
}

export function useAudiences(enabled: boolean) {
  return useQuery({ queryKey: keys.audiences(), queryFn: () => api.myAudiences(supabase), enabled, staleTime: 10 * 60_000 });
}

export function useContacts(studentId: string | null, ctx: ContextKey) {
  return useQuery({
    queryKey: keys.contacts(studentId ?? '', ctx),
    queryFn: () => api.messageContacts(supabase, studentId!, ctx),
    enabled: !!studentId,
  });
}

export function usePrefs(personId: string, ctx: ContextKey) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: keys.prefs(ctx), queryFn: () => api.prefs(supabase, personId, ctx) });
  const save = useMutation({
    mutationFn: (p: NotificationPrefs) => api.savePrefs(supabase, p),
    onMutate: (p) => qc.setQueryData(keys.prefs(ctx), p),
    onError: () => qc.invalidateQueries({ queryKey: keys.prefs(ctx) }),
  });
  return { prefs: q.data, save: save.mutate };
}

export function useAcknowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api.acknowledge(supabase, postId),
    onMutate: (postId) => {
      qc.setQueriesData<FeedPost[]>({ queryKey: ['feed'] }, (old) => old?.map((p) => (p.id === postId ? { ...p, acked: true, read: true } : p)));
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api.markRead(supabase, postId),
    onMutate: (postId) => {
      qc.setQueriesData<FeedPost[]>({ queryKey: ['feed'] }, (old) => old?.map((p) => (p.id === postId ? { ...p, read: true } : p)));
    },
  });
}

/** Save a post to find it again later (a parent's own "important"). Updates every cached feed at once. */
export function useSetSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, saved }: { postId: string; saved: boolean }) => api.setSaved(supabase, postId, saved),
    onMutate: ({ postId, saved }) => {
      qc.setQueriesData<FeedPost[]>({ queryKey: ['feed'] }, (old) => old?.map((p) => (p.id === postId ? { ...p, saved } : p)));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['feed'] }),
  });
}
