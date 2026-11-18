-- P-2 RLS·불변 규칙 시험(불변 1·3·4·5). Supabase SQL 편집기나 MCP execute_sql로 그대로 돌린다.
-- 시험 계정과 줄을 만든 뒤 마지막에 일부러 예외를 내서 **모두 되돌린다**(실제 DB에 아무것도 남지 않음).
-- 결과는 오류 메시지 "RLS_TEST_RESULT ..."에 나온다. 괄호 안이 기대값이고, ...blocked=YES가 막혀야 할 것.
-- 2026-11-18 결과: 26개 모두 기대값(docs/qa.md).
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  p1 uuid; p2 uuid; t1 uuid; c1 uuid; a1 uuid; a2 uuid; n int; ok boolean; msg text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-u1@example.test', '{"provider":"email"}', '{"nickname":"시험하나"}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-u2@example.test', '{"provider":"email"}', '{"nickname":"시험하나"}', now(), now()),
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-adm@example.test', '{"provider":"email"}', '{}', now(), now());
  select count(*) into n from public.profiles where id in (u1,u2,adm); msg := msg || 'profiles_by_trigger=' || n || '(3);';
  select count(distinct nickname) into n from public.profiles where id in (u1,u2); msg := msg || 'dup_nickname_fallback=' || n || '(2);';
  update public.profiles set role = 'admin' where id = adm;

  insert into public.projects (owner_id, kind, name, repo_url) values (u1, 'repo', 'p1', 'https://github.com/x/p1') returning id into p1;
  insert into public.projects (owner_id, kind, name, repo_url) values (u2, 'repo', 'p2', 'https://github.com/x/p2') returning id into p2;
  insert into public.technologies (tech_key, display_name, type, grade) values ('npm:rls-test-pkg', 'rls', 'mcp', 'danger') returning id into t1;
  insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by) values (u1, p1, t1, 'repo', u1);
  insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by) values (u2, p2, t1, 'repo', u2);
  insert into public.runs (trigger, started_by, project_id) values ('first_read', u1, p1);
  insert into public.changes (kind, tech_id, version, cause_id, dedupe_key) values ('grade_to_danger', t1, '1.0.0', 'GHSA-test', 'change:rls-test') returning id into c1;
  insert into public.alerts (user_id, change_id, kind, dedupe_key) values (u1, c1, 'security', 'alert:' || c1) returning id into a1;
  insert into public.alerts (user_id, change_id, kind, dedupe_key) values (u2, c1, 'security', 'alert:' || c1) returning id into a2;
  begin
    insert into public.alerts (user_id, change_id, kind, dedupe_key) values (u1, c1, 'security', 'alert:' || c1);
    msg := msg || 'dup_alert_blocked=NO;';
  exception when unique_violation then msg := msg || 'dup_alert_blocked=YES;';
  end;
  begin  -- 서비스 키처럼 로그인 없이 판단 쓰기(불변 1)
    insert into public.judgments (alert_id, decision, action, judged_by) values (a1, 'candidate', 'candidate_recorded', u1);
    msg := msg || 'service_judgment_blocked=NO;';
  exception when others then msg := msg || 'service_judgment_blocked=YES;';
  end;

  -- 사용자 2로 사용자 1의 데이터 보기(불변 5)
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.profiles where id = u1; msg := msg || 'u2_sees_u1_profile=' || n || '(0);';
  select count(*) into n from public.projects where owner_id = u1; msg := msg || 'u2_sees_u1_projects=' || n || '(0);';
  select count(*) into n from public.my_technologies where owner_id = u1; msg := msg || 'u2_sees_u1_mytech=' || n || '(0);';
  select count(*) into n from public.alerts where user_id = u1; msg := msg || 'u2_sees_u1_alerts=' || n || '(0);';
  select count(*) into n from public.alerts where user_id = u2; msg := msg || 'u2_sees_own_alerts=' || n || '(1);';
  select count(*) into n from public.runs where started_by = u1; msg := msg || 'u2_sees_u1_runs=' || n || '(0);';
  select count(*) into n from public.sources; msg := msg || 'u2_sees_sources=' || n || '(0);';
  select count(*) into n from public.technologies; msg := msg || 'u2_sees_technologies=' || n || '(>=1);';
  begin
    insert into public.projects (owner_id, kind, name, repo_url) values (u1, 'repo', 'evil', 'https://github.com/x/evil');
    msg := msg || 'u2_insert_as_u1_blocked=NO;';
  exception when others then msg := msg || 'u2_insert_as_u1_blocked=YES;';
  end;
  begin
    perform public.save_judgment(a1, 'hold', '남의 알림 판단');
    msg := msg || 'u2_judge_u1_alert_blocked=NO;';
  exception when others then msg := msg || 'u2_judge_u1_alert_blocked=YES;';
  end;
  begin
    update public.profiles set role = 'admin' where id = u2;
    msg := msg || 'u2_self_admin_blocked=NO;';
  exception when others then msg := msg || 'u2_self_admin_blocked=YES;';
  end;
  begin
    update public.alerts set status = 'done' where id = a2;
    get diagnostics n = row_count;
    msg := msg || 'u2_direct_alert_update_rows=' || n || '(blocked);';
  exception when others then msg := msg || 'u2_direct_alert_update_blocked=YES;';
  end;
  execute 'reset role';

  -- 사용자 1: 판단 한 거래(불변 1·4, ADR 0012)
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.changes where id = c1; msg := msg || 'u1_sees_linked_change=' || n || '(1);';
  begin
    perform public.save_judgment(a1, 'candidate', null, null);
    msg := msg || 'candidate_without_fixed_blocked=NO;';
  exception when others then msg := msg || 'candidate_without_fixed_blocked=YES;';
  end;
  begin
    perform public.save_judgment(a1, 'hold', '짧음');
    msg := msg || 'short_reason_blocked=NO;';
  exception when others then msg := msg || 'short_reason_blocked=YES;';
  end;
  select status = 'pending' into ok from public.alerts where id = a1; msg := msg || 'alert_still_pending_after_fail=' || ok || '(true);';
  perform public.save_judgment(a1, 'hold', '지금은 쓰지 않음');
  select msg || 'alert_after_hold=' || status || '(done);' into msg from public.alerts where id = a1;
  begin
    perform public.save_judgment(a1, 'hold', '두 번째 판단 시도');
    msg := msg || 'second_judgment_blocked=NO;';
  exception when others then msg := msg || 'second_judgment_blocked=YES;';
  end;
  execute 'reset role';

  -- 관리자: 전체 읽기, 남의 알림 판단은 못 함(불변 1)
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.projects where owner_id in (u1, u2); msg := msg || 'admin_sees_projects=' || n || '(2);';
  select count(*) into n from public.sources; msg := msg || 'admin_sees_sources=' || n || '(8);';
  begin
    perform public.save_judgment(a2, 'hold', '관리자가 대신 판단');
    msg := msg || 'admin_judge_other_blocked=NO;';
  exception when others then msg := msg || 'admin_judge_other_blocked=YES;';
  end;
  execute 'reset role';

  -- 로그인 안 한 사람
  execute 'set local role anon';
  begin
    select count(*) into n from public.profiles;
    msg := msg || 'anon_profiles_rows=' || n || ';';
  exception when others then msg := msg || 'anon_blocked=YES;';
  end;
  execute 'reset role';

  raise exception 'RLS_TEST_RESULT %', msg;  -- 일부러 실패시켜 위의 모든 줄을 되돌린다
end $$;
