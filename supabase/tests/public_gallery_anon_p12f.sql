-- P-12f M6 손님(anon) 권한 시험(불변 5, ADR 0036 개정). 끝에서 일부러 예외를 내 모두 되돌린다.
-- 실행: M1 · M2 · M3 · M6을 적용한 뒤 운영 MCP execute_sql로 1번(사용자 승인 뒤). "ROLLBACK_OK ..."가 맨 아래 주석의 기대 문자열과 같아야 한다.
-- 손님이 보는 것 = 이미 모두에게 공개된 것(열린 템플릿, 숨기지 않은 사용기의 안전한 칸)뿐. 개인 표는 모두 막힘, 쓰기 함수 모두 막힘.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  p1 uuid; tA uuid; pub uuid := gen_random_uuid(); priv uuid := gen_random_uuid(); hid uuid := gen_random_uuid(); demo uuid := gen_random_uuid();
  un uuid; un_hidden uuid; tn uuid; tn_priv uuid; r text; b boolean; c int; msg text := ''; g jsonb; tbl text; row_json jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12f-g-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12f-g-u2@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12f-g-u3@example.test', '{"provider":"email"}', '{}', now(), now());
  update public.profiles set nickname = '손님시험작가', is_public = true where id = u1;
  update public.profiles set is_demo = true where id = u3;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12f-g-a', 'tA', 'mcp') returning id into tA;
  insert into public.projects (owner_id, kind, name) values (u1, 'local', 'p12f-g') returning id into p1;
  insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by) values (u1, p1, tA, 'manual', u1);
  insert into public.tech_marks (user_id, tech_id, status, updated_at) values (u2, tA, 'candidate', now());
  g := jsonb_build_object('v', 2, 'edges', '[]'::jsonb, 'stages', jsonb_build_array(jsonb_build_object('id', 's1', 'name', '개발', 'x', 0, 'y', 0, 'techs', jsonb_build_array(jsonb_build_object('id', tA)))));

  -- u1: 공개 · 비공개 · (관리자가 숨길) 공개 템플릿, u3(시연): 공개 틀. u2: 공개 템플릿으로 확정하고 사용기, 비공개가 될 템플릿에도 사용기
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.save_blueprint_template(pub, 'combo', '공개', g);
  r := public.save_blueprint_template(priv, 'combo', '비공개될 것', g);
  r := public.save_blueprint_template(hid, 'combo', '숨길 것', g);
  b := public.set_template_public(pub, true); b := public.set_template_public(priv, true); b := public.set_template_public(hid, true);
  insert into public.usage_notes (author_id, tech_id, used_for, result, tip) values (u1, tA, '검색', '잘 됨', '팁') returning id into un;
  insert into public.usage_notes (author_id, tech_id, used_for, result, tip) values (u1, tA, '숨길 글', 'x', 'y') returning id into un_hidden;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.save_blueprint_template(demo, 'frame', '시연 틀', jsonb_set(g, '{stages,0,techs}', '[]'::jsonb));
  b := public.set_template_public(demo, true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.confirm_blueprint_v2(gen_random_uuid(), '써 봄', null, g, pub);
  r := public.confirm_blueprint_v2(gen_random_uuid(), '써 봄 2', null, g, priv);
  insert into public.template_notes (template_id, used_for, result, tip) values (pub, '위키', '잘 됨', '짧게') returning id into tn;
  insert into public.template_notes (template_id, used_for, result, tip) values (priv, '위키', '잘 됨', '짧게') returning id into tn_priv;
  execute 'reset role';
  update public.blueprint_templates set is_public = false where id = priv;
  update public.blueprint_templates set hidden_at = now(), hidden_by = u1 where id = hid;
  update public.usage_notes set hidden_at = now(), hidden_by = u1 where id = un_hidden;

  -- 손님
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  select count(*) into c from public.public_blueprint_templates() t where t.id in (pub, priv, hid, demo); msg := msg || 'gallery=' || c || '(1);';
  select to_jsonb(t) into row_json from public.public_blueprint_templates() t where t.id = pub;
  msg := msg || 'nickname=' || (row_json ->> 'author_nickname') || '(손님시험작가);no_author_id=' || (not (row_json ? 'author_id')) || '(true);uses=' || (row_json ->> 'uses') || '(1);';
  select count(*) into c from public.blueprint_template_for_use(pub); msg := msg || 'open_pub=' || c || '(1);';
  select count(*) into c from public.blueprint_template_for_use(priv); msg := msg || 'open_priv=' || c || '(0);';
  select count(*) into c from public.blueprint_template_for_use(hid); msg := msg || 'open_hidden=' || c || '(0);';
  select count(*) into c from public.blueprint_template_for_use(demo); msg := msg || 'open_demo=' || c || '(0);';
  select count(*) into c from public.usage_notes where tech_id = tA; msg := msg || 'usage_notes=' || c || '(1);';
  begin perform author_id from public.usage_notes limit 1; msg := msg || 'usage_author_id=OPEN;';
  exception when insufficient_privilege then msg := msg || 'usage_author_id=blocked;'; end;
  select count(*) into c from public.template_notes where id in (tn, tn_priv); msg := msg || 'template_notes=' || c || '(1);';
  begin perform author_id from public.template_notes limit 1; msg := msg || 'tnote_author_id=OPEN;';
  exception when insufficient_privilege then msg := msg || 'tnote_author_id=blocked;'; end;
  -- 개인 · 내부 표는 모두 막힘
  foreach tbl in array array['profiles', 'projects', 'my_technologies', 'tech_marks', 'alerts', 'judgments', 'blueprints', 'blueprint_templates', 'my_tech_tags', 'helpful_votes', 'reports', 'template_helpful_votes', 'template_reports'] loop
    begin execute format('select count(*) from public.%I', tbl) into c; msg := msg || tbl || '=OPEN(' || c || ');';
    exception when insufficient_privilege then msg := msg || tbl || '=blocked;'; end;
  end loop;
  -- 쓰기 · 개인 함수는 모두 막힘(실행 권한 없음)
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '손님', null, g); msg := msg || 'confirm=OPEN;';
  exception when insufficient_privilege then msg := msg || 'confirm=blocked;'; end;
  begin r := public.save_blueprint_template(gen_random_uuid(), 'frame', '손님', g); msg := msg || 'save_template=OPEN;';
  exception when insufficient_privilege then msg := msg || 'save_template=blocked;'; end;
  begin perform * from public.my_blueprint_tech_ids(); msg := msg || 'my_tech_ids=OPEN;';
  exception when insufficient_privilege then msg := msg || 'my_tech_ids=blocked;'; end;
  begin perform * from public.my_usage_note_ids(array[un]); msg := msg || 'my_note_ids=OPEN;';
  exception when insufficient_privilege then msg := msg || 'my_note_ids=blocked;'; end;
  begin insert into public.usage_notes (author_id, tech_id, used_for, result, tip) values (u1, tA, 'a', 'b', 'c'); msg := msg || 'insert_note=OPEN;';
  exception when insufficient_privilege then msg := msg || 'insert_note=blocked;'; end;
  begin insert into public.template_notes (template_id, used_for, result, tip) values (pub, 'a', 'b', 'c'); msg := msg || 'insert_tnote=OPEN;';
  exception when insufficient_privilege then msg := msg || 'insert_tnote=blocked;'; end;
  execute 'reset role';

  raise exception 'ROLLBACK_OK %', msg;
  -- 기대: gallery=1(1);nickname=손님시험작가(손님시험작가);no_author_id=true(true);uses=1(1);open_pub=1(1);open_priv=0(0);open_hidden=0(0);open_demo=0(0);usage_notes=1(1);usage_author_id=blocked;template_notes=1(1);tnote_author_id=blocked;profiles=blocked;projects=blocked;my_technologies=blocked;tech_marks=blocked;alerts=blocked;judgments=blocked;blueprints=blocked;blueprint_templates=blocked;my_tech_tags=blocked;helpful_votes=blocked;reports=blocked;template_helpful_votes=blocked;template_reports=blocked;confirm=blocked;save_template=blocked;my_tech_ids=blocked;my_note_ids=blocked;insert_note=blocked;insert_tnote=blocked;
end $$;
