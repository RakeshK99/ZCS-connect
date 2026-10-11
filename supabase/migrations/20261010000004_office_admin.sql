-- ZCS Connect · office & admin RPCs: people/roles, family requests, roster import,
-- conversation oversight (H3, always audited), calendar, dashboard.

create or replace function private.require_office() returns void
language plpgsql stable security definer set search_path = '' as $$
begin if not private.is_office() then raise exception 'office or admin only' using errcode = '42501'; end if; end $$;

create or replace function private.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin if not private.is_admin() then raise exception 'admin only' using errcode = '42501'; end if; end $$;

-- ---------------------------------------------------------------- people & roles
create or replace function public.admin_people(p_query text default null, p_staff_only boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_office();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'first_name', p.first_name, 'last_name', p.last_name,
    'honorific', p.honorific, 'email', p.email, 'staff_title', p.staff_title, 'signed_in', p.user_id is not null,
    'is_active', p.is_active,
    'memberships', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'scope_type', m.scope_type, 'scope_id', m.scope_id,
        'scope_label', case m.scope_type when 'school' then 'Whole school'
          when 'division' then (select d.name from public.divisions d where d.id = m.scope_id)
          when 'grade' then (select g.label from public.grades g where g.id = m.scope_id)
          when 'class' then (select c.code || ' · ' || c.name from public.classes c where c.id = m.scope_id) end,
        'starts_at', m.starts_at, 'ends_at', m.ends_at) order by m.role), '[]')
      from public.memberships m where m.person_id = p.id and (m.ends_at is null or m.ends_at > now())),
    'children', (select coalesce(jsonb_agg(private.student_name(s) || ' ' || s.last_name), '[]')
      from public.guardianships g join public.students s on s.id = g.student_id where g.person_id = p.id and g.is_active)
  ) order by p.last_name, p.first_name), '[]') into v
  from public.people p
  where p.school_id = private.my_school()
    and (p_query is null or (p.first_name || ' ' || p.last_name || ' ' || p.email) ilike '%' || p_query || '%')
    and (not p_staff_only or private.is_staff_person(p.id))
  limit 500;
  return v;
end $$;

create or replace function public.upsert_staff_person(p_email text, p_first text, p_last text, p_honorific text, p_title text, p_office_hours text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_domain text;
begin
  perform private.require_admin();
  select staff_email_domain into v_domain from public.schools where id = private.my_school();
  if split_part(lower(p_email), '@', 2) <> lower(v_domain) then
    raise exception 'Staff accounts must use an @% address', v_domain;
  end if;
  insert into public.people (school_id, email, first_name, last_name, honorific, staff_title, office_hours)
  values (private.my_school(), lower(p_email), p_first, p_last, nullif(p_honorific, ''), p_title, p_office_hours)
  on conflict (school_id, email) do update set first_name = excluded.first_name, last_name = excluded.last_name,
    honorific = excluded.honorific, staff_title = excluded.staff_title,
    office_hours = coalesce(excluded.office_hours, public.people.office_hours), is_active = true
  returning id into v_id;
  perform private.audit('person.upsert_staff', 'person', v_id::text, jsonb_build_object('email', p_email));
  return v_id;
end $$;

create or replace function public.grant_membership(p_person uuid, p_role public.role_kind, p_scope_type public.scope_kind,
  p_scope_id uuid default null, p_ends_at timestamptz default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_admin();
  if not exists (select 1 from public.people where id = p_person and school_id = private.my_school()) then
    raise exception 'person not found';
  end if;
  if p_role in ('office','emergency_sender','admin') and p_scope_type <> 'school' then
    raise exception '% is a whole-school role', p_role;
  end if;
  if p_role = 'principal' and p_scope_type <> 'division' then raise exception 'principals are scoped to a division'; end if;
  if p_role in ('teacher','aide','group_leader') and p_scope_type <> 'class' then raise exception '% is scoped to a class or group', p_role; end if;
  insert into public.memberships (school_id, person_id, role, scope_type, scope_id, ends_at, granted_by)
  values (private.my_school(), p_person, p_role, p_scope_type, case when p_scope_type = 'school' then null else p_scope_id end, p_ends_at, private.me())
  returning id into v_id;
  perform private.audit('membership.grant', 'membership', v_id::text,
    jsonb_build_object('person', p_person, 'role', p_role, 'scope_type', p_scope_type, 'scope_id', p_scope_id));
  return v_id;
end $$;

create or replace function public.revoke_membership(p_membership uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if (select person_id from public.memberships where id = p_membership) = private.me()
     and (select role from public.memberships where id = p_membership) = 'admin'
     and (select count(*) from public.memberships m where m.school_id = private.my_school() and m.role = 'admin'
          and (m.ends_at is null or m.ends_at > now())) <= 1 then
    raise exception 'You are the last admin; grant admin to someone else first';
  end if;
  update public.memberships set ends_at = now() where id = p_membership and school_id = private.my_school();
  perform private.audit('membership.revoke', 'membership', p_membership::text);
end $$;

-- ---------------------------------------------------------------- family requests
create or replace function public.family_requests_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_office();
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'email', f.email, 'note', f.note, 'status', f.status,
           'created_at', f.created_at) order by f.created_at desc), '[]') into v
  from public.family_requests f where f.school_id = private.my_school() and f.status = 'pending';
  return v;
