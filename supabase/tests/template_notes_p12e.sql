-- P-12e M3 템플릿 사용기 · 도움이 됐어요 · 신고 권한 시험(불변 3 · 4 · 5, ADR 0036). usage_notes_p24.sql과 같은 방식: 끝에서 일부러 예외를 내 모두 되돌린다.
-- 실행: M1 · M2 · M3를 적용한 뒤 운영 MCP execute_sql로 1번(사용자 승인 뒤, 다른 SQL 시험과 동시에 돌리지 않음). "ROLLBACK_OK ..."가 맨 아래 주석의 기대 문자열과 같아야 한다.
-- 사람: u1 = 템플릿 작가, u2 = 그 템플릿으로 확정해 본 사람(사용기 작가), u3 = 써 보지 않은 사람, u4 = 확정해 본 시연 계정, ad = 관리자.
-- 세는 줄은 모두 이 시험의 템플릿 · 글로 좁힌다(운영에 진짜 사용기가 있어도 기대값이 그대로).
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid(); ad uuid := gen_random_uuid();
  p1 uuid; tA uuid; combo uuid := gen_random_uuid(); n1 uuid; r text; b boolean; c int; msg text := ''; g jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12e-n-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12e-n-u2@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12e-n-u3@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u4, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12e-n-u4@example.test', '{"provider":"email"}', '{}', now(), now()),
    (ad, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12e-n-ad@example.test', '{"provider":"email"}', '{}', now(), now());
  update public.profiles set role = 'admin' where id = ad;
  update public.profiles set is_demo = true where id = u4;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12e-n-a', 'tA', 'mcp') returning id into tA;
  insert into public.projects (owner_id, kind, name) values (u1, 'local', 'p12e-n') returning id into p1;
  insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by) values (u1, p1, tA, 'manual', u1);
  insert into public.tech_marks (user_id, tech_id, status, updated_at) values (u2, tA, 'candidate', now()), (u4, tA, 'candidate', now());
  g := jsonb_build_object('v', 2, 'edges', '[]'::jsonb, 'stages', jsonb_build_array(jsonb_build_object('id', 's1', 'name', '개발', 'x', 0, 'y', 0, 'techs', jsonb_build_array(jsonb_build_object('id', tA)))));

  -- u1: 공개 조합 하나. 작가 본인은 자기 템플릿에 사용기를 못 쓴다(확정해 봤어도)
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.save_blueprint_template(combo, 'combo', '조합', g);
  b := public.set_template_public(combo, true);
  r := public.confirm_blueprint_v2(gen_random_uuid(), '내 것으로', null, g, combo);
  begin insert into public.template_notes (template_id, used_for, result, tip) values (combo, 'a', 'b', 'c'); msg := msg || 'author_note=OPEN;';
  exception when insufficient_privilege then msg := msg || 'author_note=blocked;'; end;
  execute 'reset role';

  -- u2: 써 보기 전엔 못 씀 → 확정 → 템플릿이 비공개면 못 씀(써 봤어도) → 공개로 돌아오면 한 글
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into public.template_notes (template_id, used_for, result, tip) values (combo, 'a', 'b', 'c'); msg := msg || 'before_use=OPEN;';
  exception when insufficient_privilege then msg := msg || 'before_use=blocked;'; end;
  r := public.confirm_blueprint_v2(gen_random_uuid(), '써 봄', null, g, combo);
  execute 'reset role';
  update public.blueprint_templates set is_public = false where id = combo;
  execute 'set local role authenticated';
  begin insert into public.template_notes (template_id, used_for, result, tip) values (combo, 'a', 'b', 'c'); msg := msg || 'private_template=OPEN;';
  exception when insufficient_privilege then msg := msg || 'private_template=blocked;'; end;
  execute 'reset role';
  update public.blueprint_templates set is_public = true where id = combo;
  execute 'set local role authenticated';
  insert into public.template_notes (template_id, used_for, result, tip) values (combo, '사내 위키', '잘 됨', '단계 이름은 짧게') returning id into n1;
  msg := msg || 'note=1(1);';
  begin insert into public.template_notes (template_id, used_for, result, tip) values (combo, '또', '또', '또'); msg := msg || 'note_twice=OPEN;';
  exception when unique_violation then msg := msg || 'note_twice=blocked;'; end;
  begin insert into public.template_notes (author_id, template_id, used_for, result, tip) values (u3, combo, 'a', 'b', 'c'); msg := msg || 'as_other=OPEN;';
  exception when insufficient_privilege then msg := msg || 'as_other=blocked;'; end;
  begin insert into public.template_notes (template_id, used_for, result, tip, helpful_count) values (combo, 'a', 'b', 'c', 99); msg := msg || 'set_count=OPEN;';
  exception when insufficient_privilege then msg := msg || 'set_count=blocked;'; end;
  begin update public.template_notes set tip = 'x' where id = n1; msg := msg || 'edit=OPEN;';
  exception when insufficient_privilege then msg := msg || 'edit=blocked;'; end;
  begin delete from public.template_notes where id = n1; msg := msg || 'delete=OPEN;';
  exception when insufficient_privilege then msg := msg || 'delete=blocked;'; end;
  begin insert into public.template_helpful_votes (note_id, user_id) values (n1, u2); msg := msg || 'own_vote=OPEN;';
  exception when insufficient_privilege then msg := msg || 'own_vote=blocked;'; end;
  select count(*) into c from public.my_template_note_ids(array[n1]); msg := msg || 'mine_u2=' || c || '(1);';
  execute 'reset role';
  -- 글자 수 · 빈 칸(check)은 이미 한 글이 있는 u2 대신 표 주인 권한으로 본다(규칙은 칸 검사라 사람과 무관)
  begin insert into public.template_notes (author_id, template_id, used_for, result, tip) values (u3, combo, repeat('가', 200), repeat('나', 200), repeat('😀', 101)); msg := msg || 'over_500=OPEN;';
  exception when check_violation then msg := msg || 'over_500=blocked;'; end;
  begin insert into public.template_notes (author_id, template_id, used_for, result, tip) values (u3, combo, '  ', 'b', 'c'); msg := msg || 'blank=OPEN;';
  exception when check_violation then msg := msg || 'blank=blocked;'; end;

  -- u4(시연 계정): 확정해 봤어도 사용기 · 도움이 됐어요 못 함(가짜 후기 · 순위 올리기 방지)
  perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.confirm_blueprint_v2(gen_random_uuid(), '시연', null, g, combo);
  begin insert into public.template_notes (template_id, used_for, result, tip) values (combo, 'a', 'b', 'c'); msg := msg || 'demo_note=OPEN;';
  exception when insufficient_privilege then msg := msg || 'demo_note=blocked;'; end;
  begin insert into public.template_helpful_votes (note_id, user_id) values (n1, u4); msg := msg || 'demo_vote=OPEN;';
  exception when insufficient_privilege then msg := msg || 'demo_vote=blocked;'; end;
  execute 'reset role';

  -- u3: 써 보지 않았으면 못 씀. 읽기는 안전한 칸만, 도움이 됐어요 한 번 · 신고 한 번
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin insert into public.template_notes (template_id, used_for, result, tip) values (combo, 'a', 'b', 'c'); msg := msg || 'not_used=OPEN;';
  exception when insufficient_privilege then msg := msg || 'not_used=blocked;'; end;
  select count(*) into c from public.template_notes where template_id = combo; msg := msg || 'u3_sees=' || c || '(1);';
  begin perform author_id from public.template_notes limit 1; msg := msg || 'read_author_id=OPEN;';
  exception when insufficient_privilege then msg := msg || 'read_author_id=blocked;'; end;
  begin perform hidden_by from public.template_notes limit 1; msg := msg || 'read_hidden_by=OPEN;';
  exception when insufficient_privilege then msg := msg || 'read_hidden_by=blocked;'; end;
  select count(*) into c from public.my_template_note_ids(array[n1]); msg := msg || 'mine_u3=' || c || '(0);';
  insert into public.template_helpful_votes (note_id, user_id) values (n1, u3); msg := msg || 'vote=1(1);';
  begin insert into public.template_helpful_votes (note_id, user_id) values (n1, u3); msg := msg || 'vote_twice=OPEN;';
  exception when unique_violation then msg := msg || 'vote_twice=blocked;'; end;
  begin insert into public.template_helpful_votes (note_id, user_id) values (n1, u1); msg := msg || 'vote_as_other=OPEN;';
  exception when insufficient_privilege then msg := msg || 'vote_as_other=blocked;'; end;
  select helpful_count into c from public.template_notes where id = n1; msg := msg || 'count=' || c || '(1);';
  insert into public.template_reports (note_id, reporter_id, reason) values (n1, u3, '광고'); msg := msg || 'report=1(1);';
  begin insert into public.template_reports (note_id, reporter_id, reason) values (n1, u3, '또'); msg := msg || 'report_twice=OPEN;';
  exception when unique_violation then msg := msg || 'report_twice=blocked;'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.template_reports where note_id = n1; msg := msg || 'u2_sees_reports=' || c || '(0);';
  execute 'reset role';

  -- 템플릿이 비공개 · 관리자 숨김이면 남 · 관리자에게 안 보이고(쓴 사람은 봄), 도움이 됐어요 · 신고도 못 한다
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  b := public.set_template_public(combo, false);
  select count(*) into c from public.template_notes where template_id = combo; msg := msg || 'private_tpl_author_sees=' || c || '(0);';
  begin insert into public.template_helpful_votes (note_id, user_id) values (n1, u1); msg := msg || 'private_vote=OPEN;';
  exception when insufficient_privilege then msg := msg || 'private_vote=blocked;'; end;
  begin insert into public.template_reports (note_id, reporter_id, reason) values (n1, u1, '광고'); msg := msg || 'private_report=OPEN;';
  exception when insufficient_privilege then msg := msg || 'private_report=blocked;'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.template_notes where template_id = combo; msg := msg || 'private_u3_sees=' || c || '(0);';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.template_notes where template_id = combo; msg := msg || 'private_admin_sees=' || c || '(0);';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.template_notes where template_id = combo; msg := msg || 'private_note_author_sees=' || c || '(1);';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  b := public.set_template_public(combo, true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  b := public.hide_blueprint_template(combo, true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.template_notes where template_id = combo; msg := msg || 'hidden_tpl_u3_sees=' || c || '(0);';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  b := public.hide_blueprint_template(combo, false);

  -- 관리자: 열린 템플릿의 글은 숨김 · 신고 처리(쓴 사람 · 관리자만 봄)
  update public.template_notes set hidden_at = now(), hidden_by = ad where id = n1;
  select count(*) into c from public.template_notes where id = n1; msg := msg || 'admin_sees_hidden=' || c || '(1);';
  select count(*) into c from public.template_reports where note_id = n1; msg := msg || 'admin_reports=' || c || '(1);';
  update public.template_reports set handled_by = ad, handled_at = now(), handle_reason = '숨김' where note_id = n1;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.template_notes where template_id = combo; msg := msg || 'hidden_u3_sees=' || c || '(0);';
  update public.template_notes set hidden_at = null, hidden_by = null where id = n1; get diagnostics c = row_count; msg := msg || 'user_unhide=' || c || '(0);';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.template_notes where template_id = combo; msg := msg || 'hidden_author_sees=' || c || '(1);';
  execute 'reset role';

  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  begin perform 1 from public.template_notes; msg := msg || 'anon_read=OPEN;';
  exception when insufficient_privilege then msg := msg || 'anon_read=blocked;'; end;
  begin perform * from public.my_template_note_ids(array[n1]); msg := msg || 'anon_fn=OPEN;';
  exception when insufficient_privilege then msg := msg || 'anon_fn=blocked;'; end;
  execute 'reset role';

  raise exception 'ROLLBACK_OK %', msg;
  -- 기대: author_note=blocked;before_use=blocked;private_template=blocked;note=1(1);note_twice=blocked;as_other=blocked;set_count=blocked;edit=blocked;delete=blocked;own_vote=blocked;mine_u2=1(1);over_500=blocked;blank=blocked;demo_note=blocked;demo_vote=blocked;not_used=blocked;u3_sees=1(1);read_author_id=blocked;read_hidden_by=blocked;mine_u3=0(0);vote=1(1);vote_twice=blocked;vote_as_other=blocked;count=1(1);report=1(1);report_twice=blocked;u2_sees_reports=0(0);private_tpl_author_sees=0(0);private_vote=blocked;private_report=blocked;private_u3_sees=0(0);private_admin_sees=0(0);private_note_author_sees=1(1);hidden_tpl_u3_sees=0(0);admin_sees_hidden=1(1);admin_reports=1(1);hidden_u3_sees=0(0);user_unhide=0(0);hidden_author_sees=1(1);anon_read=blocked;anon_fn=blocked;
end $$;
