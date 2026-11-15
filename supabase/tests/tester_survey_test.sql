-- ZCS Connect · tester survey. Rolled back.

begin;

create temp table _t (name text, ok boolean) on commit drop;
grant all on _t to authenticated, anon;

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



-- ---------------------------------------------------------------- tester survey
reset role;
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
set local role anon;
select public.submit_tester_survey('{
  "client_id": "11111111-1111-4111-8111-111111111111", "role": "parent", "usage": "few_days", "sign_in": "email",
  "tasks": {"read": {"ease": 5}, "clear": {"ease": 2, "note": "Took me a while to find it"}, "message": {"ease": 0}, "hack": {"ease": 5}},
  "sus": [5,1,5,1,5,1,5,1,5,1], "recommend": 9, "compared": 5, "notifications": "right",
  "frustrating": "  Clear read was hidden  ", "frustrating_impact": "annoying", "email": "Tester@Example.com", "contact_ok": true, "extra": "ignored"}');
select pg_temp.check('anyone with the link can answer the survey without signing in', true);
do $$ declare n int; begin
  select count(*) into n from public.tester_surveys;
  perform pg_temp.check('people answering cannot read anyone''s answers', n = 0);
exception when insufficient_privilege then perform pg_temp.check('people answering cannot read anyone''s answers', true); end $$;
do $$ begin
  perform public.tester_survey_report();
  perform pg_temp.check('people answering cannot see the results', false);
exception when others then perform pg_temp.check('people answering cannot see the results', sqlstate = '42501'); end $$;
do $$ begin
  perform public.submit_tester_survey('{"client_id": "22222222-2222-4222-8222-222222222222"}');
  perform pg_temp.check('a response needs a role', false);
exception when others then perform pg_temp.check('a response needs a role', sqlstate = '22023'); end $$;
select public.submit_tester_survey('{"client_id": "11111111-1111-4111-8111-111111111111", "role": "both", "sus": [3,3,3,3,3,3,3,3,3,9], "recommend": 4}');
select public.submit_tester_survey('{"client_id": "33333333-3333-4333-8333-333333333333", "role": "staff", "tasks": {"post": {"ease": 5}, "clear": {"ease": 3}}, "sus": [4,2,4,2,4,2,4,2,4,2], "recommend": 10}');

select pg_temp.as_user('rakesh+jen@syzygy.services');
do $$ begin
  perform public.tester_survey_report();
  perform pg_temp.check('teachers cannot see survey results', false);
exception when others then perform pg_temp.check('teachers cannot see survey results', sqlerrm = 'not allowed'); end $$;
select pg_temp.check('teachers cannot read survey rows', not exists (select 1 from public.tester_surveys));

select pg_temp.as_user('rakesh+office@syzygy.services');
create temp table _r as select public.tester_survey_report() r;
select pg_temp.check('answering again from the same browser updates the response instead of adding one',
  (select (r->>'responses')::int from _r) = 2 and (select (r->'by_role'->>'both')::int from _r) = 1);
select pg_temp.check('out-of-range answers are dropped, not saved',
  (select sus from public.tester_surveys where role = 'both') is null);
select pg_temp.check('SUS is scored on the standard 0–100 scale', (select (r->>'sus_avg')::numeric from _r) = 75);
select pg_temp.check('likelihood to recommend becomes a Net Promoter Score', (select (r->>'nps')::int from _r) = 0);
select pg_temp.check('tasks are summarised by how easy they were, hardest first',
  (select r->'tasks'->0->>'key' from _r) = 'clear' and (select (r->'tasks'->0->>'avg_ease')::numeric from _r) = 3);
select public.submit_tester_survey(jsonb_build_object('client_id', gen_random_uuid(), 'role', 'parent', 'tasks', '{"read": {"ease": 5}, "clear": {"ease": 1}, "message": {"ease": 0}, "zzz": {"ease": 3}}'::jsonb,
  'frustrating', '  Clear read was hidden  ', 'email', 'Tester@Example.com'));
select pg_temp.check('unknown questions are ignored and text is tidied',
  (select tasks from public.tester_surveys where frustrating is not null order by created_at desc limit 1) = '{"read": {"ease": 5}, "clear": {"ease": 1}, "message": {"ease": 0}}'::jsonb
  and (select frustrating || '|' || email from public.tester_surveys where frustrating is not null order by created_at desc limit 1) = 'Clear read was hidden|tester@example.com');
select pg_temp.check('a didn''t-try answer is counted but not averaged',
  (select (x->>'tried')::int from jsonb_array_elements(public.tester_survey_report()->'tasks') x where x->>'key' = 'message') = 0);

reset role;
select name || ': PASS' as result from _t;
rollback;
