-- P-12o 섹션 공통 기술도 공개 목록 검사를 거치는지 시험(202611240300). 끝에서 일부러 예외를 내 모두 되돌린다.
-- 실행: 마이그레이션 적용 뒤 운영 MCP execute_sql로 1번(사용자 승인 뒤). "ROLLBACK_OK ..."가 맨 아래 주석의 기대 문자열과 같아야 한다.
-- u1의 내 기술: tL(공개 목록), tP(내 저장소에서만 생긴 줄: one_liner_source 없음). 단계에는 tL만, 섹션 공통 기술에 tP.
do $$
declare
  u1 uuid := gen_random_uuid(); p1 uuid; tL uuid; tP uuid;
  sec_bad uuid := gen_random_uuid(); sec_ok uuid := gen_random_uuid(); fr uuid := gen_random_uuid();
  r text; b boolean; msg text := ''; g jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12o-sg-u1@example.test', '{"provider":"email"}', '{}', now(), now());
  insert into public.technologies (tech_key, display_name, type, one_liner_source) values ('npm:p12o-sg-l', 'listed-one', 'mcp', 'https://registry.example/l') returning id into tL;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12o-sg-p', 'my-private-pkg', 'mcp') returning id into tP;
  insert into public.projects (owner_id, kind, name) values (u1, 'local', 'p12o-sg') returning id into p1;
  insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by) values (u1, p1, tL, 'manual', u1), (u1, p1, tP, 'manual', u1);
  g := jsonb_build_object('v', 2, 'edges', '[]'::jsonb, 'stages', jsonb_build_array(
    jsonb_build_object('id', 's1', 'name', '개발', 'x', 0, 'y', 0, 'techs', jsonb_build_array(jsonb_build_object('id', tL))),
    jsonb_build_object('id', 's2', 'name', '배포', 'x', 240, 'y', 0, 'techs', '[]'::jsonb)));

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.save_blueprint_template(sec_bad, 'combo', '섹션에 목록 밖', g || jsonb_build_object('sections', jsonb_build_array(
    jsonb_build_object('id', 'sec1', 'name', '준비', 'stageIds', jsonb_build_array('s1', 's2'), 'techs', jsonb_build_array(jsonb_build_object('id', tP))))));
  r := public.save_blueprint_template(sec_ok, 'combo', '섹션에 목록 안', g || jsonb_build_object('sections', jsonb_build_array(
    jsonb_build_object('id', 'sec1', 'name', '준비', 'stageIds', jsonb_build_array('s1', 's2'), 'techs', jsonb_build_array(jsonb_build_object('id', tL))))));
  r := public.save_blueprint_template(fr, 'frame', '틀', g || jsonb_build_object('sections', jsonb_build_array(
    jsonb_build_object('id', 'sec1', 'name', '준비', 'stageIds', jsonb_build_array('s1', 's2'), 'techs', jsonb_build_array(jsonb_build_object('id', tP))))));
  select count(*) into r from public.blueprint_templates t, jsonb_array_elements(t.graph -> 'sections') s where t.id = sec_bad and s -> 'techs' @> jsonb_build_array(jsonb_build_object('id', tP::text));
  msg := msg || 'saved_section_tech=' || r || '(1);';

  begin b := public.set_template_public(sec_bad, true); msg := msg || 'section_unlisted=OPEN;';
  exception when raise_exception then msg := msg || 'section_unlisted=' || case when sqlerrm = '공개 목록에 없는 기술 1개: my-private-pkg' then 'blocked' else sqlerrm end || ';'; end;
  b := public.set_template_public(sec_ok, true); msg := msg || 'section_listed=' || b || '(true);';
  b := public.set_template_public(fr, true); msg := msg || 'frame=' || b || '(true);';
  execute 'reset role';

  -- 이 마이그레이션 전에 공개된 것처럼 바로 공개로 두어도 남에게 갤러리 · 열기에서 빠진다
  update public.blueprint_templates set is_public = true where id = sec_bad;
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  select count(*) into r from public.public_blueprint_templates() t where t.id = sec_bad; msg := msg || 'old_public_gallery=' || r || '(0);';
  select count(*) into r from public.blueprint_template_for_use(sec_bad); msg := msg || 'old_public_open=' || r || '(0);';
  select count(*) into r from public.public_blueprint_templates() t where t.id = sec_ok; msg := msg || 'listed_gallery=' || r || '(1);';
  select count(*) into r from public.public_blueprint_templates() t where t.id = fr; msg := msg || 'frame_gallery=' || r || '(1);';
  execute 'reset role';
  select cardinality(public.template_unlisted_techs('{"sections": "깨짐", "stages": []}'::jsonb))::text into r; msg := msg || 'bad_shape=' || r || '(0);';

  raise exception 'ROLLBACK_OK %', msg;
  -- 기대: saved_section_tech=1(1);section_unlisted=blocked;section_listed=true(true);frame=true(true);old_public_gallery=0(0);old_public_open=0(0);listed_gallery=1(1);frame_gallery=1(1);bad_shape=0(0);
end $$;
