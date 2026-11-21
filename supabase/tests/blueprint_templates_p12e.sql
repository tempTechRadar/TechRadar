-- P-12e M2 청사진 템플릿 · 공개 갤러리 권한 · 동작 시험(불변 1·3·4·5, ADR 0036). 끝에서 일부러 예외를 내 모두 되돌린다.
-- 실행: M1 · M2를 적용한 뒤 운영 Supabase SQL 편집기 또는 MCP execute_sql로 1번(사용자 승인 뒤, 다른 SQL 시험과 동시에 돌리지 않음).
-- 결과: "오류"로 끝나는 것이 정상. "ROLLBACK_OK ..."가 맨 아래 주석의 기대 문자열과 같아야 한다.
-- 사람: u1 = 템플릿 작가(tA를 내 기술로 가짐), u2 = 다른 사람(아무 기술도 안 고름), u3 = 시연 계정, adm = 관리자.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  p1 uuid; tA uuid; tC uuid; tD uuid; combo uuid := gen_random_uuid(); frame uuid := gen_random_uuid(); priv uuid := gen_random_uuid(); demo uuid := gen_random_uuid();
  r text; b boolean; n int; msg text := ''; g jsonb; row_json jsonb; i int;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12e-t-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12e-t-u2@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12e-t-u3@example.test', '{"provider":"email"}', '{}', now(), now()),
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12e-t-adm@example.test', '{"provider":"email"}', '{}', now(), now());
  update public.profiles set nickname = '템플릿작가', is_public = true where id = u1;
  update public.profiles set is_demo = true where id = u3;
  update public.profiles set role = 'admin' where id = adm;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12e-t-a', 'tA', 'mcp') returning id into tA;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12e-t-c', 'tC', 'mcp') returning id into tC;
  insert into public.technologies (tech_key, display_name, type, grade) values ('npm:p12e-t-d', 'tD', 'mcp', 'danger') returning id into tD;
  insert into public.projects (owner_id, kind, name) values (u1, 'local', 'p12e-t') returning id into p1;
  insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by) values (u1, p1, tA, 'manual', u1), (u1, p1, tD, 'manual', u1);
  insert into public.projects (owner_id, kind, name) values (u3, 'local', 'p12e-t3') returning id into p1;

  -- u1: 조합 저장(관문 통과) · 다시 보내면 exists · 고른 적 없는 기술 · 위험 등급은 막힘 · 틀은 기술을 빼고 저장 · 비공개 하나
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  g := jsonb_build_object('v', 2, 'edges', '[]'::jsonb, 'stages', jsonb_build_array(jsonb_build_object('id', 's1', 'name', '개발', 'x', 0, 'y', 0, 'techs', jsonb_build_array(jsonb_build_object('id', tA)))));
  r := public.save_blueprint_template(combo, 'combo', ' 내 조합 ', g); msg := msg || 'save_combo=' || r || '(saved);';
  r := public.save_blueprint_template(combo, 'combo', '내 조합', g); msg := msg || 'again=' || r || '(exists);';
  begin r := public.save_blueprint_template(gen_random_uuid(), 'combo', '고른 적 없음', jsonb_set(g, '{stages,0,techs}', jsonb_build_array(jsonb_build_object('id', tC)))); msg := msg || 'combo_gate=OPEN;';
  exception when raise_exception then msg := msg || 'combo_gate=' || case when sqlerrm like '%고른 적 없는%' then 'blocked' else sqlerrm end || ';'; end;
  begin r := public.save_blueprint_template(gen_random_uuid(), 'combo', '위험', jsonb_set(g, '{stages,0,techs}', jsonb_build_array(jsonb_build_object('id', tD)))); msg := msg || 'combo_danger=OPEN;';
  exception when raise_exception then msg := msg || 'combo_danger=' || case when sqlerrm like '%위험 등급%' then 'blocked' else sqlerrm end || ';'; end;
  r := public.save_blueprint_template(frame, 'frame', '내 틀', jsonb_set(g, '{stages,0,techs}', jsonb_build_array(jsonb_build_object('id', tC))));
  select jsonb_array_length(graph -> 'stages' -> 0 -> 'techs') into n from public.blueprint_templates where id = frame;
  msg := msg || 'frame=' || r || ',techs=' || n || '(saved,techs=0);';
  r := public.save_blueprint_template(priv, 'combo', '비공개', g);
  begin r := public.save_blueprint_template(gen_random_uuid(), 'note', '종류 틀림', g); msg := msg || 'bad_kind=OPEN;';
  exception when raise_exception then msg := msg || 'bad_kind=blocked;'; end;
  begin insert into public.blueprint_templates (id, kind, name, graph, board) values (gen_random_uuid(), 'frame', '직접', g, '[]'); msg := msg || 'direct_insert=OPEN;';
  exception when insufficient_privilege then msg := msg || 'direct_insert=blocked;'; end;
  begin update public.blueprint_templates set is_public = true where id = priv; msg := msg || 'direct_update=OPEN;';
  exception when insufficient_privilege then msg := msg || 'direct_update=blocked;'; end;
  b := public.set_template_public(combo, true); msg := msg || 'publish=' || b || '(true);';
  b := public.set_template_public(frame, true);
  execute 'reset role';

  -- u2: 남의 비공개는 못 봄 · 남의 템플릿 공개 못 바꿈 · 갤러리에 공개 2개(별명, author_id 없음)
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.blueprint_templates; msg := msg || 'u2_sees_rows=' || n || '(0);';
  begin b := public.set_template_public(priv, true); msg := msg || 'other_publish=OPEN;';
  exception when raise_exception then msg := msg || 'other_publish=blocked;'; end;
  select count(*) into n from public.public_blueprint_templates() t where t.id in (combo, frame, priv); msg := msg || 'gallery=' || n || '(2);';
  select to_jsonb(t) into row_json from public.public_blueprint_templates('combo') t where t.id = combo;
  msg := msg || 'nickname=' || (row_json ->> 'author_nickname') || '(템플릿작가);';
  msg := msg || 'no_author_id=' || (not (row_json ? 'author_id')) || '(true);';
  -- u2는 tA를 고른 적 없지만 공개 조합 템플릿으로 시작하면 그 기술은 받는다. 템플릿에 없는 고른 적 없는 기술은 막힘, 남의 비공개 템플릿은 못 씀
  -- 템플릿 없이는 tA를 못 넣는다(템플릿으로 확정하면 그 뒤로는 내 이력이 되므로 먼저 본다)
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '템플릿 없이', null, g); msg := msg || 'no_template_gate=OPEN;';
  exception when raise_exception then msg := msg || 'no_template_gate=blocked;'; end;
  r := public.confirm_blueprint_v2(gen_random_uuid(), '템플릿으로', null, g, combo); msg := msg || 'confirm_with_template=' || r || '(saved);';
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '템플릿 밖', null, jsonb_set(g, '{stages,0,techs}', jsonb_build_array(jsonb_build_object('id', tA), jsonb_build_object('id', tC))), combo); msg := msg || 'outside_template=OPEN;';
  exception when raise_exception then msg := msg || 'outside_template=' || case when sqlerrm like '%고른 적 없는%' then 'blocked' else sqlerrm end || ';'; end;
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '비공개', null, g, priv); msg := msg || 'private_template=OPEN;';
  exception when raise_exception then msg := msg || 'private_template=' || case when sqlerrm like '%쓸 수 없는 템플릿%' then 'blocked' else sqlerrm end || ';'; end;
  select t.uses into n from public.public_blueprint_templates('combo') t where t.id = combo; msg := msg || 'uses=' || n || '(1);';
  select count(*) into n from public.blueprint_template_for_use(combo); msg := msg || 'open_public=' || n || '(1);';
  select count(*) into n from public.blueprint_template_for_use(priv); msg := msg || 'open_private=' || n || '(0);';
  begin perform public.hide_blueprint_template(combo, true); msg := msg || 'user_hide=OPEN;';
  exception when raise_exception then msg := msg || 'user_hide=blocked;'; end;
  execute 'reset role';

  -- 시연 계정이 공개한 템플릿은 갤러리에서 빠진다(u3은 기술 없는 틀로)
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.save_blueprint_template(demo, 'frame', '시연 틀', jsonb_set(g, '{stages,0,techs}', '[]'::jsonb));
  b := public.set_template_public(demo, true);
  select count(*) into n from public.public_blueprint_templates() t where t.id = demo; msg := msg || 'demo_in_gallery=' || n || '(0);';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '시연 템플릿', null, jsonb_set(g, '{stages,0,techs}', '[]'::jsonb), demo); msg := msg || 'demo_template_use=OPEN;';
  exception when raise_exception then msg := msg || 'demo_template_use=' || case when sqlerrm like '%쓸 수 없는 템플릿%' then 'blocked' else sqlerrm end || ';'; end;
  execute 'reset role';

  -- 관리자 숨김 → 갤러리에서 빠짐, 작가는 다시 공개 못 함
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.blueprint_templates where id = priv; msg := msg || 'admin_sees_private=' || n || '(0);';
  begin perform public.hide_blueprint_template(priv, true); msg := msg || 'admin_hide_private=OPEN;';
  exception when raise_exception then msg := msg || 'admin_hide_private=blocked;'; end;
  b := public.hide_blueprint_template(combo, true); msg := msg || 'admin_hide=' || b || '(true);';
  select count(*) into n from public.public_blueprint_templates() t where t.id = combo; msg := msg || 'hidden_in_gallery=' || n || '(0);';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin b := public.set_template_public(combo, true); msg := msg || 'republish_hidden=OPEN;';
  exception when raise_exception then msg := msg || 'republish_hidden=blocked;'; end;
  execute 'reset role';
  update public.profiles set is_public = false where id = u1;
  execute 'set local role authenticated';
  select t.author_nickname into r from public.public_blueprint_templates('frame') t where t.id = frame; msg := msg || 'private_profile_nickname=' || r || '(익명);';
  -- 한 사람 100개까지(지금 3개 → 97개 더 넣고 101번째는 막힘)
  for i in 1..97 loop perform public.save_blueprint_template(gen_random_uuid(), 'frame', '틀' || i, jsonb_set(g, '{stages,0,techs}', '[]'::jsonb)); end loop;
  begin r := public.save_blueprint_template(gen_random_uuid(), 'frame', '넘침', jsonb_set(g, '{stages,0,techs}', '[]'::jsonb)); msg := msg || 'over_100=OPEN;';
  exception when raise_exception then msg := msg || 'over_100=' || case when sqlerrm like '%템플릿 한도%' then 'blocked' else sqlerrm end || ';'; end;
  execute 'reset role';

  execute 'set local role anon';
  begin perform * from public.public_blueprint_templates(); msg := msg || 'anon_gallery=OPEN;';
  exception when insufficient_privilege then msg := msg || 'anon_gallery=blocked;'; end;
  begin perform 1 from public.blueprint_templates; msg := msg || 'anon_read=OPEN;';
  exception when insufficient_privilege then msg := msg || 'anon_read=blocked;'; end;
  execute 'reset role';

  raise exception 'ROLLBACK_OK %', msg;
  -- 기대: save_combo=saved(saved);again=exists(exists);combo_gate=blocked;combo_danger=blocked;frame=saved,techs=0(saved,techs=0);bad_kind=blocked;direct_insert=blocked;direct_update=blocked;publish=true(true);u2_sees_rows=0(0);other_publish=blocked;gallery=2(2);nickname=템플릿작가(템플릿작가);no_author_id=true(true);no_template_gate=blocked;confirm_with_template=saved(saved);outside_template=blocked;private_template=blocked;uses=1(1);open_public=1(1);open_private=0(0);user_hide=blocked;demo_in_gallery=0(0);demo_template_use=blocked;admin_sees_private=0(0);admin_hide_private=blocked;admin_hide=true(true);hidden_in_gallery=0(0);republish_hidden=blocked;private_profile_nickname=익명(익명);over_100=blocked;anon_gallery=blocked;anon_read=blocked;
end $$;
