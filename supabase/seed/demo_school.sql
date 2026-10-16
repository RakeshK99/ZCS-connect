-- ZCS Connect · demo data (fictional people only — never real roster data)
--
-- Creates the school structure for Zeeland Christian School plus a fictional
-- demo roster used for development, the pilot walkthrough and App Store review.
-- Demo sign-ins use plus-addresses of the developer inbox so email codes arrive:
--   rakesh+sarah@syzygy.services   parent (Emma 3rd grade, Noah K)
--   rakesh+jen@syzygy.services     3rd-grade teacher + parent of Lily (6th)
--   rakesh+principal@syzygy.services  Middle School principal
--   rakesh+office@syzygy.services  office communicator + emergency sender
--   rakesh+admin@syzygy.services   district admin
--   rakesh+review@syzygy.services  App Store / Play reviewer (parent)
-- Other fictional guardians use @example.com, which the worker never emails.
-- Remove demo people before importing the real roster: select private.remove_demo_data();

create or replace function private.seed_thread(p_school uuid, p_student uuid, p_a uuid, p_actx public.app_context,
  p_b uuid, p_bctx public.app_context, p_msgs text[][]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_t uuid; i int;
begin
  insert into public.threads (school_id, student_id, created_by) values (p_school, p_student, p_a) returning id into v_t;
  insert into public.thread_participants (thread_id, person_id, context, last_read_at) values
    (v_t, p_a, p_actx, now() - interval '2 hours'), (v_t, p_b, p_bctx, now() - interval '5 days');
  for i in 1..array_length(p_msgs, 1) loop
    insert into public.messages (thread_id, sender_id, body, created_at)
    values (v_t, case when p_msgs[i][1] = 'me' then p_a else p_b end, p_msgs[i][2], now() - p_msgs[i][3]::interval);
  end loop;
  update public.threads set last_message_at = (select max(created_at) from public.messages where thread_id = v_t) where id = v_t;
  return v_t;
end $$;
revoke execute on function private.seed_thread(uuid, uuid, uuid, public.app_context, uuid, public.app_context, text[][]) from authenticated;

-- private.remove_demo_data() (defined in migration 20261011000003) removes all of this before launch.

do $seed$
declare
  v_school uuid; v_pre uuid; v_el uuid; v_ms uuid; v_term uuid;
  g_pk uuid; g_k uuid; g_1 uuid; g_2 uuid; g_3 uuid; g_4 uuid; g_5 uuid; g_6 uuid; g_7 uuid; g_8 uuid;
  c_3s uuid; c_k uuid; c_6b uuid; c_ch uuid;
  p_sarah uuid; p_mark uuid; p_jen uuid; p_devries uuid; p_bakker uuid; p_lubbers uuid; p_kuiper uuid; p_office uuid; p_admin uuid; p_review uuid;
  s_emma uuid; s_noah uuid; s_lily uuid; s_id uuid; p_id uuid;
  last_names text[] := array['Bouwens','DeJonge','Kraker','Mulder','Schipper','Timmer','Vander Ploeg','Haveman','Brink','De Witt',
    'Elzinga','Geurink','Hoekstra','Jansen','Kamps','Lamberts','Meeuwsen','Nienhuis','Overweg','Poel','Rozema','Sterk','Tibbe','Van Til'];
  first_names text[] := array['Ava','Eli','Mason','Lucy','Owen','Grace','Jack','Caleb','Nora','Levi','Ella','Isaac','Ruby','Micah',
    'Lila','Asher','Hazel','Silas','June','Ezra','Claire','Jonah','Maeve'];
  parent_first text[] := array['Kristen','Laura','Tim','Anna','Mark','Rachel','Erin','Dan','Beth','Josh','Amy','Kyle','Megan','Ryan',
    'Sara','Luke','Jenna','Nate','Holly','Ben','Katie','Matt','Leah'];
  pr record; i int; v_post uuid;
begin
  if exists (select 1 from public.schools) then raise notice 'already seeded'; return; end if;

  insert into public.schools (name, short_name, staff_email_domain, office_email)
  values ('Zeeland Christian School', 'ZCS', 'zcs.org', 'rakesh+office@syzygy.services') returning id into v_school;

  insert into public.divisions (school_id, name, sort_order) values (v_school, 'Preschool', 0) returning id into v_pre;
  insert into public.divisions (school_id, name, sort_order) values (v_school, 'Elementary', 1) returning id into v_el;
  insert into public.divisions (school_id, name, sort_order) values (v_school, 'Middle School', 2) returning id into v_ms;

  insert into public.grades (school_id, division_id, label, short_label, aliases, sort_order) values
    (v_school, v_pre, 'Preschool', 'PK', '{3s and 4s,3s & 4s,PS,Pre-K,PreK}', 0) returning id into g_pk;
  insert into public.grades (school_id, division_id, label, short_label, aliases, sort_order) values
    (v_school, v_el, 'Kindergarten', 'K', '{KG,Kinder,0}', 1) returning id into g_k;
  insert into public.grades (school_id, division_id, label, short_label, aliases, sort_order) values
    (v_school, v_el, '1st grade', '1st', '{1,First,Grade 1,Gr 1}', 2) returning id into g_1;
  insert into public.grades (school_id, division_id, label, short_label, aliases, sort_order) values
    (v_school, v_el, '2nd grade', '2nd', '{2,Second,Grade 2,Gr 2}', 3) returning id into g_2;
  insert into public.grades (school_id, division_id, label, short_label, aliases, sort_order) values
    (v_school, v_el, '3rd grade', '3rd', '{3,Third,Grade 3,Gr 3}', 4) returning id into g_3;
  insert into public.grades (school_id, division_id, label, short_label, aliases, sort_order) values
    (v_school, v_el, '4th grade', '4th', '{4,Fourth,Grade 4,Gr 4}', 5) returning id into g_4;
  insert into public.grades (school_id, division_id, label, short_label, aliases, sort_order) values
    (v_school, v_el, '5th grade', '5th', '{5,Fifth,Grade 5,Gr 5}', 6) returning id into g_5;
  insert into public.grades (school_id, division_id, label, short_label, aliases, sort_order) values
    (v_school, v_ms, '6th grade', '6th', '{6,Sixth,Grade 6,Gr 6}', 7) returning id into g_6;
  insert into public.grades (school_id, division_id, label, short_label, aliases, sort_order) values
    (v_school, v_ms, '7th grade', '7th', '{7,Seventh,Grade 7,Gr 7}', 8) returning id into g_7;
  insert into public.grades (school_id, division_id, label, short_label, aliases, sort_order) values
    (v_school, v_ms, '8th grade', '8th', '{8,Eighth,Grade 8,Gr 8}', 9) returning id into g_8;

  insert into public.terms (school_id, name, starts_on, ends_on, is_active)
  values (v_school, '2026–27', '2026-08-26', '2027-06-04', true) returning id into v_term;

  insert into public.classes (school_id, term_id, grade_id, kind, code, name) values
    (v_school, v_term, g_3, 'class', '3S', 'Mrs. Smith''s 3rd Grade') returning id into c_3s;
  insert into public.classes (school_id, term_id, grade_id, kind, code, name) values
    (v_school, v_term, g_k, 'class', 'KD', 'Mrs. De Vries'' Kindergarten') returning id into c_k;
  insert into public.classes (school_id, term_id, grade_id, kind, code, name) values
    (v_school, v_term, g_6, 'class', '6B', 'Mr. Bakker''s 6th Grade') returning id into c_6b;
  insert into public.classes (school_id, term_id, grade_id, kind, code, name) values
    (v_school, v_term, null, 'group', 'CH', 'Thursday Chapel Choir') returning id into c_ch;

  -- staff (demo)
  insert into public.people (school_id, email, first_name, last_name, honorific, staff_title, office_hours) values
    (v_school, 'rakesh+jen@syzygy.services', 'Jennifer', 'Smith', 'Mrs.', '3rd grade teacher',
     'Mrs. Smith usually replies on school days between 7:30 AM and 4:00 PM.') returning id into p_jen;
  insert into public.people (school_id, email, first_name, last_name, honorific, staff_title, office_hours) values
    (v_school, 'adevries@example.com', 'Anna', 'De Vries', 'Mrs.', 'Kindergarten teacher',
     'Mrs. De Vries usually replies on school days between 7:30 AM and 3:30 PM.') returning id into p_devries;
  insert into public.people (school_id, email, first_name, last_name, honorific, staff_title, office_hours) values
    (v_school, 'tbakker@example.com', 'Tom', 'Bakker', 'Mr.', '6th grade teacher',
     'Mr. Bakker usually replies on school days between 7:30 AM and 4:00 PM.') returning id into p_bakker;
  insert into public.people (school_id, email, first_name, last_name, honorific, staff_title, office_hours) values
    (v_school, 'klubbers@example.com', 'Karen', 'Lubbers', 'Mrs.', 'Music',
     'Mrs. Lubbers usually replies on Mondays, Wednesdays and Fridays.') returning id into p_lubbers;
  insert into public.people (school_id, email, first_name, last_name, honorific, staff_title) values
    (v_school, 'rakesh+principal@syzygy.services', 'David', 'Kuiper', 'Mr.', 'Middle School principal') returning id into p_kuiper;
  insert into public.people (school_id, email, first_name, last_name, staff_title) values
    (v_school, 'rakesh+office@syzygy.services', 'Linda', 'Brouwer', 'Office manager') returning id into p_office;
  insert into public.people (school_id, email, first_name, last_name, staff_title) values
    (v_school, 'rakesh+admin@syzygy.services', 'Tom', 'Hoekstra', 'Technology director') returning id into p_admin;

  insert into public.memberships (school_id, person_id, role, scope_type, scope_id) values
    (v_school, p_jen, 'teacher', 'class', c_3s), (v_school, p_jen, 'group_leader', 'class', c_ch),
    (v_school, p_devries, 'teacher', 'class', c_k), (v_school, p_bakker, 'teacher', 'class', c_6b),
    (v_school, p_lubbers, 'aide', 'class', c_3s), (v_school, p_lubbers, 'aide', 'class', c_k),
    (v_school, p_kuiper, 'principal', 'division', v_ms),
    (v_school, p_office, 'office', 'school', null), (v_school, p_office, 'emergency_sender', 'school', null),
    (v_school, p_admin, 'admin', 'school', null);

  -- persona families
  insert into public.people (school_id, email, first_name, last_name) values
    (v_school, 'rakesh+sarah@syzygy.services', 'Sarah', 'VanDyke') returning id into p_sarah;
  insert into public.people (school_id, email, first_name, last_name) values
    (v_school, 'mark.vandyke@example.com', 'Mark', 'VanDyke') returning id into p_mark;
  insert into public.people (school_id, email, first_name, last_name) values
    (v_school, 'rakesh+review@syzygy.services', 'Riley', 'Reviewer') returning id into p_review;

  insert into public.students (school_id, sis_id, first_name, last_name, grade_id) values
    (v_school, 'DEMO-0001', 'Emma', 'VanDyke', g_3) returning id into s_emma;
  insert into public.students (school_id, sis_id, first_name, last_name, grade_id) values
    (v_school, 'DEMO-0002', 'Noah', 'VanDyke', g_k) returning id into s_noah;
  insert into public.students (school_id, sis_id, first_name, last_name, grade_id) values
    (v_school, 'DEMO-0003', 'Lily', 'Smith', g_6) returning id into s_lily;
  insert into public.enrollments values (c_3s, s_emma), (c_k, s_noah), (c_6b, s_lily), (c_ch, s_emma);
  insert into public.guardianships (person_id, student_id, relationship) values
    (p_sarah, s_emma, 'mother'), (p_sarah, s_noah, 'mother'), (p_mark, s_emma, 'father'), (p_mark, s_noah, 'father'),
    (p_jen, s_lily, 'mother'), (p_review, s_emma, 'guardian');

  -- 23 more 3S students (24 total), a few K and 6th graders, all fictional
  for i in 1..23 loop
    insert into public.students (school_id, sis_id, first_name, last_name, grade_id)
    values (v_school, 'DEMO-' || lpad((100 + i)::text, 4, '0'), first_names[i], last_names[i], g_3) returning id into s_id;
    insert into public.enrollments values (c_3s, s_id);
    if i <= 17 then insert into public.enrollments values (c_ch, s_id); end if;
    insert into public.people (school_id, email, first_name, last_name)
    values (v_school, lower(replace(parent_first[i] || '.' || last_names[i], ' ', '')) || '@example.com', parent_first[i], last_names[i])
    returning id into p_id;
    insert into public.guardianships (person_id, student_id, relationship, hide_contact) values (p_id, s_id, 'guardian', i = 4);
  end loop;
  for i in 1..10 loop
    insert into public.students (school_id, sis_id, first_name, last_name, grade_id)
    values (v_school, 'DEMO-' || lpad((200 + i)::text, 4, '0'), first_names[24 - i], last_names[i], g_k) returning id into s_id;
    insert into public.enrollments values (c_k, s_id);
    insert into public.guardianships (person_id, student_id)
    select id, s_id from public.people where email = lower(replace(parent_first[i] || '.' || last_names[i], ' ', '')) || '@example.com';
    insert into public.students (school_id, sis_id, first_name, last_name, grade_id)
    values (v_school, 'DEMO-' || lpad((300 + i)::text, 4, '0'), first_names[i + 5], last_names[24 - i], g_6) returning id into s_id;
    insert into public.enrollments values (c_6b, s_id);
  end loop;

  -- posts (sent in the past; recipients resolved like a real send, deliveries simulated)
  for pr in select * from (values
    ('Snow day — school closed today', 'All Zeeland Christian School buildings are closed today because of snow and ice on the roads. Extended care is also closed. Stay warm, and we''ll see everyone tomorrow.', 'emergency', '[{"type":"school"}]', p_office, false, interval '3 hours'),
    ('Early dismissal Friday at 12:30', 'Students will be dismissed at 12:30 PM on Friday, October 23, so teachers can prepare for Partnership Night. Buses will run on the 12:30 schedule, and extended care is open until 6:00 PM. Lunch will be served as usual.', 'important', '[{"type":"school"}]', p_office, true, interval '1 day'),
    ('3rd grade field trip photos!', 'What a morning at the Outdoor Discovery Center! The class learned to identify tree leaves and found three kinds of mushrooms on the trail. Thank you to our parent drivers.', 'normal', '__3S__', p_jen, true, interval '2 hours'),
    ('Partnership Night is Oct 23', 'Join us Friday, October 23 from 6:30 to 8:00 PM for Partnership Night. Visit your child''s classroom, meet their teachers and see the work they''re proud of.', 'normal', '[{"type":"school"}]', p_office, false, interval '1 day 2 hours'),
    ('Pumpkin patch on Thursday', 'We''re visiting the pumpkin patch Thursday morning. Please send boots and a warm coat. We''ll be back before lunch.', 'normal', '__KD__', p_devries, false, interval '1 day 4 hours'),
    ('Science fair projects due Nov 6', 'Science fair projects are due Friday, November 6. Students have the project guide in their binders.', 'normal', '__6B__', p_bakker, false, interval '4 days'),
    ('Middle School chapel moves to the gym', 'Starting next week, Wednesday chapel meets in the gym at 8:15 AM. Families are welcome to join us.', 'normal', '__MS__', p_kuiper, false, interval '5 days')
  ) as t(title, body, priority, aud, author, ack, ago) loop
    insert into public.posts (school_id, author_id, author_label, audience, audience_label, priority, title, body, require_ack, status, sent_at, pinned_until)
    select v_school, pr.author,
      case when pr.author = p_office then 'ZCS Office' else (select private.staff_name(p) from public.people p where p.id = pr.author) end,
      a.aud, private.audience_label(a.aud), pr.priority::public.post_priority, pr.title, pr.body, pr.ack, 'sent', now() - pr.ago,
      case when pr.priority <> 'normal' then now() - pr.ago + interval '7 days' end
    from (select case pr.aud when '__3S__' then jsonb_build_array(jsonb_build_object('type','class','id',c_3s))
                             when '__KD__' then jsonb_build_array(jsonb_build_object('type','class','id',c_k))
                             when '__6B__' then jsonb_build_array(jsonb_build_object('type','class','id',c_6b))
                             when '__MS__' then jsonb_build_array(jsonb_build_object('type','division','id',v_ms))
                             else pr.aud::jsonb end as aud) a
    returning id into v_post;
    insert into public.post_recipients (post_id, person_id, context, student_ids, resolved_at)
    select v_post, r.person_id, r.context, r.student_ids, now() - pr.ago
    from private.resolve_audience(v_school, (select audience from public.posts where id = v_post)) r where r.person_id <> pr.author;
    insert into public.deliveries (post_id, person_id, channel, status, detail, created_at)
    select v_post, r.person_id, case when abs(hashtext(r.person_id::text)) % 10 = 0 then 'email' else 'push' end::public.delivery_channel,
           'delivered', 'seed', now() - pr.ago + interval '20 seconds'
    from public.post_recipients r where r.post_id = v_post and abs(hashtext(r.person_id::text || 'x')) % 24 <> 0;
    insert into public.post_reads (post_id, person_id, read_at)
    select v_post, r.person_id, now() - pr.ago + interval '30 minutes'
    from public.post_recipients r where r.post_id = v_post and abs(hashtext(r.person_id::text || v_post::text)) % 4 <> 0
      and r.person_id not in (p_sarah, p_jen, p_review);
  end loop;

  -- conversations
  perform private.seed_thread(v_school, s_emma, p_sarah, 'parent', p_jen, 'staff', array[
    ['me','Hi Mrs. Smith, Emma has a dentist appointment Thursday at 1:00. I''ll pick her up from the office at 12:45.','2 days'],
    ['them','Thanks for letting me know! I''ll send her spelling packet home Wednesday.','80 minutes'],
    ['them','She can finish the reading log over the weekend.','70 minutes']]);
  perform private.seed_thread(v_school, s_emma, p_sarah, 'parent', p_lubbers, 'staff', array[
    ['them','Emma did a lovely job on her recorder solo today. She should be proud!','3 days'],
    ['me','Thank you! She practiced all week.','3 days -1 hour']]);
  perform private.seed_thread(v_school, s_noah, p_sarah, 'parent', p_devries, 'staff', array[
    ['them','Noah lost his first tooth at recess! It''s in an envelope in his backpack.','1 day'],
    ['me','How fun, thank you for saving it!','23 hours']]);
  perform private.seed_thread(v_school, s_lily, p_jen, 'parent', p_bakker, 'staff', array[
    ['them','Lily asked a great question about volcanoes for her science fair project. I sent her some extra reading.','4 days']]);
  select g.person_id, g.student_id into pr from public.guardianships g join public.students s on s.id = g.student_id
    where s.last_name = 'Schipper' limit 1;
  perform private.seed_thread(v_school, pr.student_id, pr.person_id, 'parent', p_jen, 'staff', array[
    ['me','Owen''s grandma will pick him up on Wednesday.','2 days']]);
  select g.person_id, g.student_id into pr from public.guardianships g join public.students s on s.id = g.student_id
    where s.last_name = 'Timmer' limit 1;
  perform private.seed_thread(v_school, pr.student_id, pr.person_id, 'parent', p_jen, 'staff', array[
    ['me','Could Grace sit closer to the board? She mentioned it''s hard to see.','4 days']]);

  -- academic calendar (fictional dates until ZCS confirms the 2026–27 calendar)
  insert into public.calendar_events (school_id, title, starts_on, ends_on, start_time, end_time, location, no_school) values
    (v_school, 'First day of school', '2026-08-26', null, null, null, null, false),
    (v_school, 'No school · Labor Day', '2026-09-07', null, null, null, null, true),
    (v_school, 'Fall picture day', '2026-10-02', null, null, null, null, false),
    (v_school, 'No school · Fall break', '2026-10-09', null, null, null, null, true),
    (v_school, '3rd grade field trip', '2026-10-19', null, '09:00', '12:00', 'Outdoor Discovery Center', false),
    (v_school, 'Picture retakes', '2026-10-22', null, '08:30', null, null, false),
    (v_school, 'Early dismissal', '2026-10-23', null, '12:30', null, null, false),
    (v_school, 'Partnership Night', '2026-10-23', null, '18:30', '20:00', null, false),
    (v_school, 'All-school chapel', '2026-10-28', null, '08:15', null, 'Gym', false),
    (v_school, 'No school · Teacher in-service', '2026-10-30', null, null, null, null, true),
    (v_school, 'Science fair projects due', '2026-11-06', null, null, null, null, false),
    (v_school, 'Fall Growth Conversations', '2026-11-17', '2026-11-19', null, null, null, false),
    (v_school, 'No school · Thanksgiving break', '2026-11-25', '2026-11-27', null, null, null, true),
    (v_school, 'Christmas program', '2026-12-17', null, '19:00', '20:30', 'Gym', false),
    (v_school, 'No school · Christmas break', '2026-12-21', '2027-01-01', null, null, null, true);
end $seed$;
