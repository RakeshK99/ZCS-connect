-- ZCS Connect · delivery pipeline tests (worker_claim / worker_complete /
-- fallbacks / receipts). Same harness as permissions_test.sql; rolled back.

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

-- claim everything currently visible and return it
create or replace function pg_temp.claim_all() returns jsonb language plpgsql as $$
declare v jsonb := '[]'; b jsonb;
begin
  loop
    b := public.worker_claim(100);
    exit when jsonb_array_length(b) = 0;
    v := v || b;
  end loop;
  return v;
end $$;

create or replace function pg_temp.person(p_email text) returns uuid language sql as $$
  select id from public.people where email = p_email
$$;

create temp table _jobs (j jsonb) on commit drop;
grant all on _jobs to authenticated;

-- start from an empty queue; nobody is in quiet hours unless a test sets it
delete from pgmq.q_notify;
insert into public.notification_prefs (person_id, context, quiet_start, quiet_end)
select id, 'parent', null, null from public.people
on conflict (person_id, context) do update set quiet_start = null, quiet_end = null;

-- ---------------------------------------------------------------- emergency, no devices: one email each
select pg_temp.as_user('rakesh+office@syzygy.services');
select public.create_post('Drill', 'Practice', '[{"type":"school"}]', 'emergency', false, null, '[]');
reset role;
insert into _jobs select pg_temp.claim_all();
select pg_temp.check('emergency: each recipient gets exactly one email action (no duplicates)',
  not exists (select x->'job'->>'person_id' from _jobs, jsonb_array_elements(j) x
              where x->>'action' = 'email' group by 1 having count(*) > 1)
  and exists (select 1 from _jobs, jsonb_array_elements(j) x where x->>'action' = 'email'));
select pg_temp.check('emergency: push jobs without a device are skipped, not turned into a second email',
  not exists (select 1 from _jobs, jsonb_array_elements(j) x where x->'job'->>'channel' = 'push' and x->>'action' = 'email'));
select public.worker_complete((select jsonb_agg(jsonb_build_object('msg_id', x->'msg_id', 'person_id', x->'job'->>'person_id',
  'post_id', x->'job'->>'post_id', 'channel', x->'job'->>'channel', 'status', 'skipped')) from _jobs, jsonb_array_elements(j) x));
select pg_temp.check('completed jobs leave the queue', (select count(*) from pgmq.q_notify) = 0);
truncate _jobs;

-- ---------------------------------------------------------------- quiet hours delay pushes and fallbacks
update public.notification_prefs set quiet_start = ((now() at time zone 'America/Detroit') - interval '1 hour')::time,
                                     quiet_end = ((now() at time zone 'America/Detroit') + interval '2 hours')::time
where person_id = pg_temp.person('rakesh+sarah@syzygy.services') and context = 'parent';
select pg_temp.as_user('rakesh+jen@syzygy.services');
select public.create_post('Library books', 'Due Friday', jsonb_build_array(jsonb_build_object('type','class','id',(select id from public.classes where code = '3S'))), 'normal', false, null, '[]');
reset role;
select pg_temp.check('a parent in quiet hours gets the push later',
  exists (select 1 from pgmq.q_notify q where q.message->>'person_id' = pg_temp.person('rakesh+sarah@syzygy.services')::text
          and q.vt > now() + interval '90 minutes'));
select pg_temp.check('a parent outside quiet hours gets the push now',
  exists (select 1 from pgmq.q_notify q where q.message->>'person_id' = pg_temp.person('mark.vandyke@example.com')::text
          and q.vt <= now()));
delete from pgmq.q_notify;

-- fallback: Sarah's push went out 20 minutes ago and she hasn't opened it
insert into public.deliveries (post_id, person_id, channel, status, created_at)
values ((select id from public.posts where title = 'Library books'), pg_temp.person('rakesh+sarah@syzygy.services'), 'push', 'sent', now() - interval '20 minutes'),
       ((select id from public.posts where title = 'Library books'), pg_temp.person('mark.vandyke@example.com'), 'push', 'sent', now() - interval '5 minutes');
select private.queue_email_fallbacks();
select pg_temp.check('fallback email waits for quiet hours to end',
  exists (select 1 from pgmq.q_notify q where q.message->>'person_id' = pg_temp.person('rakesh+sarah@syzygy.services')::text
          and q.message->>'channel' = 'email' and q.vt > now() + interval '90 minutes'));
select pg_temp.check('fallback waits 15 minutes after the push actually went out',
  not exists (select 1 from pgmq.q_notify q where q.message->>'person_id' = pg_temp.person('mark.vandyke@example.com')::text));
delete from pgmq.q_notify;

-- ---------------------------------------------------------------- preferences apply to fallback email
update public.notification_prefs set class_posts = false, quiet_start = null, quiet_end = null
where person_id = pg_temp.person('rakesh+sarah@syzygy.services') and context = 'parent';
select pgmq.send('notify', jsonb_build_object('kind','post','post_id',(select id from public.posts where title = 'Library books'),
  'person_id', pg_temp.person('rakesh+sarah@syzygy.services'), 'context','parent','channel','email','fallback',true));
insert into _jobs select pg_temp.claim_all();
select pg_temp.check('fallback email is skipped when class posts are turned off',
  (select x->>'action' = 'skip' and x->>'reason' like '%preferences%' from _jobs, jsonb_array_elements(j) x limit 1));
delete from pgmq.q_notify; truncate _jobs;

