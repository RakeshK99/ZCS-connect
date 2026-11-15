-- ZCS Connect · clear read posts from Home (soft-launch feedback: "let me clear
-- the posts I've already read"). Clearing is private and only hides a post from
-- the Home list; it still turns up in search, in Saved and under "Show cleared".
-- Pinned posts and posts still waiting on a confirmation are never cleared.

create table if not exists public.post_dismissals (
  post_id uuid not null references public.posts(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (person_id, post_id)
);
create index if not exists post_dismissals_post on public.post_dismissals (post_id);
alter table public.post_dismissals enable row level security;
drop policy if exists post_dismissals_read on public.post_dismissals;
create policy post_dismissals_read on public.post_dismissals for select to authenticated using (person_id = (select private.me()));

-- Clear every post the caller has read, except pinned ones and ones that still
-- ask for a confirmation the caller hasn't given. Returns the cleared post ids
-- (so the app can offer Undo).
create or replace function public.clear_read_posts() returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.me(); v_ids uuid[];
begin
  if v_me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  with added as (
  insert into public.post_dismissals (post_id, person_id)
  select r.post_id, v_me from public.post_reads r join public.posts p on p.id = r.post_id
  where r.person_id = v_me and p.status = 'sent'
    and not (p.pinned_until is not null and p.pinned_until > now())
    and not (p.require_ack and not exists (select 1 from public.post_acks a where a.post_id = p.id and a.person_id = v_me))
  on conflict do nothing
  returning post_id)
  select coalesce(array_agg(post_id), '{}') into v_ids from added;
  return v_ids;
end $$;
revoke execute on function public.clear_read_posts() from public, anon;
grant execute on function public.clear_read_posts() to authenticated;

-- Bring cleared posts back: the listed posts, or all of them (p_posts null).
-- Returns how many came back.
create or replace function public.restore_cleared_posts(p_posts uuid[] default null) returns int
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.me(); v_n int;
begin
  if v_me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  delete from public.post_dismissals where person_id = v_me and (p_posts is null or post_id = any(p_posts));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.restore_cleared_posts(uuid[]) from public, anon;
grant execute on function public.restore_cleared_posts(uuid[]) to authenticated;

-- The feed hides cleared posts unless searching, viewing Saved or asking for
-- them (p_cleared). Every post gains `cleared`. Older app builds keep working
-- because the new argument has a default.
drop function if exists public.feed(public.app_context, uuid, text, int, timestamptz, uuid, boolean);
create or replace function public.feed(
  p_context public.app_context, p_student uuid default null, p_query text default null,
  p_limit int default 50, p_before timestamptz default null, p_before_id uuid default null,
  p_saved boolean default false, p_cleared boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := private.me(); v jsonb;
  v_hide boolean := p_query is null and not coalesce(p_saved, false) and not coalesce(p_cleared, false);
begin
  if v_me is null then return '[]'; end if;
  with visible as (
    select p.* from public.posts p
    where p.status = 'sent' and p.school_id = private.my_school()
      and (p_before is null or p.sent_at < p_before or (p_before_id is not null and p.sent_at = p_before and p.id < p_before_id))
      and (p_query is null or p.title ilike '%' || p_query || '%' or p.body ilike '%' || p_query || '%')
      and (not coalesce(p_saved, false) or exists (select 1 from public.post_saves s where s.post_id = p.id and s.person_id = v_me))
      and (not v_hide or (p.pinned_until is not null and p.pinned_until > now())
           or not exists (select 1 from public.post_dismissals d where d.post_id = p.id and d.person_id = v_me))
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
    'saved', exists (select 1 from public.post_saves x where x.post_id = p.id and x.person_id = v_me),
    'cleared', exists (select 1 from public.post_dismissals x where x.post_id = p.id and x.person_id = v_me),
    'student_ids', (select r.student_ids from public.post_recipients r where r.post_id = p.id and r.person_id = v_me and r.context = 'parent'),
    'attachments', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'file_name', a.file_name,
                      'storage_path', a.storage_path, 'size_bytes', a.size_bytes) order by a.sort_order), '[]')
                    from public.post_attachments a where a.post_id = p.id),
    'reach', case when p.author_id = v_me then public.post_reach_summary(p.id) end
  ) order by p.sent_at desc, p.id desc), '[]') into v from visible p;
  return v;
end $$;
revoke execute on function public.feed(public.app_context, uuid, text, int, timestamptz, uuid, boolean, boolean) from public, anon;
grant execute on function public.feed(public.app_context, uuid, text, int, timestamptz, uuid, boolean, boolean) to authenticated;

-- Deleting an account also removes its cleared-post list.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.me();
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if private.is_demo_email((select u.email from auth.users u where u.id = auth.uid())) then
    raise exception 'Demo accounts are shared by everyone testing, so they can''t be deleted.' using errcode = '42501';
  end if;
  if v_me is not null then
    perform private.audit('account.delete', 'person', v_me::text);
    delete from public.devices where person_id = v_me;
    delete from public.notification_prefs where person_id = v_me;
    delete from public.post_reads where person_id = v_me;
    delete from public.post_saves where person_id = v_me;
    delete from public.post_dismissals where person_id = v_me;
    update public.thread_participants set last_read_at = null where person_id = v_me;
    update public.people set user_id = null, account_deleted_at = now() where id = v_me;
  end if;
  delete from public.family_requests where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;
