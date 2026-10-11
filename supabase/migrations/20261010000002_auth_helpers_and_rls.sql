-- ZCS Connect · authorization helpers + row-level security
-- Rule: authority comes only from `memberships` (staff roles) and `guardianships`
-- (parent links). Nothing on a user-editable row grants access.

-- ---------------------------------------------------------------- helpers
create or replace function private.me() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.people p where p.user_id = auth.uid() and p.is_active limit 1
$$;

create or replace function private.my_school() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.school_id from public.people p where p.user_id = auth.uid() and p.is_active limit 1
$$;

-- Does person hold `role` (any scope)?
create or replace function private.person_has_role(p_person uuid, p_roles public.role_kind[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.person_id = p_person and m.role = any(p_roles)
      and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
  )
$$;

create or replace function private.has_role(p_roles public.role_kind[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.person_has_role(private.me(), p_roles)
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role(array['admin']::public.role_kind[])
$$;

create or replace function private.is_office() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role(array['office','admin']::public.role_kind[])
$$;

create or replace function private.is_staff_person(p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.person_id = p_person
      and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
  )
$$;

-- Students the caller is a (contactable) guardian of.
create or replace function private.my_student_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select g.student_id
  from public.guardianships g
  join public.students s on s.id = g.student_id and s.is_active
  where g.person_id = private.me() and g.is_active and not g.no_contact
$$;

-- Classes/groups the caller teaches or leads.
create or replace function private.my_class_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.scope_id from public.memberships m
  where m.person_id = private.me() and m.scope_type = 'class'
    and m.role in ('teacher', 'aide', 'group_leader')
    and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
$$;

-- Divisions the caller is principal of.
create or replace function private.my_division_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.scope_id from public.memberships m
  where m.person_id = private.me() and m.scope_type = 'division' and m.role = 'principal'
    and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
$$;

-- Students visible to the caller in a staff capacity.
create or replace function private.staff_student_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.students s
  where s.school_id = private.my_school() and (
    private.is_office()
    or s.id in (select e.student_id from public.enrollments e where e.class_id in (select private.my_class_ids()))
    or s.grade_id in (select g.id from public.grades g where g.division_id in (select private.my_division_ids()))
  )
$$;

create or replace function private.can_view_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_student in (select private.my_student_ids())
      or p_student in (select private.staff_student_ids())
$$;

create or replace function private.can_read_post(p_post uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.post_recipients r where r.post_id = p_post and r.person_id = private.me())
      or exists (select 1 from public.posts p where p.id = p_post and p.author_id = private.me())
      or exists (select 1 from public.posts p where p.id = p_post and p.school_id = private.my_school() and private.is_office())
      or exists (
        select 1 from public.post_recipients r
        where r.post_id = p_post
          and r.student_ids && array(select private.staff_student_ids())
          and exists (select 1 from private.my_division_ids())
      )
$$;

create or replace function private.in_thread(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.thread_participants t where t.thread_id = p_thread and t.person_id = private.me())
$$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------- grants
-- Clients read through RLS; nearly all writes go through RPCs.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.notification_prefs to authenticated;
grant delete on public.devices to authenticated;

-- ---------------------------------------------------------------- policies
create policy schools_read on public.schools for select to authenticated using (id = private.my_school());
create policy divisions_read on public.divisions for select to authenticated using (school_id = private.my_school());
create policy grades_read on public.grades for select to authenticated using (school_id = private.my_school());
create policy terms_read on public.terms for select to authenticated using (school_id = private.my_school());
create policy classes_read on public.classes for select to authenticated using (school_id = private.my_school());

-- people: yourself, the staff directory, and (office/admin) everyone.
-- Teachers see family contacts only through class_roster(), which masks hidden contacts.
create policy people_read on public.people for select to authenticated using (
  id = private.me()
  or (school_id = private.my_school() and private.is_staff_person(id))
  or (school_id = private.my_school() and private.is_office())
);

create policy memberships_read on public.memberships for select to authenticated using (
  person_id = private.me() or (school_id = private.my_school() and private.is_office())
);

create policy students_read on public.students for select to authenticated using (private.can_view_student(id));

create policy guardianships_read on public.guardianships for select to authenticated using (
  person_id = private.me() or private.is_office()
);

create policy enrollments_read on public.enrollments for select to authenticated using (private.can_view_student(student_id));

create policy posts_read on public.posts for select to authenticated using (private.can_read_post(id));
create policy post_attachments_read on public.post_attachments for select to authenticated using (private.can_read_post(post_id));
create policy post_recipients_read on public.post_recipients for select to authenticated using (person_id = private.me());
create policy post_reads_read on public.post_reads for select to authenticated using (person_id = private.me());
create policy post_acks_read on public.post_acks for select to authenticated using (person_id = private.me());

-- Threads: participants only. Admin oversight goes through oversight_* RPCs, which audit every read.
create policy threads_read on public.threads for select to authenticated using (private.in_thread(id));
create policy thread_participants_read on public.thread_participants for select to authenticated using (private.in_thread(thread_id));
create policy messages_read on public.messages for select to authenticated using (private.in_thread(thread_id));

create policy devices_own on public.devices for select to authenticated using (person_id = private.me());
create policy devices_delete_own on public.devices for delete to authenticated using (person_id = private.me());

create policy prefs_read on public.notification_prefs for select to authenticated using (person_id = private.me());
create policy prefs_insert on public.notification_prefs for insert to authenticated with check (person_id = private.me());
create policy prefs_update on public.notification_prefs for update to authenticated using (person_id = private.me()) with check (person_id = private.me());

create policy calendar_read on public.calendar_events for select to authenticated using (school_id = private.my_school());

create policy family_requests_read on public.family_requests for select to authenticated using (
  user_id = auth.uid() or (school_id = private.my_school() and private.is_office())
);
create policy roster_imports_read on public.roster_imports for select to authenticated using (
  school_id = private.my_school() and private.is_office()
);
create policy audit_read on public.audit_log for select to authenticated using (
  school_id = private.my_school() and private.is_admin()
);
-- deliveries: no direct access (reach reports come from post_reach()).
