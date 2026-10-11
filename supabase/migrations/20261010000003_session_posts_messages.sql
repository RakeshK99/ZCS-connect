-- ZCS Connect · session, audiences, posts, messaging (RPCs)
-- All functions are SECURITY DEFINER with an empty search_path and check
-- permissions explicitly. Every state change worth auditing writes audit_log.

select pgmq.create('notify');

-- ---------------------------------------------------------------- utilities
create or replace function private.audit(p_action text, p_target_type text, p_target_id text, p_detail jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (school_id, actor_id, action, target_type, target_id, detail)
  values (private.my_school(), private.me(), p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'));
$$;

create or replace function private.staff_name(p public.people) returns text
language sql immutable as $$
  select case when coalesce(p.honorific, '') <> '' then p.honorific || ' ' || p.last_name
              else trim(p.first_name || ' ' || p.last_name) end
$$;

create or replace function private.student_name(s public.students) returns text
language sql immutable as $$ select coalesce(nullif(s.preferred_name, ''), s.first_name) $$;

-- The class teacher label for a student ("Mrs. Smith"), first homeroom class found.
create or replace function private.homeroom_teacher(p_student uuid) returns text
language sql stable security definer set search_path = '' as $$
  select private.staff_name(p) from public.enrollments e
  join public.classes c on c.id = e.class_id and c.kind = 'class' and c.is_active
  join public.memberships m on m.scope_type = 'class' and m.scope_id = c.id and m.role = 'teacher'
       and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
  join public.people p on p.id = m.person_id
  where e.student_id = p_student order by c.code limit 1
$$;

-- ---------------------------------------------------------------- session
-- Called right after sign-in. Links the auth user to the roster/staff person
-- with the same verified email. Nobody chooses a role; contexts are derived.
create or replace function public.link_account() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_person uuid;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select u.email into v_email from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then return public.session_info(); end if;
  if private.me() is null then
    update public.people set user_id = auth.uid()
    where id = (select id from public.people where email = v_email::extensions.citext and user_id is null and is_active
                order by created_at limit 1)
    returning id into v_person;
    if v_person is not null then
      insert into public.audit_log (school_id, actor_id, action, target_type, target_id)
      select school_id, id, 'account.link', 'person', id::text from public.people where id = v_person;
    end if;
  end if;
  return public.session_info();
end $$;

create or replace function public.session_info() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me public.people; v_school public.schools; v_contexts jsonb := '[]'; v_roles text[];
  v_children jsonb; v_classes jsonb; v_role_title text; v_email text;
begin
  select * into v_me from public.people where id = private.me();
  if v_me.id is null then
    select u.email into v_email from auth.users u where u.id = auth.uid();
    return jsonb_build_object('linked', false, 'email', v_email,
      'pending_request', exists (select 1 from public.family_requests f where f.user_id = auth.uid() and f.status = 'pending'));
  end if;
  select * into v_school from public.schools where id = v_me.school_id;

  select array_agg(distinct m.role::text) into v_roles from public.memberships m
  where m.person_id = v_me.id and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now());

  if v_roles is not null then
    v_role_title := case
      when 'teacher' = any(v_roles) then 'Teacher'
      when 'principal' = any(v_roles) then 'Principal'
      when 'office' = any(v_roles) then 'Office'
      when 'group_leader' = any(v_roles) then 'Group leader'
      when 'aide' = any(v_roles) then 'Staff'
      when 'admin' = any(v_roles) then 'Admin'
      else 'Staff' end;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'code', c.code, 'name', c.name, 'kind', c.kind,
             'families', (select count(*) from public.enrollments e join public.students s on s.id = e.student_id and s.is_active where e.class_id = c.id),
             'last_post_at', (select max(p.sent_at) from public.posts p where p.status = 'sent' and p.audience @> jsonb_build_array(jsonb_build_object('type','class','id',c.id::text)))
           ) order by c.kind, c.code), '[]')
      into v_classes
    from public.classes c where c.id in (select private.my_class_ids()) and c.is_active;
    v_contexts := v_contexts || jsonb_build_object(
      'key', 'staff', 'label', private.staff_name(v_me) || ' · ' || v_role_title,
      'roles', to_jsonb(v_roles), 'classes', v_classes);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'first_name', s.first_name, 'name', private.student_name(s), 'last_name', s.last_name,
           'grade', g.label, 'grade_id', g.id, 'division_id', g.division_id,
           'teacher', private.homeroom_teacher(s.id)) order by g.sort_order desc, s.first_name), '[]')
    into v_children
  from public.students s left join public.grades g on g.id = s.grade_id
  where s.id in (select private.my_student_ids());
  if jsonb_array_length(v_children) > 0 then
    v_contexts := v_contexts || jsonb_build_object(
      'key', 'parent', 'label', v_me.last_name || ' family · Parent', 'children', v_children);
  end if;

  return jsonb_build_object(
    'linked', true,
    'person', jsonb_build_object('id', v_me.id, 'first_name', v_me.first_name, 'last_name', v_me.last_name,
      'display_name', case when v_roles is not null then private.staff_name(v_me) else v_me.first_name end,
      'full_name', trim(v_me.first_name || ' ' || v_me.last_name), 'email', v_me.email,
      'office_hours', v_me.office_hours),
    'school', jsonb_build_object('id', v_school.id, 'name', v_school.name, 'short_name', v_school.short_name,
      'staff_email_domain', v_school.staff_email_domain),
    'is_admin', private.is_admin(), 'is_office', private.is_office(),
    'can_send_emergency', private.has_role(array['emergency_sender']::public.role_kind[]),
    'contexts', v_contexts);