end $$;

create or replace function public.resolve_family_request(p_request uuid, p_approve boolean, p_student_ids uuid[] default '{}',
  p_first text default '', p_last text default '', p_relationship text default 'guardian') returns void
language plpgsql security definer set search_path = '' as $$
declare f public.family_requests; v_person uuid; s uuid;
begin
  perform private.require_office();
  select * into f from public.family_requests where id = p_request and school_id = private.my_school() and status = 'pending';
  if f.id is null then raise exception 'request not found'; end if;
  if p_approve then
    if coalesce(array_length(p_student_ids, 1), 0) = 0 then raise exception 'choose at least one student'; end if;
    insert into public.people (school_id, email, first_name, last_name, user_id)
    values (f.school_id, f.email, p_first, p_last, f.user_id)
    on conflict (school_id, email) do update set user_id = coalesce(public.people.user_id, excluded.user_id)
    returning id into v_person;
    foreach s in array p_student_ids loop
      insert into public.guardianships (person_id, student_id, relationship, source, locked_by_office)
      select v_person, s, p_relationship, 'office', true where exists (select 1 from public.students where id = s and school_id = f.school_id)
      on conflict (person_id, student_id) do update set is_active = true, source = 'office';
    end loop;
  end if;
  update public.family_requests set status = case when p_approve then 'approved' else 'dismissed' end,
    resolved_by = private.me(), resolved_at = now() where id = p_request;
  perform private.audit(case when p_approve then 'family_request.approve' else 'family_request.dismiss' end,
    'family_request', p_request::text, jsonb_build_object('students', p_student_ids));
end $$;

