-- P-30 RLS 시험(불변 5). rls_m0.sql과 같은 방식: 시험 줄을 만들고 끝에서 일부러 예외를 내 **모두 되돌린다**.
-- 결과는 오류 메시지 "RLS_M1_RESULT ..."에 나온다. 괄호 안이 기대값, ...blocked=YES가 막혀야 할 것.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  ta uuid; tb uuid; rel uuid; c1 uuid; a1 uuid; n int; msg text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm1-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm1-u2@example.test', '{"provider":"email"}', '{}', now(), now()),
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm1-adm@example.test', '{"provider":"email"}', '{}', now(), now());
  update public.profiles set role = 'admin' where id = adm;

  insert into public.technologies (tech_key, display_name, type) values ('npm:m1-a', 'a', 'mcp') returning id into ta;
  insert into public.technologies (tech_key, display_name, type) values ('npm:m1-b', 'b', 'mcp') returning id into tb;
  insert into public.tech_relations (tech_a, tech_b, made_by) values (least(ta, tb), greatest(ta, tb), 'seed') returning id into rel;
  begin
    insert into public.tech_relations (tech_a, tech_b, made_by) values (greatest(ta, tb), least(ta, tb), 'seed');
    msg := msg || 'reversed_pair_blocked=NO;';
  exception when check_violation then msg := msg || 'reversed_pair_blocked=YES;';
  end;
  insert into public.changes (kind, tech_id, cause_id, dedupe_key) values ('grade_to_danger', ta, 'GHSA-m1', 'change:m1-test') returning id into c1;
  insert into public.alerts (user_id, change_id, kind, dedupe_key) values (u1, c1, 'security', 'alert:m1') returning id into a1;
  insert into public.scenarios (alert_id, requested_by) values (a1, u1);
  insert into public.exports (user_id, kind, tech_count) values (u1, 'install_prompt', 3);
  insert into public.grade_views (user_id, tech_id) values (u1, ta);
  insert into public.ai_calls (purpose, user_id, input_hash, status) values ('draft', u1, 'h1', 'succeeded');
  insert into public.chat_logs (user_id, question, answer) values (adm, 'q', 'a');
  select count(*) into n from public.rule_lists where kind = 'allow_package'; msg := msg || 'seed_allow_packages=' || n || '(28);';

  -- 사용자 2: 남의 줄 0건, 관리자 전용 표 0건, 쓰기 막힘
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.scenarios; msg := msg || 'u2_sees_scenarios=' || n || '(0);';
  select count(*) into n from public.exports; msg := msg || 'u2_sees_exports=' || n || '(0);';
  select count(*) into n from public.grade_views; msg := msg || 'u2_sees_grade_views=' || n || '(0);';
  select count(*) into n from public.rule_lists; msg := msg || 'u2_sees_rule_lists=' || n || '(0);';
  select count(*) into n from public.ai_calls; msg := msg || 'u2_sees_ai_calls=' || n || '(0);';
  select count(*) into n from public.chat_logs; msg := msg || 'u2_sees_chat_logs=' || n || '(0);';
  select count(*) into n from public.tech_relations where id = rel; msg := msg || 'u2_sees_relations=' || n || '(1);';
  begin
    insert into public.scenarios (alert_id, requested_by) values (a1, u2);
    msg := msg || 'u2_scenario_on_u1_alert_blocked=NO;';
  exception when others then msg := msg || 'u2_scenario_on_u1_alert_blocked=YES;';
  end;
  begin
    insert into public.grade_views (user_id, tech_id) values (u1, ta);
    msg := msg || 'u2_grade_view_as_u1_blocked=NO;';
  exception when others then msg := msg || 'u2_grade_view_as_u1_blocked=YES;';
  end;
  begin
    update public.tech_relations set status = 'confirmed', confirmed_by = u2, confirmed_at = now() where id = rel;
    get diagnostics n = row_count; msg := msg || 'u2_confirm_relation_rows=' || n || '(0);';
  exception when others then msg := msg || 'u2_confirm_relation_blocked=YES;';
  end;
  begin
    insert into public.rule_lists (kind, ecosystem, value, updated_by) values ('allow_package', 'npm', 'evil', u2);
    msg := msg || 'u2_rule_insert_blocked=NO;';
  exception when others then msg := msg || 'u2_rule_insert_blocked=YES;';
  end;
  insert into public.grade_views (user_id, tech_id) values (u2, ta);
  get diagnostics n = row_count; msg := msg || 'u2_own_grade_view=' || n || '(1);';
  execute 'reset role';

  -- 사용자 1: 본인 알림에 시나리오 요청은 되고, 결과(상태)는 못 고침
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.scenarios (alert_id, requested_by) values (a1, u1);
  get diagnostics n = row_count; msg := msg || 'u1_scenario_own_alert=' || n || '(1);';
  begin  -- 요청만 하고 본문은 서버가 쓴다(202611181730 마이그레이션)
    insert into public.scenarios (alert_id, requested_by, body) values (a1, u1, '{"fake": true}');
    msg := msg || 'u1_scenario_with_body_blocked=NO;';
  exception when others then msg := msg || 'u1_scenario_with_body_blocked=YES;';
  end;
  begin
    update public.scenarios set status = 'done' where alert_id = a1;
    get diagnostics n = row_count; msg := msg || 'u1_scenario_status_rows=' || n || '(blocked);';
  exception when others then msg := msg || 'u1_scenario_status_blocked=YES;';
  end;
  execute 'reset role';

  -- 관리자: 관계 확정(상태 칸만), 관계 이름 바꾸기 막힘, 목록 고치기
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.tech_relations set status = 'confirmed', confirmed_by = adm, confirmed_at = now() where id = rel;
  get diagnostics n = row_count; msg := msg || 'admin_confirm_relation=' || n || '(1);';
  begin
    update public.tech_relations set quote = '바꿈' where id = rel;
    msg := msg || 'admin_edit_quote_blocked=NO;';
  exception when others then msg := msg || 'admin_edit_quote_blocked=YES;';
  end;
  insert into public.rule_lists (kind, ecosystem, value, updated_by) values ('allow_package', 'npm', 'm1-test-pkg', adm);
  get diagnostics n = row_count; msg := msg || 'admin_rule_insert=' || n || '(1);';
  select count(*) into n from public.ai_calls where user_id = u1; msg := msg || 'admin_sees_ai_calls=' || n || '(1);';
  select count(*) into n from public.scenarios where alert_id = a1; msg := msg || 'admin_sees_scenarios=' || n || '(2);';
  begin
    delete from public.grade_views where user_id = u1;
    get diagnostics n = row_count; msg := msg || 'admin_delete_rows=' || n || '(blocked);';
  exception when others then msg := msg || 'admin_delete_blocked=YES;';
  end;
  execute 'reset role';

  -- 로그인 안 한 사람
  execute 'set local role anon';
  begin
    select count(*) into n from public.tech_relations;
    msg := msg || 'anon_relations_rows=' || n || ';';
  exception when others then msg := msg || 'anon_blocked=YES;';
  end;
  execute 'reset role';

  raise exception 'RLS_M1_RESULT %', msg;  -- 일부러 실패시켜 위의 모든 줄을 되돌린다
end $$;
