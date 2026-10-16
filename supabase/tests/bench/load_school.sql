-- Scales the demo school up to roughly ZCS size for performance checks:
-- ~1,000 students, ~2,000 guardians, 40 classes, 30 school-wide posts with
-- recipients and deliveries. Fictional data only. Run after the demo seed.
do $$
declare v_school uuid := (select id from public.schools limit 1); v_term uuid := (select id from public.terms limit 1);
  g record; c uuid; s uuid; p1 uuid; p2 uuid; i int; k int; v_teacher uuid; v_post uuid;
begin
  for g in select id, label, row_number() over (order by sort_order) as rn from public.grades where school_id = v_school loop
    for k in 1..4 loop
      insert into public.people (school_id, email, first_name, last_name, honorific, staff_title)
      values (v_school, format('bench.teacher.%s.%s@example.com', g.rn, k), 'Teacher', format('G%sC%s', g.rn, k), 'Ms.', 'Teacher')
      returning id into v_teacher;
      insert into public.classes (school_id, term_id, grade_id, kind, code, name)
      values (v_school, v_term, g.id, 'class', format('B%s%s', g.rn, k), format('%s class %s', g.label, k)) returning id into c;
      insert into public.memberships (school_id, person_id, role, scope_type, scope_id) values (v_school, v_teacher, 'teacher', 'class', c);
      for i in 1..25 loop
        insert into public.students (school_id, sis_id, first_name, last_name, grade_id)
        values (v_school, format('BENCH-%s-%s-%s', g.rn, k, i), (array['Ava','Noah','Mia','Eli','Lucy','Jack','Ella','Owen','Anna','Levi'])[1 + i % 10],
                format('Family%s%s%s', g.rn, k, i), g.id) returning id into s;
        insert into public.enrollments (class_id, student_id) values (c, s);
        insert into public.people (school_id, email, first_name, last_name) values (v_school, format('bench.p1.%s@example.com', s), 'Parent', 'One') returning id into p1;
        insert into public.people (school_id, email, first_name, last_name) values (v_school, format('bench.p2.%s@example.com', s), 'Parent', 'Two') returning id into p2;
        insert into public.guardianships (person_id, student_id) values (p1, s), (p2, s);
      end loop;
    end loop;
  end loop;
  -- 30 school-wide posts already delivered to everyone
  for k in 1..30 loop
    insert into public.posts (school_id, author_id, author_label, audience, audience_label, priority, title, body, status, sent_at)
    values (v_school, (select id from public.people where email = 'rakesh+office@syzygy.services'), 'ZCS Office', '[{"type":"school"}]', 'All families',
            'normal', format('Bench post %s', k), 'Body', 'sent', now() - make_interval(hours => k)) returning id into v_post;
    insert into public.post_recipients (post_id, person_id, context, student_ids)
    select v_post, a.person_id, a.context, a.student_ids from private.resolve_audience(v_school, '[{"type":"school"}]') a;
    insert into public.deliveries (post_id, person_id, channel, status)
    select v_post, person_id, 'push', 'delivered' from public.post_recipients where post_id = v_post;
    insert into public.post_reads (post_id, person_id)
    select v_post, person_id from public.post_recipients where post_id = v_post and random() < 0.7;
  end loop;
end $$;
analyze;
