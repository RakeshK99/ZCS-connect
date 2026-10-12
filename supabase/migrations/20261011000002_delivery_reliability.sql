-- ZCS Connect · code review fixes, part 2: delivery reliability.
--
-- H3  Email fallback respects quiet hours and notification preferences, and its
--     15-minute clock starts when the push actually went out (not when the post
--     was sent), so a 10 pm post no longer emails everyone at 10:15 pm.
-- H4  Retryable failures (rate limits, provider outages, timeouts) are retried
--     with backoff instead of being dropped; jobs that keep failing are archived
--     after 5 attempts and recorded as failed.
-- H5  A job whose person, post or message no longer exists is skipped instead of
--     failing the whole batch (which made 100 jobs re-send every 2 minutes).
-- H1  Delayed jobs re-check rights at send time: no push or email to a guardian
--     who became no_contact, or to a thread participant who lost access.
-- M1  No duplicate emails: emergency posts already queue an email, so a missing
--     device doesn't add a second one; one email per person per post per batch.
-- L3  One delivery row per device ticket (with its token), so Expo receipts that
--     say DeviceNotRegistered prune that device; index for the receipt poll.

alter table public.deliveries add column if not exists device_token text;
create index if not exists deliveries_pending_receipts on public.deliveries (created_at)
  where channel = 'push' and status = 'sent' and provider_id is not null;
create index if not exists deliveries_person on public.deliveries (person_id, post_id, channel);

-- ---------------------------------------------------------------- claim
create or replace function public.worker_claim(p_n int default 100) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m record; v_out jsonb := '[]'; j jsonb; p public.people; v_post public.posts; v_msg record;
  v_tokens text[]; v_prefs public.notification_prefs; v_preview text; v_category text; v_enabled boolean;
  v_action text; v_reason text; v_title text; v_body text; v_route text; v_ctx_label text; v_is_read boolean;
  v_reminder boolean; v_emailed text[] := '{}'; v_key text; v_students uuid[];
