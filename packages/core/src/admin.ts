// Office/admin RPC wrappers used by the staff console.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './api';
import type { CalendarSourceStatus, Priority, ReachSummary, RoleKind, ScopeKind } from './types';

async function rpc<T>(db: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new ApiError(error.message, error.code);
  return data as T;
}

async function select<T>(q: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new ApiError(error.message, error.code);
  return data as T;
}

export interface MembershipRow {
  id: string; role: RoleKind; scope_type: ScopeKind; scope_id: string | null; scope_label: string; starts_at: string; ends_at: string | null;
}
export interface PersonRow {
  id: string; name: string; first_name: string; last_name: string; honorific: string | null; email: string; staff_title: string | null;
  signed_in: boolean; is_active: boolean; memberships: MembershipRow[]; children: string[];
}
export interface FamilyRequest { id: string; email: string; note: string | null; status: string; created_at: string }
export interface RosterRow {
  sis_id?: string; first: string; middle?: string; last: string; preferred?: string; grade: string;
  guardians: { email: string; first?: string; last?: string; relationship?: string }[];
}
export interface RosterPreview {
  import_id: string; rows: number; new_students: number; updated_students: number; unchanged_students: number;
  deactivated_students: number; new_guardians: number; guardian_links: number; removed_guardian_links: number; shared_guardians: number;
  unmatched_grades: string[]; issues: { row: number; problem: string }[];
}
export interface RosterImport { id: string; file_name: string; status: string; summary: RosterPreview | null; created_at: string; applied_at: string | null; reverted_at: string | null }
export interface RecentSend {
  id: string; title: string; author: string; audience_label: string; priority: Priority; status: string;
  sent_at: string | null; scheduled_at: string | null; reach: ReachSummary | null;
}
export interface SchoolStats { students: number; families_with_app: number; guardians: number; guardians_signed_in: number; pending_requests: number }
export interface OversightThread { id: string; student: string; grade: string | null; participants: string[]; messages: number; last_message_at: string }
export interface OversightMessage { id: string; sender: string; sender_context: 'parent' | 'staff'; body: string; created_at: string }
export interface AuditRow { id: number; action: string; target_type: string | null; target_id: string | null; detail: Record<string, unknown>; at: string; actor_id: string | null }
export interface Option { id: string; label: string }
export interface GuardianLink {
  id: string; person_id: string; name: string; email: string; relationship: string; no_contact: boolean; hide_contact: boolean;
  can_sign_forms: boolean; locked_by_office: boolean; source: 'import' | 'office'; is_active: boolean; signed_in: boolean;
}
export interface StudentGuardians { id: string; name: string; grade: string | null; is_active: boolean; guardians: GuardianLink[] }

