-- ZCS Connect · code review fix H6: row-level security at school scale.
--
-- The students/enrollments policies called can_view_student(id) for every row,
-- which re-ran staff_student_ids() (a scan of every student, calling is_office()
-- per student) each time: quadratic in school size. At ~1,000 students an
-- office search timed out after 60 s. Policies now evaluate the caller's
-- identity and roles once per query ((select ...) init plans) and test
-- membership against precomputed sets. Same rules, same results.

-- Staff-visible students: roles checked once, and nothing scanned for families.
create or replace function private.staff_student_ids() returns setof uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_school uuid := private.my_school();
begin
  if v_school is null or not private.is_staff_person(private.me()) then return; end if;
  if private.is_office() then
    return query select s.id from public.students s where s.school_id = v_school;
    return;
  end if;
  return query
    select e.student_id from public.enrollments e join public.students s on s.id = e.student_id and s.school_id = v_school
    where e.class_id in (select private.my_class_ids())
    union
    select s.id from public.students s join public.grades g on g.id = s.grade_id
    where s.school_id = v_school and g.division_id in (select private.my_division_ids());
end $$;

create or replace function private.can_view_student(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_student in (select private.my_student_ids())
      or p_student in (select private.staff_student_ids())
$$;

-- ---------------------------------------------------------------- policies
drop policy if exists students_read on public.students;
create policy students_read on public.students for select to authenticated using (
  school_id = (select private.my_school()) and (
    (select private.is_office())
    or id = any ((select array(select private.my_student_ids()))::uuid[])
    or id = any ((select array(select private.staff_student_ids()))::uuid[]))
);

drop policy if exists enrollments_read on public.enrollments;
create policy enrollments_read on public.enrollments for select to authenticated using (
  ((select private.is_office()) and exists (select 1 from public.classes c where c.id = class_id and c.school_id = (select private.my_school())))
  or student_id = any ((select array(select private.my_student_ids()))::uuid[])
  or student_id = any ((select array(select private.staff_student_ids()))::uuid[])
);

drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated using (
  id = (select private.me())
  or (school_id = (select private.my_school()) and ((select private.is_office()) or private.is_staff_person(id)))
);

drop policy if exists memberships_read on public.memberships;
create policy memberships_read on public.memberships for select to authenticated using (
  person_id = (select private.me()) or (school_id = (select private.my_school()) and (select private.is_office()))
);

drop policy if exists guardianships_read on public.guardianships;
create policy guardianships_read on public.guardianships for select to authenticated using (
  person_id = (select private.me())
  or ((select private.is_office()) and exists (select 1 from public.students s where s.id = student_id and s.school_id = (select private.my_school())))
);

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated using (
  (school_id = (select private.my_school()) and (select private.is_office()))
  or author_id = (select private.me())
  or private.can_read_post(id)
);

drop policy if exists post_recipients_read on public.post_recipients;
create policy post_recipients_read on public.post_recipients for select to authenticated using (person_id = (select private.me()));
drop policy if exists post_reads_read on public.post_reads;
create policy post_reads_read on public.post_reads for select to authenticated using (person_id = (select private.me()));
drop policy if exists post_acks_read on public.post_acks;
create policy post_acks_read on public.post_acks for select to authenticated using (person_id = (select private.me()));
drop policy if exists devices_own on public.devices;
create policy devices_own on public.devices for select to authenticated using (person_id = (select private.me()));
drop policy if exists devices_delete_own on public.devices;
create policy devices_delete_own on public.devices for delete to authenticated using (person_id = (select private.me()));
drop policy if exists prefs_read on public.notification_prefs;
create policy prefs_read on public.notification_prefs for select to authenticated using (person_id = (select private.me()));
drop policy if exists prefs_insert on public.notification_prefs;
create policy prefs_insert on public.notification_prefs for insert to authenticated with check (person_id = (select private.me()));
drop policy if exists prefs_update on public.notification_prefs;
create policy prefs_update on public.notification_prefs for update to authenticated
  using (person_id = (select private.me())) with check (person_id = (select private.me()));

-- ---------------------------------------------------------------- indexes used by the hot paths
create index if not exists students_school_active on public.students (school_id, is_active);
create index if not exists enrollments_class on public.enrollments (class_id);
create index if not exists post_recipients_post on public.post_recipients (post_id, context);
create index if not exists memberships_person_active on public.memberships (person_id, role) include (scope_type, scope_id, starts_at, ends_at);
create index if not exists guardianships_person on public.guardianships (person_id) where is_active;

-- ---------------------------------------------------------------- reach, set-based
-- One pass over the post's recipients, deliveries, reads and acks instead of
-- correlated lookups per family (a school-wide post has ~2,000 recipients).
create or replace function private.post_family_status(p_post uuid)
returns table (student_id uuid, family text, child text, reached boolean, read boolean, acked boolean, via text, has_device boolean)
language sql stable security definer set search_path = '' as $$
  with scope as (
    select private.can_see_all_reach(p_post) as all_ok, array(select private.staff_student_ids()) as mine
  ),
  fam as (
    select unnest(r.student_ids) as student_id, r.person_id from public.post_recipients r
    where r.post_id = p_post and r.context = 'parent'
  ),
  dl as (
    select d.person_id, bool_or(d.channel = 'push') as push, bool_or(d.channel = 'email') as email
    from public.deliveries d where d.post_id = p_post and d.status in ('sent', 'delivered') group by d.person_id
  ),
  rd as (select x.person_id from public.post_reads x where x.post_id = p_post),
  ak as (select x.person_id from public.post_acks x where x.post_id = p_post),
  dv as (select distinct d.person_id from public.devices d where d.person_id in (select person_id from fam))
  select s.id, s.last_name || ' family', private.student_name(s),
    bool_or(dl.person_id is not null or rd.person_id is not null),
    bool_or(rd.person_id is not null),
    bool_or(ak.person_id is not null),
    case when bool_or(coalesce(dl.push, false)) then 'Push'
         when bool_or(coalesce(dl.email, false)) then 'Email'
         when bool_or(rd.person_id is not null) then 'App' end,
    bool_or(dv.person_id is not null)
  from fam f
  join public.students s on s.id = f.student_id
  left join dl on dl.person_id = f.person_id
  left join rd on rd.person_id = f.person_id
  left join ak on ak.person_id = f.person_id
  left join dv on dv.person_id = f.person_id
  cross join scope
  where scope.all_ok or f.student_id = any(scope.mine)
  group by s.id
$$;

-- post_reach computes the family list once and derives every section from it.
create or replace function public.post_reach(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  if not private.can_see_reach(p_post) then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(f) order by f.family, f.child), '[]') into v_rows from private.post_family_status(p_post) f;
  return jsonb_build_object(
    'post', (select jsonb_build_object('id', p.id, 'title', p.title, 'audience_label', p.audience_label, 'sent_at', p.sent_at,
                                       'priority', p.priority, 'require_ack', p.require_ack, 'status', p.status)
             from public.posts p where p.id = p_post),
    'summary', (select jsonb_build_object('families', count(*), 'reached', count(*) filter (where (x->>'reached')::boolean),
                                          'read', count(*) filter (where (x->>'read')::boolean), 'acked', count(*) filter (where (x->>'acked')::boolean))
                from jsonb_array_elements(v_rows) x),
    'by_channel', jsonb_build_object(
      'push', (select count(*) from jsonb_array_elements(v_rows) x where x->>'via' = 'Push'),
      'email', (select count(*) from jsonb_array_elements(v_rows) x where x->>'via' = 'Email')),
    'not_reached', (select coalesce(jsonb_agg(jsonb_build_object('student_id', x->'student_id', 'family', x->'family', 'child', x->'child',
                      'reason', case when (x->>'has_device')::boolean then 'notification not delivered yet' else 'no app installed · email not opened' end)), '[]')
                    from jsonb_array_elements(v_rows) x where not (x->>'reached')::boolean),
    'unread', (select coalesce(jsonb_agg(jsonb_build_object('student_id', x->'student_id', 'family', x->'family', 'child', x->'child', 'via', x->'via')), '[]')
               from jsonb_array_elements(v_rows) x where (x->>'reached')::boolean and not (x->>'read')::boolean),
    'families', (select coalesce(jsonb_agg(jsonb_build_object('student_id', x->'student_id', 'family', x->'family', 'child', x->'child',
                    'reached', x->'reached', 'read', x->'read', 'acked', x->'acked', 'via', x->'via')), '[]')
                 from jsonb_array_elements(v_rows) x));
