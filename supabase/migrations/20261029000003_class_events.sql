-- ZCS Connect · class events (Oct 23 feedback: field trips and theme days that
-- don't belong on the school calendar). Teachers add events for their own
-- classes; only that class's families and staff (and the office) see them.

alter table public.calendar_events add column if not exists audience_label text;

-- Can the caller see an event addressed to these audiences? School-wide events
-- go to everyone in the school; class events go to that class's teachers and
-- the families of its students; the office sees everything.
create or replace function private.can_see_event(p_audience jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_audience @> '[{"type":"school"}]'
      or private.is_office()
      or exists (
        select 1 from jsonb_array_elements(p_audience) i
        where i->>'type' = 'class' and (
          (i->>'id')::uuid in (select private.my_class_ids())
          or exists (select 1 from public.enrollments e
                     where e.class_id = (i->>'id')::uuid and e.student_id in (select private.my_student_ids()))))
$$;

drop policy if exists calendar_read on public.calendar_events;
create policy calendar_read on public.calendar_events for select to authenticated using (
  school_id = (select private.my_school())
  and (audience @> '[{"type":"school"}]' or created_by = (select private.me()) or private.can_see_event(audience))
);

-- Teachers (and the office) add or edit an event for one of their classes.
create or replace function public.upsert_class_event(p_id uuid, p_class uuid, p_title text, p_starts_on date, p_ends_on date,
  p_start_time time, p_end_time time, p_location text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_class public.classes;
begin
  if private.me() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into v_class from public.classes c where c.id = p_class and c.school_id = private.my_school();
  if v_class.id is null or not (p_class in (select private.my_class_ids()) or private.is_office()) then
    raise exception 'You can only add events for your own classes.' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the event a name.' using errcode = '22023'; end if;
  if length(p_title) > 120 then raise exception 'Keep the event name under 120 characters.' using errcode = '22023'; end if;
  if p_starts_on is null then raise exception 'Pick a date.' using errcode = '22023'; end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then raise exception 'The end date is before the start date.' using errcode = '22023'; end if;
  if p_start_time is not null and p_end_time is not null and p_ends_on is null and p_end_time <= p_start_time then
    raise exception 'The end time is before the start time.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.calendar_events (school_id, title, starts_on, ends_on, start_time, end_time, location, no_school,
                                        audience, audience_label, created_by)
    values (private.my_school(), trim(p_title), p_starts_on, p_ends_on, p_start_time, p_end_time, nullif(trim(coalesce(p_location, '')), ''), false,
            jsonb_build_array(jsonb_build_object('type', 'class', 'id', p_class)), v_class.code || ' · ' || v_class.name, private.me())
    returning id into v_id;
  else
    update public.calendar_events e set title = trim(p_title), starts_on = p_starts_on, ends_on = p_ends_on, start_time = p_start_time,
      end_time = p_end_time, location = nullif(trim(coalesce(p_location, '')), ''),
      audience = jsonb_build_array(jsonb_build_object('type', 'class', 'id', p_class)), audience_label = v_class.code || ' · ' || v_class.name
    where e.id = p_id and e.school_id = private.my_school()
      and not (e.audience @> '[{"type":"school"}]')
      and (e.created_by = private.me() or private.is_office()
           or exists (select 1 from jsonb_array_elements(e.audience) i where i->>'type' = 'class' and (i->>'id')::uuid in (select private.my_class_ids())))
    returning e.id into v_id;
    if v_id is null then raise exception 'not allowed' using errcode = '42501'; end if;
  end if;
  perform private.audit('calendar.class_event', 'calendar_event', v_id::text, jsonb_build_object('class', p_class));
  return v_id;
end $$;

create or replace function public.delete_class_event(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  delete from public.calendar_events e
  where e.id = p_id and e.school_id = private.my_school() and not (e.audience @> '[{"type":"school"}]')
    and (e.created_by = private.me() or private.is_office()
         or exists (select 1 from jsonb_array_elements(e.audience) i where i->>'type' = 'class' and (i->>'id')::uuid in (select private.my_class_ids())))
  returning e.id into v_id;
  if v_id is null then raise exception 'not allowed' using errcode = '42501'; end if;
  perform private.audit('calendar.class_event_delete', 'calendar_event', p_id::text);
end $$;

revoke execute on function public.upsert_class_event(uuid, uuid, text, date, date, time, time, text) from public, anon;
grant execute on function public.upsert_class_event(uuid, uuid, text, date, date, time, time, text) to authenticated;
revoke execute on function public.delete_class_event(uuid) from public, anon;
grant execute on function public.delete_class_event(uuid) to authenticated;
revoke execute on function private.can_see_event(jsonb) from public, anon;
grant execute on function private.can_see_event(jsonb) to authenticated;
