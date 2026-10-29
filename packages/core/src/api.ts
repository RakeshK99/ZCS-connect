// Typed wrappers over the Supabase RPCs. Every permission check happens in the
// database; these only shape the calls.
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AudienceItem, AudienceOption, CalendarEvent, Contact, ContextKey, FeedPost, Message, NotificationPrefs,
  PostReach, Priority, RosterStudent, SessionInfo, ThreadSummary,
} from './types';

export class ApiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

async function rpc<T>(db: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new ApiError(friendly(error.message), error.code);
  return data as T;
}

function friendly(message: string) {
  if (/JWT|not signed in/i.test(message)) return 'Please sign in again.';
  if (/Failed to fetch|Network request failed/i.test(message)) return "You're offline. Try again when you're connected.";
  return message;
}

export const api = {
  // session
  linkAccount: (db: SupabaseClient) => rpc<SessionInfo>(db, 'link_account'),
  sessionInfo: (db: SupabaseClient) => rpc<SessionInfo>(db, 'session_info'),
  requestFamilyLink: (db: SupabaseClient, note?: string) => rpc<void>(db, 'request_family_link', { p_note: note ?? null }),
  deleteMyAccount: (db: SupabaseClient) => rpc<void>(db, 'delete_my_account'),

  // feed & posts
  /** Newest first. To page, pass the last post's `sent_at` and `id` as `before` / `beforeId`. */
  feed: (db: SupabaseClient, context: ContextKey, opts: { studentId?: string | null; query?: string | null; before?: string | null; beforeId?: string | null; limit?: number; saved?: boolean } = {}) =>
    rpc<FeedPost[]>(db, 'feed', {
      p_context: context, p_student: opts.studentId ?? null, p_query: opts.query || null,
      p_limit: opts.limit ?? 50, p_before: opts.before ?? null, p_before_id: opts.beforeId ?? null,
      ...(opts.saved ? { p_saved: true } : {}),
    }),
  setSaved: (db: SupabaseClient, postId: string, saved: boolean) => rpc<boolean>(db, 'set_post_saved', { p_post: postId, p_saved: saved }),
  markRead: (db: SupabaseClient, postId: string) => rpc<void>(db, 'mark_post_read', { p_post: postId }),
  acknowledge: (db: SupabaseClient, postId: string) => rpc<string>(db, 'acknowledge_post', { p_post: postId }),
  myAudiences: (db: SupabaseClient) => rpc<AudienceOption[]>(db, 'my_audiences'),
  createPost: (db: SupabaseClient, input: {
    title: string; body: string; audience: AudienceItem[]; priority?: Priority; requireAck?: boolean;
    scheduledAt?: string | null; attachments?: { storage_path: string; kind: 'image' | 'pdf'; file_name: string; size_bytes: number; sort_order?: number }[];
  }) => rpc<{ id: string; recipients: number; scheduled: boolean }>(db, 'create_post', {
    p_title: input.title, p_body: input.body, p_audience: input.audience, p_priority: input.priority ?? 'normal',
    p_require_ack: input.requireAck ?? false, p_scheduled_at: input.scheduledAt ?? null, p_attachments: input.attachments ?? [],
  }),
  editPost: (db: SupabaseClient, postId: string, title: string, body: string) =>
    rpc<void>(db, 'edit_post', { p_post: postId, p_title: title, p_body: body }),
  cancelPost: (db: SupabaseClient, postId: string) => rpc<void>(db, 'cancel_post', { p_post: postId }),
  postReach: (db: SupabaseClient, postId: string) => rpc<PostReach>(db, 'post_reach', { p_post: postId }),
  remindFamilies: (db: SupabaseClient, postId: string, studentIds: string[]) =>
    rpc<number>(db, 'remind_families', { p_post: postId, p_student_ids: studentIds }),

  // classes
  classRoster: (db: SupabaseClient, classId: string) => rpc<RosterStudent[]>(db, 'class_roster', { p_class: classId }),

  // messaging
  myThreads: (db: SupabaseClient, context: ContextKey) => rpc<ThreadSummary[]>(db, 'my_threads', { p_context: context }),
  messageContacts: (db: SupabaseClient, studentId: string, context: ContextKey) =>
    rpc<Contact[]>(db, 'message_contacts', { p_student: studentId, p_context: context }),
  startThread: (db: SupabaseClient, studentId: string, withPerson: string, context: ContextKey) =>
    rpc<string>(db, 'start_thread', { p_student: studentId, p_with: withPerson, p_context: context }),
  sendMessage: (db: SupabaseClient, threadId: string, body: string) => rpc<string>(db, 'send_message', { p_thread: threadId, p_body: body }),
  markThreadRead: (db: SupabaseClient, threadId: string) => rpc<void>(db, 'mark_thread_read', { p_thread: threadId }),
  threadMessages: async (db: SupabaseClient, threadId: string): Promise<Message[]> => {
    // newest 500, returned oldest-first for display
    const { data, error } = await db.from('messages').select('id, thread_id, sender_id, body, created_at')
      .eq('thread_id', threadId).order('created_at', { ascending: false }).limit(500);
    if (error) throw new ApiError(friendly(error.message), error.code);
    return (data as Message[]).reverse();
  },

  // calendar
  calendar: async (db: SupabaseClient, from: string, to: string): Promise<CalendarEvent[]> => {
    const { data, error } = await db.from('calendar_events')
      .select('id, title, starts_on, ends_on, start_time, end_time, location, no_school')
      .lte('starts_on', to).or(`ends_on.gte.${from},and(ends_on.is.null,starts_on.gte.${from})`)
      .order('starts_on').order('start_time', { nullsFirst: true });
    if (error) throw new ApiError(friendly(error.message), error.code);
    return data as CalendarEvent[];
  },

  // devices & preferences
  registerDevice: (db: SupabaseClient, token: string, platform: 'ios' | 'android' | 'web') =>
    rpc<void>(db, 'register_device', { p_token: token, p_platform: platform }),
  unregisterDevice: (db: SupabaseClient, token: string) => rpc<void>(db, 'unregister_device', { p_token: token }),
  prefs: async (db: SupabaseClient, personId: string, context: ContextKey): Promise<NotificationPrefs> => {
    const { data, error } = await db.from('notification_prefs').select('*').eq('person_id', personId).eq('context', context).maybeSingle();
    if (error) throw new ApiError(friendly(error.message), error.code);
    return (data as NotificationPrefs | null) ?? {
      person_id: personId, context, important: true, class_posts: true, messages: true, calendar: false,
      quiet_start: '21:00:00', quiet_end: '06:30:00',
    };
  },
  savePrefs: async (db: SupabaseClient, prefs: NotificationPrefs) => {
    const { error } = await db.from('notification_prefs').upsert(prefs, { onConflict: 'person_id,context' });
    if (error) throw new ApiError(friendly(error.message), error.code);
  },

  // attachments
  signedUrl: async (db: SupabaseClient, path: string, seconds = 3600) => {
    const { data, error } = await db.storage.from('attachments').createSignedUrl(path, seconds);
    if (error) throw new ApiError(friendly(error.message));
    return data.signedUrl;
  },
};
