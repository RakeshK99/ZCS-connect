-- ZCS Connect · advisor fixes
-- Pin search_path on the small immutable helpers flagged by the security advisor.
-- Note: the advisor also lists every public RPC as "SECURITY DEFINER executable by
-- authenticated". That is intentional: each RPC checks permissions itself and is
-- covered by supabase/tests/permissions_test.sql. `deliveries` has RLS with no
-- policies on purpose (only post_reach() and the worker read it).
alter function private.staff_name(public.people) set search_path = '';
alter function private.student_name(public.students) set search_path = '';
alter function private.relationship_label(text) set search_path = '';
