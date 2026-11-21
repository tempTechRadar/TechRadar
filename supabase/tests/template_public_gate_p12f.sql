-- P-12f 공개 목록 밖 기술이 든 조합 템플릿 공개 거절 시험(202611221320). 끝에서 일부러 예외를 내 모두 되돌린다.
-- 실행: 마이그레이션 적용 뒤 운영 MCP execute_sql로 1번(사용자 승인 뒤). "ROLLBACK_OK ..."가 맨 아래 주석의 기대 문자열과 같아야 한다.
-- u1의 내 기술: tL(공개 목록), tP(내 저장소에서만 생긴 줄: one_liner_source 없음), tS(시뮬레이터), tG(사라짐).
do $$
declare
  u1 uuid := gen_random_uuid(); p1 uuid; tL uuid; tP uuid; tS uuid; tG uuid;
  ok_c uuid := gen_random_uuid(); bad uuid := gen_random_uuid(); sim uuid := gen_random_uuid(); gone uuid := gen_random_uuid(); fr uuid := gen_random_uuid();
  r text; b boolean; msg text := ''; g jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12f-pg-u1@example.test', '{"provider":"email"}', '{}', now(), now());
  insert into public.technologies (tech_key, display_name, type, one_liner_source) values ('npm:p12f-pg-l', 'listed-one', 'mcp', 'https://registry.example/l') returning id into tL;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12f-pg-p', 'my-private-pkg', 'mcp') returning id into tP;
  insert into public.technologies (tech_key, display_name, type, one_liner_source, is_simulated) values ('npm:p12f-pg-s', 'sim-one', 'mcp', 'https://registry.example/s', true) returning id into tS;
  insert into public.technologies (tech_key, display_name, type, one_liner_source) values ('npm:p12f-pg-g', 'gone-one', 'mcp', 'https://registry.example/g') returning id into tG;
  insert into public.projects (owner_id, kind, name) values (u1, 'local', 'p12f-pg') returning id into p1;
  insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by) values (u1, p1, tL, 'manual', u1), (u1, p1, tP, 'manual', u1), (u1, p1, tS, 'manual', u1), (u1, p1, tG, 'manual', u1);
  g := jsonb_build_object('v', 2, 'edges', '[]'::jsonb, 'stages', jsonb_build_array(jsonb_build_object('id', 's1', 'name', '개발', 'x', 0, 'y', 0, 'techs', '[]'::jsonb)));

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.save_blueprint_template(ok_c, 'combo', '목록 안', jsonb_set(g, '{stages,0,techs}', jsonb_build_array(jsonb_build_object('id', tL))));
  r := public.save_blueprint_template(bad, 'combo', '목록 밖', jsonb_set(g, '{stages,0,techs}', jsonb_build_array(jsonb_build_object('id', tL), jsonb_build_object('id', tP))));
  r := public.save_blueprint_template(sim, 'combo', '시뮬레이터', jsonb_set(g, '{stages,0,techs}', jsonb_build_array(jsonb_build_object('id', tS))));
  r := public.save_blueprint_template(fr, 'frame', '틀', jsonb_set(g, '{stages,0,techs}', jsonb_build_array(jsonb_build_object('id', tP))));
  r := public.save_blueprint_template(gone, 'combo', '사라질 것', jsonb_set(g, '{stages,0,techs}', jsonb_build_array(jsonb_build_object('id', tG))));
  execute 'reset role';
  -- 저장 뒤 사라진 기술(수집이 gone으로 바꿈)이 든 조합
  update public.technologies set status = 'gone' where id = tG;
  execute 'set local role authenticated';
  begin b := public.set_template_public(gone, true); msg := msg || 'gone=OPEN;';
  exception when raise_exception then msg := msg || 'gone=' || case when sqlerrm = '공개 목록에 없는 기술 1개: gone-one' then 'blocked' else sqlerrm end || ';'; end;

  b := public.set_template_public(ok_c, true); msg := msg || 'listed=' || b || '(true);';
  begin b := public.set_template_public(bad, true); msg := msg || 'unlisted=OPEN;';
  exception when raise_exception then msg := msg || 'unlisted=' || case when sqlerrm = '공개 목록에 없는 기술 1개: my-private-pkg' then 'blocked' else sqlerrm end || ';'; end;
  begin b := public.set_template_public(sim, true); msg := msg || 'simulated=OPEN;';
  exception when raise_exception then msg := msg || 'simulated=' || case when sqlerrm like '공개 목록에 없는 기술 1개: sim-one' then 'blocked' else sqlerrm end || ';'; end;
  b := public.set_template_public(fr, true); msg := msg || 'frame=' || b || '(true);';
  b := public.set_template_public(bad, false); msg := msg || 'unpublish_ok=' || b || '(false);';
  -- 공개한 뒤 기술이 목록 밖이 되면(사라짐) 남에게 갤러리 · 열기에서 빠진다, 작가 본인은 계속 연다
  execute 'reset role';
  update public.technologies set status = 'gone' where id = tL;
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  select count(*) into r from public.public_blueprint_templates() t where t.id = ok_c; msg := msg || 'later_gone_gallery=' || r || '(0);';
  select count(*) into r from public.blueprint_template_for_use(ok_c); msg := msg || 'later_gone_open=' || r || '(0);';
  select count(*) into r from public.public_blueprint_templates() t where t.id = fr; msg := msg || 'frame_gallery=' || r || '(1);';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into r from public.blueprint_template_for_use(ok_c); msg := msg || 'author_opens=' || r || '(1);';
  select count(*) into r from public.blueprint_templates where id = bad and is_public; msg := msg || 'bad_public=' || r || '(0);';
  begin perform public.template_unlisted_techs('{}'::jsonb); msg := msg || 'call_helper=OPEN;';
  exception when insufficient_privilege then msg := msg || 'call_helper=blocked;'; end;
  execute 'reset role';

  raise exception 'ROLLBACK_OK %', msg;
  -- 기대: gone=blocked;listed=true(true);unlisted=blocked;simulated=blocked;frame=true(true);unpublish_ok=false(false);later_gone_gallery=0(0);later_gone_open=0(0);frame_gallery=1(1);author_opens=1(1);bad_public=0(0);call_helper=blocked;
end $$;
