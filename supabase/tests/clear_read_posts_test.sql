-- ZCS Connect · clear read posts. Rolled back.

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



-- ---------------------------------------------------------------- clear read posts
select pg_temp.as_user('rakesh+sarah@syzygy.services');
create temp view _titles as select x->>'title' as title, (x->>'cleared')::boolean as cleared from jsonb_array_elements(public.feed('parent')) x;
grant select on _titles to authenticated;
select public.mark_post_read(id) from public.posts where title like any (array['Pumpkin patch%', 'Partnership Night%', '3rd grade field trip%', 'Early dismissal%']);
select pg_temp.check('clearing read posts skips pinned posts and posts waiting on a confirmation',
  cardinality(public.clear_read_posts()) = 2);
select pg_temp.check('cleared posts leave the Home feed',
  not exists (select 1 from _titles where title like 'Pumpkin patch%' or title like 'Partnership Night%'));
select pg_temp.check('unread, pinned and unconfirmed posts stay on Home',
  (select count(*) from _titles where title like '3rd grade field trip%' or title like 'Early dismissal%' or title like 'Snow day%') = 3);
select pg_temp.check('cleared posts still turn up in search',
  jsonb_array_length(public.feed('parent', null, 'pumpkin')) = 1);
select pg_temp.check('"Show cleared" brings them back, flagged as cleared',
  (select count(*) from jsonb_array_elements(public.feed('parent', null, null, 50, null, null, false, true)) x
    where (x->>'cleared')::boolean) = 2);
select public.set_post_saved((select id from public.posts where title like 'Pumpkin patch%'), true);
select pg_temp.check('saved posts show under Saved even after clearing',
  jsonb_array_length(public.feed('parent', null, null, 50, null, null, true)) = 1);
select pg_temp.check('clearing again finds nothing new', cardinality(public.clear_read_posts()) = 0);
select pg_temp.check('one cleared post can be brought back',
  public.restore_cleared_posts(array(select id from public.posts where title like 'Pumpkin patch%')) = 1);
select pg_temp.check('a brought-back post is on Home again', exists (select 1 from _titles where title like 'Pumpkin patch%'));
select pg_temp.as_user('rakesh+jen@syzygy.services');
select pg_temp.check('cleared posts are private to the person who cleared them',
  not exists (select 1 from public.post_dismissals) and public.restore_cleared_posts() = 0);
select pg_temp.as_user('rakesh+sarah@syzygy.services');
select pg_temp.check('bringing back all cleared posts', public.restore_cleared_posts() = 1);
reset role;
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ begin
  perform public.clear_read_posts();
  perform pg_temp.check('signed-out callers cannot clear posts', false);
exception when others then perform pg_temp.check('signed-out callers cannot clear posts', sqlstate in ('42501', '28000')); end $$;

reset role;
select name || ': PASS' as result from _t;
rollback;
