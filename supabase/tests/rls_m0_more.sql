-- P-2 남은 테이블의 "남의 줄" 시험(불변 5): run_steps · observations · audit_logs · categories.
--
-- 실행 방법: 운영 Supabase(techradar)의 SQL 편집기에 이 파일 전체를 붙여 넣고 실행한다(또는 MCP execute_sql로 그대로).
--   **운영 DB에 시험 계정·줄을 실제로 쓰고, 마지막에 일부러 예외를 내서 트랜잭션 전체를 되돌린다(ROLLBACK).** 끝나면 아무것도 남지 않는다.
--   운영에 쓰는 일이라 돌리기 전에 사용자 승인을 받는다. 다른 SQL 시험(rls_m0.sql 등)과 동시에 돌리지 않는다.
-- 결과 읽기: 실행은 "오류"로 끝나는 것이 정상이다. 오류 메시지 "RLS_MORE_RESULT ..."에 항목=실제값(기대값)이 줄지어 나온다.
--   괄호 안이 기대값이고, ...blocked=YES가 막혀야 할 것. 돌린 뒤 결과를 docs/qa.md에 적는다.
-- 정책 근거: supabase/migrations/202611181400_P-2_m0_tables.sql 의 "runs · run_steps"·"observations · changes"·"audit_logs"·"technologies · categories" 정책.
-- 시험 대상 규칙: run_steps = 본인이 시작한 처음·다시 읽기의 단계만, observations = 본인 알림에 이어진 것만,
-- audit_logs = 본인 줄만, categories = 로그인한 사람 모두 읽기. 관리자는 앞의 셋을 모두 읽는다. 쓰기·고치기·지우기는 모두 서버만.
-- 2026-11-19 작성(Claude, 옛 worktree night-rls-more에 커밋 안 된 채 있었음). 2026-11-21 운영 스키마와 대조(I-final-bugs):
--   칸 이름·필수 칸·허용 값(trigger·status·kind·actor_role)·정책 식 모두 일치. 시험 계정 이메일만 rls_m0.sql과 겹치지 않게 바꿈. **아직 실행하지 않았다.**
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  p1 uuid; t1 uuid; src uuid;
  r1 uuid; r2 uuid; r3 uuid; o1 uuid; o2 uuid; o3 uuid; c1 uuid; c2 uuid; a1 uuid; a2 uuid;
  n int; msg text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-more-u1@example.test', '{"provider":"email"}', '{"nickname":"시험하나"}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-more-u2@example.test', '{"provider":"email"}', '{"nickname":"시험하나"}', now(), now()),
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-more-adm@example.test', '{"provider":"email"}', '{}', now(), now());
  update public.profiles set role = 'admin' where id = adm;

  select id into src from public.sources where name = 'osv';
  insert into public.technologies (tech_key, display_name, type, grade) values ('npm:rls-more-pkg', 'rls', 'mcp', 'danger') returning id into t1;
  insert into public.projects (owner_id, kind, name, repo_url) values (u1, 'repo', 'p1', 'https://github.com/x/more1') returning id into p1;

  -- 실행 기록: r1 = 사용자 1의 처음 읽기, r2 = 사용자 2의 다시 읽기, r3 = 예약 실행(시작한 사람 없음)
  insert into public.runs (trigger, started_by, project_id) values ('first_read', u1, p1) returning id into r1;
  insert into public.runs (trigger, started_by) values ('user_reread', u2) returning id into r2;
  insert into public.runs (trigger) values ('schedule') returning id into r3;
  insert into public.run_steps (run_id, step_name, status) values (r1, 'fetch_repo', 'succeeded'), (r2, 'fetch_repo', 'succeeded'), (r3, 'fetch_osv', 'succeeded');

  -- 수집 자료: o1은 사용자 1의 알림에, o2는 사용자 2의 알림에 이어지고, o3은 어느 알림에도 이어지지 않는다
  insert into public.observations (source_id, tech_id, metric, run_id, observed_at) values (src, t1, 'rls-more', r1, now()) returning id into o1;
  insert into public.observations (source_id, tech_id, metric, run_id, observed_at) values (src, t1, 'rls-more', r2, now()) returning id into o2;
  insert into public.observations (source_id, tech_id, metric, run_id, observed_at) values (src, t1, 'rls-more', r3, now()) returning id into o3;
  insert into public.changes (kind, tech_id, version, cause_id, dedupe_key, observation_id) values ('grade_to_danger', t1, '1.0.0', 'GHSA-more-1', 'change:rls-more-1', o1) returning id into c1;
  insert into public.changes (kind, tech_id, version, cause_id, dedupe_key, observation_id) values ('grade_to_danger', t1, '2.0.0', 'GHSA-more-2', 'change:rls-more-2', o2) returning id into c2;
  insert into public.alerts (user_id, change_id, kind, dedupe_key) values (u1, c1, 'security', 'alert:' || c1) returning id into a1;
  insert into public.alerts (user_id, change_id, kind, dedupe_key) values (u2, c2, 'security', 'alert:' || c2) returning id into a2;

  -- 바꾼 기록과 분류: 사용자 1·2의 줄과 서버가 쓴 줄(행위자 없음)
  insert into public.audit_logs (actor_id, actor_role, action, target_table, target_id) values
    (u1, 'user', 'rls_more', 'projects', 'u1'), (u2, 'user', 'rls_more', 'projects', 'u2'), (null, 'server', 'rls_more', 'runs', 'server');
  insert into public.categories (name) values ('rls-more-category');

  -- 사용자 2로 사용자 1의 데이터 보기(불변 5)
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.run_steps where run_id = r1; msg := msg || 'u2_sees_u1_run_steps=' || n || '(0);';
  select count(*) into n from public.run_steps where run_id = r2; msg := msg || 'u2_sees_own_run_steps=' || n || '(1);';
  select count(*) into n from public.run_steps where run_id = r3; msg := msg || 'u2_sees_schedule_run_steps=' || n || '(0);';
  select count(*) into n from public.observations where id = o1; msg := msg || 'u2_sees_u1_observation=' || n || '(0);';
  select count(*) into n from public.observations where id = o2; msg := msg || 'u2_sees_own_observation=' || n || '(1);';
  select count(*) into n from public.observations where id = o3; msg := msg || 'u2_sees_unlinked_observation=' || n || '(0);';
  select count(*) into n from public.audit_logs where action = 'rls_more' and actor_id = u1; msg := msg || 'u2_sees_u1_audit=' || n || '(0);';
  select count(*) into n from public.audit_logs where action = 'rls_more' and actor_id = u2; msg := msg || 'u2_sees_own_audit=' || n || '(1);';
  select count(*) into n from public.audit_logs where action = 'rls_more' and actor_id is null; msg := msg || 'u2_sees_server_audit=' || n || '(0);';
  select count(*) into n from public.categories where name = 'rls-more-category'; msg := msg || 'u2_sees_categories=' || n || '(1);';
  begin
    insert into public.run_steps (run_id, step_name, status) values (r2, 'forged', 'succeeded');
    msg := msg || 'u2_insert_run_steps_blocked=NO;';
  exception when others then msg := msg || 'u2_insert_run_steps_blocked=YES;';
  end;
  begin
    insert into public.observations (source_id, tech_id, metric, run_id, observed_at) values (src, t1, 'forged', r2, now());
    msg := msg || 'u2_insert_observations_blocked=NO;';
  exception when others then msg := msg || 'u2_insert_observations_blocked=YES;';
  end;
  begin
    insert into public.audit_logs (actor_id, actor_role, action, target_table, target_id) values (u2, 'user', 'forged', 'projects', 'u2');
    msg := msg || 'u2_insert_audit_blocked=NO;';
  exception when others then msg := msg || 'u2_insert_audit_blocked=YES;';
  end;
  begin
    update public.audit_logs set reason = 'edited' where action = 'rls_more' and actor_id = u2;
    msg := msg || 'u2_update_audit_blocked=NO;';
  exception when others then msg := msg || 'u2_update_audit_blocked=YES;';
  end;
  begin
    delete from public.audit_logs where action = 'rls_more' and actor_id = u2;
    msg := msg || 'u2_delete_audit_blocked=NO;';
  exception when others then msg := msg || 'u2_delete_audit_blocked=YES;';
  end;
  begin
    insert into public.categories (name) values ('forged-category');
    msg := msg || 'u2_insert_categories_blocked=NO;';
  exception when others then msg := msg || 'u2_insert_categories_blocked=YES;';
  end;
  execute 'reset role';

  -- 사용자 1은 자기 것만
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.run_steps where run_id = r1; msg := msg || 'u1_sees_own_run_steps=' || n || '(1);';
  select count(*) into n from public.run_steps where run_id in (r2, r3); msg := msg || 'u1_sees_others_run_steps=' || n || '(0);';
  select count(*) into n from public.observations where id = o1; msg := msg || 'u1_sees_own_observation=' || n || '(1);';
  select count(*) into n from public.observations where id in (o2, o3); msg := msg || 'u1_sees_others_observations=' || n || '(0);';
  select count(*) into n from public.audit_logs where action = 'rls_more'; msg := msg || 'u1_sees_audit_rows=' || n || '(1);';
  execute 'reset role';

  -- 관리자: 앞의 셋은 전부 읽는다
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.run_steps where run_id in (r1, r2, r3); msg := msg || 'admin_sees_run_steps=' || n || '(3);';
  select count(*) into n from public.observations where id in (o1, o2, o3); msg := msg || 'admin_sees_observations=' || n || '(3);';
  select count(*) into n from public.audit_logs where action = 'rls_more'; msg := msg || 'admin_sees_audit=' || n || '(3);';
  select count(*) into n from public.categories where name = 'rls-more-category'; msg := msg || 'admin_sees_categories=' || n || '(1);';
  execute 'reset role';

  -- 로그인 안 한 사람: 0줄이거나 막힘
  execute 'set local role anon';
  begin
    select count(*) into n from public.run_steps; msg := msg || 'anon_run_steps_rows=' || n || '(0 or blocked);';
  exception when others then msg := msg || 'anon_run_steps_blocked=YES;';
  end;
  begin
    select count(*) into n from public.observations; msg := msg || 'anon_observations_rows=' || n || '(0 or blocked);';
  exception when others then msg := msg || 'anon_observations_blocked=YES;';
  end;
  begin
    select count(*) into n from public.audit_logs; msg := msg || 'anon_audit_rows=' || n || '(0 or blocked);';
  exception when others then msg := msg || 'anon_audit_blocked=YES;';
  end;
  begin
    select count(*) into n from public.categories; msg := msg || 'anon_categories_rows=' || n || '(0 or blocked);';
  exception when others then msg := msg || 'anon_categories_blocked=YES;';
  end;
  execute 'reset role';

  raise exception 'RLS_MORE_RESULT %', msg;  -- 일부러 실패시켜 위의 모든 줄을 되돌린다
end $$;
