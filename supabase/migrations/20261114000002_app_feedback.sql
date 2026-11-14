-- ZCS Connect · in-app feedback (soft launch). Testers forget TestFlight's
-- screenshot feedback, so Profile → "Send feedback" writes here and the office
-- reads it in the staff console. Tied to the auth user, not the person, so
-- deleting an account removes the link to the name (the note itself stays).

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  meta jsonb not null default '{}',
  status text not null default 'new' check (status in ('new', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists app_feedback_school on public.app_feedback (school_id, created_at desc);
alter table public.app_feedback enable row level security;
drop policy if exists app_feedback_read on public.app_feedback;
create policy app_feedback_read on public.app_feedback for select to authenticated using (
  user_id = (select auth.uid())
  or ((select private.is_office()) and (school_id is null or school_id = (select private.my_school()))));

-- Anyone signed in (even before their family is linked) can send a note.
-- p_meta carries app version, platform and current role; only those keys are kept.
create or replace function public.send_feedback(p_body text, p_meta jsonb default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_body text := btrim(coalesce(p_body, '')); v_meta jsonb := '{}';
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if v_body = '' then raise exception 'Write a note first.' using errcode = '22023'; end if;
  if char_length(v_body) > 4000 then raise exception 'That note is too long (4,000 characters at most).' using errcode = '22023'; end if;
  if (select count(*) from public.app_feedback f where f.user_id = auth.uid() and f.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Thanks! That''s a lot of notes in one hour. Try again a little later.' using errcode = '54000';
  end if;
  if jsonb_typeof(p_meta) = 'object' then
    select coalesce(jsonb_object_agg(k, left(p_meta->>k, 80)), '{}') into v_meta
    from unnest(array['version', 'build', 'platform', 'os', 'context', 'screen']) k where p_meta ? k;
  end if;
  insert into public.app_feedback (school_id, user_id, body, meta)
  values (private.my_school(), auth.uid(), v_body, v_meta) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.send_feedback(text, jsonb) from public, anon;
grant execute on function public.send_feedback(text, jsonb) to authenticated;

-- Office: newest feedback with who sent it (name, email, roles) when still known.
create or replace function public.office_feedback(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_office() then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'body', f.body, 'meta', f.meta, 'status', f.status, 'created_at', f.created_at,
      'name', nullif(btrim(p.first_name || ' ' || p.last_name), ''), 'email', u.email,
      'who', case when p.id is null then null
                  when private.is_staff_person(p.id) then 'Staff'
                  when exists (select 1 from public.guardianships g where g.person_id = p.id) then 'Family'
                  else null end
    ) order by f.created_at desc)
    from (select * from public.app_feedback f
          where (f.school_id is null or f.school_id = private.my_school()) and (p_status is null or f.status = p_status)
          order by f.created_at desc limit 300) f
    left join auth.users u on u.id = f.user_id
    left join public.people p on p.user_id = f.user_id), '[]');
end $$;
revoke execute on function public.office_feedback(text) from public, anon;
grant execute on function public.office_feedback(text) to authenticated;

-- Office: mark a note handled (or new again).
create or replace function public.set_feedback_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_office() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status not in ('new', 'done') then raise exception 'bad status' using errcode = '22023'; end if;
  update public.app_feedback set status = p_status
  where id = p_id and (school_id is null or school_id = private.my_school());
end $$;
revoke execute on function public.set_feedback_status(uuid, text) from public, anon;
grant execute on function public.set_feedback_status(uuid, text) to authenticated;
