-- P-11 내 기술 insert 제한 시험(열 grant + origin 정책). rls_m0.sql과 같은 방식: 끝에서 일부러 예외를 내 모두 되돌린다(실제 DB에 아무것도 남지 않음).
-- 기대: 사용자는 쓰는 7칸으로 본인 프로젝트에 manual·import 줄을 넣을 수 있고, 서버 칸 13개·origin repo·남의 프로젝트는 막힌다. 서버(service_role)는 모든 칸을 그대로 쓴다.
-- 막힘은 insufficient_privilege(열 권한·행 정책 모두 이 오류)만 "막힘"으로 센다. 다른 오류(중복 키 등)는 시험을 멈춰 눈에 띄게 한다.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  p1 uuid; p2 uuid; t1 uuid; n int; c text; blocked int := 0; open_cols text := ''; msg text := '';
  -- 사용자가 채우면 안 되는 칸과 넣어 보는 값(이름|값). id·created_at은 기본값이 있어도 사용자가 정하면 안 된다
  server_cols text[] := array[
    'grade|''pass''', 'grade_reason|''x''', 'grade_evidence|''[]''::jsonb', 'grade_rule_version|''x''', 'graded_at|now()',
    'last_checked_ok_at|now()', 'read_at|now()', 'source_file|''package.json''', 'collect_error_kind|''parse''',
    'unknown_origin|true', 'hidden_at|now()', 'created_at|now()', 'id|gen_random_uuid()'];
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p11-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p11-u2@example.test', '{"provider":"email"}', '{}', now(), now());
  insert into public.projects (owner_id, kind, name, repo_url) values (u1, 'repo', 'p1', 'https://github.com/x/p11a') returning id into p1;
  insert into public.projects (owner_id, kind, name, repo_url) values (u2, 'repo', 'p2', 'https://github.com/x/p11b') returning id into p2;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p11-test-pkg', 'p11', 'mcp') returning id into t1;

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.my_technologies (owner_id, added_by, project_id, tech_id, origin, version) values (u1, u1, p1, t1, 'manual', '1.0.0');
  get diagnostics n = row_count; msg := msg || 'user_insert_own_7cols=' || n || '(1);';
  insert into public.my_technologies (owner_id, added_by, project_id, manual_name, origin) values (u1, u1, p1, 'p11-name', 'import');
  get diagnostics n = row_count; msg := msg || 'user_insert_import_origin=' || n || '(1);';

  foreach c in array server_cols loop
    begin
      execute format('insert into public.my_technologies (owner_id, added_by, project_id, manual_name, origin, %I) values (%L, %L, %L, %L, %L, %s)',
        split_part(c, '|', 1), u1, u1, p1, 'p11-' || split_part(c, '|', 1), 'manual', split_part(c, '|', 2));
      open_cols := open_cols || split_part(c, '|', 1) || ',';
    exception when insufficient_privilege then blocked := blocked + 1;
    end;
  end loop;
  msg := msg || 'user_insert_server_columns_blocked=' || blocked || '(' || array_length(server_cols, 1) || ')' || case when open_cols = '' then '' else ' OPEN:' || open_cols end || ';';

  begin
    insert into public.my_technologies (owner_id, added_by, project_id, manual_name, origin) values (u1, u1, p1, 'p11-repo', 'repo');
    msg := msg || 'user_insert_origin_repo_blocked=NO;';
  exception when insufficient_privilege then msg := msg || 'user_insert_origin_repo_blocked=YES;';
  end;
  begin
    insert into public.my_technologies (owner_id, added_by, project_id, manual_name, origin) values (u1, u1, p2, 'p11-other', 'manual');
    msg := msg || 'user_insert_other_project_blocked=NO;';
  exception when insufficient_privilege then msg := msg || 'user_insert_other_project_blocked=YES;';
  end;

  execute 'reset role';
  select count(*) into n from public.my_technologies where owner_id = u1; msg := msg || 'rows_kept_for_u1=' || n || '(2);';

  -- 서버 연결은 제한 밖이어야 한다(저장소 읽기가 등급·읽은 결과를 함께 넣는다). 관리자 세션이 아니라 service_role로 시험한다
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  insert into public.my_technologies (owner_id, added_by, project_id, manual_name, origin, source_file, read_at, grade)
    values (u1, u1, p1, 'p11-server', 'repo', 'package.json', now(), 'danger');
  get diagnostics n = row_count; msg := msg || 'service_insert_all_columns=' || n || '(1);';
  execute 'reset role';

  raise exception 'P11_TEST_RESULT %', msg;  -- 일부러 실패시켜 위의 모든 줄을 되돌린다
end $$;
