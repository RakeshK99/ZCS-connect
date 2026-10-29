-- ZCS Connect · class events. Rolled back.

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


-- ---------------------------------------------------------------- class events
select pg_temp.as_user('rakesh+jen@syzygy.services');
select public.upsert_class_event(null, (select id from public.classes where code = '3S'), 'Apple day', current_date + 3, null, '09:00', '11:00', 'Orchard');
select pg_temp.check('a teacher can add an event for her class', exists (select 1 from public.calendar_events where title = 'Apple day' and audience_label like '3S%'));
do $$ begin
  perform public.upsert_class_event(null, (select id from public.classes where code = 'KD'), 'Not mine', current_date + 3, null, null, null, null);
  perform pg_temp.check('a teacher cannot add an event for another class', false);
exception when others then perform pg_temp.check('a teacher cannot add an event for another class', sqlerrm like '%your own classes%'); end $$;
do $$ begin
  perform public.upsert_class_event(null, (select id from public.classes where code = '3S'), 'Backwards', current_date + 3, current_date + 1, null, null, null);
  perform pg_temp.check('an event cannot end before it starts', false);
exception when others then perform pg_temp.check('an event cannot end before it starts', sqlerrm like '%before the start%'); end $$;
select pg_temp.as_user('rakesh+sarah@syzygy.services');
select pg_temp.check('a family in the class sees the class event', exists (select 1 from public.calendar_events where title = 'Apple day'));
select pg_temp.check('families still see school-wide events', exists (select 1 from public.calendar_events where title = 'Partnership Night'));
select pg_temp.as_user('mark.vandyke@example.com');
select pg_temp.check('the other guardian in the class sees it too', exists (select 1 from public.calendar_events where title = 'Apple day'));
select pg_temp.as_user('adevries@example.com');
select pg_temp.check('a teacher of another class does not see it', not exists (select 1 from public.calendar_events where title = 'Apple day'));
do $$ begin
  perform public.delete_class_event((select id from public.calendar_events where title = 'Partnership Night'));
  perform pg_temp.check('a teacher cannot delete a school-wide event', false);
exception when others then perform pg_temp.check('a teacher cannot delete a school-wide event', sqlerrm = 'not allowed'); end $$;
select pg_temp.as_user('rakesh+office@syzygy.services');
select pg_temp.check('the office sees every class event', exists (select 1 from public.calendar_events where title = 'Apple day'));
select pg_temp.as_user('rakesh+jen@syzygy.services');
select public.delete_class_event((select id from public.calendar_events where title = 'Apple day'));
reset role;
select pg_temp.check('the teacher can delete her class event, and it is audited',
  not exists (select 1 from public.calendar_events where title = 'Apple day')
  and exists (select 1 from public.audit_log where action = 'calendar.class_event_delete'));


reset role;
select name || ': PASS' as result from _t;
rollback;