end $$;

-- Unknown family: one-tap request to the office.
create or replace function public.request_family_link(p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_school uuid;
begin
  select u.email into v_email from auth.users u where u.id = auth.uid();
  if v_email is null then raise exception 'not signed in'; end if;
  select id into v_school from public.schools order by created_at limit 1; -- single-school deployment
  insert into public.family_requests (school_id, user_id, email, note)
  values (v_school, auth.uid(), v_email, left(p_note, 500))
  on conflict (school_id, email) where status = 'pending' do nothing;
end $$;

-- ---------------------------------------------------------------- audiences
-- Audience spec items: {"type":"school"} families of every active student;
-- {"type":"staff"}; {"type":"division"|"grade"|"class"|"student","id":"..."}.
create or replace function private.resolve_audience(p_school uuid, p_audience jsonb)
returns table (person_id uuid, context public.app_context, student_ids uuid[])
language sql stable security definer set search_path = '' as $$
  with items as (select i->>'type' as t, nullif(i->>'id', '')::uuid as id from jsonb_array_elements(p_audience) i),
  target_students as (
    select s.id from public.students s, items
    where s.school_id = p_school and s.is_active and (
      items.t = 'school'
      or (items.t = 'division' and s.grade_id in (select g.id from public.grades g where g.division_id = items.id))
      or (items.t = 'grade' and s.grade_id = items.id)
      or (items.t = 'class' and s.id in (select e.student_id from public.enrollments e where e.class_id = items.id))
      or (items.t = 'student' and s.id = items.id))
  ),
  fam as (
    select g.person_id, 'parent'::public.app_context as context, array_agg(distinct g.student_id) as student_ids
    from public.guardianships g join public.people p on p.id = g.person_id and p.is_active
    where g.student_id in (select id from target_students) and g.is_active and not g.no_contact
    group by g.person_id
  ),
  staff as (
    select distinct m.person_id, 'staff'::public.app_context, '{}'::uuid[]
    from public.memberships m join public.people p on p.id = m.person_id and p.is_active
    where m.school_id = p_school and exists (select 1 from items where t = 'staff')
      and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
  )
  select * from fam union all select * from staff
$$;

create or replace function private.can_post_to(p_audience jsonb, p_priority public.post_priority) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare i jsonb; t text; v_id uuid; ok boolean;
begin
  if p_audience is null or jsonb_typeof(p_audience) <> 'array' or jsonb_array_length(p_audience) = 0 then return false; end if;
  if p_priority = 'emergency' and not private.has_role(array['emergency_sender']::public.role_kind[]) then return false; end if;
  for i in select * from jsonb_array_elements(p_audience) loop
    t := i->>'type'; v_id := nullif(i->>'id', '')::uuid;
    ok := case t
      when 'school' then private.has_role(array['office','emergency_sender']::public.role_kind[])
      when 'staff' then private.has_role(array['office','principal']::public.role_kind[])
      when 'division' then private.is_office() or v_id in (select private.my_division_ids())
      when 'grade' then private.is_office() or exists (select 1 from public.grades g where g.id = v_id and g.division_id in (select private.my_division_ids()))
      when 'class' then private.is_office() or v_id in (select private.my_class_ids())
        or exists (select 1 from public.classes c join public.grades g on g.id = c.grade_id where c.id = v_id and g.division_id in (select private.my_division_ids()))
      when 'student' then private.is_office() or v_id in (select private.staff_student_ids())
      else false end;
    if not coalesce(ok, false) then return false; end if;
  end loop;
  return true;
end $$;

create or replace function private.audience_label(p_audience jsonb) returns text
language sql stable security definer set search_path = '' as $$
  select string_agg(case i->>'type'
    when 'school' then 'All families'
    when 'staff' then 'All staff'
    when 'division' then (select d.name from public.divisions d where d.id = (i->>'id')::uuid)
    when 'grade' then (select g.label from public.grades g where g.id = (i->>'id')::uuid)
    when 'class' then (select case when c.kind = 'class' then coalesce(g.label || ' · ', '') || c.code else c.name end
                       from public.classes c left join public.grades g on g.id = c.grade_id where c.id = (i->>'id')::uuid)
    when 'student' then (select s.last_name || ' family' from public.students s where s.id = (i->>'id')::uuid)
  end, ', ') from jsonb_array_elements(p_audience) i
$$;

-- Audiences the caller may target (drives the composer; server re-checks on send).
create or replace function public.my_audiences() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(a order by a->>'sort'), '[]') from (
    select jsonb_build_object('type','school','label','All families','sort','0') a
      where private.has_role(array['office','emergency_sender']::public.role_kind[])
    union all select jsonb_build_object('type','staff','label','All staff','sort','1')
      where private.has_role(array['office','principal']::public.role_kind[])
    union all select jsonb_build_object('type','division','id',d.id,'label',d.name,'sort','2'||d.sort_order)
      from public.divisions d where d.school_id = private.my_school() and (private.is_office() or d.id in (select private.my_division_ids()))
    union all select jsonb_build_object('type','grade','id',g.id,'label',g.label,'sort','3'||lpad(g.sort_order::text,3,'0'))
      from public.grades g where g.school_id = private.my_school() and (private.is_office() or g.division_id in (select private.my_division_ids()))
    union all select jsonb_build_object('type','class','id',c.id,'label',c.code || ' · ' || c.name,'kind',c.kind,'mine',c.id in (select private.my_class_ids()),'sort','4'||c.code)
      from public.classes c where c.school_id = private.my_school() and c.is_active and (
        private.is_office() or c.id in (select private.my_class_ids())
        or c.grade_id in (select g.id from public.grades g where g.division_id in (select private.my_division_ids())))
  ) x
