-- ZCS Connect · calendar sync from Google Calendar. Rolled back.

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


-- ---------------------------------------------------------------- office connects the calendar
select pg_temp.as_user('rakesh+jen@syzygy.services');
do $$ begin
  perform public.set_calendar_source('https://calendar.google.com/calendar/ical/x/private-abc/basic.ics');
  perform pg_temp.check('a teacher cannot connect the school calendar', false);
exception when others then perform pg_temp.check('a teacher cannot connect the school calendar', sqlerrm not like 'FAIL%'); end $$;
select pg_temp.as_user('rakesh+office@syzygy.services');
do $$ begin
  perform public.set_calendar_source('https://evil.example.com/feed.ics');
  perform pg_temp.check('only Google Calendar iCal addresses are accepted', false);
exception when others then perform pg_temp.check('only Google Calendar iCal addresses are accepted', sqlerrm like '%Secret address in iCal format%'); end $$;
select public.set_calendar_source('https://calendar.google.com/calendar/ical/zcs.org_abc%40group.calendar.google.com/private-123/basic.ics');
select pg_temp.check('the office can connect the calendar and see its status',
  (public.calendar_source_status()->>'connected')::boolean);
reset role;
select pg_temp.check('the secret address is not written to the audit log',
  exists (select 1 from public.audit_log where action = 'calendar.source_set')
  and not exists (select 1 from public.audit_log where detail::text like '%private-123%'));

-- ---------------------------------------------------------------- the worker syncs
select public.worker_sync_calendar((select id from public.schools limit 1), '[
  {"uid":"g1","title":"Fall concert","starts_on":"2026-12-03","start_time":"18:30","end_time":"20:00","location":"Gym","no_school":false},
  {"uid":"g2","title":"No school · Thanksgiving","starts_on":"2026-11-25","ends_on":"2026-11-27","no_school":true}
]'::jsonb, '2026-08-01', '2027-07-31', null);
select pg_temp.check('synced events are added as Google Calendar events',
  (select count(*) from public.calendar_events where source = 'ics') = 2
  and exists (select 1 from public.calendar_events where external_uid = 'g1' and start_time = '18:30' and location = 'Gym'));
select pg_temp.as_user('rakesh+sarah@syzygy.services');
select pg_temp.check('families see synced school events', exists (select 1 from public.calendar_events where title = 'Fall concert'));
reset role;
select public.worker_sync_calendar((select id from public.schools limit 1), '[
  {"uid":"g1","title":"Fall concert (moved)","starts_on":"2026-12-04","start_time":"19:00","no_school":false}
]'::jsonb, '2026-08-01', '2027-07-31', null);
select pg_temp.check('changes in Google Calendar update the event, and removed events disappear',
  exists (select 1 from public.calendar_events where external_uid = 'g1' and title = 'Fall concert (moved)' and starts_on = '2026-12-04')
  and not exists (select 1 from public.calendar_events where external_uid = 'g2'));
select pg_temp.check('events entered by hand are never touched by the sync',
  exists (select 1 from public.calendar_events where title = 'Partnership Night' and source = 'manual'));
select public.worker_sync_calendar((select id from public.schools limit 1), '[]'::jsonb, '2026-08-01', '2027-07-31', 'The calendar link answered 404.');
select pg_temp.check('a failed sync records the error and keeps the events',
  exists (select 1 from public.calendar_events where external_uid = 'g1')
  and (select last_error from private.calendar_sources limit 1) like '%404%');

select pg_temp.as_user('rakesh+office@syzygy.services');
do $$ begin
  perform public.delete_calendar_event((select id from public.calendar_events where external_uid = 'g1'));
  perform pg_temp.check('synced events can only be changed in Google Calendar', false);
exception when others then perform pg_temp.check('synced events can only be changed in Google Calendar', sqlerrm like '%Google Calendar%'); end $$;
do $$ begin
  set local role authenticated;
  perform public.worker_sync_calendar((select id from public.schools limit 1), '[]'::jsonb, '2026-08-01', '2027-07-31', null);
  perform pg_temp.check('signed-in users cannot run the sync worker', false);
exception when others then perform pg_temp.check('signed-in users cannot run the sync worker', sqlerrm like '%permission denied%'); end $$;
select public.set_calendar_source(null);
select pg_temp.check('the office can disconnect the calendar', not (public.calendar_source_status()->>'connected')::boolean);

reset role;
select name || ': PASS' as result from _t;
rollback;
