-- ZCS Connect · class lists (Nov 2026, James and Rakesh).
--
-- 1. Semester import: before each semester ZCS shares its class lists (one row
--    per student per class or section, with the teacher's school email). The
--    office (or Syzygy, at first) uploads the sheet in the staff website:
--    import_class_lists() previews what will change, then applies it. Every
--    class or section becomes a class, so middle school teachers reach the
--    students in each of their sections.
-- 2. Mid-semester changes: a teacher can add a student who is already on the
--    school's list to one of their own classes, or remove one. Teachers can't
--    create students or link families; that stays with the office, so custody
--    and no-contact rules can't be bypassed. Every change is audited.

-- ---------------------------------------------------------------- 1. semester import
-- p_rows: [{ class_code, class_name?, kind? ('class'|'group'), grade?, teacher_emails: [..],
--            student_sis_id?, student_first?, student_last? }]
-- p_apply = false only previews. p_replace = true makes each class in the file
-- match it exactly (students and teachers not listed are taken off that class);
-- classes not in the file are never touched.
create or replace function public.import_class_lists(p_rows jsonb, p_apply boolean default false, p_replace boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_school uuid := private.my_school();
  v_term uuid;
  v_domain text;
  r jsonb; i int := 0;
  v_code text; v_class uuid; v_student uuid; v_person uuid; v_grade uuid; v_email text; v_n int;
  v_first text; v_last text; v_sis text;
  s_new_classes int := 0; s_classes int := 0; s_new_staff int := 0; s_teacher_links int := 0; s_teacher_ended int := 0;
  s_enrolled int := 0; s_unenrolled int := 0; s_rows int := 0;
  v_unmatched jsonb := '[]'; v_bad_teachers jsonb := '[]';
begin
  perform private.require_office();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'The class list is empty.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 20000 then raise exception 'Split class lists over 20,000 rows into several files.' using errcode = '22023'; end if;
  select id into v_term from public.terms where school_id = v_school and is_active order by starts_on desc limit 1;
  select staff_email_domain into v_domain from public.schools where id = v_school;

  create temp table if not exists _cl_class (code text primary key, id uuid, name text, kind text, grade_id uuid, is_new boolean) on commit drop;
  create temp table if not exists _cl_enroll (class_code text, student_id uuid, primary key (class_code, student_id)) on commit drop;
  create temp table if not exists _cl_teach (class_code text, person_id uuid, email text, primary key (class_code, email)) on commit drop;
  truncate _cl_class, _cl_enroll, _cl_teach;

  for r in select x from jsonb_array_elements(p_rows) x loop
    i := i + 1;
    v_code := upper(left(trim(coalesce(r->>'class_code', '')), 40));
    if v_code = '' then
      v_unmatched := v_unmatched || jsonb_build_object('row', i, 'name', concat_ws(' ', r->>'student_first', r->>'student_last'), 'reason', 'No class code');
      continue;
    end if;
    s_rows := s_rows + 1;

    -- the class (one per code in the active term)
    if not exists (select 1 from _cl_class where code = v_code) then
      select g.id into v_grade from public.grades g where g.school_id = v_school
        and nullif(trim(r->>'grade'), '') is not null and lower(g.label) = lower(trim(r->>'grade')) limit 1;
      select c.id into v_class from public.classes c where c.school_id = v_school and upper(c.code) = v_code
        and (c.term_id is not distinct from v_term or c.term_id is null) order by (c.term_id is null) limit 1;
      insert into _cl_class values (v_code, v_class, left(coalesce(nullif(trim(r->>'class_name'), ''), v_code), 120),
        case when r->>'kind' = 'group' then 'group' else 'class' end, v_grade, v_class is null);
      v_grade := null; v_class := null;
    end if;

    -- teachers
    for v_email in select lower(trim(e)) from jsonb_array_elements_text(coalesce(r->'teacher_emails', '[]')) e where trim(e) <> '' loop
      if exists (select 1 from _cl_teach where class_code = v_code and email = v_email) then continue; end if;
      select id into v_person from public.people where school_id = v_school and email = v_email::extensions.citext;
      if v_person is null and split_part(v_email, '@', 2) <> lower(v_domain) then
        if not v_bad_teachers @> jsonb_build_array(v_email) then v_bad_teachers := v_bad_teachers || to_jsonb(v_email); end if;
        continue;
      end if;
      insert into _cl_teach values (v_code, v_person, v_email);
      v_person := null;
    end loop;

    -- the student: by SIS id, else by first + last name (only if exactly one match)
    v_sis := nullif(trim(r->>'student_sis_id'), '');
    v_first := nullif(trim(r->>'student_first'), ''); v_last := nullif(trim(r->>'student_last'), '');
    v_student := null;
    if v_sis is not null then
      select id into v_student from public.students where school_id = v_school and sis_id = v_sis and is_active;
    end if;
    if v_student is null and v_first is not null and v_last is not null then
      select count(*), min(id::text)::uuid into v_n, v_student from public.students
      where school_id = v_school and is_active and lower(last_name) = lower(v_last)
        and (lower(first_name) = lower(v_first) or lower(coalesce(preferred_name, '')) = lower(v_first));
      if v_n > 1 then
        v_unmatched := v_unmatched || jsonb_build_object('row', i, 'name', v_first || ' ' || v_last, 'class', v_code,
          'reason', 'More than one student with this name; add the student ID');
        continue;
      end if;
    end if;
    if v_student is null then
      if v_sis is not null or v_first is not null or v_last is not null then
        v_unmatched := v_unmatched || jsonb_build_object('row', i, 'name', coalesce(concat_ws(' ', v_first, v_last), v_sis), 'class', v_code,
          'reason', 'Not on the school''s student list');
      end if;
      continue;
    end if;
    insert into _cl_enroll values (v_code, v_student) on conflict do nothing;
  end loop;

  select count(*) filter (where is_new), count(*) filter (where not is_new) into s_new_classes, s_classes from _cl_class;
  s_new_staff := (select count(distinct email) from _cl_teach where person_id is null);
  s_teacher_links := (select count(*) from _cl_teach t join _cl_class c on c.code = t.class_code
    where not exists (select 1 from public.memberships m where m.person_id = t.person_id and m.role = 'teacher' and m.scope_type = 'class'
                      and m.scope_id = c.id and (m.ends_at is null or m.ends_at > now())));
  s_enrolled := (select count(*) from _cl_enroll x join _cl_class c on c.code = x.class_code
    where not exists (select 1 from public.enrollments e where e.class_id = c.id and e.student_id = x.student_id));
  if p_replace then
    s_unenrolled := (select count(*) from public.enrollments e join _cl_class c on c.id = e.class_id
      where not exists (select 1 from _cl_enroll x where x.class_code = c.code and x.student_id = e.student_id));
    s_teacher_ended := (select count(*) from public.memberships m join _cl_class c on c.id = m.scope_id
      where m.scope_type = 'class' and m.role = 'teacher' and (m.ends_at is null or m.ends_at > now())
        and exists (select 1 from _cl_teach t where t.class_code = c.code)
        and not exists (select 1 from _cl_teach t join public.people p on p.email = t.email::extensions.citext and p.school_id = v_school
                        where t.class_code = c.code and p.id = m.person_id));
  end if;

  if p_apply then
    -- new staff people (school-domain emails only), named from the email until the office edits them
    insert into public.people (school_id, email, first_name, last_name, staff_title)
    select distinct v_school, t.email, initcap(split_part(split_part(t.email, '@', 1), '.', 1)),
      initcap(coalesce(nullif(split_part(split_part(t.email, '@', 1), '.', 2), ''), '')), 'Teacher'
    from _cl_teach t where t.person_id is null
    on conflict (school_id, email) do nothing;
    update _cl_teach t set person_id = p.id from public.people p where p.school_id = v_school and p.email = t.email::extensions.citext;

    insert into public.classes (school_id, term_id, grade_id, kind, code, name)
    select v_school, v_term, c.grade_id, c.kind, c.code, c.name from _cl_class c where c.is_new;
    update _cl_class c set id = k.id from public.classes k
      where c.id is null and k.school_id = v_school and upper(k.code) = c.code and k.term_id is not distinct from v_term;
    update public.classes k set name = c.name, grade_id = coalesce(c.grade_id, k.grade_id), kind = c.kind, is_active = true
      from _cl_class c where k.id = c.id and not c.is_new;

    insert into public.memberships (school_id, person_id, role, scope_type, scope_id)
    select v_school, t.person_id, 'teacher', 'class', c.id from _cl_teach t join _cl_class c on c.code = t.class_code
    where not exists (select 1 from public.memberships m where m.person_id = t.person_id and m.role = 'teacher' and m.scope_type = 'class'
                      and m.scope_id = c.id and (m.ends_at is null or m.ends_at > now()));

    insert into public.enrollments (class_id, student_id)
    select c.id, x.student_id from _cl_enroll x join _cl_class c on c.code = x.class_code on conflict do nothing;

    if p_replace then
      delete from public.enrollments e using _cl_class c
      where e.class_id = c.id and not exists (select 1 from _cl_enroll x where x.class_code = c.code and x.student_id = e.student_id);
      update public.memberships m set ends_at = now() from _cl_class c
      where m.scope_id = c.id and m.scope_type = 'class' and m.role = 'teacher' and (m.ends_at is null or m.ends_at > now())
        and exists (select 1 from _cl_teach t where t.class_code = c.code)
        and not exists (select 1 from _cl_teach t where t.class_code = c.code and t.person_id = m.person_id);
    end if;
  end if;

  if p_apply then
    perform private.audit('roster.class_lists', 'school', v_school::text,
      jsonb_build_object('classes', s_new_classes + s_classes, 'students_added', s_enrolled, 'students_removed', coalesce(s_unenrolled, 0),
                         'unmatched', jsonb_array_length(v_unmatched)));
  end if;
  return jsonb_build_object(
    'applied', p_apply, 'rows', s_rows, 'classes_new', s_new_classes, 'classes_updated', s_classes,
    'staff_new', s_new_staff, 'teacher_links_added', s_teacher_links, 'teacher_links_ended', coalesce(s_teacher_ended, 0),
    'students_added', s_enrolled, 'students_removed', coalesce(s_unenrolled, 0),
    'unmatched', v_unmatched, 'not_school_emails', v_bad_teachers);
end $$;

-- ---------------------------------------------------------------- 2. teachers adjust their own classes
create or replace function private.require_class_editor(p_class uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.classes c where c.id = p_class and c.school_id = private.my_school())
     or not (p_class in (select private.my_class_ids()) or private.is_office()) then
    raise exception 'You can only change your own classes.' using errcode = '42501';
  end if;
end $$;

-- Students on the school's list who aren't in the class yet (names and grades only; no family details).
create or replace function public.class_student_candidates(p_class uuid, p_query text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; q text := trim(coalesce(p_query, ''));
begin
  perform private.require_class_editor(p_class);
  if length(q) < 2 then return '[]'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('student_id', s.id, 'name', private.student_name(s) || ' ' || s.last_name, 'grade', g.label)
    order by s.last_name, s.first_name), '[]') into v
  from (select * from public.students s where s.school_id = private.my_school() and s.is_active
          and (s.first_name || ' ' || s.last_name || ' ' || coalesce(s.preferred_name, '')) ilike '%' || q || '%'
          and not exists (select 1 from public.enrollments e where e.class_id = p_class and e.student_id = s.id)
        order by s.last_name, s.first_name limit 25) s
  left join public.grades g on g.id = s.grade_id;
  return v;
end $$;

create or replace function public.class_add_student(p_class uuid, p_student uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_class_editor(p_class);
  if not exists (select 1 from public.students s where s.id = p_student and s.school_id = private.my_school() and s.is_active) then
    raise exception 'That student isn''t on the school''s list. Ask the office to add them.' using errcode = '22023';
  end if;
  insert into public.enrollments (class_id, student_id) values (p_class, p_student) on conflict do nothing;
  perform private.audit('class.student_added', 'class', p_class::text, jsonb_build_object('student', p_student));
end $$;

create or replace function public.class_remove_student(p_class uuid, p_student uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_class_editor(p_class);
  delete from public.enrollments where class_id = p_class and student_id = p_student;
  perform private.audit('class.student_removed', 'class', p_class::text, jsonb_build_object('student', p_student));
end $$;

revoke execute on function public.import_class_lists(jsonb, boolean, boolean) from public, anon;
grant execute on function public.import_class_lists(jsonb, boolean, boolean) to authenticated;
revoke execute on function public.class_student_candidates(uuid, text) from public, anon;
grant execute on function public.class_student_candidates(uuid, text) to authenticated;
revoke execute on function public.class_add_student(uuid, uuid) from public, anon;
grant execute on function public.class_add_student(uuid, uuid) to authenticated;
revoke execute on function public.class_remove_student(uuid, uuid) from public, anon;
grant execute on function public.class_remove_student(uuid, uuid) to authenticated;
revoke execute on function private.require_class_editor(uuid) from public, anon;
grant execute on function private.require_class_editor(uuid) to authenticated;
