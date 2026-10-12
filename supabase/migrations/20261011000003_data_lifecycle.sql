-- ZCS Connect · code review fixes, part 3: data lifecycle and paging.
--
-- M4  The audit log no longer blocks deleting people (its actor reference was a
--     foreign key with ON DELETE SET NULL, which the append-only trigger
--     rejected), and TRUNCATE is blocked too. remove_demo_data() now works.
-- M5  delete_my_account removes the person's app data (devices, preferences,
--     read receipts, family requests, sign-in) and records the deletion; the
--     school keeps only its own roster contact and school records.
-- L1  admin_people applies its 500-row limit to people, not to the result row.
-- L2  Feed paging uses a (sent_at, id) cursor, and posts dispatched together
--     get distinct send times.

-- ---------------------------------------------------------------- M4: audit log
alter table public.audit_log drop constraint if exists audit_log_actor_id_fkey;
comment on column public.audit_log.actor_id is 'people.id of the actor at the time; kept even if that person is later removed';

create or replace function private.audit_log_no_truncate() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'audit_log is append-only'; end $$;
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_log_no_truncate();

-- Removes every fictional demo record (run before importing the real roster).
create or replace function private.remove_demo_data() returns void
language plpgsql security definer set search_path = '' as $$
declare v_demo uuid[];
begin
  select coalesce(array_agg(id), '{}') into v_demo from public.people
  where email like '%@example.com' or email like 'rakesh+%@syzygy.services';
  delete from public.posts where author_id = any(v_demo);
  delete from public.threads where student_id in (select id from public.students where sis_id like 'DEMO-%');
  delete from public.messages where sender_id = any(v_demo);
  delete from public.roster_imports where uploaded_by = any(v_demo);
  delete from public.students where sis_id like 'DEMO-%';
  delete from public.people where id = any(v_demo);
  delete from public.classes where code in ('3S','KD','6B','CH');
end $$;
revoke execute on function private.remove_demo_data() from public, anon, authenticated;

-- ---------------------------------------------------------------- M5: account deletion
alter table public.people add column if not exists account_deleted_at timestamptz;

-- Deletes the caller's ZCS Connect account. Removed: sign-in, devices,
-- notification preferences, read receipts, pending family requests. Kept by
-- the school (and described in the privacy policy): the roster contact the
-- school itself provided, and school records (messages with staff, read
-- confirmations it asked for), retained under its records policy.
-- Signing in again later creates a new account linked to the same roster contact.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.me();
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if v_me is not null then
    perform private.audit('account.delete', 'person', v_me::text);
    delete from public.devices where person_id = v_me;
    delete from public.notification_prefs where person_id = v_me;
    delete from public.post_reads where person_id = v_me;
    update public.thread_participants set last_read_at = null where person_id = v_me;
    update public.people set user_id = null, account_deleted_at = now() where id = v_me;
  end if;
  delete from public.family_requests where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

-- link_account: unchanged behaviour, but a person who deleted their account and
-- signs in again is recorded as a new account.
create or replace function public.link_account() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_person uuid; v_was_deleted boolean;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select u.email into v_email from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then return public.session_info(); end if;
  if private.me() is null then
    select id, account_deleted_at is not null into v_person, v_was_deleted from public.people
    where email = v_email::extensions.citext and user_id is null and is_active
    order by created_at limit 1;
    if v_person is not null then
      update public.people set user_id = auth.uid(), account_deleted_at = null where id = v_person;
      insert into public.audit_log (school_id, actor_id, action, target_type, target_id)
      select school_id, id, case when v_was_deleted then 'account.relink_after_delete' else 'account.link' end, 'person', id::text
      from public.people where id = v_person;
    end if;
  end if;
  return public.session_info();
end $$;

-- ---------------------------------------------------------------- L1: admin_people limit
create or replace function public.admin_people(p_query text default null, p_staff_only boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_office();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'first_name', p.first_name, 'last_name', p.last_name,
    'honorific', p.honorific, 'email', p.email, 'staff_title', p.staff_title, 'signed_in', p.user_id is not null,
    'is_active', p.is_active,
    'memberships', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'scope_type', m.scope_type, 'scope_id', m.scope_id,
        'scope_label', case m.scope_type when 'school' then 'Whole school'
          when 'division' then (select d.name from public.divisions d where d.id = m.scope_id)
          when 'grade' then (select g.label from public.grades g where g.id = m.scope_id)
          when 'class' then (select c.code || ' · ' || c.name from public.classes c where c.id = m.scope_id) end,
        'starts_at', m.starts_at, 'ends_at', m.ends_at) order by m.role), '[]')
      from public.memberships m where m.person_id = p.id and (m.ends_at is null or m.ends_at > now())),
    'children', (select coalesce(jsonb_agg(private.student_name(s) || ' ' || s.last_name), '[]')
      from public.guardianships g join public.students s on s.id = g.student_id where g.person_id = p.id and g.is_active)
  ) order by p.last_name, p.first_name), '[]') into v
  from (
    select * from public.people x
    where x.school_id = private.my_school()
      and (p_query is null or (x.first_name || ' ' || x.last_name || ' ' || x.email) ilike '%' || p_query || '%')
      and (not p_staff_only or private.is_staff_person(x.id))
    order by x.last_name, x.first_name
    limit 500
  ) p;
  return v;
