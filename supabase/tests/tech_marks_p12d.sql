-- P-12d-marks 시험(불변 3·4·5, ADR 0012·0028). rls_m1.sql과 같은 방식: 시험 줄을 만들고 끝에서 일부러 예외를 내 **모두 되돌린다**.
-- 결과는 오류 메시지 "TECH_MARKS_RESULT ..."에 나온다. 괄호 안이 기대값, ...blocked=YES가 막혀야 할 것.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  ta uuid; tb uuid; tc uuid; c1 uuid; c2 uuid; a_sec uuid; a_opp uuid; n int; st text; msg text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tm-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tm-u2@example.test', '{"provider":"email"}', '{}', now(), now()),
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tm-adm@example.test', '{"provider":"email"}', '{}', now(), now());
  update public.profiles set role = 'admin' where id = adm;
  insert into public.technologies (tech_key, display_name, type) values ('npm:tm-a', 'a', 'mcp') returning id into ta;
  insert into public.technologies (tech_key, display_name, type, grade) values ('npm:tm-b', 'b', 'mcp', 'danger') returning id into tb;
  insert into public.technologies (tech_key, display_name, type, grade) values ('npm:tm-c', 'c', 'mcp', 'danger') returning id into tc;
  -- tb: 고친 버전이 있는 보안 경고(판단 대기). tc: 적용 기회 알림만(판단 대기)
  insert into public.changes (kind, tech_id, cause_id, dedupe_key, curr_value) values ('grade_to_danger', tb, 'GHSA-tm', 'change:tm-b', '{"fixed_version":"1.2.3"}') returning id into c1;
  insert into public.alerts (user_id, change_id, kind, dedupe_key) values (u1, c1, 'security', 'alert:tm-b') returning id into a_sec;
  insert into public.changes (kind, tech_id, cause_id, dedupe_key) values ('same_role_new', tc, 'new:tm-c', 'change:tm-c') returning id into c2;
  insert into public.alerts (user_id, change_id, kind, dedupe_key) values (u1, c2, 'opportunity', 'alert:tm-c') returning id into a_opp;

  -- u1: 관심 → 같은 값 다시(기록 안 늘어남) → 보류(이유 짧으면 막힘) → 지우기
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_tech_mark(ta, 'interest');
  perform public.set_tech_mark(ta, 'interest');
  select count(*) into n from public.tech_mark_events where tech_id = ta; msg := msg || 'same_twice_events=' || n || '(1);';
  begin
    perform public.set_tech_mark(ta, 'hold', '짧음');
    msg := msg || 'short_hold_blocked=NO;';
  exception when others then msg := msg || 'short_hold_blocked=YES;';
  end;
  select msg || 'after_failed_hold=' || coalesce(max(status), 'none') || '(interest);' into msg from public.tech_marks where tech_id = ta;
  perform public.set_tech_mark(ta, 'hold', '다음 달에 다시 보기');
  -- 위험 + 적용 기회 알림만: 적용 후보는 막히고, 한 거래라 그 알림도 판단 대기 그대로(불변 4)
  begin
    perform public.set_tech_mark(tc, 'candidate');
    msg := msg || 'danger_candidate_blocked=NO;';
  exception when others then msg := msg || 'danger_candidate_blocked=YES;';
  end;
  select status into st from public.alerts where id = a_opp; msg := msg || 'opp_alert_after_block=' || st || '(pending);';
  -- 위험 + 고친 버전 있는 보안 경고: 적용 후보로 알림 판단과 표시가 함께 남는다
  perform public.set_tech_mark(tb, 'candidate');
  select status into st from public.alerts where id = a_sec; msg := msg || 'sec_alert_after_candidate=' || st || '(done);';
  select fixed_version into st from public.judgments where alert_id = a_sec; msg := msg || 'judged_fixed_version=' || coalesce(st, 'none') || '(1.2.3);';
  select status into st from public.tech_marks where tech_id = tb; msg := msg || 'tb_mark=' || coalesce(st, 'none') || '(candidate);';
  begin
    insert into public.tech_marks (user_id, tech_id, status) values (u1, tb, 'interest');
    msg := msg || 'direct_insert_blocked=NO;';
  exception when others then msg := msg || 'direct_insert_blocked=YES;';
  end;
  begin
    insert into public.tech_mark_events (user_id, tech_id, new_status) values (u1, tb, 'interest');
    msg := msg || 'direct_event_insert_blocked=NO;';
  exception when others then msg := msg || 'direct_event_insert_blocked=YES;';
  end;
  select count(*) into n from public.tech_marks; msg := msg || 'u1_sees_marks=' || n || '(2);';
  execute 'reset role';

  -- 덧붙이기만: 서버(소유자)도 기록을 못 고치고 비우지도 못한다
  begin
    update public.tech_mark_events set reason = 'x' where user_id = u1;
    msg := msg || 'event_update_blocked=NO;';
  exception when others then msg := msg || 'event_update_blocked=YES;';
  end;
  begin
    truncate public.tech_mark_events;
    msg := msg || 'event_truncate_blocked=NO;';
  exception when others then msg := msg || 'event_truncate_blocked=YES;';
  end;

  -- u2 · 관리자: 남의 표시와 기록을 못 본다
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.tech_marks; msg := msg || 'u2_sees_marks=' || n || '(0);';
  select count(*) into n from public.tech_mark_events; msg := msg || 'u2_sees_events=' || n || '(0);';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.tech_marks; msg := msg || 'admin_sees_marks=' || n || '(0);';
  execute 'reset role';

  -- u1 지우기: 표시 0, 기록 3(관심 · 보류 · 지움)
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.set_tech_mark(ta, null);
  select count(*) into n from public.tech_marks where tech_id = ta; msg := msg || 'after_clear_marks=' || n || '(0);';
  select count(*) into n from public.tech_mark_events where tech_id = ta; msg := msg || 'after_clear_events=' || n || '(3);';
  execute 'reset role';

  -- 로그인 안 한 사람: 읽기·함수 모두 막힘
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  begin
    perform count(*) from public.tech_marks;
    msg := msg || 'anon_read_blocked=NO;';
  exception when others then msg := msg || 'anon_read_blocked=YES;';
  end;
  begin
    perform public.set_tech_mark(ta, 'interest');
    msg := msg || 'anon_rpc_blocked=NO;';
  exception when others then msg := msg || 'anon_rpc_blocked=YES;';
  end;
  execute 'reset role';

  raise exception 'TECH_MARKS_RESULT %', msg;  -- 일부러 실패시켜 위의 모든 줄을 되돌린다
end $$;
