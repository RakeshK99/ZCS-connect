-- Minimal stand-ins for the Supabase platform pieces our migrations use, so the
-- schema, seed and permission tests can run on a plain PostgreSQL 16+ server
-- (locally or in CI) without Docker images. Behaviour mirrors Supabase closely
-- enough for authorization tests: roles, default privileges, auth.uid(),
-- storage folders, and a small pgmq-compatible queue. Not used in production.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema extensions;
create extension citext with schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- Supabase grants these on objects created by the migration owner.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------- auth
create schema auth;
create table auth.users (
  id uuid primary key, instance_id uuid, aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- ---------------------------------------------------------------- storage
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, delete on storage.objects to authenticated;

-- ---------------------------------------------------------------- vault / net / cron
create schema vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
create schema net;
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}',
                              timeout_milliseconds int default 1000) returns bigint language sql as $$ select 1::bigint $$;
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid
$$;

-- ---------------------------------------------------------------- pgmq (subset)
create schema pgmq;
create type pgmq.message_record as (msg_id bigint, read_ct int, enqueued_at timestamptz, vt timestamptz, message jsonb);
create function pgmq.create(queue_name text) returns void language plpgsql as $$
begin
  execute format('create table if not exists pgmq.%I (msg_id bigserial primary key, read_ct int not null default 0,
    enqueued_at timestamptz not null default now(), vt timestamptz not null default now(), message jsonb)', 'q_' || queue_name);
  execute format('create table if not exists pgmq.%I (msg_id bigint primary key, read_ct int, enqueued_at timestamptz,
    archived_at timestamptz not null default now(), vt timestamptz, message jsonb)', 'a_' || queue_name);
end $$;
create function pgmq.send(queue_name text, msg jsonb, delay int default 0) returns setof bigint language plpgsql as $$
begin
  return query execute format('insert into pgmq.%I (vt, message) values (now() + make_interval(secs => $1), $2) returning msg_id',
                              'q_' || queue_name) using delay, msg;
end $$;
create function pgmq.read(queue_name text, vt int, qty int) returns setof pgmq.message_record language plpgsql as $$
begin
  return query execute format(
    'with c as (select msg_id from pgmq.%1$I where vt <= clock_timestamp() order by msg_id limit $1 for update skip locked)
     update pgmq.%1$I q set vt = clock_timestamp() + make_interval(secs => $2), read_ct = q.read_ct + 1
     from c where q.msg_id = c.msg_id returning q.msg_id, q.read_ct, q.enqueued_at, q.vt, q.message', 'q_' || queue_name)
    using qty, vt;
end $$;
create function pgmq.delete(queue_name text, msg_id bigint) returns boolean language plpgsql as $$
declare n int;
begin
  execute format('delete from pgmq.%I where msg_id = $1', 'q_' || queue_name) using msg_id;
  get diagnostics n = row_count; return n > 0;
end $$;
create function pgmq.archive(queue_name text, msg_id bigint) returns boolean language plpgsql as $$
declare n int;
begin
  execute format('with d as (delete from pgmq.%1$I where msg_id = $1 returning *)
                  insert into pgmq.%2$I (msg_id, read_ct, enqueued_at, vt, message) select msg_id, read_ct, enqueued_at, vt, message from d',
                 'q_' || queue_name, 'a_' || queue_name) using msg_id;
  get diagnostics n = row_count; return n > 0;
end $$;
create function pgmq.set_vt(queue_name text, msg_id bigint, vt int) returns setof pgmq.message_record language plpgsql as $$
begin
  return query execute format('update pgmq.%I set vt = clock_timestamp() + make_interval(secs => $2) where msg_id = $1
                               returning msg_id, read_ct, enqueued_at, vt, message', 'q_' || queue_name) using msg_id, vt;
end $$;