-- ---------------------------------------------------------------- rights re-checked at send time
update public.guardianships set no_contact = true
where person_id = pg_temp.person('mark.vandyke@example.com') and student_id = (select id from public.students where first_name = 'Emma');
select pgmq.send('notify', jsonb_build_object('kind','post','post_id',(select id from public.posts where title = 'Library books'),
  'person_id', pg_temp.person('mark.vandyke@example.com'), 'context','parent','channel','push'));
insert into _jobs select pg_temp.claim_all();
select pg_temp.check('a delayed push to a guardian who became no_contact is skipped',
  (select x->>'action' = 'skip' from _jobs, jsonb_array_elements(j) x limit 1));
delete from pgmq.q_notify; truncate _jobs;

-- ---------------------------------------------------------------- missing rows don't poison the batch
select pgmq.send('notify', jsonb_build_object('kind','post','post_id',gen_random_uuid(),'person_id',gen_random_uuid(),'context','parent','channel','push'));
select pgmq.send('notify', jsonb_build_object('kind','post','post_id',gen_random_uuid(),'person_id',pg_temp.person('rakesh+sarah@syzygy.services'),'context','parent','channel','email'));
insert into _jobs select pg_temp.claim_all();
select pg_temp.check('jobs for missing people or posts are skipped',
  (select bool_and(x->>'action' = 'skip') from _jobs, jsonb_array_elements(j) x));
select public.worker_complete((select jsonb_agg(jsonb_build_object('msg_id', x->'msg_id', 'person_id', x->'job'->>'person_id',
  'post_id', x->'job'->>'post_id', 'channel', x->'job'->>'channel', 'status', 'sent')) from _jobs, jsonb_array_elements(j) x));
select pg_temp.check('completing results that reference missing rows does not fail and clears the queue',
  (select count(*) from pgmq.q_notify) = 0);
truncate _jobs;

-- ---------------------------------------------------------------- retries and dead letters
select pgmq.send('notify', jsonb_build_object('kind','post','post_id',(select id from public.posts where title = 'Library books'),
  'person_id', pg_temp.person('rakesh+jen@syzygy.services'), 'context','parent','channel','email'));
insert into _jobs select pg_temp.claim_all();
select public.worker_complete((select jsonb_agg(jsonb_build_object('msg_id', x->'msg_id', 'person_id', x->'job'->>'person_id',
  'post_id', x->'job'->>'post_id', 'channel', 'email', 'status', 'failed', 'detail', 'rate limited', 'retry', true)) from _jobs, jsonb_array_elements(j) x));
select pg_temp.check('a retryable failure stays queued with a backoff',
  exists (select 1 from pgmq.q_notify where vt > now() + interval '30 seconds'));
select pg_temp.check('a retryable failure is not recorded as a delivery yet',
  not exists (select 1 from public.deliveries where detail = 'rate limited'));
update pgmq.q_notify set read_ct = 5;
select public.worker_complete((select jsonb_agg(jsonb_build_object('msg_id', x->'msg_id', 'person_id', x->'job'->>'person_id',
  'post_id', x->'job'->>'post_id', 'channel', 'email', 'status', 'failed', 'detail', 'rate limited', 'retry', true)) from _jobs, jsonb_array_elements(j) x));
select pg_temp.check('after 5 attempts the job is archived and recorded as failed',
  (select count(*) from pgmq.q_notify) = 0 and (select count(*) from pgmq.a_notify) >= 1
  and exists (select 1 from public.deliveries where status = 'failed' and detail like 'gave up after 5 attempts%'));
truncate _jobs;

-- ---------------------------------------------------------------- receipts prune dead devices
insert into public.devices (person_id, expo_token, platform) values (pg_temp.person('rakesh+jen@syzygy.services'), 'ExponentPushToken[dead-device-123]', 'ios');
insert into public.deliveries (post_id, person_id, channel, status, provider_id, device_token)
values ((select id from public.posts where title = 'Library books'), pg_temp.person('rakesh+jen@syzygy.services'), 'push', 'sent', 'ticket-1', 'ExponentPushToken[dead-device-123]');
select public.worker_apply_receipts(jsonb_build_array(jsonb_build_object(
  'id', (select id from public.deliveries where provider_id = 'ticket-1'), 'status', 'failed', 'detail', 'DeviceNotRegistered')));
select pg_temp.check('a DeviceNotRegistered receipt removes the device',
  not exists (select 1 from public.devices where expo_token = 'ExponentPushToken[dead-device-123]'));

-- ---------------------------------------------------------------- messages to someone who lost access
select pg_temp.as_user('rakesh+sarah@syzygy.services');
insert into _jobs select to_jsonb(public.start_thread((select id from public.students where first_name = 'Noah'),
  (select id from public.people where email = 'adevries@example.com'), 'parent'));
select public.send_message((select (j #>> '{}')::uuid from _jobs), 'Hello');
reset role;
delete from pgmq.q_notify;
select pgmq.send('notify', jsonb_build_object('kind','message','message_id',(select id from public.messages where body = 'Hello' order by created_at desc limit 1),
  'person_id', pg_temp.person('rakesh+sarah@syzygy.services'), 'context','parent','channel','push'));
update public.guardianships set no_contact = true
where person_id = pg_temp.person('rakesh+sarah@syzygy.services') and student_id = (select id from public.students where first_name = 'Noah');
truncate _jobs;
insert into _jobs select pg_temp.claim_all();
select pg_temp.check('a message notification to someone who lost access is skipped',
  (select x->>'action' = 'skip' from _jobs, jsonb_array_elements(j) x limit 1));

reset role;
select name || ': PASS' as result from _t;
rollback;
