-- ZCS Connect · in-app feedback. Rolled back.

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



-- ---------------------------------------------------------------- feedback
select pg_temp.as_user('rakesh+sarah@syzygy.services');
select public.send_feedback('  The bell icon is hard to find.  ', '{"version":"1.2.0","platform":"ios","context":"parent","secret":"x"}');
select pg_temp.check('a parent can send feedback and see their own note, trimmed',
  (select body from public.app_feedback) = 'The bell icon is hard to find.');
select pg_temp.check('only the expected details are kept with a note',
  (select meta from public.app_feedback) = '{"version":"1.2.0","platform":"ios","context":"parent"}'::jsonb);
do $$ begin
  perform public.send_feedback('   ');
  perform pg_temp.check('an empty note is refused', false);
exception when others then perform pg_temp.check('an empty note is refused', sqlstate = '22023'); end $$;
do $$ begin
  perform public.office_feedback();
  perform pg_temp.check('a parent cannot read the feedback inbox', false);
exception when others then perform pg_temp.check('a parent cannot read the feedback inbox', sqlerrm = 'not allowed'); end $$;
select pg_temp.as_user('rakesh+jen@syzygy.services');
select pg_temp.check('people cannot see each other''s notes', not exists (select 1 from public.app_feedback));
select pg_temp.as_user('stranger@example.com');
select public.send_feedback('I could not find my family.');
select pg_temp.check('someone not yet linked can still send feedback', (select count(*) from public.app_feedback) = 1);
select pg_temp.as_user('rakesh+office@syzygy.services');
select pg_temp.check('the office sees every note with who sent it',
  jsonb_array_length(public.office_feedback()) = 2
  and (select x->>'who' from jsonb_array_elements(public.office_feedback()) x where x->>'body' like 'The bell%') = 'Family');
select public.set_feedback_status((select id from public.app_feedback where body like 'The bell%'), 'done');
select pg_temp.check('the office can mark a note handled',
  jsonb_array_length(public.office_feedback('new')) = 1 and jsonb_array_length(public.office_feedback('done')) = 1);
select pg_temp.as_user('rakesh+sarah@syzygy.services');
do $$ begin
  for i in 1..20 loop perform public.send_feedback('note ' || i); end loop;
  perform pg_temp.check('feedback is rate limited', false);
exception when others then perform pg_temp.check('feedback is rate limited', sqlstate = '54000'); end $$;

reset role;
select name || ': PASS' as result from _t;
rollback;
