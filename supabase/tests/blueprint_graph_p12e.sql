-- P-12e M1 청사진 그래프 v2 권한 · 동작 시험(불변 1·3·4·5). my_tech_tags_p12d.sql과 같은 방식: 끝에서 일부러 예외를 내 모두 되돌린다(실제 DB에 아무것도 남지 않음).
-- 실행: 운영 Supabase(techradar) SQL 편집기 또는 MCP execute_sql. 운영에 쓰고 ROLLBACK으로 되돌리는 일이라 사용자 승인 뒤에만, 다른 SQL 시험과 동시에 돌리지 않는다.
-- 결과: "오류"로 끝나는 것이 정상. 메시지 "ROLLBACK_OK ..."가 맨 아래 주석의 기대 문자열과 같아야 한다.
-- 관문(넣을 수 있는 기술): 내 기술 tA · 적용 후보 표시 tB · 표시보다 늦은 알림 판단 candidate tE · 알림 판단보다 늦은 표시 candidate tF · 내 이력 tI.
-- 막혀야 하는 것: 고른 적 없음 tC · 위험 등급 tD · 표시보다 늦은 알림 판단 hold tG · 남의 적용 후보 tH · 보관한 프로젝트 tJ · 숨긴 내 기술 tK.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  p1 uuid; p_arch uuid; tA uuid; tB uuid; tC uuid; tD uuid; tE uuid; tF uuid; tG uuid; tH uuid; tI uuid; tJ uuid; tK uuid;
  c uuid; a uuid; bp uuid := gen_random_uuid(); r text; n int; msg text := ''; g jsonb; row_board jsonb; row_graph jsonb; i int;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12e-g-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12e-g-u2@example.test', '{"provider":"email"}', '{}', now(), now());
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12e-a', '진짜 이름 A', 'mcp') returning id into tA;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12e-b', 'B', 'mcp') returning id into tB;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12e-c', 'C', 'mcp') returning id into tC;
  insert into public.technologies (tech_key, display_name, type, grade) values ('npm:p12e-d', 'D', 'mcp', 'danger') returning id into tD;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12e-e', 'E', 'mcp') returning id into tE;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12e-f', 'F', 'mcp') returning id into tF;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12e-g', 'G', 'mcp') returning id into tG;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12e-h', 'H', 'mcp') returning id into tH;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12e-i', 'I', 'mcp') returning id into tI;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12e-j', 'J', 'mcp') returning id into tJ;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12e-k', 'K', 'mcp') returning id into tK;
  insert into public.projects (owner_id, kind, name) values (u1, 'local', 'p12e') returning id into p1;
  insert into public.projects (owner_id, kind, name, repo_url, archived_at) values (u1, 'repo', 'p12e-old', 'https://github.com/x/p12e-old', now()) returning id into p_arch;
  insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by) values (u1, p1, tA, 'manual', u1), (u1, p1, tD, 'manual', u1), (u1, p_arch, tJ, 'manual', u1);
  insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by, hidden_at) values (u1, p1, tK, 'manual', u1, now());
  insert into public.tech_marks (user_id, tech_id, status, updated_at) values
    (u1, tB, 'candidate', now()), (u1, tE, 'interest', now() - interval '1 day'), (u1, tF, 'candidate', now() + interval '1 day'),
    (u1, tG, 'candidate', now() - interval '1 day'), (u2, tH, 'candidate', now());
  insert into public.blueprints (id, user_id, name, board) values (gen_random_uuid(), u1, '옛 이력', jsonb_build_array(jsonb_build_array(jsonb_build_object('name', '옛 단계', 'techs', jsonb_build_array(jsonb_build_object('id', tI, 'name', 'I'))))));

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  -- 알림 판단(본인 토큰으로 save_judgment): tE candidate(표시보다 늦음 → 판단이 이김), tF hold(표시가 더 늦음 → 표시가 이김), tG hold(표시보다 늦음 → 판단이 이김)
  foreach c in array array[tE, tF, tG] loop
    insert into public.changes (kind, tech_id, cause_id, dedupe_key) values ('same_role_new', c, 'p12e', 'change:p12e:' || c) returning id into a;
    insert into public.alerts (user_id, change_id, kind, dedupe_key) values (u1, a, 'opportunity', 'alert:p12e:' || c) returning id into a;
    execute 'set local role authenticated';
    perform public.save_judgment(a, case when c = tE then 'candidate' else 'hold' end, case when c = tE then null else '다음 분기에 다시 보기' end, null);
    execute 'reset role';
  end loop;

  execute 'set local role authenticated';
  -- 한 기술씩 넣어 본다(단계 하나짜리 그래프)
  foreach c in array array[tA, tB, tE, tF, tI, tC, tD, tG, tH, tJ, tK] loop
    g := jsonb_build_object('v', 2, 'edges', '[]'::jsonb, 'stages', jsonb_build_array(jsonb_build_object('id', 's1', 'name', '하나', 'x', 0, 'y', 0, 'techs', jsonb_build_array(jsonb_build_object('id', c, 'name', '가짜')))));
    begin
      r := public.confirm_blueprint_v2(gen_random_uuid(), '하나씩', null, g);
      msg := msg || 'allow_' || (case c when tA then 'A' when tB then 'B' when tE then 'E' when tF then 'F' when tI then 'I' when tC then 'C' when tD then 'D' when tG then 'G' when tH then 'H' when tJ then 'J' else 'K' end) || '=' || r || ';';
    exception when raise_exception then
      msg := msg || 'allow_' || (case c when tA then 'A' when tB then 'B' when tE then 'E' when tF then 'F' when tI then 'I' when tC then 'C' when tD then 'D' when tG then 'G' when tH then 'H' when tJ then 'J' else 'K' end) || '=' || (case when sqlerrm like '%위험 등급%' then 'danger' when sqlerrm like '%고른 적 없는%' then 'gate' else sqlerrm end) || ';';
    end;
  end loop;

  -- 투영: s1 → s2, s1 → s3 (s2·s3 같은 깊이, y가 작은 s3가 먼저). 화면이 보낸 기술 이름은 버리고 DB 이름
  g := jsonb_build_object('v', 2,
    'stages', jsonb_build_array(
      jsonb_build_object('id', 's1', 'name', '  시작 ', 'x', 0, 'y', 0, 'techs', jsonb_build_array(jsonb_build_object('id', tA, 'name', '가짜'), jsonb_build_object('id', tA))),
      jsonb_build_object('id', 's2', 'name', '아래', 'x', 300, 'y', 200, 'techs', '[]'::jsonb),
      jsonb_build_object('id', 's3', 'name', '위', 'x', 300, 'y', -100, 'techs', jsonb_build_array(jsonb_build_object('id', tB)))),
    'edges', jsonb_build_array(jsonb_build_object('from', 's1', 'to', 's2'), jsonb_build_object('from', 's1', 'to', 's3')));
  r := public.confirm_blueprint_v2(bp, '투영 시험', p1, g); msg := msg || 'save=' || r || '(saved);';
  r := public.confirm_blueprint_v2(bp, '투영 시험', p1, g); msg := msg || 'again=' || r || '(exists);';
  select board, graph into row_board, row_graph from public.blueprints where id = bp;
  msg := msg || 'cols=' || jsonb_array_length(row_board) || '(2);';
  msg := msg || 'col2_order=' || (row_board -> 1 -> 0 ->> 'name') || ',' || (row_board -> 1 -> 1 ->> 'name') || '(위,아래);';
  msg := msg || 'name_trim=' || (row_board -> 0 -> 0 ->> 'name') || '(시작);';
  msg := msg || 'db_name=' || (row_board -> 0 -> 0 -> 'techs' -> 0 ->> 'name') || '(진짜 이름 A);';
  msg := msg || 'dedupe=' || jsonb_array_length(row_board -> 0 -> 0 -> 'techs') || '(1);';
  msg := msg || 'graph_kept=' || jsonb_array_length(row_graph -> 'edges') || '(2);';

  -- 막혀야 하는 그래프
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '고리', null, jsonb_build_object('v', 2,
      'stages', jsonb_build_array(jsonb_build_object('id', 'a', 'name', 'a', 'x', 0, 'y', 0), jsonb_build_object('id', 'b', 'name', 'b', 'x', 0, 'y', 0)),
      'edges', jsonb_build_array(jsonb_build_object('from', 'a', 'to', 'b'), jsonb_build_object('from', 'b', 'to', 'a')))); msg := msg || 'cycle=OPEN;';
  exception when raise_exception then msg := msg || 'cycle=' || case when sqlerrm like '%사이클%' then 'blocked' else sqlerrm end || ';'; end;
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '자기', null, jsonb_build_object('v', 2,
      'stages', jsonb_build_array(jsonb_build_object('id', 'a', 'name', 'a', 'x', 0, 'y', 0)), 'edges', jsonb_build_array(jsonb_build_object('from', 'a', 'to', 'a')))); msg := msg || 'self=OPEN;';
  exception when raise_exception then msg := msg || 'self=blocked;'; end;
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '겹침', null, jsonb_build_object('v', 2,
      'stages', jsonb_build_array(jsonb_build_object('id', 'a', 'name', 'a', 'x', 0, 'y', 0), jsonb_build_object('id', 'b', 'name', 'b', 'x', 0, 'y', 0)),
      'edges', jsonb_build_array(jsonb_build_object('from', 'a', 'to', 'b'), jsonb_build_object('from', 'a', 'to', 'b')))); msg := msg || 'dup_edge=OPEN;';
  exception when raise_exception then msg := msg || 'dup_edge=blocked;'; end;
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '없는 단계', null, jsonb_build_object('v', 2,
      'stages', jsonb_build_array(jsonb_build_object('id', 'a', 'name', 'a', 'x', 0, 'y', 0)), 'edges', jsonb_build_array(jsonb_build_object('from', 'a', 'to', 'z')))); msg := msg || 'missing=OPEN;';
  exception when raise_exception then msg := msg || 'missing=blocked;'; end;
  -- 깊이 13(사슬)
  g := jsonb_build_object('v', 2, 'stages', (select jsonb_agg(jsonb_build_object('id', 'n' || k, 'name', 'n' || k, 'x', k * 10, 'y', 0)) from generate_series(1, 13) k),
    'edges', (select jsonb_agg(jsonb_build_object('from', 'n' || k, 'to', 'n' || (k + 1))) from generate_series(1, 12) k));
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '깊이', null, g); msg := msg || 'depth13=OPEN;';
  exception when raise_exception then msg := msg || 'depth13=' || case when sqlerrm like '%깊이는 12%' then 'blocked' else sqlerrm end || ';'; end;
  -- 같은 깊이 5개(선 없는 단계 5개 = 모두 깊이 0)
  g := jsonb_build_object('v', 2, 'edges', '[]'::jsonb, 'stages', (select jsonb_agg(jsonb_build_object('id', 'p' || k, 'name', 'p' || k, 'x', 0, 'y', k)) from generate_series(1, 5) k));
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '나란히', null, g); msg := msg || 'parallel5=OPEN;';
  exception when raise_exception then msg := msg || 'parallel5=' || case when sqlerrm like '%같은 깊이%' then 'blocked' else sqlerrm end || ';'; end;
  -- 단계 49개
  g := jsonb_build_object('v', 2, 'edges', '[]'::jsonb, 'stages', (select jsonb_agg(jsonb_build_object('id', 'q' || k, 'name', 'q' || k, 'x', 0, 'y', k)) from generate_series(1, 49) k));
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '많음', null, g); msg := msg || 'stages49=OPEN;';
  exception when raise_exception then msg := msg || 'stages49=blocked;'; end;
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '옛 모양', null, jsonb_build_object('v', 1, 'stages', '[]'::jsonb)); msg := msg || 'not_v2=OPEN;';
  exception when raise_exception then msg := msg || 'not_v2=blocked;'; end;
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '소수 자리', null, jsonb_build_object('v', 2, 'edges', '[]'::jsonb,
      'stages', jsonb_build_array(jsonb_build_object('id', 'a', 'name', 'a', 'x', 1.5, 'y', 0)))); msg := msg || 'fraction_xy=OPEN;';
  exception when raise_exception then msg := msg || 'fraction_xy=blocked;'; end;
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '한글 id', null, jsonb_build_object('v', 2, 'edges', '[]'::jsonb,
      'stages', jsonb_build_array(jsonb_build_object('id', '단계1', 'name', 'a', 'x', 0, 'y', 0)))); msg := msg || 'non_ascii_id=OPEN;';
  exception when raise_exception then msg := msg || 'non_ascii_id=blocked;'; end;
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), '템플릿', null, jsonb_build_object('v', 2, 'edges', '[]'::jsonb,
      'stages', jsonb_build_array(jsonb_build_object('id', 'a', 'name', 'a', 'x', 0, 'y', 0))), gen_random_uuid()); msg := msg || 'template_before_m2=OPEN;';
  exception when raise_exception then msg := msg || 'template_before_m2=blocked;'; end;

  -- 권한: 검사 함수 · 허용 목록 함수는 사용자가 직접 못 부른다, 표에 직접 넣기 못 함
  begin perform public.blueprint_graph_clean(u1, g); msg := msg || 'call_clean=OPEN;';
  exception when insufficient_privilege then msg := msg || 'call_clean=blocked;'; end;
  begin perform * from public.blueprint_allowed_techs(u2); msg := msg || 'call_allowed=OPEN;';
  exception when insufficient_privilege then msg := msg || 'call_allowed=blocked;'; end;
  begin insert into public.blueprints (id, user_id, name, board) values (gen_random_uuid(), u1, '직접', '[[{"name":"x","techs":[]}]]'); msg := msg || 'direct_insert=OPEN;';
  exception when insufficient_privilege then msg := msg || 'direct_insert=blocked;'; end;
  execute 'reset role';

  -- 남이 내 확정 id를 다시 쓰면 막힘, 남은 내 청사진을 못 봄
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin r := public.confirm_blueprint_v2(bp, '남의 id', null, jsonb_build_object('v', 2, 'edges', '[]'::jsonb,
      'stages', jsonb_build_array(jsonb_build_object('id', 'a', 'name', 'a', 'x', 0, 'y', 0)))); msg := msg || 'other_id=OPEN;';
  exception when raise_exception then msg := msg || 'other_id=blocked;'; end;
  select count(*) into n from public.blueprints where user_id = u1; msg := msg || 'other_sees=' || n || '(0);';
  execute 'reset role';

  execute 'set local role anon';
  begin r := public.confirm_blueprint_v2(gen_random_uuid(), 'anon', null, g); msg := msg || 'anon_confirm=OPEN;';
  exception when insufficient_privilege then msg := msg || 'anon_confirm=blocked;'; end;
  execute 'reset role';

  raise exception 'ROLLBACK_OK %', msg;
  -- 기대: allow_A=saved;allow_B=saved;allow_E=saved;allow_F=saved;allow_I=saved;allow_C=gate;allow_D=danger;allow_G=gate;allow_H=gate;allow_J=gate;allow_K=gate;save=saved(saved);again=exists(exists);cols=2(2);col2_order=위,아래(위,아래);name_trim=시작(시작);db_name=진짜 이름 A(진짜 이름 A);dedupe=1(1);graph_kept=2(2);cycle=blocked;self=blocked;dup_edge=blocked;missing=blocked;depth13=blocked;parallel5=blocked;stages49=blocked;not_v2=blocked;fraction_xy=blocked;non_ascii_id=blocked;template_before_m2=blocked;call_clean=blocked;call_allowed=blocked;direct_insert=blocked;other_id=blocked;other_sees=0(0);anon_confirm=blocked;
end $$;
