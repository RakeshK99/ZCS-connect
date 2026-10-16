-- Times the hot paths as real users (run after load_school.sql). Prints ms per call.
set statement_timeout = '60s';
create temp table _timing (name text, ms numeric);
grant all on _timing to authenticated;
create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
declare v_uid uuid;
begin
  reset role;
  select id into v_uid from auth.users where email = p_email;
  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (id, email, email_confirmed_at) values (v_uid, p_email, now());
  end if;
  perform set_config('request.jwt.claim.sub', v_uid::text, false);
  set role authenticated;
  perform public.link_account();
end $$;
create or replace function pg_temp.time_it(p_name text, p_sql text, p_runs int default 3) returns void language plpgsql as $$
declare t0 timestamptz; best numeric := null; i int; ms numeric;
begin
  for i in 1..p_runs loop
    t0 := clock_timestamp();
    begin
      execute p_sql;
    exception when query_canceled then
      insert into _timing values (p_name, null); return;  -- hit the 60 s statement timeout
    end;
    ms := extract(epoch from clock_timestamp() - t0) * 1000;
    best := least(coalesce(best, ms), ms);
  end loop;
  insert into _timing values (p_name, round(best, 1));
end $$;

select pg_temp.as_user('rakesh+office@syzygy.services');
select pg_temp.time_it('office: search students (RLS)', $q$ select count(*) from (select id from public.students where last_name ilike '%family1%' limit 20) x $q$);
select pg_temp.time_it('office: count all students (RLS)', $q$ select count(*) from public.students $q$);
select pg_temp.time_it('office: count enrollments (RLS)', $q$ select count(*) from public.enrollments $q$);
select pg_temp.time_it('office: reach for a school-wide post', $q$ select public.post_reach((select id from public.posts where title = 'Bench post 1')) $q$);
select pg_temp.time_it('office: people & roles list', $q$ select public.admin_people(null, false) $q$);
select pg_temp.time_it('office: dashboard recent sends', $q$ select public.recent_sends(25) $q$);
select pg_temp.as_user('rakesh+sarah@syzygy.services');
select pg_temp.time_it('parent: feed', $q$ select public.feed('parent') $q$);
select pg_temp.time_it('parent: students (RLS)', $q$ select count(*) from public.students $q$);
select pg_temp.as_user('rakesh+jen@syzygy.services');
select pg_temp.time_it('teacher: staff feed', $q$ select public.feed('staff') $q$);
select pg_temp.time_it('teacher: class roster', $q$ select public.class_roster((select id from public.classes where code = '3S')) $q$);
select pg_temp.as_user('rakesh+principal@syzygy.services');
select pg_temp.time_it('principal: students (RLS)', $q$ select count(*) from public.students $q$);
reset role;
select name, coalesce(ms::text, '> 60000 (timed out)') from _timing;