begin
  for m in select * from pgmq.read('notify', 120, p_n) loop
    j := m.message; v_action := null; v_reason := null; v_post := null; v_msg := null; p := null;
    v_reminder := coalesce((j->>'reminder')::boolean, false);
    select * into p from public.people where id = (j->>'person_id')::uuid and is_active;

    if p.id is null then
      v_action := 'skip'; v_reason := 'recipient no longer active';
    else
      select coalesce(array_agg(d.expo_token), '{}') into v_tokens from public.devices d where d.person_id = p.id;
      select * into v_prefs from public.notification_prefs n where n.person_id = p.id and n.context = (j->>'context')::public.app_context;
      select s.notification_preview into v_preview from public.schools s where s.id = p.school_id;
      v_ctx_label := case when j->>'context' = 'parent' then p.last_name || ' family' else coalesce(nullif(p.honorific,'') || ' ' || p.last_name, p.first_name) end;

      if j->>'kind' = 'post' then
        select * into v_post from public.posts where id = (j->>'post_id')::uuid;
        if v_post.id is null then
          v_action := 'skip'; v_reason := 'post no longer exists';
        else
          v_category := case v_post.priority when 'normal' then case when v_post.audience @> '[{"type":"school"}]' then 'important' else 'class_posts' end else 'important' end;
          v_enabled := v_post.priority = 'emergency' or coalesce(case v_category when 'important' then v_prefs.important else v_prefs.class_posts end, true);
          v_is_read := exists (select 1 from public.post_reads r where r.post_id = v_post.id and r.person_id = p.id);
          v_title := case when v_post.priority = 'emergency' then 'Emergency · ' else '' end || v_post.title;
          v_body := case when v_preview = 'private' then 'New post from ' || v_post.author_label else left(regexp_replace(v_post.body, '\s+', ' ', 'g'), 160) end;
          v_route := '/post/' || v_post.id;
          v_key := v_post.id::text || ':' || p.id::text;
          select r.student_ids into v_students from public.post_recipients r
            where r.post_id = v_post.id and r.person_id = p.id and r.context = (j->>'context')::public.app_context;

          if v_post.status = 'cancelled' then v_action := 'skip'; v_reason := 'post cancelled';
          elsif j->>'context' = 'parent' and not exists (
                  select 1 from public.guardianships g join public.students s on s.id = g.student_id and s.is_active
                  where g.person_id = p.id and g.student_id = any(coalesce(v_students, '{}')) and g.is_active and not g.no_contact) then
            v_action := 'skip'; v_reason := 'no longer a contact for this student';
          elsif j->>'channel' = 'push' then
            if not v_enabled then v_action := 'skip'; v_reason := 'turned off in preferences';
            elsif cardinality(v_tokens) > 0 then v_action := 'push';
            -- no device: email instead, unless an email is already queued or sent for this post
            elsif v_post.priority = 'emergency' then v_action := 'skip'; v_reason := 'no app installed (emergency email sent separately)';
            elsif v_key = any(v_emailed) or exists (select 1 from public.deliveries d where d.post_id = v_post.id and d.person_id = p.id
                                                     and d.channel = 'email' and d.status in ('queued','sent','delivered')) then
              v_action := 'skip'; v_reason := 'no app installed (email already sent)';
            else v_action := 'email'; v_reason := 'no app installed'; end if;
          else
            if v_is_read and not v_reminder then v_action := 'skip'; v_reason := 'already read';
            elsif not v_enabled and not v_reminder then v_action := 'skip'; v_reason := 'turned off in preferences';
            elsif v_key = any(v_emailed) then v_action := 'skip'; v_reason := 'email already sent';
            elsif not v_reminder and exists (select 1 from public.deliveries d where d.post_id = v_post.id and d.person_id = p.id
                                             and d.channel = 'email' and d.status in ('sent','delivered')) then
              v_action := 'skip'; v_reason := 'email already sent';
            else v_action := 'email'; end if;
          end if;
          if v_action = 'email' then v_emailed := array_append(v_emailed, v_key); end if;
        end if;
      elsif j->>'kind' = 'message' then
        select m2.id, m2.body, m2.thread_id, sp.first_name, sp.last_name, sp.honorific,
               (select s.first_name from public.threads t join public.students s on s.id = t.student_id where t.id = m2.thread_id) as child
          into v_msg from public.messages m2 join public.people sp on sp.id = m2.sender_id where m2.id = (j->>'message_id')::uuid;
        if v_msg.id is null then
          v_action := 'skip'; v_reason := 'message no longer exists';
        elsif not private.person_can_use_thread(p.id, v_msg.thread_id) then
          v_action := 'skip'; v_reason := 'no longer part of this conversation';
        else
          v_enabled := coalesce(v_prefs.messages, true);
          v_title := coalesce(nullif(v_msg.honorific, '') || ' ' || v_msg.last_name, trim(v_msg.first_name || ' ' || v_msg.last_name)) || ' · ' || v_msg.child;
          v_body := case when v_preview = 'private' then 'New message' else left(v_msg.body, 160) end;
          v_route := '/thread/' || v_msg.thread_id;
          if not v_enabled then v_action := 'skip'; v_reason := 'turned off in preferences';
          elsif cardinality(v_tokens) = 0 then v_action := 'email'; v_reason := 'no app installed';
          else v_action := 'push'; end if;
        end if;
      else
        v_action := 'skip'; v_reason := 'unknown job';
      end if;
    end if;

    v_out := v_out || jsonb_build_object('msg_id', m.msg_id, 'attempt', m.read_ct, 'job', j, 'action', v_action, 'reason', v_reason,
      'email', p.email, 'first_name', p.first_name, 'tokens', to_jsonb(coalesce(v_tokens, '{}')),
      'title', v_title, 'body', v_body, 'route', v_route, 'context', j->>'context', 'context_label', v_ctx_label,
      'priority', coalesce(v_post.priority::text, 'normal'), 'author', v_post.author_label, 'full_body', v_post.body);
    v_tokens := null; v_students := null;
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------------- complete
-- p_results: [{msg_id, post_id?, message_id?, person_id, channel, status, provider_id?, detail?,
--              device_token?, invalid_tokens?: [], retry?: bool}]
-- A job (msg_id) is retried when it has a retryable result and nothing was sent;
-- otherwise its rows are recorded and the queue message is deleted.
create or replace function public.worker_complete(p_results jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare r jsonb; n int := 0; v_retry bigint[]; v_dead bigint[]; v_msg bigint; v_attempts int;
begin
  -- jobs to retry: some result asked for a retry and no result for that job was sent
  select coalesce(array_agg(distinct (x->>'msg_id')::bigint), '{}') into v_retry
  from jsonb_array_elements(p_results) x
  where (x->>'msg_id') is not null and coalesce((x->>'retry')::boolean, false)
    and not exists (select 1 from jsonb_array_elements(p_results) y
                    where y->>'msg_id' = x->>'msg_id' and y->>'status' in ('sent', 'delivered'));
  v_dead := '{}';
  foreach v_msg in array v_retry loop
    select q.read_ct into v_attempts from pgmq.q_notify q where q.msg_id = v_msg;
    if coalesce(v_attempts, 0) >= 5 then
      v_dead := array_append(v_dead, v_msg);
    else
      -- back off 1, 2, 4, 8 minutes
      perform pgmq.set_vt('notify', v_msg, (60 * power(2, greatest(coalesce(v_attempts, 1) - 1, 0)))::int);
    end if;
  end loop;

  for r in select * from jsonb_array_elements(p_results) loop
    continue when (r->>'msg_id') is not null and (r->>'msg_id')::bigint = any(v_retry) and not ((r->>'msg_id')::bigint = any(v_dead));
    if nullif(r->>'status', '') is not null and r->>'status' <> 'none' then
      -- a fallback email fills in its placeholder row instead of adding a second one
      if r->>'channel' = 'email' and nullif(r->>'post_id', '') is not null then
        update public.deliveries d set status = (r->>'status')::public.delivery_status, provider_id = r->>'provider_id',
               detail = left(r->>'detail', 500)
        where d.id = (select x.id from public.deliveries x where x.post_id = (r->>'post_id')::uuid and x.person_id = (r->>'person_id')::uuid
                      and x.channel = 'email' and x.status = 'queued' order by x.id limit 1);
        if found then n := n + 1; continue; end if;
      end if;
      -- only record rows whose person/post/message still exist (H5)
      insert into public.deliveries (post_id, message_id, person_id, channel, status, provider_id, detail, device_token)
      select nullif(r->>'post_id','')::uuid, nullif(r->>'message_id','')::uuid, (r->>'person_id')::uuid,
             (r->>'channel')::public.delivery_channel,
             case when (r->>'msg_id')::bigint = any(v_dead) then 'failed' else (r->>'status') end::public.delivery_status,
             r->>'provider_id',
             left(case when (r->>'msg_id')::bigint = any(v_dead) then 'gave up after 5 attempts: ' || coalesce(r->>'detail', '') else r->>'detail' end, 500),
             r->>'device_token'
      where exists (select 1 from public.people p where p.id = (r->>'person_id')::uuid)
        and (nullif(r->>'post_id','') is null or exists (select 1 from public.posts x where x.id = (r->>'post_id')::uuid))
        and (nullif(r->>'message_id','') is null or exists (select 1 from public.messages x where x.id = (r->>'message_id')::uuid));
    end if;
    if jsonb_typeof(r->'invalid_tokens') = 'array' then
      delete from public.devices where expo_token in (select jsonb_array_elements_text(r->'invalid_tokens'));
    end if;
    n := n + 1;
  end loop;

  -- finished jobs leave the queue; jobs that kept failing are archived for inspection
  perform pgmq.delete('notify', x.id) from (
    select distinct (y->>'msg_id')::bigint as id from jsonb_array_elements(p_results) y where (y->>'msg_id') is not null) x
  where not (x.id = any(v_retry));
  perform pgmq.archive('notify', d) from unnest(v_dead) d;
  return n;
end $$;

-- ---------------------------------------------------------------- receipts
create or replace function public.worker_apply_receipts(p_receipts jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.deliveries d set status = (r->>'status')::public.delivery_status, detail = coalesce(r->>'detail', d.detail)
  from jsonb_array_elements(p_receipts) r where d.id = (r->>'id')::bigint;
  -- the device was uninstalled or the token expired: stop sending to it
  delete from public.devices dv
  where dv.expo_token in (select d.device_token from public.deliveries d join jsonb_array_elements(p_receipts) r on d.id = (r->>'id')::bigint
                          where r->>'detail' = 'DeviceNotRegistered' and d.device_token is not null);
end $$;

-- ---------------------------------------------------------------- email fallback (F-04)
-- 15 minutes after a recipient's push went out, email them if they still haven't
-- opened the post. Quiet hours delay the email; preferences are checked at claim.
create or replace function private.queue_email_fallbacks() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in
    select pr.post_id, pr.person_id, pr.context, p.priority from public.post_recipients pr
    join public.posts p on p.id = pr.post_id
    where p.status = 'sent' and p.sent_at > now() - interval '24 hours'
      and exists (select 1 from public.deliveries d where d.post_id = pr.post_id and d.person_id = pr.person_id
                  and d.channel = 'push' and d.status in ('sent', 'delivered', 'failed') and d.created_at < now() - interval '15 minutes')
      and not exists (select 1 from public.post_reads x where x.post_id = pr.post_id and x.person_id = pr.person_id)
      and not exists (select 1 from public.deliveries d where d.post_id = pr.post_id and d.person_id = pr.person_id and d.channel = 'email')
    limit 2000
  loop
    -- placeholder row stops this job from re-queuing the same recipient next run
    insert into public.deliveries (post_id, person_id, channel, status, detail) values (r.post_id, r.person_id, 'email', 'queued', 'fallback');
    perform pgmq.send('notify', jsonb_build_object('kind','post','post_id',r.post_id,'person_id',r.person_id,'context',r.context,'channel','email','fallback',true),
                      case when r.priority = 'emergency' then 0 else private.in_quiet_hours(r.person_id, r.context) end);
    n := n + 1;
  end loop;
  if n > 0 then perform private.kick_worker(); end if;
  return n;
end $$;
