-- ZCS Connect · delivery pipeline (queue → worker → push/email → receipts),
-- attachment storage, and scheduled jobs.
--
-- Flow: create_post/send_message enqueue one job per recipient on pgmq 'notify'
-- and kick the `deliver` Edge Function. The function calls worker_claim(), sends
-- via Expo Push / email, then worker_complete() records deliveries. pg_cron runs
-- the worker every minute as a safety net, dispatches scheduled posts, and
-- queues the 15-minute email fallback for unread posts.

-- ---------------------------------------------------------------- worker kick
-- Secrets live in Vault: deliver_url, deliver_secret (set once per environment).
create or replace function private.kick_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'deliver_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'deliver_secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(url := v_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-deliver-secret', v_secret),
    timeout_milliseconds := 2000);
exception when others then null; -- never block a send on the kick; cron will pick it up
end $$;

-- ---------------------------------------------------------------- worker RPCs (service_role only)
create or replace function public.worker_claim(p_n int default 100) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m record; v_out jsonb := '[]'; j jsonb; p public.people; v_post public.posts; v_msg record;
  v_tokens text[]; v_prefs public.notification_prefs; v_preview text; v_category text; v_enabled boolean;
  v_action text; v_reason text; v_title text; v_body text; v_route text; v_ctx_label text; v_is_read boolean;
begin
  for m in select * from pgmq.read('notify', 120, p_n) loop
    j := m.message; v_action := null; v_reason := null;
    select * into p from public.people where id = (j->>'person_id')::uuid;
    select coalesce(array_agg(d.expo_token), '{}') into v_tokens from public.devices d where d.person_id = p.id;
    select * into v_prefs from public.notification_prefs n where n.person_id = p.id and n.context = (j->>'context')::public.app_context;
    select s.notification_preview into v_preview from public.schools s where s.id = p.school_id;
    v_ctx_label := case when j->>'context' = 'parent' then p.last_name || ' family' else coalesce(nullif(p.honorific,'') || ' ' || p.last_name, p.first_name) end;

    if j->>'kind' = 'post' then
      select * into v_post from public.posts where id = (j->>'post_id')::uuid;
      v_category := case v_post.priority when 'normal' then case when v_post.audience @> '[{"type":"school"}]' then 'important' else 'class_posts' end else 'important' end;
      v_enabled := v_post.priority = 'emergency' or coalesce(case v_category when 'important' then v_prefs.important else v_prefs.class_posts end, true);
      v_is_read := exists (select 1 from public.post_reads r where r.post_id = v_post.id and r.person_id = p.id);
      v_title := case when v_post.priority = 'emergency' then 'Emergency · ' else '' end || v_post.title;
      v_body := case when v_preview = 'private' then 'New post from ' || v_post.author_label else left(regexp_replace(v_post.body, '\s+', ' ', 'g'), 160) end;
      v_route := '/post/' || v_post.id;
      if v_post.status = 'cancelled' then v_action := 'skip'; v_reason := 'post cancelled';
      elsif j->>'channel' = 'push' then
        if not v_enabled then v_action := 'skip'; v_reason := 'turned off in preferences';
        elsif cardinality(v_tokens) = 0 then v_action := 'email'; v_reason := 'no app installed';
        else v_action := 'push'; end if;
      else
        if v_is_read and not coalesce((j->>'reminder')::boolean, false) then v_action := 'skip'; v_reason := 'already read';
        elsif exists (select 1 from public.deliveries d where d.post_id = v_post.id and d.person_id = p.id and d.channel = 'email' and d.status in ('sent','delivered'))
              and not coalesce((j->>'reminder')::boolean, false) then v_action := 'skip'; v_reason := 'email already sent';
        else v_action := 'email'; end if;
      end if;
    elsif j->>'kind' = 'message' then
      select m2.id, m2.body, m2.thread_id, sp.first_name, sp.last_name, sp.honorific,
             (select s.first_name from public.threads t join public.students s on s.id = t.student_id where t.id = m2.thread_id) as child
        into v_msg from public.messages m2 join public.people sp on sp.id = m2.sender_id where m2.id = (j->>'message_id')::uuid;
      v_enabled := coalesce(v_prefs.messages, true);
      v_title := coalesce(nullif(v_msg.honorific, '') || ' ' || v_msg.last_name, trim(v_msg.first_name || ' ' || v_msg.last_name)) || ' · ' || v_msg.child;
      v_body := case when v_preview = 'private' then 'New message' else left(v_msg.body, 160) end;
      v_route := '/thread/' || v_msg.thread_id;
      if not v_enabled then v_action := 'skip'; v_reason := 'turned off in preferences';
      elsif cardinality(v_tokens) = 0 then v_action := 'email'; v_reason := 'no app installed';
      else v_action := 'push'; end if;
    else
      v_action := 'skip'; v_reason := 'unknown job';
    end if;

    v_out := v_out || jsonb_build_object('msg_id', m.msg_id, 'job', j, 'action', v_action, 'reason', v_reason,
      'email', p.email, 'first_name', p.first_name, 'tokens', to_jsonb(v_tokens),
      'title', v_title, 'body', v_body, 'route', v_route, 'context', j->>'context', 'context_label', v_ctx_label,
      'priority', coalesce(v_post.priority::text, 'normal'), 'author', v_post.author_label, 'full_body', v_post.body);
    v_post := null;
  end loop;
  return v_out;