export const admin = {
  stats: (db: SupabaseClient) => rpc<SchoolStats>(db, 'school_stats'),
  recentSends: (db: SupabaseClient, limit = 25) => rpc<RecentSend[]>(db, 'recent_sends', { p_limit: limit }),

  people: (db: SupabaseClient, query?: string, staffOnly = false) => rpc<PersonRow[]>(db, 'admin_people', { p_query: query || null, p_staff_only: staffOnly }),
  upsertStaff: (db: SupabaseClient, p: { email: string; first: string; last: string; honorific: string; title: string; officeHours?: string }) =>
    rpc<string>(db, 'upsert_staff_person', { p_email: p.email, p_first: p.first, p_last: p.last, p_honorific: p.honorific, p_title: p.title, p_office_hours: p.officeHours ?? null }),
  grant: (db: SupabaseClient, personId: string, role: RoleKind, scopeType: ScopeKind, scopeId: string | null, endsAt?: string | null) =>
    rpc<string>(db, 'grant_membership', { p_person: personId, p_role: role, p_scope_type: scopeType, p_scope_id: scopeId, p_ends_at: endsAt ?? null }),
  revoke: (db: SupabaseClient, membershipId: string) => rpc<void>(db, 'revoke_membership', { p_membership: membershipId }),

  familyRequests: (db: SupabaseClient) => rpc<FamilyRequest[]>(db, 'family_requests_queue'),
  resolveFamilyRequest: (db: SupabaseClient, id: string, approve: boolean, studentIds: string[] = [], first = '', last = '', relationship = 'guardian') =>
    rpc<void>(db, 'resolve_family_request', { p_request: id, p_approve: approve, p_student_ids: studentIds, p_first: first, p_last: last, p_relationship: relationship }),

  studentGuardians: (db: SupabaseClient, query: string) => rpc<StudentGuardians[]>(db, 'office_student_guardians', { p_query: query }),
  setGuardianFlags: (db: SupabaseClient, id: string, f: { noContact: boolean; hideContact: boolean; canSign: boolean }) =>
    rpc<void>(db, 'update_guardianship_flags', { p_guardianship: id, p_no_contact: f.noContact, p_hide_contact: f.hideContact, p_can_sign: f.canSign }),
  setGuardianActive: (db: SupabaseClient, id: string, active: boolean) => rpc<void>(db, 'set_guardianship_active', { p_guardianship: id, p_active: active }),

  previewRoster: (db: SupabaseClient, fileName: string, rows: RosterRow[]) => rpc<RosterPreview>(db, 'preview_roster_import', { p_file_name: fileName, p_rows: rows }),
  applyRoster: (db: SupabaseClient, id: string, deactivateMissing: boolean) =>
    rpc<Record<string, number>>(db, 'apply_roster_import', { p_import: id, p_deactivate_missing: deactivateMissing }),
  revertRoster: (db: SupabaseClient, id: string) => rpc<void>(db, 'revert_roster_import', { p_import: id }),
  rosterImports: (db: SupabaseClient) =>
    select<RosterImport[]>(db.from('roster_imports').select('id, file_name, status, summary, created_at, applied_at, reverted_at').order('created_at', { ascending: false }).limit(20)),

  oversightThreads: (db: SupabaseClient, query?: string) => rpc<OversightThread[]>(db, 'oversight_threads', { p_query: query || null }),
  oversightOpen: (db: SupabaseClient, threadId: string, reason: string) => rpc<OversightMessage[]>(db, 'oversight_open_thread', { p_thread: threadId, p_reason: reason }),

  upsertEvent: (db: SupabaseClient, e: { id?: string | null; title: string; starts_on: string; ends_on?: string | null; start_time?: string | null; end_time?: string | null; location?: string | null; no_school: boolean }) =>
    rpc<string>(db, 'upsert_calendar_event', { p_id: e.id ?? null, p_title: e.title, p_starts_on: e.starts_on, p_ends_on: e.ends_on || null,
      p_start_time: e.start_time || null, p_end_time: e.end_time || null, p_location: e.location ?? null, p_no_school: e.no_school }),
  deleteEvent: (db: SupabaseClient, id: string) => rpc<void>(db, 'delete_calendar_event', { p_id: id }),
  /** ZCS Google Calendar sync: the office pastes the calendar's secret iCal address (null disconnects). */
  calendarSource: (db: SupabaseClient) => rpc<CalendarSourceStatus>(db, 'calendar_source_status'),
  setCalendarSource: (db: SupabaseClient, url: string | null) => rpc<void>(db, 'set_calendar_source', { p_url: url }),
  syncCalendarNow: (db: SupabaseClient) => rpc<void>(db, 'request_calendar_sync'),

  audit: (db: SupabaseClient, action?: string) => {
    let q = db.from('audit_log').select('id, action, target_type, target_id, detail, at, actor_id').order('at', { ascending: false }).limit(200);
    if (action) q = q.like('action', `${action}%`);
    return select<AuditRow[]>(q);
  },
  searchStudents: (db: SupabaseClient, query: string) =>
    select<{ id: string; first_name: string; last_name: string; preferred_name: string | null; grades: { label: string } | null }[]>(
      db.from('students').select('id, first_name, last_name, preferred_name, grades(label)').eq('is_active', true)
        .or(`first_name.ilike.%${query.replace(/[%,()]/g, '')}%,last_name.ilike.%${query.replace(/[%,()]/g, '')}%`).order('last_name').limit(20)),
  scopes: async (db: SupabaseClient) => {
    const [divisions, grades, classes] = await Promise.all([
      select<{ id: string; name: string }[]>(db.from('divisions').select('id, name').order('sort_order')),
      select<{ id: string; label: string }[]>(db.from('grades').select('id, label').order('sort_order')),
      select<{ id: string; code: string; name: string }[]>(db.from('classes').select('id, code, name').eq('is_active', true).order('code')),
    ]);
    return {
      division: divisions.map((d) => ({ id: d.id, label: d.name })),
      grade: grades.map((g) => ({ id: g.id, label: g.label })),
      class: classes.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` })),
    } satisfies Record<string, Option[]>;
  },
};

export const ROLE_LABELS: Record<RoleKind, string> = {
  teacher: 'Teacher', aide: 'Specialist / aide', group_leader: 'Group leader', principal: 'Division principal',
  office: 'Office communicator', emergency_sender: 'Emergency sender', admin: 'District admin',
};

/** Which scope each role is granted at (mirrors grant_membership checks). */
export const ROLE_SCOPE: Record<RoleKind, ScopeKind> = {
  teacher: 'class', aide: 'class', group_leader: 'class', principal: 'division', office: 'school', emergency_sender: 'school', admin: 'school',
};
