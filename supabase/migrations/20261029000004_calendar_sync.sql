-- ZCS Connect · school calendar syncs from the ZCS Google Calendar.
--
-- ZCS confirmed (Oct 2026) that its Google Calendar is the source of truth for
-- school-wide events. The office pastes the calendar's secret iCal address in
-- the console; the calendar-sync Edge Function reads it every 15 minutes and
-- calls worker_sync_calendar(). Synced events are source = 'ics' and can only
-- be changed in Google Calendar. Events entered by hand and class events are
-- never touched by the sync.

create table if not exists private.calendar_sources (
  school_id uuid primary key references public.schools(id) on delete cascade,
  ics_url text not null,
  last_synced_at timestamptz,
  last_count int,
  last_error text,
  updated_by uuid references public.people(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table private.calendar_sources enable row level security; -- no policies: reachable only through the functions below

-- Only Google Calendar iCal addresses are accepted, so the sync never fetches
-- arbitrary URLs.
create or replace function private.valid_calendar_url(p_url text) returns boolean
language sql immutable as $$
  select p_url ~ '^https://calendar\.google\.com/calendar/ical/[^\s]+\.ics$' and length(p_url) < 600
$$;

-- Asks the calendar-sync function to run now (same secret as the delivery worker).
create or replace function private.kick_calendar_sync() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select regexp_replace(decrypted_secret, '/deliver/?$', '/calendar-sync') into v_url from vault.decrypted_secrets where name = 'deliver_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'deliver_secret';
  if v_url is null or v_secret is null or not exists (select 1 from private.calendar_sources) then return; end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-deliver-secret', v_secret),
    timeout_milliseconds := 2000);
exception when others then null;
end $$;

-- ---------------------------------------------------------------- office
create or replace function public.set_calendar_source(p_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text := nullif(trim(coalesce(p_url, '')), '');
begin
  perform private.require_office();
  if v_url is null then
    delete from private.calendar_sources where school_id = private.my_school();
    perform private.audit('calendar.source_removed', 'school', private.my_school()::text);
    return;
  end if;
  if not private.valid_calendar_url(v_url) then
    raise exception 'Paste the calendar''s "Secret address in iCal format" from Google Calendar settings. It starts with https://calendar.google.com/calendar/ical/ and ends with .ics.'
      using errcode = '22023';
  end if;
  insert into private.calendar_sources (school_id, ics_url, updated_by)
  values (private.my_school(), v_url, private.me())
  on conflict (school_id) do update set ics_url = excluded.ics_url, updated_by = excluded.updated_by, updated_at = now(),
    last_synced_at = null, last_count = null, last_error = null;
  -- the address is a secret: the audit records that it changed, not what it is
  perform private.audit('calendar.source_set', 'school', private.my_school()::text);
  perform private.kick_calendar_sync();
end $$;

create or replace function public.calendar_source_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_office();
  select jsonb_build_object('connected', true, 'last_synced_at', s.last_synced_at, 'last_count', s.last_count,
    'last_error', s.last_error, 'updated_at', s.updated_at,
    'synced_events', (select count(*) from public.calendar_events e where e.school_id = s.school_id and e.source = 'ics'))
  into v from private.calendar_sources s where s.school_id = private.my_school();
  return coalesce(v, '{"connected": false}'::jsonb);
end $$;

create or replace function public.request_calendar_sync() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_office();
  perform private.kick_calendar_sync();
end $$;

-- Synced events are edited in Google Calendar, not here.
create or replace function public.upsert_calendar_event(p_id uuid, p_title text, p_starts_on date, p_ends_on date,
  p_start_time time, p_end_time time, p_location text, p_no_school boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_office();
  if p_id is not null and exists (select 1 from public.calendar_events where id = p_id and source = 'ics') then
    raise exception 'This event comes from the ZCS Google Calendar. Change it there and it will update here within 15 minutes.' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.calendar_events (school_id, title, starts_on, ends_on, start_time, end_time, location, no_school, created_by)
    values (private.my_school(), p_title, p_starts_on, p_ends_on, p_start_time, p_end_time, nullif(p_location, ''), p_no_school, private.me())
    returning id into v_id;
  else
    update public.calendar_events set title = p_title, starts_on = p_starts_on, ends_on = p_ends_on, start_time = p_start_time,
      end_time = p_end_time, location = nullif(p_location, ''), no_school = p_no_school
    where id = p_id and school_id = private.my_school() returning id into v_id;
  end if;
  perform private.audit('calendar.upsert', 'calendar_event', v_id::text);
  return v_id;
end $$;

create or replace function public.delete_calendar_event(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_office();
  if exists (select 1 from public.calendar_events where id = p_id and source = 'ics') then
    raise exception 'This event comes from the ZCS Google Calendar. Delete it there and it will disappear here within 15 minutes.' using errcode = '42501';
  end if;
  delete from public.calendar_events where id = p_id and school_id = private.my_school();
  perform private.audit('calendar.delete', 'calendar_event', p_id::text);
end $$;

-- ---------------------------------------------------------------- worker (service_role only)
create or replace function public.worker_calendar_sources() returns table (school_id uuid, ics_url text)
language sql stable security definer set search_path = '' as $$
  select s.school_id, s.ics_url from private.calendar_sources s
$$;

-- Applies one sync: upserts every event in p_events (by uid) and removes Google
-- events in [p_from, p_to] that are no longer in the feed. With p_error set,
-- only records the error and changes nothing else.
create or replace function public.worker_sync_calendar(p_school uuid, p_events jsonb, p_from date, p_to date, p_error text)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int := 0;
begin
  if p_error is not null then
    update private.calendar_sources set last_error = p_error, last_synced_at = now() where school_id = p_school;
    return 0;
  end if;
  with incoming as (
    select distinct on (e->>'uid')
      left(e->>'uid', 500) as uid, left(coalesce(nullif(e->>'title', ''), 'School event'), 200) as title,
      (e->>'starts_on')::date as starts_on, nullif(e->>'ends_on', '')::date as ends_on,
      nullif(e->>'start_time', '')::time as start_time, nullif(e->>'end_time', '')::time as end_time,
      left(nullif(e->>'location', ''), 200) as location, coalesce((e->>'no_school')::boolean, false) as no_school
    from jsonb_array_elements(coalesce(p_events, '[]')) e
    where e->>'uid' is not null and e->>'starts_on' is not null
  ), up as (
    insert into public.calendar_events (school_id, title, starts_on, ends_on, start_time, end_time, location, no_school, source, external_uid)
    select p_school, i.title, i.starts_on, i.ends_on, i.start_time, i.end_time, i.location, i.no_school, 'ics', i.uid from incoming i
    on conflict (school_id, external_uid) where external_uid is not null do update set
      title = excluded.title, starts_on = excluded.starts_on, ends_on = excluded.ends_on, start_time = excluded.start_time,
      end_time = excluded.end_time, location = excluded.location, no_school = excluded.no_school
    where public.calendar_events.source = 'ics'
    returning 1
  )
  select count(*) into v_n from up;
  delete from public.calendar_events e
  where e.school_id = p_school and e.source = 'ics' and e.starts_on between p_from and p_to
    and not exists (select 1 from jsonb_array_elements(coalesce(p_events, '[]')) x where x->>'uid' = e.external_uid);
  update private.calendar_sources set last_synced_at = now(), last_count = v_n, last_error = null where school_id = p_school;
  return v_n;
end $$;

revoke execute on function public.set_calendar_source(text) from public, anon;
grant execute on function public.set_calendar_source(text) to authenticated;
revoke execute on function public.calendar_source_status() from public, anon;
grant execute on function public.calendar_source_status() to authenticated;
revoke execute on function public.request_calendar_sync() from public, anon;
grant execute on function public.request_calendar_sync() to authenticated;
revoke execute on function public.worker_calendar_sources() from public, anon, authenticated;
grant execute on function public.worker_calendar_sources() to service_role;
revoke execute on function public.worker_sync_calendar(uuid, jsonb, date, date, text) from public, anon, authenticated;
grant execute on function public.worker_sync_calendar(uuid, jsonb, date, date, text) to service_role;
revoke execute on function private.kick_calendar_sync() from public, anon, authenticated;

select cron.schedule('zcs-calendar-sync', '*/15 * * * *', $$ select private.kick_calendar_sync() $$);
