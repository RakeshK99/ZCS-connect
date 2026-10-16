-- ZCS Connect · Supabase performance advisor fixes (new SYZYGY-services project).
--
-- family_requests_read called auth.uid() and the role helpers once per row; it
-- now evaluates them once per query. Foreign keys used for joins and cascading
-- deletes get covering indexes.

drop policy if exists family_requests_read on public.family_requests;
create policy family_requests_read on public.family_requests for select to authenticated using (
  user_id = (select auth.uid())
  or (school_id = (select private.my_school()) and (select private.is_office()))
);

create index if not exists calendar_events_created_by on public.calendar_events (created_by);
create index if not exists classes_grade on public.classes (grade_id);
create index if not exists classes_term on public.classes (term_id);
create index if not exists family_requests_resolved_by on public.family_requests (resolved_by);
create index if not exists family_requests_user on public.family_requests (user_id);
create index if not exists memberships_granted_by on public.memberships (granted_by);
create index if not exists memberships_school on public.memberships (school_id);
create index if not exists messages_sender on public.messages (sender_id);
create index if not exists post_acks_person on public.post_acks (person_id);
create index if not exists post_reads_person on public.post_reads (person_id);
create index if not exists posts_author on public.posts (author_id);
create index if not exists roster_imports_school on public.roster_imports (school_id);
create index if not exists roster_imports_uploaded_by on public.roster_imports (uploaded_by);
create index if not exists threads_created_by on public.threads (created_by);
create index if not exists threads_school on public.threads (school_id);
