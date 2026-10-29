// Shapes returned by the Supabase RPCs (see supabase/migrations). Shared by the
// mobile app and the staff console.

export type ContextKey = 'parent' | 'staff';
export type Priority = 'normal' | 'important' | 'emergency';
export type RoleKind =
  | 'teacher' | 'aide' | 'group_leader' | 'principal' | 'office' | 'emergency_sender' | 'admin';
export type ScopeKind = 'school' | 'division' | 'grade' | 'class';

export interface Child {
  id: string;
  first_name: string;
  name: string; // preferred name
  last_name: string;
  grade: string | null;
  grade_id: string | null;
  division_id: string | null;
  teacher: string | null;
}

export interface StaffClass {
  id: string;
  code: string;
  name: string;
  kind: 'class' | 'group';
  families: number;
  last_post_at: string | null;
}

export interface ParentContext {
  key: 'parent';
  label: string;
  children: Child[];
}

export interface StaffContext {
  key: 'staff';
  label: string;
  roles: RoleKind[];
  classes: StaffClass[];
}

export type AppContext = ParentContext | StaffContext;

export interface LinkedSession {
  linked: true;
  person: {
    id: string;
    first_name: string;
    last_name: string;
    display_name: string;
    full_name: string;
    email: string;
    office_hours: string | null;
  };
  school: { id: string; name: string; short_name: string; staff_email_domain: string };
  is_admin: boolean;
  is_office: boolean;
  can_send_emergency: boolean;
  contexts: AppContext[];
}

export interface UnlinkedSession {
  linked: false;
  email: string | null;
  pending_request: boolean;
}

export type SessionInfo = LinkedSession | UnlinkedSession;

export interface Attachment {
  id: string;
  kind: 'image' | 'pdf';
  file_name: string;
  storage_path: string;
  size_bytes: number;
}

export interface ReachSummary {
  families: number;
  reached: number;
  read: number;
  acked: number;
}

export interface AudienceItem {
  type: 'school' | 'staff' | 'division' | 'grade' | 'class' | 'student';
  id?: string;
}

export interface FeedPost {
  id: string;
  title: string;
  body: string;
  priority: Priority;
  author: string;
  author_id: string;
  mine: boolean;
  audience: AudienceItem[];
  audience_label: string;
  sent_at: string;
  edited_at: string | null;
  pinned: boolean;
  require_ack: boolean;
  read: boolean;
  acked: boolean;
  /** The viewer saved this post to find it again (older servers omit it). */
  saved?: boolean;
  student_ids: string[] | null;
  attachments: Attachment[];
  reach: ReachSummary | null;
}

export interface ThreadSummary {
  id: string;
  student_id: string;
  student_name: string;
  student_first: string;
  grade: string | null;
  with: string;
  with_sub: string;
  office_hours: string | null;
  last_message: string | null;
  last_message_at: string;
  unread: boolean;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Contact {
  person_id: string;
  name: string;
  role: string;
  office_hours?: string | null;
}

export interface RosterGuardian {
  person_id: string;
  name: string;
  first_name: string;
  relationship: string;
  email: string | null;
  phone: string | null;
  contact_hidden: boolean;
  has_app: boolean;
}

export interface RosterStudent {
  student_id: string;
  name: string;
  guardians: RosterGuardian[];
}

export interface FamilyStatus {
  student_id: string;
  family: string;
  child: string;
  via?: string | null;
  reason?: string;
  reached?: boolean;
  read?: boolean;
  acked?: boolean;
}

export interface PostReach {
  post: { id: string; title: string; audience_label: string; sent_at: string | null; priority: Priority; require_ack: boolean; status: string };
  summary: ReachSummary;
  by_channel: { push: number; email: number };
  not_reached: FamilyStatus[];
  unread: FamilyStatus[];
  families: FamilyStatus[];
}

export interface AudienceOption {
  type: AudienceItem['type'];
  id?: string;
  label: string;
  kind?: 'class' | 'group';
  mine?: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  starts_on: string; // yyyy-mm-dd
  ends_on: string | null;
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  location: string | null;
  no_school: boolean;
  /** Set for class events ("3S · Mrs. Smith's 3rd Grade"); null for school-wide ones. */
  audience_label?: string | null;
  created_by?: string | null;
  /** 'ics' = synced from the ZCS Google Calendar (change it there); 'manual' = entered in ZCS Connect. */
  source?: 'manual' | 'ics';
}

export interface CalendarSourceStatus {
  connected: boolean;
  last_synced_at?: string | null;
  last_count?: number | null;
  last_error?: string | null;
  synced_events?: number;
}

export interface NotificationPrefs {
  person_id: string;
  context: ContextKey;
  important: boolean;
  class_posts: boolean;
  messages: boolean;
  calendar: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
}
