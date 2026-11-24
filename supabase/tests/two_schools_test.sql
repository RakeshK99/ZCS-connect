-- ZCS Connect · two schools: real families beside the demo school. Rolled back.

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



-- ---------------------------------------------------------------- setup (invented people)
reset role;
create temp table _ids (k text primary key, id uuid);
grant all on _ids to authenticated;
insert into _ids select 'real', private.create_school('Lakeshore Christian School', 'LCS', 'zcs.org', 'office@zcs.org');
insert into _ids select 'office', private.add_office_staff((select id from _ids where k = 'real'), 'rakesh+zcs@syzygy.services', 'Rakesh', 'Kottapalli', 'Mr.', 'Pilot support', true);
select pg_temp.check('a new school gets the demo school''s divisions and grades',
  (select count(*) from public.grades where school_id = (select id from _ids where k = 'real'))
  = (select count(*) from public.grades where school_id = private.demo_school()) and private.demo_school() <> (select id from _ids where k = 'real'));
select pg_temp.check('setting up the same school twice reuses it',
  private.create_school('Lakeshore Christian School', 'LCS', 'zcs.org') = (select id from _ids where k = 'real'));
select pg_temp.check('new people default to the real school', private.default_school() = (select id from _ids where k = 'real'));

-- a demo-school tester who is also a parent in the real school (signed in before the list arrives)
select private.add_tester('both@zcs-test.org', 'Bo', 'Oakes');
select pg_temp.as_user('both@zcs-test.org');
select pg_temp.check('before the real list arrives, the tester is in the demo school',
  (public.session_info()->'school'->>'name') = 'Zeeland Christian School');

-- office of the real school imports a family list with one family that also exists in the demo school by email
select pg_temp.as_user('rakesh+zcs@syzygy.services');
create temp table _p as select public.preview_roster_import('pilot.csv', '[
  {"first":"Mila","last":"Berg","grade":"2nd","guardians":[{"email":"ann.berg@example.com","first":"Ann","last":"Berg"}]},
  {"first":"Ben","last":"Oakes","grade":"2nd","guardians":[{"email":"both@zcs-test.org","first":"Bo","last":"Oakes"}]}]'::jsonb) v;
select pg_temp.check('a real-school import only counts the real school''s students',
  (select (v->>'new_students')::int = 2 and (v->>'deactivated_students')::int = 0 from _p));
select public.apply_roster_import((select (v->>'import_id')::uuid from _p), false);
select pg_temp.check('the real office sees only real-school people',
  not exists (select 1 from jsonb_array_elements(public.admin_people(null, false)) x where x->>'email' = 'rakesh+office@syzygy.services')
  and exists (select 1 from jsonb_array_elements(public.admin_people(null, false)) x where x->>'email' = 'ann.berg@example.com'));
select pg_temp.check('the real office sees no demo students',
  not exists (select 1 from public.students where school_id = private.demo_school()));
select public.create_post('Welcome to the pilot', 'Hi families!', '[{"type":"school"}]', 'normal', false, null, '[]');

select pg_temp.as_user('rakesh+office@syzygy.services');
select pg_temp.check('the demo office sees no real-school students or people',
  not exists (select 1 from public.students where first_name = 'Mila')
  and not exists (select 1 from jsonb_array_elements(public.admin_people(null, false)) x where x->>'email' = 'rakesh+zcs@syzygy.services'));
select pg_temp.check('a real-school post never reaches the demo school',
  not exists (select 1 from jsonb_array_elements(public.feed('staff')) x where x->>'title' = 'Welcome to the pilot'));

select pg_temp.as_user('ann.berg@example.com');
select pg_temp.check('a real parent signs in to the real school and gets its post',
  (public.session_info()->'school'->>'name') = 'Lakeshore Christian School'
  and exists (select 1 from jsonb_array_elements(public.feed('parent')) x where x->>'title' = 'Welcome to the pilot'));

select pg_temp.as_user('both@zcs-test.org');
select pg_temp.check('once the real school lists them, their next sign-in moves to the real school',
  (public.link_account()->'school'->>'name') = 'Lakeshore Christian School'
  and exists (select 1 from jsonb_array_elements(public.feed('parent')) x where x->>'title' = 'Welcome to the pilot'));

select pg_temp.as_user('stranger@gmail.test');
select public.request_family_link('Hi');
reset role;
select pg_temp.check('someone we don''t know asks the real school''s office',
  (select school_id from public.family_requests where email = 'stranger@gmail.test') = (select id from _ids where k = 'real'));

select private.add_tester('tester@example.com', 'Tess', 'Ter');
select pg_temp.check('testers still go into the demo school',
  (select school_id from public.people where email = 'tester@example.com') = private.demo_school());
select pg_temp.check('demo accounts are people in the demo school, not real-school staff',
  private.is_demo_email('rakesh+sarah@syzygy.services') and not private.is_demo_email('rakesh+zcs@syzygy.services'));
select private.remove_demo_data();
select pg_temp.check('clearing demo data leaves the real school alone',
  exists (select 1 from public.students where first_name = 'Mila') and exists (select 1 from public.people where email = 'rakesh+zcs@syzygy.services')
  and not exists (select 1 from public.students where school_id = private.demo_school()));

reset role;
select name || ': PASS' as result from _t;
rollback;