end $$;

-- results: [{msg_id, post_id?, message_id?, person_id, channel, status, provider_id?, detail?, invalid_tokens?: []}]
create or replace function public.worker_complete(p_results jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare r jsonb; n int := 0;
begin
  for r in select * from jsonb_array_elements(p_results) loop
    if nullif(r->>'status', '') is not null and r->>'status' <> 'none' then
      insert into public.deliveries (post_id, message_id, person_id, channel, status, provider_id, detail)
      values (nullif(r->>'post_id','')::uuid, nullif(r->>'message_id','')::uuid, (r->>'person_id')::uuid,
              (r->>'channel')::public.delivery_channel, (r->>'status')::public.delivery_status, r->>'provider_id', left(r->>'detail', 500));
    end if;
    if jsonb_typeof(r->'invalid_tokens') = 'array' then
      delete from public.devices where expo_token in (select jsonb_array_elements_text(r->'invalid_tokens'));
    end if;
    if (r->>'msg_id') is not null then perform pgmq.delete('notify', (r->>'msg_id')::bigint); end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Expo push receipts: mark tickets delivered/failed later.
create or replace function public.worker_pending_receipts(p_limit int default 300) returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'provider_id', provider_id)), '[]') from (
    select id, provider_id from public.deliveries
    where channel = 'push' and status = 'sent' and provider_id is not null
      and created_at < now() - interval '1 minute' and created_at > now() - interval '24 hours'
    order by id limit p_limit) d
$$;

create or replace function public.worker_apply_receipts(p_receipts jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.deliveries d set status = (r->>'status')::public.delivery_status, detail = coalesce(r->>'detail', d.detail)
  from jsonb_array_elements(p_receipts) r where d.id = (r->>'id')::bigint;
$$;

revoke execute on function public.worker_claim(int), public.worker_complete(jsonb),
  public.worker_pending_receipts(int), public.worker_apply_receipts(jsonb) from public, anon, authenticated;
grant execute on function public.worker_claim(int), public.worker_complete(jsonb),
  public.worker_pending_receipts(int), public.worker_apply_receipts(jsonb) to service_role;
grant usage on schema pgmq to service_role;

-- ---------------------------------------------------------------- email fallback (F-04)
-- 15 minutes after a post is sent, email every recipient who hasn't opened it.
create or replace function private.queue_email_fallbacks() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in
    select pr.post_id, pr.person_id, pr.context from public.post_recipients pr
    join public.posts p on p.id = pr.post_id
    where p.status = 'sent' and p.sent_at between now() - interval '6 hours' and now() - interval '15 minutes'
      and not exists (select 1 from public.post_reads x where x.post_id = pr.post_id and x.person_id = pr.person_id)
      and not exists (select 1 from public.deliveries d where d.post_id = pr.post_id and d.person_id = pr.person_id and d.channel = 'email')
    limit 2000
  loop
    -- placeholder row stops this job from re-queuing the same recipient next run
    insert into public.deliveries (post_id, person_id, channel, status, detail) values (r.post_id, r.person_id, 'email', 'queued', 'fallback');
    perform pgmq.send('notify', jsonb_build_object('kind','post','post_id',r.post_id,'person_id',r.person_id,'context',r.context,'channel','email','fallback',true));
    n := n + 1;
  end loop;
  if n > 0 then perform private.kick_worker(); end if;
  return n;
end $$;

-- Kick the worker right after sends so delivery doesn't wait for the cron tick.
create or replace function private.after_post_sent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'sent' and old.status is distinct from 'sent' then perform private.kick_worker(); end if;
  return new;
end $$;
create trigger posts_kick_worker after update of status on public.posts
  for each row execute function private.after_post_sent();

create or replace function private.after_message() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform private.kick_worker(); return new; end $$;
create trigger messages_kick_worker after insert on public.messages
  for each row execute function private.after_message();

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 26214400, array['image/jpeg','image/png','image/heic','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Staff upload into <school>/<person>/...; readers get access only through a post they can read.
create policy attachments_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'attachments'
  and (storage.foldername(name))[1] = private.my_school()::text
  and (storage.foldername(name))[2] = private.me()::text
  and private.is_staff_person(private.me())
);
create policy attachments_read on storage.objects for select to authenticated using (
  bucket_id = 'attachments' and (
    (storage.foldername(name))[2] = private.me()::text
    or exists (select 1 from public.post_attachments a where a.storage_path = name and private.can_read_post(a.post_id)))
);
create policy attachments_delete_own on storage.objects for delete to authenticated using (
  bucket_id = 'attachments' and (storage.foldername(name))[2] = private.me()::text
);

-- ---------------------------------------------------------------- schedules
select cron.schedule('zcs-dispatch-due-posts', '* * * * *', $$ select private.dispatch_due_posts() $$);
select cron.schedule('zcs-email-fallbacks', '*/5 * * * *', $$ select private.queue_email_fallbacks() $$);
select cron.schedule('zcs-deliver', '* * * * *', $$ select private.kick_worker() $$);
select cron.schedule('zcs-prune-queue-archive', '17 3 * * *', $$ delete from pgmq.a_notify where archived_at < now() - interval '30 days' $$);
