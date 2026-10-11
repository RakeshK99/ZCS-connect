-- ZCS Connect · core schema
-- Every table has RLS enabled (policies in 0003). Clients never write most tables
-- directly; they call audited RPCs (0004+).

create extension if not exists citext with schema extensions;
create extension if not exists pgmq;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- enums
create type public.role_kind as enum (
  'guardian', 'teacher', 'aide', 'group_leader', 'principal', 'office', 'emergency_sender', 'admin'
);
create type public.scope_kind as enum ('school', 'division', 'grade', 'class');
create type public.post_priority as enum ('normal', 'important', 'emergency');
create type public.post_status as enum ('scheduled', 'sending', 'sent', 'cancelled');
create type public.delivery_channel as enum ('push', 'email', 'sms');
create type public.delivery_status as enum ('queued', 'sent', 'delivered', 'failed', 'skipped');
create type public.app_context as enum ('parent', 'staff');

-- ---------------------------------------------------------------- organization
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  staff_email_domain extensions.citext not null,
  timezone text not null default 'America/Detroit',
  office_email extensions.citext,
  notification_preview text not null default 'full' check (notification_preview in ('full', 'private')),
  created_at timestamptz not null default now()
);

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  unique (school_id, name)
);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  division_id uuid not null references public.divisions(id) on delete restrict,
  label text not null,          -- "3rd grade"
  short_label text not null,    -- "3rd"
  aliases text[] not null default '{}', -- roster spellings: '3', 'Third', 'Gr 3'
  sort_order int not null default 0,
  unique (school_id, label)
);
create index on public.grades (division_id);

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default false,
  check (ends_on > starts_on)
);
create unique index terms_one_active on public.terms (school_id) where is_active;

-- ---------------------------------------------------------------- people
-- One row per adult. A row can exist before the person ever signs in (created
-- by roster import or an admin); it is linked to auth.users on first sign-in
-- when the verified email matches. There is deliberately NO role column here.
create table public.people (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  email extensions.citext not null,
  first_name text not null default '',
  last_name text not null default '',
  honorific text,               -- "Mrs." for staff display ("Mrs. Smith")
  phone text,
  preferred_language text not null default 'en',
  staff_title text,             -- "3rd grade teacher", "Music"
  office_hours text,            -- shown to families in threads
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, email)
);
create index on public.people (user_id);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role public.role_kind not null,
  scope_type public.scope_kind not null,
  scope_id uuid,                -- null when scope_type = 'school'
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  granted_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((scope_type = 'school') = (scope_id is null)),
  check (role <> 'guardian') -- guardianship is modelled per student (guardianships table)
);
create index on public.memberships (person_id);
create index on public.memberships (scope_type, scope_id);

-- ---------------------------------------------------------------- students & classes
create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  sis_id text,
  first_name text not null,
  middle_name text,
  last_name text not null,
  preferred_name text,
  grade_id uuid references public.grades(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, sis_id)
);
create index on public.students (grade_id);

create table public.guardianships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  relationship text not null default 'guardian',
  no_contact boolean not null default false,     -- custody restriction: receives nothing
  hide_contact boolean not null default false,   -- contact details hidden from staff/other guardians
  can_sign_forms boolean not null default true,
  locked_by_office boolean not null default false, -- imports never overwrite flags when true
  source text not null default 'import' check (source in ('import', 'office')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (person_id, student_id)
);
create index on public.guardianships (student_id);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  term_id uuid references public.terms(id) on delete set null,
  grade_id uuid references public.grades(id) on delete set null,
  kind text not null default 'class' check (kind in ('class', 'group')),
  code text not null,           -- "3S", "CH"
  name text not null,           -- "Mrs. Smith's 3rd Grade"
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, term_id, code)
);

create table public.enrollments (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, student_id)
);
create index on public.enrollments (student_id);

-- ---------------------------------------------------------------- posts & delivery
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  author_id uuid not null references public.people(id) on delete restrict,
  author_label text not null,   -- "Mrs. Smith", "ZCS Office" (snapshot)
  audience jsonb not null,      -- [{"type":"class","id":"..."}] | [{"type":"school"}]
  audience_label text not null, -- "3rd grade · 3S"
  priority public.post_priority not null default 'normal',
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 10000),
  require_ack boolean not null default false,
  status public.post_status not null default 'scheduled',
  scheduled_at timestamptz,
  sent_at timestamptz,
  edited_at timestamptz,
  pinned_until timestamptz,
  created_at timestamptz not null default now()
);
create index on public.posts (school_id, sent_at desc);
create index on public.posts (status, scheduled_at);

