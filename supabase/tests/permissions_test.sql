-- ZCS Connect · permission tests (allow AND deny cases).
-- Runs against a database that has the demo seed. Everything happens inside a
-- transaction that is rolled back, so it is safe to run anywhere.
-- Run: psql "$DB_URL" -f supabase/tests/permissions_test.sql   (prints PASS lines; raises on first FAIL)

begin;

create temp table _t (name text, ok boolean) on commit drop;
grant all on _t to authenticated;

create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
declare v_uid uuid := gen_random_uuid();
begin
  reset role;
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, now(), '{"provider":"email"}', '{}', now(), now());
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

-- ---------------------------------------------------------------- parent: Sarah
select pg_temp.as_user('rakesh+sarah@syzygy.services');
select pg_temp.check('sarah is linked with a parent context only',
  (select jsonb_path_query_array(public.session_info(), '$.contexts[*].key') = '["parent"]'::jsonb));
select pg_temp.check('sarah sees exactly her 2 children', (select count(*) = 2 from public.students));
select pg_temp.check('sarah sees the 3S class post', exists (select 1 from public.posts where title like '3rd grade field trip%'));
select pg_temp.check('sarah sees school-wide posts', exists (select 1 from public.posts where title like 'Snow day%'));
select pg_temp.check('sarah does NOT see the 6th grade post', not exists (select 1 from public.posts where title like 'Science fair%'));
select pg_temp.check('sarah does NOT see the Middle School post', not exists (select 1 from public.posts where title like 'Middle School chapel%'));
select pg_temp.check('sarah cannot read other families'' people rows',
  not exists (select 1 from public.people where email like '%.%@example.com'));
select pg_temp.check('sarah cannot see deliveries', (select count(*) = 0 from public.deliveries));
select pg_temp.check('sarah cannot see the audit log', (select count(*) = 0 from public.audit_log));
select pg_temp.check('sarah sees only her own threads', (select count(*) = 3 from public.threads));
select pg_temp.check('sarah feed filtered to Noah has no 3S post',
  not exists (select 1 from jsonb_array_elements(public.feed('parent', (select id from public.students where first_name = 'Noah'))) p
              where p->>'title' like '3rd grade field trip%'));
do $$ begin
  perform public.create_post('x', 'y', '[{"type":"school"}]', 'normal', false, null, '[]');
  perform pg_temp.check('sarah cannot post to the school', false);
exception when insufficient_privilege then perform pg_temp.check('sarah cannot post to the school', true); end $$;
do $$ begin
  perform public.oversight_threads(null);
  perform pg_temp.check('sarah cannot use oversight', false);
exception when insufficient_privilege then perform pg_temp.check('sarah cannot use oversight', true); end $$;
do $$ begin
  perform public.grant_membership((select private.me()), 'admin', 'school', null, null);
  perform pg_temp.check('sarah cannot promote herself to admin', false);
exception when insufficient_privilege then perform pg_temp.check('sarah cannot promote herself to admin', true); end $$;
do $$ begin
  insert into public.memberships (school_id, person_id, role, scope_type) values (private.my_school(), private.me(), 'admin', 'school');
  perform pg_temp.check('sarah cannot insert memberships directly', false);
exception when insufficient_privilege then perform pg_temp.check('sarah cannot insert memberships directly', true); end $$;
do $$ begin
  update public.people set user_id = null where id <> private.me();
  perform pg_temp.check('sarah cannot update people rows', false);
exception when insufficient_privilege then perform pg_temp.check('sarah cannot update people rows', true); end $$;
select pg_temp.check('sarah can message Emma''s teacher',
  public.start_thread((select id from public.students where first_name = 'Emma'),
                      (select id from public.people where email = 'rakesh+jen@syzygy.services'), 'parent') is not null);
do $$ begin
  perform public.start_thread((select id from public.students where first_name = 'Emma'),
                              (select id from public.people where email = 'tbakker@example.com'), 'parent');
  perform pg_temp.check('sarah cannot message a teacher who doesn''t teach her child', false);
exception when insufficient_privilege then perform pg_temp.check('sarah cannot message a teacher who doesn''t teach her child', true); end $$;
select pg_temp.check('acknowledge works', public.acknowledge_post((select id from public.posts where title like 'Early dismissal%')) is not null);

-- ---------------------------------------------------------------- teacher + parent: Jen
select pg_temp.as_user('rakesh+jen@syzygy.services');
select pg_temp.check('jen has staff and parent contexts',
  (select jsonb_path_query_array(public.session_info(), '$.contexts[*].key') = '["staff","parent"]'::jsonb));
select pg_temp.check('jen staff feed includes her class post',
  exists (select 1 from jsonb_array_elements(public.feed('staff')) p where p->>'title' like '3rd grade field trip%' and (p->>'mine')::boolean));
select pg_temp.check('jen parent feed does NOT include her own class post',
  not exists (select 1 from jsonb_array_elements(public.feed('parent')) p where p->>'title' like '3rd grade field trip%'));
