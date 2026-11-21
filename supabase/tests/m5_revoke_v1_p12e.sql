-- P-12e M5 시험: 옛 확정(v1) 막힘 · v2와 템플릿 저장은 그대로 · p_extra 없는 blueprint_graph_clean. 끝에서 일부러 예외를 내 모두 되돌린다.
-- 실행: M5를 적용한 뒤 운영 MCP execute_sql로 1번(사용자 승인 뒤). "ROLLBACK_OK ..."가 맨 아래 주석의 기대 문자열과 같아야 한다.
do $$
declare
  u1 uuid := gen_random_uuid(); r text; c int; msg text := '';
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

  raise exception 'ROLLBACK_OK %', msg;
  -- 기대: old_clean_gone=true(true);new_clean=true(true);clean_exec=false(false);v1=blocked;v2=saved(saved);template=saved(saved);rows=1(1);anon_v1=blocked;
end $$;
