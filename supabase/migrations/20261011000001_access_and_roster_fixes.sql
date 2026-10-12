-- ZCS Connect · code review fixes, part 1: access follows current rights.
--
-- H1  Threads: access is re-checked against current rights on every read/send.
--     A guardian flagged no_contact (or deactivated), or a teacher whose class
--     membership ended, loses access to existing threads and stops being notified.
-- H2  Roster import deactivates guardian links that dropped off the sheet (and
--     re-activates ones that came back); undo restores both.
-- M7  Roster matching falls back from SIS id to name+grade (and back-fills the
--     SIS id) instead of creating duplicates; "deactivate missing" defaults off.
-- M2  Principals see reach and send reminders only for students in their
--     division; a family can be reminded about a post at most once an hour.
-- M3  Sending to divisions/grades/classes/students needs the office role, not admin.
-- M6  Office RPCs to look up a student's guardians and set custody flags / end a link.
-- L5  register_device validates the Expo token and platform.
-- L7  grant_membership validates the scope belongs to the school; cancel_post
--     office branch is school-scoped.
-- L8  Last-admin guard counts people, applies to any admin revoke, and locks.

-- ---------------------------------------------------------------- H1: thread access
create or replace function private.person_can_see_student_as_staff(p_person uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s
    join public.memberships m on m.person_id = p_person and m.school_id = s.school_id
     and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
    where s.id = p_student and s.is_active and (
      m.role in ('office', 'admin')
      or (m.scope_type = 'class' and m.role in ('teacher', 'aide', 'group_leader')
          and exists (select 1 from public.enrollments e where e.class_id = m.scope_id and e.student_id = s.id))
      or (m.scope_type = 'division' and m.role = 'principal'
          and exists (select 1 from public.grades g where g.id = s.grade_id and g.division_id = m.scope_id))))
$$;

-- A participant may use a thread only while they still hold the right that let
-- them into it: an active, contactable guardianship (parent side) or a current
-- staff relationship to the student (staff side).
create or replace function private.person_can_use_thread(p_person uuid, p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.thread_participants tp
    join public.threads t on t.id = tp.thread_id
    join public.people p on p.id = tp.person_id and p.is_active
    where tp.thread_id = p_thread and tp.person_id = p_person and (
      (tp.context = 'parent' and exists (
        select 1 from public.guardianships g join public.students s on s.id = g.student_id and s.is_active
        where g.person_id = p_person and g.student_id = t.student_id and g.is_active and not g.no_contact))
      or (tp.context = 'staff' and private.person_can_see_student_as_staff(p_person, t.student_id))))
$$;

