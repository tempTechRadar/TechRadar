-- P-12j H2 기술 관계선 시험: 확정 graph에 맞는 관계선만 남고(없는 기술 · 자기 자신 · 겹침 · 모양 틀림 · 100개 넘음은 뺌, 판은 거절하지 않음),
-- 관계선이 없으면 links 키가 없고, 조합 템플릿엔 남고 틀 템플릿엔 없으며, 남 · 손님은 못 읽는다. 끝에서 일부러 예외를 내 모두 되돌린다.
-- 실행: 202611232000 다음 202611232200을 적용한 뒤 운영 MCP execute_sql로 1번(사용자 승인 뒤). "ROLLBACK_OK ..."가 맨 아래 주석의 기대 문자열과 같아야 한다.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); bp uuid := gen_random_uuid(); bp2 uuid := gen_random_uuid(); tf uuid := gen_random_uuid(); tc uuid := gen_random_uuid();
  t1 uuid; t2 uuid; t3 uuid; e1 text; e2 text; e3 text; r text; c int; lk jsonb; msg text := ''; g jsonb; big jsonb; many jsonb;
begin
  -- 위험이 아닌 실제 기술 3개를 u1의 적용 후보로(청사진 관문 = 내 기술 · 적용 후보 · 내 이력)
  select (array_agg(id order by id))[1], (array_agg(id order by id))[2], (array_agg(id order by id))[3] into t1, t2, t3
    from (select id from public.technologies where grade is distinct from 'danger' and not is_simulated and status <> 'gone' order by id limit 3) x;
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12j-links-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12j-links-u2@example.test', '{"provider":"email"}', '{}', now(), now());
  insert into public.tech_marks (user_id, tech_id, status) values (u1, t1, 'candidate'), (u1, t2, 'candidate'), (u1, t3, 'candidate');
  e1 := t1::text || '@s1'; e2 := t2::text || '@s1'; e3 := t3::text || '@s2';
  g := jsonb_build_object('v', 2, 'edges', jsonb_build_array(jsonb_build_object('from', 's1', 'to', 's2')), 'stages', jsonb_build_array(
    jsonb_build_object('id', 's1', 'name', '개발', 'x', 0, 'y', 0, 'techs', jsonb_build_array(jsonb_build_object('id', t1), jsonb_build_object('id', t2))),
    jsonb_build_object('id', 's2', 'name', '배포', 'x', 400, 'y', 0, 'techs', jsonb_build_array(jsonb_build_object('id', t3)))),
    'links', jsonb_build_array(
      jsonb_build_object('from', e1, 'to', e3),                          -- 남음
      jsonb_build_object('from', e1, 'to', e3),                          -- 겹침
      jsonb_build_object('from', e2, 'to', e2),                          -- 자기 자신
      jsonb_build_object('from', e1, 'to', t3::text || '@s1'),           -- s1에 없는 기술
      jsonb_build_object('from', e1, 'to', gen_random_uuid()::text || '@s2'), -- 없는 기술
      jsonb_build_object('from', 7, 'to', e3), '"x"'::jsonb,              -- 모양 틀림
      jsonb_build_object('from', e2, 'to', e3)));                        -- 남음

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.confirm_blueprint_v2(bp, '관계선 판', null, g); msg := msg || 'confirm=' || r || '(saved);';
  select graph -> 'links' into lk from public.blueprints where id = bp;
  msg := msg || 'kept=' || jsonb_array_length(lk) || '(2);';
  msg := msg || 'first=' || ((lk -> 0) = jsonb_build_object('from', e1, 'to', e3)) || '(true);';
  select count(*) into c from public.blueprints b, jsonb_array_elements(b.board) col, jsonb_array_elements(col) s where b.id = bp and s ? 'links';
  msg := msg || 'board_no_links=' || c || '(0);';
  r := public.confirm_blueprint_v2(bp2, '선 없음', null, g - 'links');
  select count(*) into c from public.blueprints where id = bp2 and graph ? 'links'; msg := msg || 'no_key=' || c || '(0);';
  r := public.save_blueprint_template(tf, 'frame', '틀', g); r := public.save_blueprint_template(tc, 'combo', '조합', g);
  select count(*) into c from public.blueprint_templates where id = tf and graph ? 'links'; msg := msg || 'frame_no_links=' || c || '(0);';
  select jsonb_array_length(graph -> 'links') into c from public.blueprint_templates where id = tc; msg := msg || 'combo_links=' || c || '(2);';
  execute 'reset role';

  -- 100개 한도(서버 키로 함수 직접): 12단계 사슬 × 기술 3개 = 끝 36개, 서로 다른 짝 1,260개 → 앞 100개
  select jsonb_build_object('v', 2,
      'stages', jsonb_agg(jsonb_build_object('id', 'c' || i, 'name', '단계' || i, 'x', i * 400, 'y', 0, 'techs', jsonb_build_array(jsonb_build_object('id', t1), jsonb_build_object('id', t2), jsonb_build_object('id', t3)))),
      'edges', coalesce(jsonb_agg(jsonb_build_object('from', 'c' || (i - 1), 'to', 'c' || i)) filter (where i > 1), '[]'))
    into big from generate_series(1, 12) i;
  select jsonb_agg(jsonb_build_object('from', a.t::text || '@c' || a.i, 'to', b.t::text || '@c' || b.i)) into many
    from (select i, t from generate_series(1, 12) i, unnest(array[t1, t2, t3]) t) a, (select i, t from generate_series(1, 12) i, unnest(array[t1, t2, t3]) t) b
   where (a.i, a.t) <> (b.i, b.t);
  msg := msg || 'pairs=' || jsonb_array_length(many) || '(1260);';
  msg := msg || 'cap=' || jsonb_array_length(public.blueprint_graph_clean(u1, big || jsonb_build_object('links', many)) -> 'graph' -> 'links') || '(100);';

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
  -- 기대: confirm=saved(saved);kept=2(2);first=true(true);board_no_links=0(0);no_key=0(0);frame_no_links=0(0);combo_links=2(2);pairs=1260(1260);cap=100(100);other_reads=0(0);other_template=0(0);clean_direct=blocked(blocked);guest_reads=0(0);
  -- (손님 줄은 권한에 따라 blocked(0)일 수 있음. other_template은 템플릿이 비공개(is_public 기본 false)라 0)
end $$;