create or replace function public.update_guardianship_flags(p_guardianship uuid, p_no_contact boolean, p_hide_contact boolean, p_can_sign boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_office();
  update public.guardianships g set no_contact = p_no_contact, hide_contact = p_hide_contact, can_sign_forms = p_can_sign,
    locked_by_office = true
  where g.id = p_guardianship and exists (select 1 from public.students s where s.id = g.student_id and s.school_id = private.my_school());
  perform private.audit('guardianship.flags', 'guardianship', p_guardianship::text,
    jsonb_build_object('no_contact', p_no_contact, 'hide_contact', p_hide_contact, 'can_sign_forms', p_can_sign));
end $$;

-- ---------------------------------------------------------------- roster import
-- The console wizard parses the spreadsheet and maps columns; it sends rows as
-- [{sis_id?, first, middle?, last, preferred?, grade, guardians:[{email, first, last, relationship?}]}].
create or replace function private.match_grade(p_school uuid, p_label text) returns uuid
language sql stable security definer set search_path = '' as $$
  select g.id from public.grades g where g.school_id = p_school and (
    lower(g.label) = lower(trim(p_label)) or lower(g.short_label) = lower(trim(p_label))
    or lower(trim(p_label)) = any(select lower(a) from unnest(g.aliases) a))
  limit 1
$$;

create or replace function private.match_student(p_school uuid, r jsonb, p_grade uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.students s where s.school_id = p_school and (
    (nullif(r->>'sis_id', '') is not null and s.sis_id = r->>'sis_id')
    or (nullif(r->>'sis_id', '') is null and lower(s.first_name) = lower(trim(r->>'first')) and lower(s.last_name) = lower(trim(r->>'last'))
        and (s.grade_id = p_grade or s.grade_id is null or p_grade is null)))
  order by s.is_active desc limit 1
$$;

create or replace function public.preview_roster_import(p_file_name text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_school uuid := private.my_school(); r jsonb; gd jsonb; v_grade uuid; v_student uuid;
  n_new int := 0; n_upd int := 0; n_same int := 0; n_fam_new int := 0; n_fam_link int := 0; n_deact int := 0;
  unmatched text[] := '{}'; dup_emails text[]; v_id uuid; seen uuid[] := '{}'; issues jsonb := '[]'; i int := 0;
begin
  perform private.require_office();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'no rows'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    if coalesce(trim(r->>'first'), '') = '' or coalesce(trim(r->>'last'), '') = '' then
      issues := issues || jsonb_build_object('row', i, 'problem', 'missing student name'); continue;
    end if;
    v_grade := private.match_grade(v_school, r->>'grade');
    if v_grade is null then unmatched := array_append(unmatched, coalesce(r->>'grade', '(blank)')); end if;
    v_student := private.match_student(v_school, r, v_grade);
    if v_student is null then n_new := n_new + 1;
    else
      seen := array_append(seen, v_student);
      if exists (select 1 from public.students s where s.id = v_student and (s.grade_id is distinct from v_grade
                 or coalesce(s.preferred_name,'') <> coalesce(r->>'preferred','') or coalesce(s.middle_name,'') <> coalesce(r->>'middle','') or not s.is_active))
      then n_upd := n_upd + 1; else n_same := n_same + 1; end if;
    end if;
    for gd in select * from jsonb_array_elements(coalesce(r->'guardians', '[]')) loop
      if coalesce(trim(gd->>'email'), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        issues := issues || jsonb_build_object('row', i, 'problem', 'guardian email missing or invalid: ' || coalesce(gd->>'email', '')); continue;
      end if;
      if not exists (select 1 from public.people p where p.school_id = v_school and p.email = lower(trim(gd->>'email'))::extensions.citext) then
        n_fam_new := n_fam_new + 1;
      end if;
      n_fam_link := n_fam_link + 1;
    end loop;
  end loop;
  select count(*) into n_deact from public.students s where s.school_id = v_school and s.is_active and not (s.id = any(seen));
  select array_agg(e) into dup_emails from (
    select lower(trim(g->>'email')) e from jsonb_array_elements(p_rows) r2, jsonb_array_elements(coalesce(r2->'guardians','[]')) g
    group by 1 having count(*) > 1) d;

  insert into public.roster_imports (school_id, uploaded_by, file_name, rows, summary)
  values (v_school, private.me(), p_file_name, p_rows, jsonb_build_object(
    'rows', jsonb_array_length(p_rows), 'new_students', n_new, 'updated_students', n_upd, 'unchanged_students', n_same,
    'deactivated_students', n_deact, 'new_guardians', n_fam_new, 'guardian_links', n_fam_link,
    'shared_guardians', coalesce(array_length(dup_emails, 1), 0),
    'unmatched_grades', (select coalesce(jsonb_agg(distinct u), '[]') from unnest(unmatched) u),
    'issues', issues))
  returning id into v_id;
  return jsonb_build_object('import_id', v_id) || (select summary from public.roster_imports where id = v_id);
end $$;

create or replace function public.apply_roster_import(p_import uuid, p_deactivate_missing boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare imp public.roster_imports; r jsonb; gd jsonb; v_school uuid; v_grade uuid; v_student uuid; v_person uuid; v_gid uuid;
  created_students uuid[] := '{}'; created_people uuid[] := '{}'; created_links uuid[] := '{}';
  updated jsonb := '[]'; deactivated uuid[] := '{}'; seen uuid[] := '{}'; prev jsonb;
begin
  perform private.require_office();
  select * into imp from public.roster_imports where id = p_import and school_id = private.my_school() for update;
  if imp.id is null or imp.status <> 'previewed' then raise exception 'import is not ready to apply'; end if;
  v_school := imp.school_id;
  for r in select * from jsonb_array_elements(imp.rows) loop
    continue when coalesce(trim(r->>'first'), '') = '' or coalesce(trim(r->>'last'), '') = '';
    v_grade := private.match_grade(v_school, r->>'grade');
    v_student := private.match_student(v_school, r, v_grade);
    if v_student is null then
      insert into public.students (school_id, sis_id, first_name, middle_name, last_name, preferred_name, grade_id)
      values (v_school, nullif(r->>'sis_id', ''), trim(r->>'first'), nullif(trim(r->>'middle'), ''), trim(r->>'last'),
              nullif(trim(r->>'preferred'), ''), v_grade)
      returning id into v_student;
      created_students := array_append(created_students, v_student);
    else
      select to_jsonb(s) into prev from public.students s where s.id = v_student;
      update public.students set grade_id = coalesce(v_grade, grade_id), middle_name = nullif(trim(r->>'middle'), ''),
        preferred_name = nullif(trim(r->>'preferred'), ''), is_active = true
      where id = v_student;
      updated := updated || jsonb_build_array(prev);
    end if;
    seen := array_append(seen, v_student);
    for gd in select * from jsonb_array_elements(coalesce(r->'guardians', '[]')) loop
      continue when coalesce(trim(gd->>'email'), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
      select id into v_person from public.people where school_id = v_school and email = lower(trim(gd->>'email'))::extensions.citext;
      if v_person is null then
        insert into public.people (school_id, email, first_name, last_name)
        values (v_school, lower(trim(gd->>'email')), coalesce(trim(gd->>'first'), ''), coalesce(trim(gd->>'last'), trim(r->>'last')))
        returning id into v_person;
        created_people := array_append(created_people, v_person);
      end if;
      insert into public.guardianships (person_id, student_id, relationship, source)
      values (v_person, v_student, coalesce(nullif(gd->>'relationship', ''), 'guardian'), 'import')
      on conflict (person_id, student_id) do nothing
      returning id into v_gid;
      if v_gid is not null then created_links := array_append(created_links, v_gid); v_gid := null; end if;
    end loop;
  end loop;
  if p_deactivate_missing then
    with d as (update public.students set is_active = false
               where school_id = v_school and is_active and not (id = any(seen)) returning id)
    select coalesce(array_agg(id), '{}') into deactivated from d;
  end if;
  update public.roster_imports set status = 'applied', applied_at = now(), undo = jsonb_build_object(
    'created_students', created_students, 'created_people', created_people, 'created_links', created_links,
    'updated_students', updated, 'deactivated_students', deactivated)
  where id = p_import;
  perform private.audit('roster.apply', 'roster_import', p_import::text, jsonb_build_object(
    'new_students', cardinality(created_students), 'new_people', cardinality(created_people),
    'new_links', cardinality(created_links), 'deactivated', cardinality(deactivated)));
  return jsonb_build_object('new_students', cardinality(created_students), 'new_guardians', cardinality(created_people),
    'new_links', cardinality(created_links), 'updated_students', jsonb_array_length(updated), 'deactivated_students', cardinality(deactivated));
end $$;

create or replace function public.revert_roster_import(p_import uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare imp public.roster_imports; u jsonb;
begin
  perform private.require_office();
  select * into imp from public.roster_imports where id = p_import and school_id = private.my_school() for update;
  if imp.id is null or imp.status <> 'applied' then raise exception 'only an applied import can be reverted'; end if;
  if exists (select 1 from public.roster_imports where school_id = imp.school_id and status = 'applied' and applied_at > imp.applied_at) then
    raise exception 'revert newer imports first';
  end if;
  delete from public.guardianships where id in (select (jsonb_array_elements_text(imp.undo->'created_links'))::uuid);
  update public.students set is_active = true where id in (select (jsonb_array_elements_text(imp.undo->'deactivated_students'))::uuid);
  for u in select * from jsonb_array_elements(imp.undo->'updated_students') loop
    update public.students set grade_id = (u->>'grade_id')::uuid, middle_name = u->>'middle_name',
      preferred_name = u->>'preferred_name', is_active = (u->>'is_active')::boolean where id = (u->>'id')::uuid;
  end loop;
  -- created students/people are removed only if nothing else references them yet
  delete from public.students s where s.id in (select (jsonb_array_elements_text(imp.undo->'created_students'))::uuid)
    and not exists (select 1 from public.threads t where t.student_id = s.id);
  delete from public.people p where p.id in (select (jsonb_array_elements_text(imp.undo->'created_people'))::uuid)
    and p.user_id is null and not exists (select 1 from public.guardianships g where g.person_id = p.id);
  update public.roster_imports set status = 'reverted', reverted_at = now() where id = p_import;
  perform private.audit('roster.revert', 'roster_import', p_import::text);
end $$;

-- ---------------------------------------------------------------- oversight (H3)
create or replace function public.oversight_threads(p_query text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'student', private.student_name(s) || ' ' || s.last_name, 'grade', g.label,
    'participants', (select jsonb_agg(case when tp.context = 'staff' then private.staff_name(p) else trim(p.first_name || ' ' || p.last_name) end)
                     from public.thread_participants tp join public.people p on p.id = tp.person_id where tp.thread_id = t.id),
    'messages', (select count(*) from public.messages m where m.thread_id = t.id),
    'last_message_at', t.last_message_at) order by t.last_message_at desc), '[]') into v
  from public.threads t join public.students s on s.id = t.student_id left join public.grades g on g.id = s.grade_id
  where t.school_id = private.my_school()
    and (p_query is null or (s.first_name || ' ' || s.last_name) ilike '%' || p_query || '%'
         or exists (select 1 from public.thread_participants tp join public.people p on p.id = tp.person_id
                    where tp.thread_id = t.id and (p.first_name || ' ' || p.last_name) ilike '%' || p_query || '%'));
  perform private.audit('oversight.list_threads', 'thread', null, jsonb_build_object('query', p_query));
  return v;
end $$;

create or replace function public.oversight_open_thread(p_thread uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_admin();
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required to open a conversation'; end if;
  if not exists (select 1 from public.threads where id = p_thread and school_id = private.my_school()) then raise exception 'not found'; end if;
  perform private.audit('oversight.open_thread', 'thread', p_thread::text, jsonb_build_object('reason', p_reason));
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'sender', case when tp.context = 'staff' then private.staff_name(p) else trim(p.first_name || ' ' || p.last_name) end,
           'sender_context', tp.context, 'body', m.body, 'created_at', m.created_at) order by m.created_at), '[]') into v
  from public.messages m join public.people p on p.id = m.sender_id
  left join public.thread_participants tp on tp.thread_id = m.thread_id and tp.person_id = m.sender_id
  where m.thread_id = p_thread;
  return v;
end $$;

-- ---------------------------------------------------------------- calendar
create or replace function public.upsert_calendar_event(p_id uuid, p_title text, p_starts_on date, p_ends_on date,
  p_start_time time, p_end_time time, p_location text, p_no_school boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_office();
  if p_id is null then
    insert into public.calendar_events (school_id, title, starts_on, ends_on, start_time, end_time, location, no_school, created_by)
    values (private.my_school(), p_title, p_starts_on, p_ends_on, p_start_time, p_end_time, nullif(p_location, ''), p_no_school, private.me())
    returning id into v_id;
  else
    update public.calendar_events set title = p_title, starts_on = p_starts_on, ends_on = p_ends_on, start_time = p_start_time,
      end_time = p_end_time, location = nullif(p_location, ''), no_school = p_no_school
    where id = p_id and school_id = private.my_school() returning id into v_id;
  end if;
  perform private.audit('calendar.upsert', 'calendar_event', v_id::text);
  return v_id;
end $$;

create or replace function public.delete_calendar_event(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_office();
  delete from public.calendar_events where id = p_id and school_id = private.my_school();
  perform private.audit('calendar.delete', 'calendar_event', p_id::text);
end $$;

-- ---------------------------------------------------------------- dashboard
create or replace function public.recent_sends(p_limit int default 25) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not (private.is_office() or exists (select 1 from private.my_division_ids())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'author', p.author_label,
      'audience_label', p.audience_label, 'priority', p.priority, 'status', p.status,
      'sent_at', p.sent_at, 'scheduled_at', p.scheduled_at,
      'reach', case when p.status = 'sent' then public.post_reach_summary(p.id) end)
    order by coalesce(p.sent_at, p.scheduled_at) desc), '[]') into v
  from (select * from public.posts p where p.school_id = private.my_school() and p.status <> 'cancelled'
          and private.can_read_post(p.id)
        order by coalesce(p.sent_at, p.scheduled_at) desc limit least(p_limit, 100)) p;
  return v;
end $$;

create or replace function public.school_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_office();
  return jsonb_build_object(
    'students', (select count(*) from public.students where school_id = private.my_school() and is_active),
    'families_with_app', (select count(distinct g.student_id) from public.guardianships g join public.devices d on d.person_id = g.person_id
                          join public.students s on s.id = g.student_id and s.school_id = private.my_school() and s.is_active where g.is_active),
    'guardians', (select count(distinct g.person_id) from public.guardianships g join public.students s on s.id = g.student_id
                  and s.school_id = private.my_school() and s.is_active where g.is_active),
    'guardians_signed_in', (select count(distinct g.person_id) from public.guardianships g join public.people p on p.id = g.person_id and p.user_id is not null
                  join public.students s on s.id = g.student_id and s.school_id = private.my_school() and s.is_active where g.is_active),
    'pending_requests', (select count(*) from public.family_requests where school_id = private.my_school() and status = 'pending'));
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.admin_people(text, boolean), public.upsert_staff_person(text, text, text, text, text, text),
  public.grant_membership(uuid, public.role_kind, public.scope_kind, uuid, timestamptz), public.revoke_membership(uuid),
  public.family_requests_queue(), public.resolve_family_request(uuid, boolean, uuid[], text, text, text),
  public.update_guardianship_flags(uuid, boolean, boolean, boolean),
  public.preview_roster_import(text, jsonb), public.apply_roster_import(uuid, boolean), public.revert_roster_import(uuid),
  public.oversight_threads(text), public.oversight_open_thread(uuid, text),
  public.upsert_calendar_event(uuid, text, date, date, time, time, text, boolean), public.delete_calendar_event(uuid),
  public.recent_sends(int), public.school_stats()
to authenticated;
