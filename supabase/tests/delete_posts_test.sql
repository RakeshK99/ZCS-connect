-- ZCS Connect · delete posts + author parent copy. Rolled back.

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



-- ---------------------------------------------------------------- setup: a teacher of 3S who is also a 3S parent
reset role;
select private.add_tester('rakesh@syzygy.services', 'Rakesh', 'Kottapalli', 'Mr.', '3S', 'Emma');
delete from pgmq.q_notify;
create temp table _post (id uuid);
grant all on _post to authenticated;

-- ---------------------------------------------------------------- author parent copy
select pg_temp.as_user('rakesh@syzygy.services');
insert into _post select (public.create_post('Library books', 'Due Friday',
  jsonb_build_array(jsonb_build_object('type','class','id',(select id from public.classes where code = '3S'))), 'normal', false, null, '[]')->>'id')::uuid;
select pg_temp.check('a teacher who is a parent in the class sees their own post in the parent feed',
  exists (select 1 from jsonb_array_elements(public.feed('parent')) x where x->>'title' = 'Library books'));
select pg_temp.check('their parent copy is already read',
  (select (x->>'read')::boolean from jsonb_array_elements(public.feed('parent')) x where x->>'title' = 'Library books'));
reset role;
select pg_temp.check('the author gets no notification for their own post',
  not exists (select 1 from pgmq.q_notify q where q.message->>'post_id' = (select id::text from _post)
    and q.message->>'person_id' = (select id::text from public.people where email = 'rakesh@syzygy.services')));
select pg_temp.check('other families in the class are still notified',
  exists (select 1 from pgmq.q_notify q where q.message->>'post_id' = (select id::text from _post)));
select pg_temp.check('the author is not a staff recipient of their own post',
  not exists (select 1 from public.post_recipients r join public.people p on p.id = r.person_id
    where r.post_id = (select id from _post) and p.email = 'rakesh@syzygy.services' and r.context = 'staff'));

-- ---------------------------------------------------------------- delete
select pg_temp.as_user('rakesh+sarah@syzygy.services');
do $$ begin
  perform public.delete_post((select id from _post));
  perform pg_temp.check('a parent cannot delete a post', false);
exception when others then perform pg_temp.check('a parent cannot delete a post', sqlstate = '42501'); end $$;
select pg_temp.as_user('rakesh+jen@syzygy.services');
do $$ begin
  perform public.delete_post((select id from _post));
  perform pg_temp.check('another teacher cannot delete someone else''s post', false);
exception when others then perform pg_temp.check('another teacher cannot delete someone else''s post', sqlstate = '42501'); end $$;
select pg_temp.as_user('rakesh@syzygy.services');
select public.delete_post((select id from _post));
select pg_temp.check('the author can delete their post and it leaves every feed',
  not exists (select 1 from jsonb_array_elements(public.feed('parent')) x where x->>'title' = 'Library books')
  and not exists (select 1 from jsonb_array_elements(public.feed('staff')) x where x->>'title' = 'Library books'));
reset role;
select pg_temp.check('deleting is audited with the post title',
  exists (select 1 from public.audit_log where action = 'post.delete' and detail->>'title' = 'Library books'));
select pg_temp.check('its recipients go with it', not exists (select 1 from public.post_recipients where post_id = (select id from _post)));
select pg_temp.as_user('rakesh+office@syzygy.services');
select public.delete_post((select id from public.posts where title like 'Pumpkin patch%'));
select pg_temp.check('the office can delete any post', not exists (select 1 from public.posts where title like 'Pumpkin patch%'));

reset role;
select name || ': PASS' as result from _t;
rollback;
