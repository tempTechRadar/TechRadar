-- P-24 usage_notes·helpful_votes·reports 권한 시험. rls_m0.sql과 같은 방식: 끝에서 일부러 예외를 내 모두 되돌린다(실제 DB에 아무것도 남지 않음).
-- 기대: 마지막 ROLLBACK_OK 줄이 파일 끝 주석과 같다. 202611201000과 202611201100(쓴 사람 칸 숨기기) 두 파일을 적용한 뒤에 돌린다. 막힘은 insufficient_privilege·check·unique 위반만 "막힘"으로 센다(다른 오류는 시험을 멈춰 눈에 띄게 한다).
-- 주의: 쓰기만 하고 실행하지 못한 시험이다(이 컴퓨터에 Postgres 없음). 영식이 운영 적용 때 처음 돌린다. 틀린 곳이 있으면 시험 쪽 오류일 수 있으니 출력을 같이 본다.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); ad uuid := gen_random_uuid();
  t1 uuid; n1 uuid; n int; c int; msg text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p24-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p24-u2@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p24-u3@example.test', '{"provider":"email"}', '{}', now(), now()),
    (ad, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p24-ad@example.test', '{"provider":"email"}', '{}', now(), now());
  update public.profiles set role = 'admin' where id = ad;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p24-test-pkg', 'p24', 'mcp') returning id into t1;

  -- u1: 사용기 쓰기
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.usage_notes (author_id, tech_id, used_for, result, tip) values (u1, t1, '검색', '잘 됨', '키는 환경변수로') returning id into n1;
  msg := msg || 'own_insert=1(1);';
  begin insert into public.usage_notes (author_id, tech_id, used_for, result, tip) values (u2, t1, 'a', 'b', 'c'); msg := msg || 'insert_as_other=OPEN;';
  exception when insufficient_privilege then msg := msg || 'insert_as_other=blocked;'; end;
  begin insert into public.usage_notes (author_id, tech_id, used_for, result, tip, helpful_count) values (u1, t1, 'a', 'b', 'c', 99); msg := msg || 'set_count=OPEN;';
  exception when insufficient_privilege then msg := msg || 'set_count=blocked;'; end;
  begin insert into public.usage_notes (author_id, tech_id, used_for, result, tip, hidden_at, hidden_by) values (u1, t1, 'a', 'b', 'c', now(), u1); msg := msg || 'set_hidden=OPEN;';
  exception when insufficient_privilege then msg := msg || 'set_hidden=blocked;'; end;
  begin insert into public.usage_notes (author_id, tech_id, used_for, result, tip) values (u1, t1, repeat('가', 200), repeat('나', 200), repeat('😀', 101)); msg := msg || 'over_500=OPEN;';
  exception when check_violation then msg := msg || 'over_500=blocked;'; end;
  insert into public.usage_notes (author_id, tech_id, used_for, result, tip) values (u1, t1, repeat('가', 200), repeat('나', 200), repeat('😀', 100));
  msg := msg || 'exactly_500=1(1);';
  begin insert into public.usage_notes (author_id, tech_id, used_for, result, tip) values (u1, t1, '   ', 'b', 'c'); msg := msg || 'blank=OPEN;';
  exception when check_violation then msg := msg || 'blank=blocked;'; end;
  begin update public.usage_notes set tip = 'x' where id = n1; msg := msg || 'edit=OPEN;';
  exception when insufficient_privilege then msg := msg || 'edit=blocked;'; end;
  begin insert into public.helpful_votes (note_id, user_id) values (n1, u1); msg := msg || 'own_note_vote=OPEN;';
  exception when insufficient_privilege then msg := msg || 'own_note_vote=blocked;'; end;
  begin delete from public.usage_notes where id = n1; msg := msg || 'delete=OPEN;';
  exception when insufficient_privilege then msg := msg || 'delete=blocked;'; end;

  -- u2: 읽기·도움이 됐어요·신고
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  select count(*) into c from public.usage_notes where tech_id = t1; msg := msg || 'u2_sees_notes=' || c || '(2);';
  begin perform author_id from public.usage_notes limit 1; msg := msg || 'read_author_id=OPEN;';
  exception when insufficient_privilege then msg := msg || 'read_author_id=blocked;'; end;
  begin perform hidden_by from public.usage_notes limit 1; msg := msg || 'read_hidden_by=OPEN;';
  exception when insufficient_privilege then msg := msg || 'read_hidden_by=blocked;'; end;
  begin perform count(*) from (select * from public.usage_notes) x; msg := msg || 'select_star=OPEN;';
  exception when insufficient_privilege then msg := msg || 'select_star=blocked;'; end;
  select count(*) into c from public.my_usage_note_ids(array[n1]); msg := msg || 'mine_u2=' || c || '(0);';
  insert into public.helpful_votes (note_id, user_id) values (n1, u2); msg := msg || 'vote=1(1);';
  begin insert into public.helpful_votes (note_id, user_id) values (n1, u2); msg := msg || 'vote_twice=OPEN;';
  exception when unique_violation then msg := msg || 'vote_twice=blocked;'; end;
  begin insert into public.helpful_votes (note_id, user_id) values (n1, u1); msg := msg || 'vote_as_other=OPEN;';
  exception when insufficient_privilege then msg := msg || 'vote_as_other=blocked;'; end;
  select helpful_count into c from public.usage_notes where id = n1; msg := msg || 'count=' || c || '(1);';
  select count(*) into c from public.helpful_votes; msg := msg || 'votes_visible=' || c || '(1);';
  insert into public.reports (note_id, reporter_id, reason) values (n1, u2, '광고'); msg := msg || 'report=1(1);';
  begin insert into public.reports (note_id, reporter_id, reason) values (n1, u2, '또'); msg := msg || 'report_twice=OPEN;';
  exception when unique_violation then msg := msg || 'report_twice=blocked;'; end;
  update public.usage_notes set hidden_at = now(), hidden_by = u2 where id = n1;
  get diagnostics n = row_count; msg := msg || 'user_hide=' || n || '(0);';
  update public.reports set handled_by = u2, handled_at = now() where note_id = n1;
  get diagnostics n = row_count; msg := msg || 'user_handle=' || n || '(0);';

  -- u1: 남의 신고는 안 보임, 자기 글 신고 불가
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  select count(*) into c from public.reports; msg := msg || 'u1_sees_reports=' || c || '(0);';
  begin insert into public.reports (note_id, reporter_id, reason) values (n1, u1, '내 글'); msg := msg || 'report_own=OPEN;';
  exception when insufficient_privilege then msg := msg || 'report_own=blocked;'; end;

  -- 관리자: 숨김·신고 처리, 숨긴 글은 남에게 안 보이고 쓴 사람에게는 보임
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated')::text, true);
  update public.usage_notes set hidden_at = now(), hidden_by = ad where id = n1;
  get diagnostics n = row_count; msg := msg || 'admin_hide=' || n || '(1);';
  update public.reports set handled_by = ad, handled_at = now(), handle_reason = '숨김' where note_id = n1;
  get diagnostics n = row_count; msg := msg || 'admin_handle=' || n || '(1);';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  select count(*) into c from public.usage_notes where id = n1; msg := msg || 'hidden_for_other=' || c || '(0);';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  select count(*) into c from public.usage_notes where id = n1; msg := msg || 'hidden_for_author=' || c || '(1);';
  select count(*) into c from public.my_usage_note_ids(array[n1]); msg := msg || 'mine_u1=' || c || '(1);';
  -- 숨긴 글에는 제3자가 도움이 됐어요·신고를 못 한다
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  begin insert into public.helpful_votes (note_id, user_id) values (n1, u3); msg := msg || 'vote_on_hidden=OPEN;';
  exception when insufficient_privilege then msg := msg || 'vote_on_hidden=blocked;'; end;
  begin insert into public.reports (note_id, reporter_id, reason) values (n1, u3, '숨긴 글'); msg := msg || 'report_on_hidden=OPEN;';
  exception when insufficient_privilege then msg := msg || 'report_on_hidden=blocked;'; end;

  execute 'reset role';
  execute 'set local role anon';
  begin perform 1 from public.usage_notes; msg := msg || 'anon_read=OPEN;';
  exception when insufficient_privilege then msg := msg || 'anon_read=blocked;'; end;
  execute 'reset role';

  raise exception 'ROLLBACK_OK %', msg;
  -- 기대: own_insert=1(1);insert_as_other=blocked;set_count=blocked;set_hidden=blocked;over_500=blocked;exactly_500=1(1);blank=blocked;edit=blocked;own_note_vote=blocked;delete=blocked;u2_sees_notes=2(2);read_author_id=blocked;read_hidden_by=blocked;select_star=blocked;mine_u2=0(0);vote=1(1);vote_twice=blocked;vote_as_other=blocked;count=1(1);votes_visible=1(1);report=1(1);report_twice=blocked;user_hide=0(0);user_handle=0(0);u1_sees_reports=0(0);report_own=blocked;admin_hide=1(1);admin_handle=1(1);hidden_for_other=0(0);hidden_for_author=1(1);mine_u1=1(1);vote_on_hidden=blocked;report_on_hidden=blocked;anon_read=blocked;
end $$;