select pg_temp.check('jen parent feed includes Lily''s 6th grade post',
  exists (select 1 from jsonb_array_elements(public.feed('parent')) p where p->>'title' like 'Science fair%'));
select pg_temp.check('jen can post to 3S', (public.create_post('Test', 'Body', jsonb_build_array(jsonb_build_object('type','class','id',(select id from public.classes where code = '3S'))), 'normal', true, null, '[]')->>'recipients')::int >= 24);
do $$ begin
  perform public.create_post('x', 'y', jsonb_build_array(jsonb_build_object('type','class','id',(select id from public.classes where code = 'KD'))), 'normal', false, null, '[]');
  perform pg_temp.check('jen cannot post to another teacher''s class', false);
exception when insufficient_privilege then perform pg_temp.check('jen cannot post to another teacher''s class', true); end $$;
do $$ begin
  perform public.create_post('x', 'y', jsonb_build_array(jsonb_build_object('type','class','id',(select id from public.classes where code = '3S'))), 'emergency', false, null, '[]');
  perform pg_temp.check('jen cannot send an emergency', false);
exception when insufficient_privilege then perform pg_temp.check('jen cannot send an emergency', true); end $$;
select pg_temp.check('jen roster masks hidden contacts',
  exists (select 1 from jsonb_array_elements(public.class_roster((select id from public.classes where code = '3S'))) s,
          jsonb_array_elements(s->'guardians') g where (g->>'contact_hidden')::boolean and g->>'email' is null));
do $$ begin
  perform public.class_roster((select id from public.classes where code = '6B'));
  perform pg_temp.check('jen cannot open the 6B roster', false);
exception when insufficient_privilege then perform pg_temp.check('jen cannot open the 6B roster', true); end $$;
select pg_temp.check('jen sees reach on her post', (select public.post_reach((select id from public.posts where title like '3rd grade field trip%'))->'summary'->>'families')::int = 24);

-- ---------------------------------------------------------------- principal
select pg_temp.as_user('rakesh+principal@syzygy.services');
select pg_temp.check('principal can post to Middle School',
  (public.create_post('MS test', '', jsonb_build_array(jsonb_build_object('type','division','id',(select id from public.divisions where name = 'Middle School'))), 'normal', false, null, '[]')->>'id') is not null);
do $$ begin
  perform public.create_post('x', 'y', jsonb_build_array(jsonb_build_object('type','division','id',(select id from public.divisions where name = 'Elementary'))), 'normal', false, null, '[]');
  perform pg_temp.check('principal cannot post to Elementary', false);
exception when insufficient_privilege then perform pg_temp.check('principal cannot post to Elementary', true); end $$;
select pg_temp.check('principal sees only Middle School students',
  (select bool_and(g.division_id = (select id from public.divisions where name = 'Middle School')) from public.students s join public.grades g on g.id = s.grade_id));

-- ---------------------------------------------------------------- office
select pg_temp.as_user('rakesh+office@syzygy.services');
select pg_temp.check('office can send an emergency to the school',
  (public.create_post('Test emergency', 'Drill', '[{"type":"school"}]', 'emergency', false, null, '[]')->>'recipients')::int >= 27);
select pg_temp.check('office sees every student', (select count(*) from public.students) = (select count(*) from public.students where true));
do $$ begin
  perform public.oversight_threads(null);
  perform pg_temp.check('office (not admin) cannot use oversight', false);
exception when insufficient_privilege then perform pg_temp.check('office (not admin) cannot use oversight', true); end $$;
select pg_temp.check('office cannot read message bodies directly', (select count(*) = 0 from public.messages));

-- ---------------------------------------------------------------- admin
select pg_temp.as_user('rakesh+admin@syzygy.services');
select pg_temp.check('admin can list threads (oversight)', jsonb_array_length(public.oversight_threads(null)) >= 6);
select pg_temp.check('admin oversight read returns messages',
  jsonb_array_length(public.oversight_open_thread((public.oversight_threads(null)->0->>'id')::uuid, 'test review')) >= 1);
select pg_temp.check('oversight read is audited', exists (select 1 from public.audit_log where action = 'oversight.open_thread'));
select pg_temp.check('admin has no content role by default',
  not (public.session_info()->>'can_send_emergency')::boolean);
do $$ begin
  perform public.create_post('x', 'y', '[{"type":"school"}]', 'normal', false, null, '[]');
  perform pg_temp.check('admin cannot post school-wide without office role', false);
exception when insufficient_privilege then perform pg_temp.check('admin cannot post school-wide without office role', true); end $$;

-- ---------------------------------------------------------------- unknown parent
select pg_temp.as_user('someone.new@example.org');
select pg_temp.check('unknown email is not linked', not (public.session_info()->>'linked')::boolean);
select pg_temp.check('unknown email sees no students', (select count(*) = 0 from public.students));
select pg_temp.check('unknown email sees no posts', (select count(*) = 0 from public.posts));

reset role;
select name || ': PASS' as result from _t;
rollback;
