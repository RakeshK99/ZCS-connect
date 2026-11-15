-- ZCS Connect · tester survey (soft launch). A short web survey, separate from
-- the app, sent to testers by link. No sign-in needed. Answers are structured so
-- they can be summarised straight into "what to fix next": per-task ease, the
-- System Usability Scale (SUS), likelihood to recommend, and open answers.
-- Only office staff can read results (console → Tester survey).

create table if not exists public.tester_surveys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,            -- one per browser; resubmitting updates the same response
  role text not null check (role in ('parent', 'staff', 'both')),
  usage text check (usage in ('once', 'few_days', 'one_two_weeks', 'longer')),
  sign_in text check (sign_in in ('email', 'apple', 'google', 'demo', 'failed')),
  tasks jsonb not null default '{}',         -- {"read": {"ease": 1-5 | 0 = didn't try, "note": "..."}}
  sus smallint[] check (sus is null or (cardinality(sus) = 10 and 1 <= all(sus) and 5 >= all(sus))),
  sus_score numeric generated always as (
    case when sus is null then null else
      ((sus[1] - 1) + (5 - sus[2]) + (sus[3] - 1) + (5 - sus[4]) + (sus[5] - 1)
       + (5 - sus[6]) + (sus[7] - 1) + (5 - sus[8]) + (sus[9] - 1) + (5 - sus[10])) * 2.5 end) stored,
  recommend smallint check (recommend between 0 and 10),
  compared smallint check (compared between 1 and 5),   -- vs how they get school news today: 1 much worse … 5 much better
  notifications text check (notifications in ('too_many', 'right', 'too_few', 'off', 'none')),
  useful text, frustrating text,
  frustrating_impact text check (frustrating_impact in ('minor', 'annoying', 'blocked')),
  broken text, wish text,
  name text, email text, contact_ok boolean not null default false,
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tester_surveys_created on public.tester_surveys (created_at desc);
alter table public.tester_surveys enable row level security;
drop policy if exists tester_surveys_office on public.tester_surveys;
create policy tester_surveys_office on public.tester_surveys for select to authenticated using ((select private.is_office()));

create or replace function private.survey_text(p jsonb, k text, n int default 2000) returns text
language sql immutable set search_path = '' as $$ select nullif(left(btrim(p->>k), n), '') $$;

-- Public: save (or update) one response. Validates every field; unknown keys are ignored.
create or replace function public.submit_tester_survey(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_client uuid; v_id uuid; v_tasks jsonb := '{}'; v_sus smallint[]; k text; t jsonb; v_ease int;
  v_role text := p->>'role';
  c_tasks constant text[] := array['signin', 'read', 'confirm', 'save', 'clear', 'message', 'calendar', 'notify',
                                   'post', 'reach', 'classlist', 'classevent', 'reply', 'website'];
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'bad survey' using errcode = '22023'; end if;
  begin v_client := (p->>'client_id')::uuid; exception when others then v_client := null; end;
  if v_client is null then raise exception 'bad survey' using errcode = '22023'; end if;
  if v_role is null or v_role not in ('parent', 'staff', 'both') then raise exception 'Please choose how you use ZCS Connect.' using errcode = '22023'; end if;
  if (select count(*) from public.tester_surveys where updated_at > now() - interval '10 minutes') >= 60 then
    raise exception 'Lots of answers are coming in right now. Please try again in a few minutes.' using errcode = '54000';
  end if;

  if jsonb_typeof(p->'tasks') = 'object' then
    foreach k in array c_tasks loop
      t := p->'tasks'->k;
      continue when t is null or jsonb_typeof(t) <> 'object';
      begin v_ease := (t->>'ease')::int; exception when others then v_ease := null; end;
      continue when v_ease is null or v_ease not between 0 and 5;
      v_tasks := v_tasks || jsonb_build_object(k, jsonb_strip_nulls(jsonb_build_object('ease', v_ease, 'note', private.survey_text(t, 'note', 1000))));
    end loop;
  end if;

  if jsonb_typeof(p->'sus') = 'array' and jsonb_array_length(p->'sus') = 10 then
    begin
      select array_agg(x::smallint order by i) into v_sus from jsonb_array_elements_text(p->'sus') with ordinality a(x, i);
      if not (1 <= all(v_sus) and 5 >= all(v_sus)) then v_sus := null; end if;
    exception when others then v_sus := null; end;
  end if;

  insert into public.tester_surveys as s (client_id, role, usage, sign_in, tasks, sus, recommend, compared, notifications,
    useful, frustrating, frustrating_impact, broken, wish, name, email, contact_ok, app_version)
  values (v_client, v_role,
    case when p->>'usage' in ('once', 'few_days', 'one_two_weeks', 'longer') then p->>'usage' end,
    case when p->>'sign_in' in ('email', 'apple', 'google', 'demo', 'failed') then p->>'sign_in' end,
    v_tasks, v_sus,
    case when p->>'recommend' ~ '^\d{1,2}$' and (p->>'recommend')::int <= 10 then (p->>'recommend')::smallint end,
    case when p->>'compared' ~ '^[1-5]$' then (p->>'compared')::smallint end,
    case when p->>'notifications' in ('too_many', 'right', 'too_few', 'off', 'none') then p->>'notifications' end,
    private.survey_text(p, 'useful'), private.survey_text(p, 'frustrating'),
    case when p->>'frustrating_impact' in ('minor', 'annoying', 'blocked') then p->>'frustrating_impact' end,
    private.survey_text(p, 'broken'), private.survey_text(p, 'wish'),
    private.survey_text(p, 'name', 120),
    case when private.survey_text(p, 'email', 200) ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(private.survey_text(p, 'email', 200)) end,
    coalesce((p->>'contact_ok')::boolean, false),
    private.survey_text(p, 'app_version', 40))
  on conflict (client_id) do update set
    role = excluded.role, usage = excluded.usage, sign_in = excluded.sign_in, tasks = excluded.tasks, sus = excluded.sus,
    recommend = excluded.recommend, compared = excluded.compared, notifications = excluded.notifications,
    useful = excluded.useful, frustrating = excluded.frustrating, frustrating_impact = excluded.frustrating_impact,
    broken = excluded.broken, wish = excluded.wish, name = excluded.name, email = excluded.email,
    contact_ok = excluded.contact_ok, app_version = excluded.app_version, updated_at = now()
  returning s.id into v_id;
  return v_id;
end $$;
revoke execute on function public.submit_tester_survey(jsonb) from public;
grant execute on function public.submit_tester_survey(jsonb) to anon, authenticated;

-- Office: the whole survey summarised, plus every response for reading and CSV.
create or replace function public.tester_survey_report() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not private.is_office() then raise exception 'not allowed' using errcode = '42501'; end if;
  with s as (select * from public.tester_surveys),
  task_rows as (
    select k as key, (s.tasks->k->>'ease')::int as ease, s.tasks->k->>'note' as note
    from s, jsonb_object_keys(s.tasks) k
  )
  select jsonb_build_object(
    'responses', (select count(*) from s),
    'by_role', (select coalesce(jsonb_object_agg(role, n), '{}') from (select role, count(*) n from s group by role) x),
    'sus_avg', (select round(avg(sus_score), 1) from s),
    'sus_n', (select count(sus_score) from s),
    'recommend_n', (select count(recommend) from s),
    'recommend_avg', (select round(avg(recommend), 1) from s),
    -- Net Promoter Score: % 9–10 minus % 0–6
    'nps', (select round(100.0 * (count(*) filter (where recommend >= 9) - count(*) filter (where recommend <= 6)) / nullif(count(recommend), 0)) from s),
    'compared_avg', (select round(avg(compared), 2) from s),
    'counts', jsonb_build_object(
      'usage', (select coalesce(jsonb_object_agg(usage, n), '{}') from (select usage, count(*) n from s where usage is not null group by usage) x),
      'sign_in', (select coalesce(jsonb_object_agg(sign_in, n), '{}') from (select sign_in, count(*) n from s where sign_in is not null group by sign_in) x),
      'notifications', (select coalesce(jsonb_object_agg(notifications, n), '{}') from (select notifications, count(*) n from s where notifications is not null group by notifications) x),
      'compared', (select coalesce(jsonb_object_agg(compared, n), '{}') from (select compared, count(*) n from s where compared is not null group by compared) x),
      'frustrating_impact', (select coalesce(jsonb_object_agg(frustrating_impact, n), '{}') from (select frustrating_impact, count(*) n from s where frustrating_impact is not null group by frustrating_impact) x)),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('key', key, 'answered', answered, 'tried', tried, 'avg_ease', avg_ease, 'hard', hard) order by avg_ease nulls last, hard desc, key), '[]')
              from (select key, count(*) answered, count(*) filter (where ease > 0) tried,
                           round(avg(ease) filter (where ease > 0), 2) avg_ease, count(*) filter (where ease between 1 and 2) hard
                    from task_rows group by key) x),
    'rows', (select coalesce(jsonb_agg(to_jsonb(s) - 'client_id' order by s.created_at desc), '[]') from s)
  ) into v;
  return v;
end $$;
revoke execute on function public.tester_survey_report() from public, anon;
grant execute on function public.tester_survey_report() to authenticated;
