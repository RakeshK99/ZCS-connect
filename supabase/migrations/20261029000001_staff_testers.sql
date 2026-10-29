-- ZCS Connect · staff user testing (Oct 23 call with ZCS).
--
-- Real ZCS staff test with their own email in the demo school, and the shared
-- demo accounts can't be deleted from the app (one tester would remove a demo
-- person for everyone).

-- ---------------------------------------------------------------- demo accounts can't be deleted
create or replace function private.is_demo_email(p_email text) returns boolean
language sql immutable as $$
  select coalesce(p_email ilike '%@example.com' or p_email ilike 'rakesh+%@syzygy.services', false)
$$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.me();
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if private.is_demo_email((select u.email from auth.users u where u.id = auth.uid())) then
    raise exception 'Demo accounts are shared by everyone testing, so they can''t be deleted.' using errcode = '42501';
  end if;
  if v_me is not null then
    perform private.audit('account.delete', 'person', v_me::text);
    delete from public.devices where person_id = v_me;
    delete from public.notification_prefs where person_id = v_me;
    delete from public.post_reads where person_id = v_me;
    update public.thread_participants set last_read_at = null where person_id = v_me;
    update public.people set user_id = null, account_deleted_at = now() where id = v_me;
  end if;
  delete from public.family_requests where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------- staff testers
-- Adds (or updates) a ZCS staff member in the demo school and makes them a
-- teacher of a demo class, so they can sign in with their own email and an
-- emailed code. Run by an operator in the SQL editor, e.g.
--   select private.add_tester('pjenkins@zcs.org', 'Peter', 'Jenkins', 'Mr.', '3S');
-- p_as_parent_of: optional demo student first name, to also try the parent view.
create or replace function private.add_tester(p_email text, p_first text, p_last text, p_honorific text default null,
  p_class_code text default '3S', p_as_parent_of text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_school uuid; v_person uuid; v_class uuid; v_student uuid;
begin
  select id into v_school from public.schools order by created_at limit 1;
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
