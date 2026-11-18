-- ZCS Connect · soft-launch feedback (Nov 18 demo prep):
-- 1. Delete a sent post. The author or office staff can remove a post for
--    everyone (a mistake, a test, wrong class). It disappears from every feed,
--    queued notifications and email fallbacks are dropped, and the audit log
--    keeps what was deleted, by whom and when.
-- 2. A teacher who is also a parent in the class gets their own post in their
--    parent feed (no notification, already marked read), so the parent side
--    shows what families see.

create or replace function public.delete_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.posts; v_me uuid := private.me();
begin
  if v_me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into v from public.posts where id = p_post and school_id = private.my_school();
  if v.id is null or not (v.author_id = v_me or private.is_office()) then
    raise exception 'Only the person who sent this post or the school office can delete it.' using errcode = '42501';
  end if;
  perform private.audit('post.delete', 'post', p_post::text, jsonb_build_object(
    'title', v.title, 'audience', v.audience_label, 'author', v.author_label, 'status', v.status,
    'sent_at', v.sent_at, 'recipients', (select count(*) from public.post_recipients r where r.post_id = p_post)));
  -- recipients, reads, confirmations, saves, deliveries and attachments rows go with it (on delete cascade);
  -- notifications still queued find no post and are skipped by the delivery worker
  delete from public.posts where id = p_post;
end $$;
revoke execute on function public.delete_post(uuid) from public, anon;
grant execute on function public.delete_post(uuid) to authenticated;

create or replace function private.dispatch_post(p_post uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v public.posts; r record; n int := 0; v_delay int;
begin
  select * into v from public.posts where id = p_post for update;
  if v.status not in ('scheduled') then return 0; end if;
  update public.posts set status = 'sending' where id = p_post;

  -- the author is never a staff recipient of their own post, but keeps their parent copy
  insert into public.post_recipients (post_id, person_id, context, student_ids)
  select p_post, a.person_id, a.context, a.student_ids from private.resolve_audience(v.school_id, v.audience) a
  where not (a.person_id = v.author_id and a.context = 'staff')
  on conflict do nothing;
  insert into public.post_reads (post_id, person_id) values (p_post, v.author_id) on conflict do nothing;

  for r in select * from public.post_recipients where post_id = p_post and person_id <> v.author_id loop
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

-- Posts already sent: give authors who are parents in the audience their parent copy.
insert into public.post_recipients (post_id, person_id, context, student_ids, resolved_at)
select p.id, a.person_id, a.context, a.student_ids, coalesce(p.sent_at, now())
from public.posts p
cross join lateral private.resolve_audience(p.school_id, p.audience) a
where p.status = 'sent' and a.person_id = p.author_id and a.context = 'parent'
on conflict do nothing;
insert into public.post_reads (post_id, person_id)
select p.id, p.author_id from public.posts p
where p.status = 'sent' and exists (select 1 from public.post_recipients r where r.post_id = p.id and r.person_id = p.author_id)
on conflict do nothing;
