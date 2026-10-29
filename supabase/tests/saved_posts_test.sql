-- ZCS Connect · saved posts. Rolled back.

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


-- ---------------------------------------------------------------- saved posts
select pg_temp.as_user('rakesh+sarah@syzygy.services');
select public.set_post_saved((select id from public.posts where title like 'Pumpkin patch%'), true);
select pg_temp.check('a parent can save a post they received and it shows as saved',
  (select bool_and((x->>'saved')::boolean) from jsonb_array_elements(public.feed('parent', null, null, 50, null, null, true)) x)
  and jsonb_array_length(public.feed('parent', null, null, 50, null, null, true)) = 1);
select pg_temp.check('unsaved posts are not in the Saved filter',
  (select count(*) from jsonb_array_elements(public.feed('parent')) x where not (x->>'saved')::boolean) > 0);
select public.set_post_saved((select id from public.posts where title like 'Pumpkin patch%'), false);
select pg_temp.check('a parent can unsave a post', jsonb_array_length(public.feed('parent', null, null, 50, null, null, true)) = 0);
do $$ begin
  perform public.set_post_saved((select id from public.posts where title like 'Middle School chapel%'), true);
  perform pg_temp.check('a parent cannot save a post that was not sent to them', false);
exception when others then perform pg_temp.check('a parent cannot save a post that was not sent to them', sqlerrm = 'not allowed'); end $$;
select public.set_post_saved((select id from public.posts where title like 'Partnership Night%'), true);
select pg_temp.as_user('rakesh+jen@syzygy.services');
select pg_temp.check('saves are private to the person who saved',
  not exists (select 1 from public.post_saves));


reset role;
select name || ': PASS' as result from _t;
rollback;
