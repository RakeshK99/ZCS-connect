-- ZCS Connect · real school beside the demo school (Nov 23).
-- The pilot (Mrs. Vargas's 2nd Grade Spanish class) brings real families in,
-- while the made-up demo school stays for demos and TestFlight review. Every
-- table is already scoped by school and row-level security only ever shows a
-- person their own school, so the two never mix. This migration makes the few
-- places that assumed "one school" school-aware:
--   * schools.is_demo marks the made-up school
--   * someone who signs in with an email we don't know asks the real school
--   * sign-in links to the real school's record when an email is in both, and
--     moves a demo-school sign-in over once the real school lists that email
--   * testers are only ever added to the demo school
--   * "demo account" (can't be deleted, removed by remove_demo_data) means a
--     person in the demo school, not an email pattern
--   * private.create_school sets up a new school (divisions + grades copied
--     from the demo school) and private.add_office_staff adds its office staff

alter table public.schools add column if not exists is_demo boolean not null default false;

-- The school new people belong to: the oldest real school (the demo one only if it's all there is).
create or replace function private.default_school() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.schools order by is_demo, created_at limit 1
$$;

create or replace function private.demo_school() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.schools order by not is_demo, created_at limit 1
$$;

-- Unknown family: one-tap request to the office of the real school (or the school whose staff domain matches).
create or replace function public.request_family_link(p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_school uuid;
begin
  select u.email into v_email from auth.users u where u.id = auth.uid();
  if v_email is null then raise exception 'not signed in'; end if;
  select id into v_school from public.schools
  where not is_demo and staff_email_domain = split_part(v_email, '@', 2)::extensions.citext order by created_at limit 1;
  v_school := coalesce(v_school, private.default_school());
  insert into public.family_requests (school_id, user_id, email, note)
  values (v_school, auth.uid(), v_email, left(p_note, 500))
  on conflict (school_id, email) where status = 'pending' do nothing;
end $$;

-- Sign-in links the account to the person with that email, preferring the real school.
create or replace function public.link_account() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_person uuid; v_was_deleted boolean;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select u.email into v_email from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then return public.session_info(); end if;
  -- Signed in as someone in the demo school, but the real school now has this email
  -- (e.g. a staff tester who is also a pilot parent): move the sign-in to the real school.
  if private.me() is not null and exists (select 1 from public.people p join public.schools s on s.id = p.school_id
                                          where p.user_id = auth.uid() and s.is_demo) then
    select p.id into v_person from public.people p join public.schools s on s.id = p.school_id
    where p.email = v_email::extensions.citext and p.user_id is null and p.is_active and not s.is_demo
    order by p.created_at limit 1;
    if v_person is not null then
      update public.people set user_id = null where user_id = auth.uid();
      update public.people set user_id = auth.uid(), account_deleted_at = null where id = v_person;
      insert into public.audit_log (school_id, actor_id, action, target_type, target_id)
      select school_id, id, 'account.move_to_real_school', 'person', id::text from public.people where id = v_person;
    end if;
    v_person := null;
  end if;
  if private.me() is null then
    select p.id, p.account_deleted_at is not null into v_person, v_was_deleted
    from public.people p join public.schools s on s.id = p.school_id
    where p.email = v_email::extensions.citext and p.user_id is null and p.is_active
    order by s.is_demo, p.created_at limit 1;
    if v_person is not null then
      update public.people set user_id = auth.uid(), account_deleted_at = null where id = v_person;
      insert into public.audit_log (school_id, actor_id, action, target_type, target_id)
      select school_id, id, case when v_was_deleted then 'account.relink_after_delete' else 'account.link' end, 'person', id::text
      from public.people where id = v_person;
    end if;
  end if;
  return public.session_info();
end $$;

-- Demo accounts: anyone in the demo school (plus the invented @example.com addresses).
create or replace function private.is_demo_email(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_email ilike '%@example.com' or exists (
    select 1 from public.people p join public.schools s on s.id = p.school_id
    where p.email = p_email::extensions.citext and s.is_demo), false)
$$;

-- Clearing demo data only ever touches the demo school.
create or replace function private.remove_demo_data() returns void
language plpgsql security definer set search_path = '' as $$
declare v_demo uuid[]; v_school uuid := private.demo_school();
begin
  if not (select is_demo from public.schools where id = v_school) then return; end if;
  select coalesce(array_agg(id), '{}') into v_demo from public.people where school_id = v_school;
  delete from public.posts where school_id = v_school;
  delete from public.threads where student_id in (select id from public.students where school_id = v_school);
  delete from public.messages where sender_id = any(v_demo);
  delete from public.roster_imports where uploaded_by = any(v_demo);
  delete from public.students where school_id = v_school;
  delete from public.people where id = any(v_demo);
  delete from public.classes where school_id = v_school;
end $$;

-- Testers always go into the demo school.
create or replace function private.add_tester(p_email text, p_first text, p_last text, p_honorific text default null,
  p_class_code text default '3S', p_as_parent_of text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_school uuid := private.demo_school(); v_person uuid; v_class uuid; v_student uuid;
begin
  select id into v_class from public.classes where school_id = v_school and code = p_class_code;
  if v_class is null then raise exception 'No class with code %', p_class_code; end if;
  select id into v_person from public.people where school_id = v_school and email = lower(trim(p_email))::extensions.citext;
  if v_person is null then
    insert into public.people (school_id, email, first_name, last_name, honorific, staff_title, office_hours)
    values (v_school, lower(trim(p_email)), p_first, p_last, nullif(p_honorific, ''), 'Teacher (tester)', null)
    returning id into v_person;
  else
    update public.people set is_active = true, first_name = p_first, last_name = p_last,
      honorific = coalesce(nullif(p_honorific, ''), honorific) where id = v_person;
  end if;
  if not exists (select 1 from public.memberships where person_id = v_person and role = 'teacher' and scope_type = 'class'
                 and scope_id = v_class and (ends_at is null or ends_at > now())) then
    insert into public.memberships (school_id, person_id, role, scope_type, scope_id) values (v_school, v_person, 'teacher', 'class', v_class);
  end if;
  if p_as_parent_of is not null then
    select s.id into v_student from public.students s where s.school_id = v_school and s.sis_id like 'DEMO-%' and s.first_name = p_as_parent_of limit 1;
    if v_student is null then raise exception 'No demo student named %', p_as_parent_of; end if;
    insert into public.guardianships (student_id, person_id, relationship) values (v_student, v_person, 'guardian')
    on conflict do nothing;
  end if;
  insert into public.audit_log (school_id, actor_id, action, target_type, target_id, detail)
  values (v_school, null, 'tester.add', 'person', v_person::text, jsonb_build_object('class', p_class_code));
  return v_person;
end $$;
revoke execute on function private.add_tester(text, text, text, text, text, text) from public, anon, authenticated;

-- Set up a school: the school row plus its divisions and grades, copied from the demo school.
-- Run by an operator, e.g. select private.create_school('Zeeland Christian School', 'ZCS', 'zcs.org', 'office@zcs.org');
create or replace function private.create_school(p_name text, p_short text, p_domain text, p_office_email text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_school uuid; v_from uuid := private.demo_school(); d record; v_div uuid;
begin
  select id into v_school from public.schools where not is_demo and staff_email_domain = p_domain::extensions.citext;
  if v_school is not null then return v_school; end if;
  insert into public.schools (name, short_name, staff_email_domain, office_email, timezone, notification_preview, is_demo)
  select p_name, p_short, p_domain, nullif(p_office_email, ''), coalesce(s.timezone, 'America/Detroit'), coalesce(s.notification_preview, 'full'), false
  from (select 1) x left join public.schools s on s.id = v_from
  returning id into v_school;
  for d in select * from public.divisions where school_id = v_from order by sort_order loop
    insert into public.divisions (school_id, name, sort_order) values (v_school, d.name, d.sort_order) returning id into v_div;
    insert into public.grades (school_id, division_id, label, short_label, aliases, sort_order)
    select v_school, v_div, g.label, g.short_label, g.aliases, g.sort_order from public.grades g where g.division_id = d.id;
  end loop;
  insert into public.audit_log (school_id, actor_id, action, target_type, target_id, detail)
  values (v_school, null, 'school.create', 'school', v_school::text, jsonb_build_object('name', p_name));
  return v_school;
end $$;
revoke execute on function private.create_school(text, text, text, text) from public, anon, authenticated;

-- Add (or update) an office staff member of a school. They sign in with an emailed code.
create or replace function private.add_office_staff(p_school uuid, p_email text, p_first text, p_last text,
  p_honorific text default null, p_title text default 'Office', p_admin boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_person uuid; v_email text := lower(trim(p_email)); r public.role_kind;
begin
  select id into v_person from public.people where school_id = p_school and email = v_email::extensions.citext;
  if v_person is null then
    insert into public.people (school_id, email, first_name, last_name, honorific, staff_title)
    values (p_school, v_email, p_first, p_last, nullif(p_honorific, ''), p_title) returning id into v_person;
  else
    update public.people set is_active = true, first_name = p_first, last_name = p_last, staff_title = coalesce(p_title, staff_title),
      honorific = coalesce(nullif(p_honorific, ''), honorific) where id = v_person;
  end if;
  foreach r in array case when p_admin then array['office', 'admin']::public.role_kind[] else array['office']::public.role_kind[] end loop
    if not exists (select 1 from public.memberships m where m.person_id = v_person and m.role = r and (m.ends_at is null or m.ends_at > now())) then
      insert into public.memberships (school_id, person_id, role, scope_type) values (p_school, v_person, r, 'school');
    end if;
  end loop;
  insert into public.audit_log (school_id, actor_id, action, target_type, target_id, detail)
  values (p_school, null, 'staff.add_office', 'person', v_person::text, jsonb_build_object('admin', p_admin));
  return v_person;
end $$;
revoke execute on function private.add_office_staff(uuid, text, text, text, text, text, boolean) from public, anon, authenticated;