$$;

-- ---------------------------------------------------------------- posting
create or replace function private.in_quiet_hours(p_person uuid, p_context public.app_context) returns int
language plpgsql stable security definer set search_path = '' as $$
-- returns seconds until quiet hours end (0 when not in quiet hours)
declare v_start time; v_end time; v_tz text; v_now time; v_secs int;
begin
  select n.quiet_start, n.quiet_end into v_start, v_end from public.notification_prefs n
  where n.person_id = p_person and n.context = p_context;
  if not found then v_start := '21:00'; v_end := '06:30'; end if;
  if v_start is null or v_end is null then return 0; end if;
  select s.timezone into v_tz from public.people p join public.schools s on s.id = p.school_id where p.id = p_person;
  v_now := (now() at time zone coalesce(v_tz, 'America/Detroit'))::time;
  if (v_start < v_end and v_now >= v_start and v_now < v_end) or (v_start > v_end and (v_now >= v_start or v_now < v_end)) then
    v_secs := extract(epoch from (v_end - v_now))::int;
    if v_secs < 0 then v_secs := v_secs + 86400; end if;
    return v_secs;
  end if;
  return 0;
end $$;

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

  update public.posts set status = 'sent', sent_at = now(),
    pinned_until = case when v.priority in ('important','emergency') then now() + interval '48 hours' end
  where id = p_post;
  return n;
end $$;

