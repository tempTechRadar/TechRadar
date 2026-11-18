-- P-3 내 버전 등급 칸 시험. rls_m0.sql과 같은 방식: 끝에서 일부러 예외를 내 모두 되돌린다(실제 DB에 아무것도 남지 않음).
-- 기대: 같은 기술의 두 버전이 각자 등급을 가짐, 사용자는 등급을 못 고치고 숨김은 고칠 수 있음.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  p1 uuid; p2 uuid; t1 uuid; m1 uuid; n int; g text; msg text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p3-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p3-u2@example.test', '{"provider":"email"}', '{}', now(), now());
  insert into public.projects (owner_id, kind, name, repo_url) values (u1, 'repo', 'p1', 'https://github.com/x/p3a') returning id into p1;
  insert into public.projects (owner_id, kind, name, repo_url) values (u2, 'repo', 'p2', 'https://github.com/x/p3b') returning id into p2;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p3-test-pkg', 'p3', 'mcp') returning id into t1;
  insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by, version, grade)
    values (u1, p1, t1, 'repo', u1, '0.1.15', 'danger') returning id into m1;
  insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by, version, grade)
    values (u2, p2, t1, 'repo', u2, '0.1.16', 'unknown');
  select count(distinct grade) into n from public.my_technologies where tech_id = t1; msg := msg || 'two_versions_two_grades=' || n || '(2);';

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.my_technologies set grade = 'pass' where id = m1;
    msg := msg || 'user_edit_grade_blocked=NO;';
  exception when others then msg := msg || 'user_edit_grade_blocked=YES;';
  end;
  update public.my_technologies set hidden_at = now() where id = m1;
  get diagnostics n = row_count; msg := msg || 'user_hide_own=' || n || '(1);';
  execute 'reset role';
  select grade into g from public.my_technologies where id = m1; msg := msg || 'grade_kept=' || g || '(danger);';

  raise exception 'P3_TEST_RESULT %', msg;  -- 일부러 실패시켜 위의 모든 줄을 되돌린다
end $$;