create table public.post_attachments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('image', 'pdf')),
  file_name text not null,
  size_bytes bigint not null check (size_bytes <= 26214400),
  sort_order int not null default 0
);
create index on public.post_attachments (post_id);

-- Audience snapshot at send time (reports stay accurate when the roster changes).
create table public.post_recipients (
  post_id uuid not null references public.posts(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  context public.app_context not null,
  student_ids uuid[] not null default '{}',
  resolved_at timestamptz not null default now(),
  primary key (post_id, person_id, context)
);
create index on public.post_recipients (person_id, context);

create table public.post_reads (
  post_id uuid not null references public.posts(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (post_id, person_id)
);

create table public.post_acks (
  post_id uuid not null references public.posts(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  acked_at timestamptz not null default now(),
  primary key (post_id, person_id)
);

-- ---------------------------------------------------------------- messaging
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  created_by uuid not null references public.people(id) on delete restrict,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.threads (student_id);

create table public.thread_participants (
  thread_id uuid not null references public.threads(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  context public.app_context not null,
  last_read_at timestamptz,
  primary key (thread_id, person_id)
);
create index on public.thread_participants (person_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  sender_id uuid not null references public.people(id) on delete restrict,
  body text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index on public.messages (thread_id, created_at);

create table public.deliveries (
  id bigint generated always as identity primary key,
  post_id uuid references public.posts(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  channel public.delivery_channel not null,
  status public.delivery_status not null default 'queued',
  provider_id text,
  detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((post_id is null) <> (message_id is null))
);
create index on public.deliveries (post_id, person_id);
create index on public.deliveries (message_id);

-- ---------------------------------------------------------------- devices & preferences
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  expo_token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  last_seen_at timestamptz not null default now()
);
create index on public.devices (person_id);

create table public.notification_prefs (
  person_id uuid not null references public.people(id) on delete cascade,
  context public.app_context not null,
  important boolean not null default true,
  class_posts boolean not null default true,
  messages boolean not null default true,
  calendar boolean not null default false,
  quiet_start time default '21:00',
  quiet_end time default '06:30',
  primary key (person_id, context)
);

-- ---------------------------------------------------------------- calendar
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  starts_on date not null,
  ends_on date,
  start_time time,
  end_time time,
  location text,
  no_school boolean not null default false,
  audience jsonb not null default '[{"type":"school"}]',
  source text not null default 'manual' check (source in ('manual', 'ics')),
  external_uid text,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.calendar_events (school_id, starts_on);
create unique index calendar_events_ics on public.calendar_events (school_id, external_uid) where external_uid is not null;

-- ---------------------------------------------------------------- office queue, imports, audit
create table public.family_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email extensions.citext not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  resolved_by uuid references public.people(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index family_requests_one_pending on public.family_requests (school_id, email) where status = 'pending';

create table public.roster_imports (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  uploaded_by uuid not null references public.people(id) on delete restrict,
  file_name text not null,
  status text not null default 'previewed' check (status in ('previewed', 'applied', 'reverted', 'discarded')),
  rows jsonb not null,          -- normalized rows from the wizard
  summary jsonb,                -- counts shown in the preview
  undo jsonb,                   -- what apply changed, for revert
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  reverted_at timestamptz
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  school_id uuid references public.schools(id) on delete cascade,
  actor_id uuid references public.people(id) on delete set null,
  action text not null,         -- 'post.send', 'membership.grant', 'oversight.open_thread', ...
  target_type text,
  target_id text,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index on public.audit_log (school_id, at desc);
create index on public.audit_log (action);

-- append-only
create function private.audit_log_immutable() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'audit_log is append-only'; end $$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function private.audit_log_immutable();

-- updated_at helper
create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger people_touch before update on public.people for each row execute function private.touch_updated_at();
create trigger students_touch before update on public.students for each row execute function private.touch_updated_at();
create trigger deliveries_touch before update on public.deliveries for each row execute function private.touch_updated_at();

-- RLS on everything, deny by default
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
