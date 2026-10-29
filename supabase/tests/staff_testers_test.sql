-- ZCS Connect · staff testers and demo accounts. Rolled back.

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


-- ---------------------------------------------------------------- staff testers
select private.add_tester('tester.one@zcs.org', 'Terry', 'Tester', 'Ms.', '3S', 'Emma');
select pg_temp.as_user('tester.one@zcs.org');
select pg_temp.check('a tester signs in with their own email as a teacher of the demo class',
  exists (select 1 from jsonb_array_elements(public.session_info()->'contexts') c, jsonb_array_elements(c->'classes') k where k->>'code' = '3S'));
select pg_temp.check('a tester can also try the parent view', exists (select 1 from jsonb_array_elements(public.session_info()->'contexts') c where c->>'key' = 'parent'));
reset role;
select private.add_tester('tester.one@zcs.org', 'Terry', 'Tester', 'Ms.', '3S');
select pg_temp.check('adding a tester twice does not duplicate them',
  (select count(*) from public.memberships m join public.people p on p.id = m.person_id where p.email = 'tester.one@zcs.org') = 1);
do $$ begin
  set local role authenticated;
  perform private.add_tester('sneaky@zcs.org', 'S', 'S');
  perform pg_temp.check('signed-in users cannot add testers', false);
exception when others then perform pg_temp.check('signed-in users cannot add testers', sqlerrm like '%permission denied%'); end $$;


reset role;
select name || ': PASS' as result from _t;
rollback;
