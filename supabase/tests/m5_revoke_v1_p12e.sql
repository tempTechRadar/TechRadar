-- P-12e M5 시험: 옛 확정(v1) 막힘 · v2와 템플릿 저장은 그대로 · p_extra 없는 blueprint_graph_clean · 열린 템플릿 규칙 하나로. 끝에서 일부러 예외를 내 모두 되돌린다.
-- 실행: M5를 적용한 뒤 운영 MCP execute_sql로 1번(사용자 승인 뒤). "ROLLBACK_OK ..."가 맨 아래 주석의 기대 문자열과 같아야 한다.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); p1 uuid; tL uuid; tpl uuid := gen_random_uuid(); n1 uuid; b boolean; gt jsonb;
  r text; c int; msg text := '';
  g jsonb := '{"v":2,"edges":[],"stages":[{"id":"s1","name":"개발","x":0,"y":0,"techs":[]}]}';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12e-m5-u1@example.test', '{"provider":"email"}', '{}', now(), now());
  msg := msg || 'old_clean_gone=' || (to_regprocedure('public.blueprint_graph_clean(uuid,jsonb,uuid[])') is null) || '(true);';
  msg := msg || 'new_clean=' || (to_regprocedure('public.blueprint_graph_clean(uuid,jsonb)') is not null) || '(true);';
  msg := msg || 'clean_exec=' || has_function_privilege('authenticated', 'public.blueprint_graph_clean(uuid,jsonb)', 'execute') || '(false);';

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin r := public.confirm_blueprint(gen_random_uuid(), 'v1', null, '[[{"name":"개발","techs":[]}]]'); msg := msg || 'v1=OPEN;';
  exception when insufficient_privilege then msg := msg || 'v1=blocked;'; end;
  r := public.confirm_blueprint_v2(gen_random_uuid(), 'v2', null, g); msg := msg || 'v2=' || r || '(saved);';
  r := public.save_blueprint_template(gen_random_uuid(), 'frame', '틀', g); msg := msg || 'template=' || r || '(saved);';
  select count(*) into c from public.blueprints; msg := msg || 'rows=' || c || '(1);';
  execute 'reset role';

  execute 'set local role anon';
  begin r := public.confirm_blueprint(gen_random_uuid(), 'anon', null, '[[{"name":"a"}]]'); msg := msg || 'anon_v1=OPEN;';
  exception when insufficient_privilege then msg := msg || 'anon_v1=blocked;'; end;
  execute 'reset role';

  -- 열린 템플릿 규칙 하나로: 공개 뒤 템플릿 기술이 사라지면 사용기도 남 · 손님에게 빠지고, 쓴 사람은 계속 본다
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12e-m5-u2@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12e-m5-u3@example.test', '{"provider":"email"}', '{}', now(), now());
  insert into public.technologies (tech_key, display_name, type, one_liner_source) values ('npm:p12e-m5-l', 'listed-one', 'mcp', 'https://registry.example/m5') returning id into tL;
  insert into public.projects (owner_id, kind, name) values (u1, 'local', 'p12e-m5') returning id into p1;
  insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by) values (u1, p1, tL, 'manual', u1);
  insert into public.tech_marks (user_id, tech_id, status, updated_at) values (u2, tL, 'candidate', now());
  gt := jsonb_set(g, '{stages,0,techs}', jsonb_build_array(jsonb_build_object('id', tL)));
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.save_blueprint_template(tpl, 'combo', '조합', gt);
  b := public.set_template_public(tpl, true);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.confirm_blueprint_v2(gen_random_uuid(), '써 봄', null, gt, tpl);
  insert into public.template_notes (template_id, used_for, result, tip) values (tpl, '위키', '잘 됨', '짧게') returning id into n1;
  execute 'reset role';
  msg := msg || 'open_before=' || public.is_open_template(tpl) || '(true);';
  update public.technologies set status = 'gone' where id = tL;
  msg := msg || 'open_after=' || public.is_open_template(tpl) || '(false);';
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.template_notes where template_id = tpl; msg := msg || 'other_sees=' || c || '(0);';
  begin insert into public.template_helpful_votes (note_id, user_id) values (n1, u3); msg := msg || 'other_vote=OPEN;';
  exception when insufficient_privilege then msg := msg || 'other_vote=blocked;'; end;
  select count(*) into c from public.template_helpful_totals(array[tpl]); msg := msg || 'totals=' || c || '(0);';
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  select count(*) into c from public.template_notes where template_id = tpl; msg := msg || 'guest_sees=' || c || '(0);';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from public.template_notes where template_id = tpl; msg := msg || 'writer_sees=' || c || '(1);';
  execute 'reset role';

  raise exception 'ROLLBACK_OK %', msg;
  -- 기대: old_clean_gone=true(true);new_clean=true(true);clean_exec=false(false);v1=blocked;v2=saved(saved);template=saved(saved);rows=1(1);anon_v1=blocked;open_before=true(true);open_after=false(false);other_sees=0(0);other_vote=blocked;totals=0(0);guest_sees=0(0);writer_sees=1(1);
end $$;