end $$;

-- ---------------------------------------------------------------- L2: feed cursor
create or replace function private.dispatch_post(p_post uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v public.posts; r record; n int := 0; v_delay int;
begin
  select * into v from public.posts where id = p_post for update;
  if v.status not in ('scheduled') then return 0; end if;
  update public.posts set status = 'sending' where id = p_post;

  insert into public.post_recipients (post_id, person_id, context, student_ids)
  select p_post, a.person_id, a.context, a.student_ids from private.resolve_audience(v.school_id, v.audience) a
  where a.person_id <> v.author_id
  on conflict do nothing;

  for r in select * from public.post_recipients where post_id = p_post loop
    v_delay := case when v.priority = 'emergency' then 0 else private.in_quiet_hours(r.person_id, r.context) end;
    perform pgmq.send('notify', jsonb_build_object('kind','post','post_id',p_post,'person_id',r.person_id,'context',r.context,'channel','push'), v_delay);
    if v.priority = 'emergency' then
      perform pgmq.send('notify', jsonb_build_object('kind','post','post_id',p_post,'person_id',r.person_id,'context',r.context,'channel','email'), 0);
    end if;
    n := n + 1;
  end loop;

  -- clock_timestamp(): posts dispatched in the same transaction get distinct times
  update public.posts set status = 'sent', sent_at = clock_timestamp(),
    pinned_until = case when v.priority in ('important','emergency') then now() + interval '48 hours' end
  where id = p_post;
  return n;
end $$;

drop function if exists public.feed(public.app_context, uuid, text, int, timestamptz);
create or replace function public.feed(
  p_context public.app_context, p_student uuid default null, p_query text default null,
  p_limit int default 50, p_before timestamptz default null, p_before_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := private.me(); v jsonb;
begin
  if v_me is null then return '[]'; end if;
  with visible as (
    select p.* from public.posts p
    where p.status = 'sent' and p.school_id = private.my_school()
      and (p_before is null or p.sent_at < p_before or (p_before_id is not null and p.sent_at = p_before and p.id < p_before_id))
      and (p_query is null or p.title ilike '%' || p_query || '%' or p.body ilike '%' || p_query || '%')
      and (
        (p_context = 'parent' and exists (
          select 1 from public.post_recipients r where r.post_id = p.id and r.person_id = v_me and r.context = 'parent'
            and (p_student is null or p_student = any(r.student_ids))))
        or (p_context = 'staff' and private.is_staff_person(v_me) and (
          p.author_id = v_me
          or exists (select 1 from public.post_recipients r where r.post_id = p.id and r.person_id = v_me and r.context = 'staff')
          or p.audience @> '[{"type":"school"}]'
          or exists (select 1 from jsonb_array_elements(p.audience) i where i->>'type' = 'class' and (i->>'id')::uuid in (select private.my_class_ids()))
          or private.is_office())
          and (p_student is null or exists (select 1 from jsonb_array_elements(p.audience) i where i->>'type' = 'class' and (i->>'id')::uuid = p_student)))
      )
    order by p.sent_at desc, p.id desc limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'title', p.title, 'body', p.body, 'priority', p.priority,
    'author', p.author_label, 'author_id', p.author_id, 'mine', p.author_id = v_me,
    'audience', p.audience, 'audience_label', p.audience_label,
    'sent_at', p.sent_at, 'edited_at', p.edited_at,
    'pinned', p.pinned_until is not null and p.pinned_until > now(),
    'require_ack', p.require_ack,
    'read', exists (select 1 from public.post_reads x where x.post_id = p.id and x.person_id = v_me),
    'acked', exists (select 1 from public.post_acks x where x.post_id = p.id and x.person_id = v_me),
    'student_ids', (select r.student_ids from public.post_recipients r where r.post_id = p.id and r.person_id = v_me and r.context = 'parent'),
    'attachments', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'file_name', a.file_name,
                      'storage_path', a.storage_path, 'size_bytes', a.size_bytes) order by a.sort_order), '[]')
                    from public.post_attachments a where a.post_id = p.id),
    'reach', case when p.author_id = v_me then public.post_reach_summary(p.id) end
  ) order by p.sent_at desc, p.id desc), '[]') into v from visible p;
  return v;
end $$;
revoke execute on function public.feed(public.app_context, uuid, text, int, timestamptz, uuid) from public, anon;
grant execute on function public.feed(public.app_context, uuid, text, int, timestamptz, uuid) to authenticated;