create or replace function public.create_post(
  p_title text, p_body text, p_audience jsonb,
  p_priority public.post_priority default 'normal', p_require_ack boolean default false,
  p_scheduled_at timestamptz default null, p_attachments jsonb default '[]'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me public.people; v_id uuid; v_label text; v_author text; n int := 0; a jsonb;
begin
  select * into v_me from public.people where id = private.me();
  if v_me.id is null then raise exception 'not linked' using errcode = '42501'; end if;
  if not private.can_post_to(p_audience, p_priority) then
    raise exception 'You can''t post to that audience' using errcode = '42501';
  end if;
  if p_scheduled_at is not null and p_scheduled_at > now() + interval '60 days' then
    raise exception 'Posts can be scheduled up to 60 days ahead';
  end if;
  v_label := private.audience_label(p_audience);
  v_author := case when exists (select 1 from jsonb_array_elements(p_audience) i where i->>'type' in ('school','staff'))
                    and private.has_role(array['office','emergency_sender']::public.role_kind[])
                   then (select s.short_name || ' Office' from public.schools s where s.id = v_me.school_id)
                   else private.staff_name(v_me) end;
  insert into public.posts (school_id, author_id, author_label, audience, audience_label, priority, title, body, require_ack, scheduled_at)
  values (v_me.school_id, v_me.id, v_author, p_audience, v_label, p_priority, trim(p_title), coalesce(p_body, ''), p_require_ack, p_scheduled_at)
  returning id into v_id;

  for a in select * from jsonb_array_elements(coalesce(p_attachments, '[]')) loop
    if (a->>'storage_path') not like v_me.school_id::text || '/' || v_me.id::text || '/%' then
      raise exception 'attachment path not owned by sender';
    end if;
    insert into public.post_attachments (post_id, storage_path, kind, file_name, size_bytes, sort_order)
    values (v_id, a->>'storage_path', a->>'kind', a->>'file_name', (a->>'size_bytes')::bigint, coalesce((a->>'sort_order')::int, 0));
  end loop;

  perform private.audit('post.create', 'post', v_id::text,
    jsonb_build_object('audience', p_audience, 'priority', p_priority, 'scheduled_at', p_scheduled_at));
  if p_scheduled_at is null or p_scheduled_at <= now() then
    n := private.dispatch_post(v_id);
  end if;
  return jsonb_build_object('id', v_id, 'recipients', n, 'scheduled', p_scheduled_at is not null and p_scheduled_at > now());
end $$;

create or replace function public.edit_post(p_post uuid, p_title text, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.posts set title = trim(p_title), body = coalesce(p_body, ''),
         edited_at = case when status = 'sent' then now() end
  where id = p_post and author_id = private.me();
  if not found then raise exception 'not your post' using errcode = '42501'; end if;
  perform private.audit('post.edit', 'post', p_post::text);
end $$;

create or replace function public.cancel_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.posts set status = 'cancelled'
  where id = p_post and status = 'scheduled' and (author_id = private.me() or private.is_office());
  if not found then raise exception 'only scheduled posts you own can be cancelled' using errcode = '42501'; end if;
  perform private.audit('post.cancel', 'post', p_post::text);
end $$;

-- Runs every minute (pg_cron).
create or replace function private.dispatch_due_posts() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from public.posts where status = 'scheduled' and scheduled_at <= now() order by scheduled_at limit 50 loop
    perform private.dispatch_post(r.id); n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- feed
create or replace function public.feed(
  p_context public.app_context, p_student uuid default null, p_query text default null,
  p_limit int default 50, p_before timestamptz default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := private.me(); v jsonb;
begin
  if v_me is null then return '[]'; end if;
  with visible as (
    select p.* from public.posts p
    where p.status = 'sent' and p.school_id = private.my_school()
      and (p_before is null or p.sent_at < p_before)
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
    order by p.sent_at desc limit least(p_limit, 100)
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
  ) order by p.sent_at desc), '[]') into v from visible p;
  return v;
end $$;

create or replace function public.mark_post_read(p_post uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.post_reads (post_id, person_id)
  select p_post, private.me() where private.can_read_post(p_post) and private.me() is not null
  on conflict do nothing;
$$;

create or replace function public.acknowledge_post(p_post uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_at timestamptz;
begin
  if not private.can_read_post(p_post) then raise exception 'not found' using errcode = '42501'; end if;
  perform public.mark_post_read(p_post);
  insert into public.post_acks (post_id, person_id) values (p_post, private.me())
  on conflict (post_id, person_id) do update set acked_at = public.post_acks.acked_at
  returning acked_at into v_at;
  return v_at;
end $$;

-- ---------------------------------------------------------------- reach
-- A "family" = a student; reached when any guardian got a push/email; read when any guardian opened it.
create or replace function private.post_family_status(p_post uuid)
returns table (student_id uuid, family text, child text, reached boolean, read boolean, acked boolean, via text, has_device boolean)
language sql stable security definer set search_path = '' as $$
  with fam as (
    select unnest(r.student_ids) as student_id, r.person_id from public.post_recipients r
    where r.post_id = p_post and r.context = 'parent'
  )
  select s.id, s.last_name || ' family', private.student_name(s),
    bool_or(exists (select 1 from public.deliveries d where d.post_id = p_post and d.person_id = f.person_id and d.status in ('sent','delivered'))
            or exists (select 1 from public.post_reads x where x.post_id = p_post and x.person_id = f.person_id)),
    bool_or(exists (select 1 from public.post_reads x where x.post_id = p_post and x.person_id = f.person_id)),
    bool_or(exists (select 1 from public.post_acks x where x.post_id = p_post and x.person_id = f.person_id)),
    case when bool_or(exists (select 1 from public.deliveries d where d.post_id = p_post and d.person_id = f.person_id and d.channel = 'push' and d.status in ('sent','delivered'))) then 'Push'
         when bool_or(exists (select 1 from public.deliveries d where d.post_id = p_post and d.person_id = f.person_id and d.channel = 'email' and d.status in ('sent','delivered'))) then 'Email'
         when bool_or(exists (select 1 from public.post_reads x where x.post_id = p_post and x.person_id = f.person_id)) then 'App'
    end,
    bool_or(exists (select 1 from public.devices dv where dv.person_id = f.person_id))
  from fam f join public.students s on s.id = f.student_id
  group by s.id
$$;

create or replace function private.can_see_reach(p_post uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.posts p where p.id = p_post and (p.author_id = private.me() or (p.school_id = private.my_school() and private.is_office())))
      or (private.can_read_post(p_post) and exists (select 1 from private.my_division_ids()))
$$;

create or replace function public.post_reach_summary(p_post uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.can_see_reach(p_post) then (
    select jsonb_build_object('families', count(*), 'reached', count(*) filter (where reached),
                              'read', count(*) filter (where read), 'acked', count(*) filter (where acked))
    from private.post_family_status(p_post)) end
$$;

create or replace function public.post_reach(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not private.can_see_reach(p_post) then raise exception 'not allowed' using errcode = '42501'; end if;
  select jsonb_build_object(
    'post', (select jsonb_build_object('id', p.id, 'title', p.title, 'audience_label', p.audience_label, 'sent_at', p.sent_at,
                                       'priority', p.priority, 'require_ack', p.require_ack, 'status', p.status)
             from public.posts p where p.id = p_post),
    'summary', public.post_reach_summary(p_post),
    'by_channel', jsonb_build_object(
      'push', (select count(distinct student_id) from private.post_family_status(p_post) where via = 'Push'),
      'email', (select count(distinct student_id) from private.post_family_status(p_post) where via = 'Email')),
    'not_reached', (select coalesce(jsonb_agg(jsonb_build_object('student_id', student_id, 'family', family, 'child', child,
                      'reason', case when has_device then 'notification not delivered yet' else 'no app installed · email not opened' end) order by family), '[]')
                    from private.post_family_status(p_post) where not reached),
    'unread', (select coalesce(jsonb_agg(jsonb_build_object('student_id', student_id, 'family', family, 'child', child, 'via', via) order by family), '[]')
               from private.post_family_status(p_post) where reached and not read),
    'families', (select coalesce(jsonb_agg(jsonb_build_object('student_id', student_id, 'family', family, 'child', child,
                    'reached', reached, 'read', read, 'acked', acked, 'via', via) order by family), '[]')
                 from private.post_family_status(p_post))
  ) into v;
  return v;
end $$;

-- Send a reminder (email) to families not reached / not read.
create or replace function public.remind_families(p_post uuid, p_student_ids uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  if not private.can_see_reach(p_post) then raise exception 'not allowed' using errcode = '42501'; end if;
  for r in select distinct pr.person_id, pr.context from public.post_recipients pr
           where pr.post_id = p_post and pr.context = 'parent' and pr.student_ids && p_student_ids loop
    perform pgmq.send('notify', jsonb_build_object('kind','post','post_id',p_post,'person_id',r.person_id,'context',r.context,'channel','email','reminder',true));
    n := n + 1;
  end loop;
  perform private.audit('post.remind', 'post', p_post::text, jsonb_build_object('students', p_student_ids));
  return n;
end $$;

-- ---------------------------------------------------------------- classes & roster (staff)
create or replace function public.class_roster(p_class uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not (private.is_office() or p_class in (select private.my_class_ids())
          or exists (select 1 from public.classes c join public.grades g on g.id = c.grade_id
                     where c.id = p_class and g.division_id in (select private.my_division_ids()))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'student_id', s.id, 'name', private.student_name(s) || ' ' || s.last_name,
    'guardians', (select coalesce(jsonb_agg(jsonb_build_object(
        'person_id', p.id, 'name', trim(p.first_name || ' ' || p.last_name), 'first_name', p.first_name,
        'relationship', g.relationship,
        'email', case when g.hide_contact then null else p.email end,
        'phone', case when g.hide_contact then null else p.phone end,
        'contact_hidden', g.hide_contact,
        'has_app', exists (select 1 from public.devices d where d.person_id = p.id)) order by p.first_name), '[]')
      from public.guardianships g join public.people p on p.id = g.person_id and p.is_active
      where g.student_id = s.id and g.is_active and not g.no_contact)
  ) order by s.last_name, s.first_name), '[]') into v
  from public.enrollments e join public.students s on s.id = e.student_id and s.is_active
  where e.class_id = p_class;
  return v;
end $$;

-- ---------------------------------------------------------------- messaging
create or replace function private.relationship_label(p_relationship text) returns text
language sql immutable as $$
  select case lower(coalesce(p_relationship, '')) when 'mother' then 'mom' when 'father' then 'dad'
         when 'mom' then 'mom' when 'dad' then 'dad' else 'family' end
$$;

create or replace function public.my_threads(p_context public.app_context) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'last_message_at' desc), '[]') from (
    select jsonb_build_object(
      'id', t.id, 'student_id', s.id, 'student_name', private.student_name(s) || ' ' || s.last_name,
      'student_first', private.student_name(s), 'grade', g.label,
      'with', (select string_agg(case when op.context = 'staff' then private.staff_name(p) else trim(p.first_name || ' ' || p.last_name) end, ', ')
               from public.thread_participants op join public.people p on p.id = op.person_id
               where op.thread_id = t.id and op.person_id <> private.me()),
      'with_sub', (select string_agg(case when op.context = 'staff'
                        then coalesce(p.staff_title, 'Staff')
                        else private.student_name(s) || '''s ' || private.relationship_label(gg.relationship) end, ', ')
               from public.thread_participants op join public.people p on p.id = op.person_id
               left join public.guardianships gg on gg.person_id = p.id and gg.student_id = s.id
               where op.thread_id = t.id and op.person_id <> private.me()),
      'office_hours', (select string_agg(p.office_hours, ' ') from public.thread_participants op join public.people p on p.id = op.person_id
               where op.thread_id = t.id and op.context = 'staff' and op.person_id <> private.me()),
      'last_message', (select m.body from public.messages m where m.thread_id = t.id order by m.created_at desc limit 1),
      'last_message_at', t.last_message_at,
      'unread', exists (select 1 from public.messages m where m.thread_id = t.id and m.sender_id <> private.me()
                        and m.created_at > coalesce(me.last_read_at, '-infinity'))
    ) x
    from public.thread_participants me
    join public.threads t on t.id = me.thread_id
    join public.students s on s.id = t.student_id
    left join public.grades g on g.id = s.grade_id
    where me.person_id = private.me() and me.context = p_context
  ) q
$$;

-- Who can I message about this student?
create or replace function public.message_contacts(p_student uuid, p_context public.app_context) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if p_context = 'parent' then
    if p_student not in (select private.my_student_ids()) then raise exception 'not allowed' using errcode = '42501'; end if;
    select coalesce(jsonb_agg(distinct jsonb_build_object('person_id', p.id, 'name', private.staff_name(p),
              'role', coalesce(p.staff_title, 'Teacher'), 'office_hours', p.office_hours)), '[]') into v
    from public.enrollments e
    join public.memberships m on m.scope_type = 'class' and m.scope_id = e.class_id and m.role in ('teacher','aide','group_leader')
         and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
    join public.people p on p.id = m.person_id and p.is_active
    where e.student_id = p_student;
  else
    if p_student not in (select private.staff_student_ids()) then raise exception 'not allowed' using errcode = '42501'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('person_id', p.id, 'name', trim(p.first_name || ' ' || p.last_name),
              'role', private.student_name(s) || '''s ' || private.relationship_label(g.relationship))), '[]') into v
    from public.guardianships g join public.people p on p.id = g.person_id and p.is_active
    join public.students s on s.id = g.student_id
    where g.student_id = p_student and g.is_active and not g.no_contact;
  end if;
  return v;
end $$;

create or replace function public.start_thread(p_student uuid, p_with uuid, p_context public.app_context) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.me(); v_thread uuid; v_ok boolean;
begin
  if p_context = 'parent' then
    v_ok := p_student in (select private.my_student_ids()) and exists (
      select 1 from public.enrollments e join public.memberships m on m.scope_type = 'class' and m.scope_id = e.class_id
        and m.role in ('teacher','aide','group_leader') and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
      where e.student_id = p_student and m.person_id = p_with);
  else
    v_ok := p_student in (select private.staff_student_ids()) and exists (
      select 1 from public.guardianships g where g.student_id = p_student and g.person_id = p_with and g.is_active and not g.no_contact);
  end if;
  if not coalesce(v_ok, false) then raise exception 'You can''t message this person about this student' using errcode = '42501'; end if;

  select t.id into v_thread from public.threads t
  where t.student_id = p_student
    and exists (select 1 from public.thread_participants a where a.thread_id = t.id and a.person_id = v_me)
    and exists (select 1 from public.thread_participants b where b.thread_id = t.id and b.person_id = p_with)
  limit 1;
  if v_thread is not null then return v_thread; end if;

  insert into public.threads (school_id, student_id, created_by) values (private.my_school(), p_student, v_me) returning id into v_thread;
  insert into public.thread_participants (thread_id, person_id, context, last_read_at) values
    (v_thread, v_me, p_context, now()),
    (v_thread, p_with, case when p_context = 'parent' then 'staff' else 'parent' end::public.app_context, null);
  return v_thread;
end $$;

create or replace function public.send_message(p_thread uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; r record;
begin
  if not private.in_thread(p_thread) then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'empty message'; end if;
  insert into public.messages (thread_id, sender_id, body) values (p_thread, private.me(), trim(p_body)) returning id into v_id;
  update public.threads set last_message_at = now() where id = p_thread;
  update public.thread_participants set last_read_at = now() where thread_id = p_thread and person_id = private.me();
  for r in select person_id, context from public.thread_participants where thread_id = p_thread and person_id <> private.me() loop
    perform pgmq.send('notify', jsonb_build_object('kind','message','message_id',v_id,'person_id',r.person_id,'context',r.context,'channel','push'),
                      private.in_quiet_hours(r.person_id, r.context));
  end loop;
  return v_id;
end $$;

create or replace function public.mark_thread_read(p_thread uuid) returns void
language sql security definer set search_path = '' as $$
  update public.thread_participants set last_read_at = now() where thread_id = p_thread and person_id = private.me();
$$;

-- ---------------------------------------------------------------- devices
create or replace function public.register_device(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.me() is null then return; end if;
  insert into public.devices (person_id, expo_token, platform) values (private.me(), p_token, p_platform)
  on conflict (expo_token) do update set person_id = excluded.person_id, platform = excluded.platform, last_seen_at = now();
end $$;

create or replace function public.unregister_device(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.devices where expo_token = p_token and person_id = private.me();
$$;

-- ---------------------------------------------------------------- account deletion (store requirement)
-- Removes the sign-in link and devices; student records stay with the school.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := private.me();
begin
  if v_me is not null then
    perform private.audit('account.delete', 'person', v_me::text);
    delete from public.devices where person_id = v_me;
    delete from public.notification_prefs where person_id = v_me;
    update public.people set user_id = null where id = v_me;
  end if;
  delete from public.family_requests where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.link_account(), public.session_info(), public.request_family_link(text), public.my_audiences(),
  public.create_post(text, text, jsonb, public.post_priority, boolean, timestamptz, jsonb),
  public.edit_post(uuid, text, text), public.cancel_post(uuid),
  public.feed(public.app_context, uuid, text, int, timestamptz), public.mark_post_read(uuid), public.acknowledge_post(uuid),
  public.post_reach_summary(uuid), public.post_reach(uuid), public.remind_families(uuid, uuid[]),
  public.class_roster(uuid), public.my_threads(public.app_context), public.message_contacts(uuid, public.app_context),
  public.start_thread(uuid, uuid, public.app_context), public.send_message(uuid, text), public.mark_thread_read(uuid),
  public.register_device(text, text), public.unregister_device(text), public.delete_my_account()
to authenticated;
