-- P-12o 청사진 섹션 시험: 확정 graph에 맞는 섹션만 남고(겹침 · 단계 1개 · 없는 단계 · id 모양 틀림 · 단계 id와 겹침은 그 섹션만 뺌, 판은 거절하지 않음),
-- 섹션이 없으면 sections 키가 없고, 공통 기술은 관문(내 기술 · 적용 후보 · 내 이력)을 거쳐 이름이 채워지며 관문 밖 기술이면 판 전체를 거절하고,
-- 틀 템플릿은 공통 기술을 비우고 조합 템플릿엔 남으며, 남 · 손님은 못 읽는다. 끝에서 일부러 예외를 내 모두 되돌린다.
-- 실행: 202611240100을 적용한 뒤 운영 MCP execute_sql로 1번(사용자 승인 뒤). "ROLLBACK_OK ..."가 맨 아래 주석의 기대 문자열과 같아야 한다.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); bp uuid := gen_random_uuid(); bp2 uuid := gen_random_uuid(); bp3 uuid := gen_random_uuid();
  tf uuid := gen_random_uuid(); tc uuid := gen_random_uuid();
  t1 uuid; t2 uuid; t3 uuid; outside uuid; r text; c int; sec jsonb; msg text := ''; g jsonb;
begin
  -- 위험이 아닌 실제 기술 3개를 u1의 적용 후보로, 넷째는 관문 밖(아무 표시 없음)
  select (array_agg(id order by id))[1], (array_agg(id order by id))[2], (array_agg(id order by id))[3], (array_agg(id order by id))[4] into t1, t2, t3, outside
    from (select id from public.technologies where grade is distinct from 'danger' and not is_simulated and status <> 'gone' order by id limit 4) x;
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12o-sec-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12o-sec-u2@example.test', '{"provider":"email"}', '{}', now(), now());
  insert into public.tech_marks (user_id, tech_id, status) values (u1, t1, 'candidate'), (u1, t2, 'candidate'), (u1, t3, 'candidate');
  g := jsonb_build_object('v', 2,
    'edges', jsonb_build_array(jsonb_build_object('from', 's1', 'to', 's2'), jsonb_build_object('from', 's2', 'to', 's3')),
    'stages', jsonb_build_array(
      jsonb_build_object('id', 's1', 'name', '기획', 'x', 0, 'y', 0, 'techs', jsonb_build_array(jsonb_build_object('id', t1))),
      jsonb_build_object('id', 's2', 'name', '개발', 'x', 400, 'y', 0, 'techs', '[]'::jsonb),
      jsonb_build_object('id', 's3', 'name', '배포', 'x', 800, 'y', 0, 'techs', '[]'::jsonb)),
    'sections', jsonb_build_array(
      jsonb_build_object('id', 'sec1', 'name', ' 준비 ', 'stageIds', jsonb_build_array('s1', 's2', 's1'), 'techs', jsonb_build_array(jsonb_build_object('id', t2), jsonb_build_object('id', t3))), -- 남음(겹친 s1은 한 번)
      jsonb_build_object('id', 'sec2', 'name', '겹침', 'stageIds', jsonb_build_array('s2', 's3')),             -- s2가 sec1과 겹쳐 s3 하나 → 뺌
      jsonb_build_object('id', 'sec3', 'name', '없음', 'stageIds', jsonb_build_array('s3', 'zz')),             -- 없는 단계라 하나 → 뺌
      jsonb_build_object('id', 'bad id', 'name', '모양', 'stageIds', jsonb_build_array('s2', 's3')),           -- id 모양 틀림 → 뺌
      jsonb_build_object('id', 's3', 'name', '단계id', 'stageIds', jsonb_build_array('s2', 's3')),             -- 단계 id와 겹침 → 뺌
      jsonb_build_object('id', 'sec5', 'name', '', 'stageIds', jsonb_build_array('s2', 's3')),                 -- 이름 없음 → 뺌
      '"x"'::jsonb));                                                                                          -- 모양 틀림 → 뺌

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.confirm_blueprint_v2(bp, '섹션 판', null, g); msg := msg || 'confirm=' || r || '(saved);';
  select graph -> 'sections' into sec from public.blueprints where id = bp;
  msg := msg || 'kept=' || jsonb_array_length(sec) || '(1);';
  msg := msg || 'members=' || (sec -> 0 -> 'stageIds')::text || '(["s1", "s2"]);';
  msg := msg || 'name=' || (sec -> 0 ->> 'name') || '(준비);';
  msg := msg || 'tech_names=' || ((sec -> 0 -> 'techs' -> 0 ->> 'name') is not null) || '(true);';
  select count(*) into c from public.blueprints b, jsonb_array_elements(b.board) col, jsonb_array_elements(col) s where b.id = bp and s ? 'sections';
  msg := msg || 'board_no_sections=' || c || '(0);';
  r := public.confirm_blueprint_v2(bp2, '섹션 없음', null, g - 'sections');
  select count(*) into c from public.blueprints where id = bp2 and graph ? 'sections'; msg := msg || 'no_key=' || c || '(0);';
  begin
    r := public.confirm_blueprint_v2(bp3, '관문 밖', null, jsonb_set(g, '{sections,0,techs}', jsonb_build_array(jsonb_build_object('id', outside))));
    msg := msg || 'outside=saved(rejected);';
  exception when others then msg := msg || 'outside=rejected(rejected);'; end;
  r := public.save_blueprint_template(tf, 'frame', '틀', g); r := public.save_blueprint_template(tc, 'combo', '조합', g);
  select jsonb_array_length(graph -> 'sections' -> 0 -> 'techs') into c from public.blueprint_templates where id = tf; msg := msg || 'frame_techs=' || c || '(0);';
  select jsonb_array_length(graph -> 'sections' -> 0 -> 'techs') into c from public.blueprint_templates where id = tc; msg := msg || 'combo_techs=' || c || '(2);';
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.blueprints where id = bp; msg := msg || 'other_reads=' || c || '(0);';
  select count(*) into c from public.blueprint_templates where id = tc; msg := msg || 'other_template=' || c || '(0);';
  begin perform public.blueprint_graph_clean(u2, g); msg := msg || 'clean_direct=open(blocked);';
  exception when insufficient_privilege then msg := msg || 'clean_direct=blocked(blocked);'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  begin select count(*) into c from public.blueprints where id = bp; msg := msg || 'guest_reads=' || c || '(0);';
  exception when insufficient_privilege then msg := msg || 'guest_reads=blocked(0);'; end;
  execute 'reset role';

  raise exception 'ROLLBACK_OK %', msg;
  -- 기대: confirm=saved(saved);kept=1(1);members=["s1", "s2"](["s1", "s2"]);name=준비(준비);tech_names=true(true);board_no_sections=0(0);no_key=0(0);outside=rejected(rejected);frame_techs=0(0);combo_techs=2(2);other_reads=0(0);other_template=0(0);clean_direct=blocked(blocked);guest_reads=0(0);
  -- (손님 줄은 권한에 따라 blocked(0)일 수 있음. other_template은 템플릿이 비공개(is_public 기본 false)라 0)
end $$;
