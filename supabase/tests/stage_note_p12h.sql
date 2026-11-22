-- P-12h-2 T2 단계 메모 시험: 확정 graph에 메모가 남고(200자 · 공백 · 빈 값), 남은 못 읽고, 템플릿에는 메모가 없다. 끝에서 일부러 예외를 내 모두 되돌린다.
-- 실행: M5와 202611232000을 적용한 뒤 운영 MCP execute_sql로 1번(사용자 승인 뒤). "ROLLBACK_OK ..."가 맨 아래 주석의 기대 문자열과 같아야 한다.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); bp uuid := gen_random_uuid(); tf uuid := gen_random_uuid(); tc uuid := gen_random_uuid();
  r text; c int; gs jsonb; msg text := '';
  g jsonb := jsonb_build_object('v', 2, 'edges', '[]'::jsonb, 'stages', jsonb_build_array(
    jsonb_build_object('id', 's1', 'name', '기획', 'x', 0, 'y', 0, 'techs', '[]'::jsonb, 'note', '  인터뷰 먼저  '),
    jsonb_build_object('id', 's2', 'name', '개발', 'x', 0, 'y', 200, 'techs', '[]'::jsonb, 'note', repeat('가', 250)),
    jsonb_build_object('id', 's3', 'name', '배포', 'x', 0, 'y', 400, 'techs', '[]'::jsonb, 'note', '   '),
    jsonb_build_object('id', 's4', 'name', '회고', 'x', 0, 'y', 600, 'techs', '[]'::jsonb, 'note', 42)));
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12h-note-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12h-note-u2@example.test', '{"provider":"email"}', '{}', now(), now());

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.confirm_blueprint_v2(bp, '메모 판', null, g); msg := msg || 'confirm=' || r || '(saved);';
  select graph -> 'stages' into gs from public.blueprints where id = bp;
  msg := msg || 'trim=' || (gs -> 0 ->> 'note') || '(인터뷰 먼저);';
  msg := msg || 'cut=' || char_length(gs -> 1 ->> 'note') || '(200);';
  msg := msg || 'blank_gone=' || (not (gs -> 2 ? 'note')) || '(true);';
  msg := msg || 'nonstring_gone=' || (not (gs -> 3 ? 'note')) || '(true);';
  select count(*) into c from public.blueprints b, jsonb_array_elements(b.board) col, jsonb_array_elements(col) s where b.id = bp and s ? 'note';
  msg := msg || 'board_no_note=' || c || '(0);';
  r := public.save_blueprint_template(tf, 'frame', '틀', g); r := public.save_blueprint_template(tc, 'combo', '조합', g);
  select count(*) into c from public.blueprint_templates t, jsonb_array_elements(t.graph -> 'stages') s where t.id in (tf, tc) and s ? 'note';
  msg := msg || 'template_no_note=' || c || '(0);';
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.blueprints where id = bp; msg := msg || 'other_reads=' || c || '(0);';
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  begin select count(*) into c from public.blueprints where id = bp; msg := msg || 'guest_reads=' || c || '(0);';
  exception when insufficient_privilege then msg := msg || 'guest_reads=blocked(0);'; end;
  execute 'reset role';

  raise exception 'ROLLBACK_OK %', msg;
  -- 기대: confirm=saved(saved);trim=인터뷰 먼저(인터뷰 먼저);cut=200(200);blank_gone=true(true);nonstring_gone=true(true);board_no_note=0(0);template_no_note=0(0);other_reads=0(0);guest_reads=0(0); (손님 줄은 권한에 따라 blocked(0)일 수 있음)
end $$;
