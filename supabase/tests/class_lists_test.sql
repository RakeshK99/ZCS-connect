-- ZCS Connect · class lists import and teacher roster changes. Rolled back.

begin;

create temp table _t (name text, ok boolean) on commit drop;
grant all on _t to authenticated;

create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
declare v_uid uuid;
begin
  reset role;
  select id into v_uid from auth.users where email = p_email;
  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, now(), '{"provider":"email"}', '{}', now(), now());
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated', 'email', p_email)::text, true);
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  set local role authenticated;
  perform public.link_account();
end $$;

create or replace function pg_temp.check(p_name text, p_ok boolean) returns void language plpgsql as $$
begin
  insert into _t values (p_name, coalesce(p_ok, false));
  if not coalesce(p_ok, false) then raise exception 'FAIL: %', p_name; end if;
end $$;


-- ---------------------------------------------------------------- semester import
select pg_temp.as_user('rakesh+jen@syzygy.services');
do $$ begin
  perform public.import_class_lists('[{"class_code":"X1","student_sis_id":"DEMO-0001"}]'::jsonb, false);
  perform pg_temp.check('a teacher cannot import class lists', false);
exception when others then perform pg_temp.check('a teacher cannot import class lists', sqlerrm like '%office or admin%'); end $$;

select pg_temp.as_user('rakesh+office@syzygy.services');
create temp table _res (j jsonb) on commit drop;
grant all on _res to authenticated;
insert into _res select public.import_class_lists('[
  {"class_code":"7MATH-A","class_name":"Math 7 · Section A","grade":"7th grade","teacher_emails":["new.teacher@zcs.org"],"student_sis_id":"DEMO-0001"},
  {"class_code":"7MATH-A","teacher_emails":["new.teacher@zcs.org"],"student_first":"Noah","student_last":"VanDyke"},
  {"class_code":"7MATH-A","teacher_emails":["outsider@gmail.com"],"student_first":"Nobody","student_last":"Here"},
  {"class_code":"3S","class_name":"Mrs. Smith''s 3rd Grade","teacher_emails":["rakesh+jen@syzygy.services"],"student_sis_id":"DEMO-0001"}
]'::jsonb, false);
select pg_temp.check('the preview counts what will change without changing anything',
  (select (j->>'classes_new')::int = 1 and (j->>'classes_updated')::int = 1 and (j->>'staff_new')::int = 1
      and (j->>'students_added')::int = 2 and (j->>'students_removed')::int > 0 from _res)
  and not exists (select 1 from public.classes where code = '7MATH-A'));
select pg_temp.check('the preview lists students it could not match and non-school teacher emails',
  (select jsonb_array_length(j->'unmatched') = 1 and j->'not_school_emails' = '["outsider@gmail.com"]'::jsonb from _res));
truncate _res;
insert into _res select public.import_class_lists('[
  {"class_code":"7MATH-A","class_name":"Math 7 · Section A","teacher_emails":["new.teacher@zcs.org"],"student_sis_id":"DEMO-0001"},
  {"class_code":"7MATH-A","teacher_emails":["new.teacher@zcs.org"],"student_first":"Noah","student_last":"VanDyke"},
  {"class_code":"3S","teacher_emails":["rakesh+jen@syzygy.services"],"student_sis_id":"DEMO-0001"}
]'::jsonb, true);
select pg_temp.check('applying creates the class, the teacher and the enrollments',
  exists (select 1 from public.classes where code = '7MATH-A' and name = 'Math 7 · Section A')
  and exists (select 1 from public.memberships m join public.people p on p.id = m.person_id join public.classes c on c.id = m.scope_id
              where p.email = 'new.teacher@zcs.org' and c.code = '7MATH-A' and m.role = 'teacher')
  and (select count(*) from public.enrollments e join public.classes c on c.id = e.class_id where c.code = '7MATH-A') = 2);
select pg_temp.check('a class in the file is made to match it exactly',
  (select count(*) from public.enrollments e join public.classes c on c.id = e.class_id where c.code = '3S') = 1);
select pg_temp.check('classes not in the file are untouched',
  (select count(*) from public.enrollments e join public.classes c on c.id = e.class_id where c.code = 'KD') > 1);
reset role;
select pg_temp.check('the import is audited', exists (select 1 from public.audit_log where action = 'roster.class_lists'));

-- ---------------------------------------------------------------- teachers adjust their own classes
select pg_temp.as_user('rakesh+jen@syzygy.services');
select pg_temp.check('a teacher can search the school list for students not in her class',
  jsonb_array_length(public.class_student_candidates((select id from public.classes where code = '3S'), 'Noah')) = 1);
-- Jen can't read Noah's record directly (he isn't her student); she adds him from the search result.
select public.class_add_student((select id from public.classes where code = '3S'),
  (public.class_student_candidates((select id from public.classes where code = '3S'), 'Noah')->0->>'student_id')::uuid);
reset role;
select pg_temp.check('a teacher can add a student from the school list to her class',
  exists (select 1 from public.enrollments e join public.classes c on c.id = e.class_id
          where c.code = '3S' and e.student_id = (select id from public.students where sis_id = 'DEMO-0002')));
select pg_temp.as_user('rakesh+jen@syzygy.services');
select public.class_remove_student((select id from public.classes where code = '3S'), (select id from public.students where sis_id = 'DEMO-0002'));
reset role;
select pg_temp.check('a teacher can remove a student from her class',
  not exists (select 1 from public.enrollments e join public.classes c on c.id = e.class_id
              where c.code = '3S' and e.student_id = (select id from public.students where sis_id = 'DEMO-0002')));
select pg_temp.as_user('rakesh+jen@syzygy.services');
do $$ begin
  perform public.class_add_student((select id from public.classes where code = 'KD'), (select id from public.students where sis_id = 'DEMO-0001'));
  perform pg_temp.check('a teacher cannot change another teacher''s class', false);
exception when others then perform pg_temp.check('a teacher cannot change another teacher''s class', sqlerrm like '%own classes%'); end $$;
select pg_temp.check('student search shows names and grades only, no family details',
  not exists (select 1 from jsonb_array_elements(public.class_student_candidates((select id from public.classes where code = '3S'), 'Va')) x
              where x ? 'guardians' or x ? 'email'));
reset role;
select pg_temp.check('teacher roster changes are audited',
  exists (select 1 from public.audit_log where action = 'class.student_added')
  and exists (select 1 from public.audit_log where action = 'class.student_removed'));

reset role;
select name || ': PASS' as result from _t;
rollback;
