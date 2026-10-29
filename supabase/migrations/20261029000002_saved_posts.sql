-- ZCS Connect · saved posts (Oct 23 feedback: parents want to mark the posts
-- that matter to them). Anyone can save a post they can read; saves are private.

create table if not exists public.post_saves (
  post_id uuid not null references public.posts(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (person_id, post_id)
);
create index if not exists post_saves_post on public.post_saves (post_id);
alter table public.post_saves enable row level security;
drop policy if exists post_saves_read on public.post_saves;
create policy post_saves_read on public.post_saves for select to authenticated using (person_id = (select private.me()));

-- Save or unsave a post the caller can read. Returns the new state.
create or replace function public.set_post_saved(p_post uuid, p_saved boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.me();
begin
  if v_me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not (private.can_read_post(p_post) or exists (select 1 from public.posts p where p.id = p_post and p.author_id = v_me)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_saved then
    insert into public.post_saves (post_id, person_id) values (p_post, v_me) on conflict do nothing;
  else
    delete from public.post_saves where post_id = p_post and person_id = v_me;
  end if;
  return p_saved;
end $$;
revoke execute on function public.set_post_saved(uuid, boolean) from public, anon;
grant execute on function public.set_post_saved(uuid, boolean) to authenticated;

-- The feed gains `saved` on every post and a p_saved filter. The old 6-argument
-- version is dropped so PostgREST has one function to call; older app builds
-- still work because the new argument has a default.
drop function if exists public.feed(public.app_context, uuid, text, int, timestamptz, uuid);
create or replace function public.feed(
  p_context public.app_context, p_student uuid default null, p_query text default null,
  p_limit int default 50, p_before timestamptz default null, p_before_id uuid default null,
  p_saved boolean default false
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
      and (not coalesce(p_saved, false) or exists (select 1 from public.post_saves s where s.post_id = p.id and s.person_id = v_me))
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
    'student_ids', (select r.student_ids from public.post_recipients r where r.post_id = p.id and r.person_id = v_me and r.context = 'parent'),
    'attachments', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'file_name', a.file_name,
                      'storage_path', a.storage_path, 'size_bytes', a.size_bytes) order by a.sort_order), '[]')
                    from public.post_attachments a where a.post_id = p.id),
    'reach', case when p.author_id = v_me then public.post_reach_summary(p.id) end
  ) order by p.sent_at desc, p.id desc), '[]') into v from visible p;
  return v;
end $$;
revoke execute on function public.feed(public.app_context, uuid, text, int, timestamptz, uuid, boolean) from public, anon;
grant execute on function public.feed(public.app_context, uuid, text, int, timestamptz, uuid, boolean) to authenticated;