-- Used by the threads / thread_participants / messages RLS policies and send_message.
create or replace function private.in_thread(p_thread uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.person_can_use_thread(private.me(), p_thread)
$$;

create or replace function public.my_threads(p_context public.app_context) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'last_message_at' desc), '[]') from (
    select jsonb_build_object(
      'id', t.id, 'student_id', s.id, 'student_name', private.student_name(s) || ' ' || s.last_name,
      'student_first', private.student_name(s), 'grade', g.label,
      'with', (select string_agg(case when op.context = 'staff' then private.staff_name(p) else trim(p.first_name || ' ' || p.last_name) end, ', ')
               from public.thread_participants op join public.people p on p.id = op.person_id
               where op.thread_id = t.id and op.person_id <> private.me()),
      'with_sub', (select string_agg(case when op.context = 'staff'
                        then coalesce(p.staff_title, 'Staff')
                        else private.student_name(s) || '''s ' || private.relationship_label(gg.relationship) end, ', ')
               from public.thread_participants op join public.people p on p.id = op.person_id
               left join public.guardianships gg on gg.person_id = p.id and gg.student_id = s.id
               where op.thread_id = t.id and op.person_id <> private.me()),
      'office_hours', (select string_agg(p.office_hours, ' ') from public.thread_participants op join public.people p on p.id = op.person_id
               where op.thread_id = t.id and op.context = 'staff' and op.person_id <> private.me()),
      'last_message', (select m.body from public.messages m where m.thread_id = t.id order by m.created_at desc limit 1),
      'last_message_at', t.last_message_at,
      'unread', exists (select 1 from public.messages m where m.thread_id = t.id and m.sender_id <> private.me()
                        and m.created_at > coalesce(me.last_read_at, '-infinity'))
    ) x
    from public.thread_participants me
    join public.threads t on t.id = me.thread_id
    join public.students s on s.id = t.student_id
    left join public.grades g on g.id = s.grade_id
    where me.person_id = private.me() and me.context = p_context and private.in_thread(t.id)
  ) q
$$;

create or replace function public.send_message(p_thread uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; r record;
begin
  if not private.in_thread(p_thread) then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'empty message'; end if;
  if length(p_body) > 5000 then raise exception 'Messages can be up to 5,000 characters'; end if;
  insert into public.messages (thread_id, sender_id, body) values (p_thread, private.me(), trim(p_body)) returning id into v_id;
  update public.threads set last_message_at = now() where id = p_thread;
  update public.thread_participants set last_read_at = now() where thread_id = p_thread and person_id = private.me();
  -- notify only participants who may still use the thread
  for r in select tp.person_id, tp.context from public.thread_participants tp
           where tp.thread_id = p_thread and tp.person_id <> private.me()
             and private.person_can_use_thread(tp.person_id, p_thread) loop
    perform pgmq.send('notify', jsonb_build_object('kind','message','message_id',v_id,'person_id',r.person_id,'context',r.context,'channel','push'),
                      private.in_quiet_hours(r.person_id, r.context));
  end loop;
  return v_id;
end $$;

-- ---------------------------------------------------------------- M7: roster matching
-- Prefer the SIS id; if the row's id isn't known yet, fall back to name + grade
-- among students that don't have an SIS id (so a first import without ids
-- followed by one with ids updates the same students).
create or replace function private.match_student(p_school uuid, r jsonb, p_grade uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select s.id from public.students s
     where s.school_id = p_school and nullif(trim(r->>'sis_id'), '') is not null and s.sis_id = trim(r->>'sis_id')
     limit 1),
    (select s.id from public.students s
     where s.school_id = p_school
       and (nullif(trim(r->>'sis_id'), '') is null or s.sis_id is null)
       and lower(s.first_name) = lower(trim(r->>'first')) and lower(s.last_name) = lower(trim(r->>'last'))
       and (s.grade_id = p_grade or s.grade_id is null or p_grade is null)
     order by s.is_active desc, s.created_at limit 1))
$$;

-- Valid, lower-cased guardian emails listed on a roster row.
create or replace function private.row_guardian_emails(r jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct lower(trim(g->>'email'))), '{}')
  from jsonb_array_elements(coalesce(r->'guardians', '[]')) g
  where coalesce(trim(g->>'email'), '') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
$$;

-- Active guardian links that a row would end: import-sourced, not locked by the
-- office, and not listed on the row. Rows with no guardians listed end nothing.
create or replace function private.links_dropped_by_row(p_school uuid, p_student uuid, p_emails text[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select g.id from public.guardianships g join public.people p on p.id = g.person_id
  where g.student_id = p_student and g.is_active and g.source = 'import' and not g.locked_by_office
    and cardinality(p_emails) > 0 and p.school_id = p_school
    and not (lower(p.email::text) = any(p_emails))
$$;

create or replace function public.preview_roster_import(p_file_name text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_school uuid := private.my_school(); r jsonb; gd jsonb; v_grade uuid; v_student uuid;
  n_new int := 0; n_upd int := 0; n_same int := 0; n_fam_new int := 0; n_fam_link int := 0; n_deact int := 0; n_removed int := 0;
  unmatched text[] := '{}'; dup_emails text[]; v_id uuid; seen uuid[] := '{}'; issues jsonb := '[]'; i int := 0;
begin
  perform private.require_office();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'no rows'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Import up to 5,000 rows at a time'; end if;
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
      n_removed := n_removed + (select count(*) from private.links_dropped_by_row(v_school, v_student, private.row_guardian_emails(r)));
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
    'removed_guardian_links', n_removed,
    'shared_guardians', coalesce(array_length(dup_emails, 1), 0),
    'unmatched_grades', (select coalesce(jsonb_agg(distinct u), '[]') from unnest(unmatched) u),
    'issues', issues))
  returning id into v_id;
  return jsonb_build_object('import_id', v_id) || (select summary from public.roster_imports where id = v_id);
end $$;

create or replace function public.apply_roster_import(p_import uuid, p_deactivate_missing boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare imp public.roster_imports; r jsonb; gd jsonb; v_school uuid; v_grade uuid; v_student uuid; v_person uuid;
  v_gid uuid; v_inserted boolean; v_emails text[];
  created_students uuid[] := '{}'; created_people uuid[] := '{}'; created_links uuid[] := '{}';
  reactivated_links uuid[] := '{}'; dropped_links uuid[] := '{}';
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
      values (v_school, nullif(trim(r->>'sis_id'), ''), trim(r->>'first'), nullif(trim(r->>'middle'), ''), trim(r->>'last'),
              nullif(trim(r->>'preferred'), ''), v_grade)
      returning id into v_student;
      created_students := array_append(created_students, v_student);
    else
      select to_jsonb(s) into prev from public.students s where s.id = v_student;
      update public.students set grade_id = coalesce(v_grade, grade_id), middle_name = nullif(trim(r->>'middle'), ''),
        preferred_name = nullif(trim(r->>'preferred'), ''), is_active = true,
        sis_id = coalesce(sis_id, nullif(trim(r->>'sis_id'), ''))
      where id = v_student;
      updated := updated || jsonb_build_array(prev);
    end if;
    seen := array_append(seen, v_student);

    v_emails := private.row_guardian_emails(r);
    for gd in select * from jsonb_array_elements(coalesce(r->'guardians', '[]')) loop
      continue when coalesce(trim(gd->>'email'), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
      select id into v_person from public.people where school_id = v_school and email = lower(trim(gd->>'email'))::extensions.citext;
      if v_person is null then
        insert into public.people (school_id, email, first_name, last_name)
        values (v_school, lower(trim(gd->>'email')), coalesce(trim(gd->>'first'), ''), coalesce(trim(gd->>'last'), trim(r->>'last')))
        returning id into v_person;
        created_people := array_append(created_people, v_person);
      end if;
      v_gid := null;
      insert into public.guardianships as g (person_id, student_id, relationship, source)
      values (v_person, v_student, coalesce(nullif(gd->>'relationship', ''), 'guardian'), 'import')
      on conflict (person_id, student_id) do update set is_active = true
        where g.is_active = false and not g.locked_by_office
      returning g.id, (xmax = 0) into v_gid, v_inserted;
      if v_gid is not null then
        if v_inserted then created_links := array_append(created_links, v_gid);
        else reactivated_links := array_append(reactivated_links, v_gid); end if;
      end if;
    end loop;

    -- H2: guardians no longer listed for this student stop receiving anything
    with d as (update public.guardianships set is_active = false
               where id in (select private.links_dropped_by_row(v_school, v_student, v_emails)) returning id)
    select dropped_links || coalesce(array_agg(id), '{}') into dropped_links from d;
  end loop;
  if p_deactivate_missing then
    with d as (update public.students set is_active = false
               where school_id = v_school and is_active and not (id = any(seen)) returning id)
    select coalesce(array_agg(id), '{}') into deactivated from d;
  end if;
  update public.roster_imports set status = 'applied', applied_at = now(), undo = jsonb_build_object(
    'created_students', created_students, 'created_people', created_people, 'created_links', created_links,
    'reactivated_links', reactivated_links, 'dropped_links', dropped_links,
    'updated_students', updated, 'deactivated_students', deactivated)
  where id = p_import;
  perform private.audit('roster.apply', 'roster_import', p_import::text, jsonb_build_object(
    'new_students', cardinality(created_students), 'new_people', cardinality(created_people),
    'new_links', cardinality(created_links), 'reactivated_links', cardinality(reactivated_links),
    'removed_links', cardinality(dropped_links), 'deactivated', cardinality(deactivated)));
  return jsonb_build_object('new_students', cardinality(created_students), 'new_guardians', cardinality(created_people),
    'new_links', cardinality(created_links), 'reactivated_links', cardinality(reactivated_links),
    'removed_guardian_links', cardinality(dropped_links),
    'updated_students', jsonb_array_length(updated), 'deactivated_students', cardinality(deactivated));
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
  delete from public.guardianships where id in (select (jsonb_array_elements_text(coalesce(imp.undo->'created_links', '[]')))::uuid);
  update public.guardianships set is_active = false
    where id in (select (jsonb_array_elements_text(coalesce(imp.undo->'reactivated_links', '[]')))::uuid);
  update public.guardianships set is_active = true
    where id in (select (jsonb_array_elements_text(coalesce(imp.undo->'dropped_links', '[]')))::uuid);
  update public.students set is_active = true where id in (select (jsonb_array_elements_text(imp.undo->'deactivated_students'))::uuid);
  for u in select * from jsonb_array_elements(imp.undo->'updated_students') loop
    update public.students set grade_id = (u->>'grade_id')::uuid, middle_name = u->>'middle_name',
      preferred_name = u->>'preferred_name', is_active = (u->>'is_active')::boolean, sis_id = u->>'sis_id'
    where id = (u->>'id')::uuid;
  end loop;
  -- created students/people are removed only if nothing else references them yet
  delete from public.students s where s.id in (select (jsonb_array_elements_text(imp.undo->'created_students'))::uuid)
    and not exists (select 1 from public.threads t where t.student_id = s.id);
  delete from public.people p where p.id in (select (jsonb_array_elements_text(imp.undo->'created_people'))::uuid)
    and p.user_id is null and not exists (select 1 from public.guardianships g where g.person_id = p.id);
  update public.roster_imports set status = 'reverted', reverted_at = now() where id = p_import;
  perform private.audit('roster.revert', 'roster_import', p_import::text);
end $$;

-- ---------------------------------------------------------------- M6: custody flags
create or replace function public.office_student_guardians(p_query text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; q text := nullif(trim(coalesce(p_query, '')), '');
begin
  perform private.require_office();
  if q is null or length(q) < 2 then return '[]'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'name', private.student_name(s) || ' ' || s.last_name, 'grade', g.label, 'is_active', s.is_active,
    'guardians', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', gs.id, 'person_id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'email', p.email,
        'relationship', gs.relationship, 'no_contact', gs.no_contact, 'hide_contact', gs.hide_contact,
        'can_sign_forms', gs.can_sign_forms, 'locked_by_office', gs.locked_by_office, 'source', gs.source,
        'is_active', gs.is_active, 'signed_in', p.user_id is not null) order by gs.is_active desc, p.first_name), '[]')
      from public.guardianships gs join public.people p on p.id = gs.person_id where gs.student_id = s.id)
  ) order by s.last_name, s.first_name), '[]') into v
  from (select * from public.students st
        where st.school_id = private.my_school()
          and (st.first_name || ' ' || coalesce(st.preferred_name, '') || ' ' || st.last_name) ilike '%' || q || '%'
        order by st.is_active desc, st.last_name, st.first_name limit 25) s
  left join public.grades g on g.id = s.grade_id;
  return v;
end $$;

create or replace function public.update_guardianship_flags(p_guardianship uuid, p_no_contact boolean, p_hide_contact boolean, p_can_sign boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_office();
  update public.guardianships g set no_contact = p_no_contact, hide_contact = p_hide_contact, can_sign_forms = p_can_sign,
    locked_by_office = true
  where g.id = p_guardianship and exists (select 1 from public.students s where s.id = g.student_id and s.school_id = private.my_school());
  if not found then raise exception 'guardian link not found'; end if;
  perform private.audit('guardianship.flags', 'guardianship', p_guardianship::text,
    jsonb_build_object('no_contact', p_no_contact, 'hide_contact', p_hide_contact, 'can_sign_forms', p_can_sign));
end $$;

-- End (or restore) a guardian link. Office-set links are locked so a later import won't undo it.
create or replace function public.set_guardianship_active(p_guardianship uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_office();
  update public.guardianships g set is_active = p_active, locked_by_office = true
  where g.id = p_guardianship and exists (select 1 from public.students s where s.id = g.student_id and s.school_id = private.my_school());
  if not found then raise exception 'guardian link not found'; end if;
  perform private.audit(case when p_active then 'guardianship.restore' else 'guardianship.end' end, 'guardianship', p_guardianship::text);
end $$;

-- ---------------------------------------------------------------- M2: reach scope + reminder throttle
-- Authors and the office see every family; principals (and other readers with
-- reach rights) see only students they can see as staff.
create or replace function private.can_see_all_reach(p_post uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.posts p where p.id = p_post
                 and (p.author_id = private.me() or (p.school_id = private.my_school() and private.is_office())))
$$;

create or replace function private.post_family_status(p_post uuid)
returns table (student_id uuid, family text, child text, reached boolean, read boolean, acked boolean, via text, has_device boolean)
language sql stable security definer set search_path = '' as $$
  with scope as (
    select private.can_see_all_reach(p_post) as all_ok,
           array(select private.staff_student_ids()) as mine
  ),
  fam as (
    select unnest(r.student_ids) as student_id, r.person_id from public.post_recipients r
    where r.post_id = p_post and r.context = 'parent'
  )
  select s.id, s.last_name || ' family', private.student_name(s),
    bool_or(exists (select 1 from public.deliveries d where d.post_id = p_post and d.person_id = f.person_id and d.status in ('sent','delivered'))
            or exists (select 1 from public.post_reads x where x.post_id = p_post and x.person_id = f.person_id)),
    bool_or(exists (select 1 from public.post_reads x where x.post_id = p_post and x.person_id = f.person_id)),
    bool_or(exists (select 1 from public.post_acks x where x.post_id = p_post and x.person_id = f.person_id)),
    case when bool_or(exists (select 1 from public.deliveries d where d.post_id = p_post and d.person_id = f.person_id and d.channel = 'push' and d.status in ('sent','delivered'))) then 'Push'
         when bool_or(exists (select 1 from public.deliveries d where d.post_id = p_post and d.person_id = f.person_id and d.channel = 'email' and d.status in ('sent','delivered'))) then 'Email'
         when bool_or(exists (select 1 from public.post_reads x where x.post_id = p_post and x.person_id = f.person_id)) then 'App'
    end,
    bool_or(exists (select 1 from public.devices dv where dv.person_id = f.person_id))
  from fam f join public.students s on s.id = f.student_id, scope
  where scope.all_ok or f.student_id = any(scope.mine)
  group by s.id
$$;

create or replace function public.remind_families(p_post uuid, p_student_ids uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_ids uuid[];
begin
  if not private.can_see_reach(p_post) then raise exception 'not allowed' using errcode = '42501'; end if;
  -- only students the caller may see reach for, and not reminded about this post in the last hour
  select coalesce(array_agg(x), '{}') into v_ids from unnest(coalesce(p_student_ids, '{}')) x
  where (private.can_see_all_reach(p_post) or x in (select private.staff_student_ids()))
    and not exists (select 1 from public.audit_log a where a.action = 'post.remind' and a.target_id = p_post::text
                    and a.at > now() - interval '1 hour' and a.detail->'students' ? x::text);
  if cardinality(v_ids) = 0 then return 0; end if;
  for r in select distinct pr.person_id, pr.context from public.post_recipients pr
           where pr.post_id = p_post and pr.context = 'parent' and pr.student_ids && v_ids loop
    perform pgmq.send('notify', jsonb_build_object('kind','post','post_id',p_post,'person_id',r.person_id,'context',r.context,'channel','email','reminder',true),
                      private.in_quiet_hours(r.person_id, r.context));
    n := n + 1;
  end loop;
  perform private.audit('post.remind', 'post', p_post::text, jsonb_build_object('students', to_jsonb(v_ids)));
  return n;
end $$;

-- ---------------------------------------------------------------- M3: who may send
-- The office role sends; admin is an IT/oversight role and sends nothing by default.
create or replace function private.is_sending_office() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role(array['office']::public.role_kind[])
$$;

create or replace function private.can_post_to(p_audience jsonb, p_priority public.post_priority) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare i jsonb; t text; v_id uuid; ok boolean; v_office boolean := private.is_sending_office();
begin
  if p_audience is null or jsonb_typeof(p_audience) <> 'array' or jsonb_array_length(p_audience) = 0 then return false; end if;
  if p_priority = 'emergency' and not private.has_role(array['emergency_sender']::public.role_kind[]) then return false; end if;
  for i in select * from jsonb_array_elements(p_audience) loop
    t := i->>'type'; v_id := nullif(i->>'id', '')::uuid;
    ok := case t
      when 'school' then private.has_role(array['office','emergency_sender']::public.role_kind[])
      when 'staff' then private.has_role(array['office','principal']::public.role_kind[])
      when 'division' then (v_office and exists (select 1 from public.divisions d where d.id = v_id and d.school_id = private.my_school()))
        or v_id in (select private.my_division_ids())
      when 'grade' then (v_office and exists (select 1 from public.grades g where g.id = v_id and g.school_id = private.my_school()))
        or exists (select 1 from public.grades g where g.id = v_id and g.division_id in (select private.my_division_ids()))
      when 'class' then (v_office and exists (select 1 from public.classes c where c.id = v_id and c.school_id = private.my_school()))
        or v_id in (select private.my_class_ids())
        or exists (select 1 from public.classes c join public.grades g on g.id = c.grade_id where c.id = v_id and g.division_id in (select private.my_division_ids()))
      when 'student' then (v_office and exists (select 1 from public.students s where s.id = v_id and s.school_id = private.my_school()))
        or v_id in (select private.staff_student_ids())
      else false end;
    if not coalesce(ok, false) then return false; end if;
  end loop;
  return true;
end $$;

create or replace function public.my_audiences() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(a order by a->>'sort'), '[]') from (
    select jsonb_build_object('type','school','label','All families','sort','0') a
      where private.has_role(array['office','emergency_sender']::public.role_kind[])
    union all select jsonb_build_object('type','staff','label','All staff','sort','1')
      where private.has_role(array['office','principal']::public.role_kind[])
    union all select jsonb_build_object('type','division','id',d.id,'label',d.name,'sort','2'||d.sort_order)
      from public.divisions d where d.school_id = private.my_school() and (private.is_sending_office() or d.id in (select private.my_division_ids()))
    union all select jsonb_build_object('type','grade','id',g.id,'label',g.label,'sort','3'||lpad(g.sort_order::text,3,'0'))
      from public.grades g where g.school_id = private.my_school() and (private.is_sending_office() or g.division_id in (select private.my_division_ids()))
    union all select jsonb_build_object('type','class','id',c.id,'label',c.code || ' · ' || c.name,'kind',c.kind,'mine',c.id in (select private.my_class_ids()),'sort','4'||c.code)
      from public.classes c where c.school_id = private.my_school() and c.is_active and (
        private.is_sending_office() or c.id in (select private.my_class_ids())
        or c.grade_id in (select g.id from public.grades g where g.division_id in (select private.my_division_ids())))
  ) x
$$;

-- ---------------------------------------------------------------- L5 / L7 / L8
create or replace function public.register_device(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.me() is null then return; end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$' then
    raise exception 'invalid push token' using errcode = '22023';
  end if;
  if p_platform not in ('ios', 'android') then raise exception 'invalid platform' using errcode = '22023'; end if;
  insert into public.devices (person_id, expo_token, platform) values (private.me(), p_token, p_platform)
  on conflict (expo_token) do update set person_id = excluded.person_id, platform = excluded.platform, last_seen_at = now();
end $$;

create or replace function public.cancel_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.posts set status = 'cancelled'
  where id = p_post and status = 'scheduled' and school_id = private.my_school()
    and (author_id = private.me() or private.is_office());
  if not found then raise exception 'only scheduled posts you own can be cancelled' using errcode = '42501'; end if;
  perform private.audit('post.cancel', 'post', p_post::text);
end $$;

create or replace function public.grant_membership(p_person uuid, p_role public.role_kind, p_scope_type public.scope_kind,
  p_scope_id uuid default null, p_ends_at timestamptz default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_school uuid := private.my_school();
begin
  perform private.require_admin();
  if not exists (select 1 from public.people where id = p_person and school_id = v_school and is_active) then
    raise exception 'person not found';
  end if;
  if p_role in ('office','emergency_sender','admin') and p_scope_type <> 'school' then
    raise exception '% is a whole-school role', p_role;
  end if;
  if p_role = 'principal' and p_scope_type <> 'division' then raise exception 'principals are scoped to a division'; end if;
  if p_role in ('teacher','aide','group_leader') and p_scope_type <> 'class' then raise exception '% is scoped to a class or group', p_role; end if;
  if p_scope_type = 'division' and not exists (select 1 from public.divisions where id = p_scope_id and school_id = v_school) then
    raise exception 'division not found';
  elsif p_scope_type = 'grade' and not exists (select 1 from public.grades where id = p_scope_id and school_id = v_school) then
    raise exception 'grade not found';
  elsif p_scope_type = 'class' and not exists (select 1 from public.classes where id = p_scope_id and school_id = v_school) then
    raise exception 'class not found';
  end if;
  if p_ends_at is not null and p_ends_at <= now() then raise exception 'end date must be in the future'; end if;
  insert into public.memberships (school_id, person_id, role, scope_type, scope_id, ends_at, granted_by)
  values (v_school, p_person, p_role, p_scope_type, case when p_scope_type = 'school' then null else p_scope_id end, p_ends_at, private.me())
  returning id into v_id;
  perform private.audit('membership.grant', 'membership', v_id::text,
    jsonb_build_object('person', p_person, 'role', p_role, 'scope_type', p_scope_type, 'scope_id', p_scope_id));
  return v_id;
end $$;

create or replace function public.revoke_membership(p_membership uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.memberships; v_school uuid := private.my_school(); v_left int;
begin
  perform private.require_admin();
  -- serialize admin changes so two admins can't remove each other at the same time
  perform 1 from public.memberships where school_id = v_school and role = 'admin' for update;
  select * into m from public.memberships where id = p_membership and school_id = v_school;
  if m.id is null then raise exception 'membership not found'; end if;
  if m.role = 'admin' then
    select count(distinct x.person_id) into v_left from public.memberships x
    where x.school_id = v_school and x.role = 'admin' and x.id <> m.id
      and x.starts_at <= now() and (x.ends_at is null or x.ends_at > now());
    if v_left = 0 then raise exception 'This is the last admin; grant admin to someone else first'; end if;
  end if;
  update public.memberships set ends_at = now() where id = p_membership and (ends_at is null or ends_at > now());
  perform private.audit('membership.revoke', 'membership', p_membership::text);
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on function public.office_student_guardians(text), public.set_guardianship_active(uuid, boolean) from public, anon;
grant execute on function public.office_student_guardians(text), public.set_guardianship_active(uuid, boolean) to authenticated;
revoke execute on function private.row_guardian_emails(jsonb) from public, anon;