end $$;

-- Dashboard: reach summaries for the recent posts in one aggregate query
-- (was one family-status computation per post).
create or replace function public.recent_sends(p_limit int default 25) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; v_me uuid := private.me(); v_office boolean := private.is_office(); v_mine uuid[];
begin
  if not (v_office or exists (select 1 from private.my_division_ids())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_mine := case when v_office then '{}' else array(select private.staff_student_ids()) end;
  with ps as (
    select p.* from public.posts p
    where p.school_id = private.my_school() and p.status <> 'cancelled' and private.can_read_post(p.id)
    order by coalesce(p.sent_at, p.scheduled_at) desc limit least(greatest(coalesce(p_limit, 25), 1), 100)
  ),
  fam as (
    select r.post_id, unnest(r.student_ids) as sid, r.person_id
    from public.post_recipients r join ps on ps.id = r.post_id
    where r.context = 'parent' and ps.status = 'sent'
  ),
  dl as (select distinct d.post_id, d.person_id from public.deliveries d join ps on ps.id = d.post_id where d.status in ('sent', 'delivered')),
  rd as (select x.post_id, x.person_id from public.post_reads x join ps on ps.id = x.post_id),
  ak as (select x.post_id, x.person_id from public.post_acks x join ps on ps.id = x.post_id),
  st as (
    select f.post_id, f.sid,
      bool_or(dl.person_id is not null or rd.person_id is not null) as reached,
      bool_or(rd.person_id is not null) as read, bool_or(ak.person_id is not null) as acked
    from fam f
    join ps on ps.id = f.post_id
    left join dl on dl.post_id = f.post_id and dl.person_id = f.person_id
    left join rd on rd.post_id = f.post_id and rd.person_id = f.person_id
    left join ak on ak.post_id = f.post_id and ak.person_id = f.person_id
    where v_office or ps.author_id = v_me or f.sid = any(v_mine)
    group by f.post_id, f.sid
  ),
  summ as (
    select post_id, jsonb_build_object('families', count(*), 'reached', count(*) filter (where reached),
                                       'read', count(*) filter (where read), 'acked', count(*) filter (where acked)) as reach
    from st group by post_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'author', p.author_label,
      'audience_label', p.audience_label, 'priority', p.priority, 'status', p.status,
      'sent_at', p.sent_at, 'scheduled_at', p.scheduled_at,
      'reach', case when p.status = 'sent' then coalesce(s.reach, '{"families":0,"reached":0,"read":0,"acked":0}'::jsonb) end)
    order by coalesce(p.sent_at, p.scheduled_at) desc), '[]') into v
  from ps p left join summ s on s.post_id = p.id;
  return v;
end $$;
