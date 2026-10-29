-- ZCS Connect · account deletion, audit log, paging tests. Rolled back.

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


-- ---------------------------------------------------------------- account deletion (M5)
-- Shared demo accounts can't be deleted from the app.
select pg_temp.as_user('rakesh+sarah@syzygy.services');
do $$ begin
  perform public.delete_my_account();
  perform pg_temp.check('a shared demo account cannot be deleted', false);
exception when others then perform pg_temp.check('a shared demo account cannot be deleted', sqlerrm like '%shared by everyone testing%'); end $$;
-- A real family's account can: give Sarah a non-demo address for this block.
reset role;
update public.people set email = 'sarah.family@zcs-test.org', user_id = null where email = 'rakesh+sarah@syzygy.services';
select pg_temp.as_user('sarah.family@zcs-test.org');
select public.mark_post_read((select id from public.posts where title like 'Snow day%'));
insert into public.notification_prefs (person_id, context) values (private.me(), 'parent') on conflict do nothing;
select public.delete_my_account();
reset role;
select pg_temp.check('deleting an account removes the sign-in and app data',
  (select user_id is null and account_deleted_at is not null from public.people where email = 'sarah.family@zcs-test.org')
  and not exists (select 1 from auth.users where email = 'sarah.family@zcs-test.org')
  and not exists (select 1 from public.post_reads r join public.people p on p.id = r.person_id where p.email = 'sarah.family@zcs-test.org')
  and not exists (select 1 from public.notification_prefs n join public.people p on p.id = n.person_id where p.email = 'sarah.family@zcs-test.org'));
select pg_temp.check('account deletion is audited', exists (select 1 from public.audit_log where action = 'account.delete'));
select pg_temp.as_user('sarah.family@zcs-test.org');
select pg_temp.check('signing in again creates a new linked account', (public.session_info()->>'linked')::boolean);
reset role;
select pg_temp.check('the re-link is recorded', exists (select 1 from public.audit_log where action = 'account.relink_after_delete'));

-- ---------------------------------------------------------------- feed paging (L2)
select pg_temp.as_user('rakesh+jen@syzygy.services');
create temp table _pages (id uuid, sent_at timestamptz, n int) on commit drop;
do $$
declare v jsonb; b_at timestamptz; b_id uuid; i int := 0;
begin
  loop
    v := public.feed('staff', null, null, 1, b_at, b_id);
    exit when jsonb_array_length(v) = 0 or i > 50;
    b_at := (v->0->>'sent_at')::timestamptz; b_id := (v->0->>'id')::uuid; i := i + 1;
    insert into _pages values (b_id, b_at, i);
  end loop;
end $$;
select pg_temp.check('paging one post at a time returns every post exactly once',
  (select count(*) from _pages) = jsonb_array_length(public.feed('staff', null, null, 100))
  and (select count(distinct id) from _pages) = (select count(*) from _pages));

-- ---------------------------------------------------------------- admin_people limit (L1)
select pg_temp.as_user('rakesh+office@syzygy.services');
select pg_temp.check('admin_people returns everyone in the school (not just one row)',
  jsonb_array_length(public.admin_people(null, false)) = (select count(*) from public.people));

-- ---------------------------------------------------------------- audit log and demo removal (M4)
reset role;
do $$ begin
  truncate public.audit_log;
  perform pg_temp.check('audit_log cannot be truncated', false);
exception when others then perform pg_temp.check('audit_log cannot be truncated', sqlerrm like '%append-only%'); end $$;
select private.remove_demo_data();
select pg_temp.check('remove_demo_data removes the demo school''s people and students even with audit history',
  not exists (select 1 from public.students where sis_id like 'DEMO-%')
  and not exists (select 1 from public.people where email like 'rakesh+%@syzygy.services')
  and exists (select 1 from public.audit_log));

reset role;
select name || ': PASS' as result from _t;
rollback;
