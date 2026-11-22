-- P-12d-blueprint 시험(불변 3 · 4 · 5). tech_marks_p12d.sql과 같은 방식: 시험 줄을 만들고 끝에서 일부러 예외를 내 **모두 되돌린다**.
-- 결과는 오류 메시지 "BLUEPRINTS_RESULT ..."에 나온다. 괄호 안이 기대값, ...blocked=YES가 막혀야 할 것.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  p1 uuid; p2 uuid; ta uuid; td uuid; b1 uuid := gen_random_uuid(); n int; r text; v text; msg text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bp-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bp-u2@example.test', '{"provider":"email"}', '{}', now(), now()),
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bp-adm@example.test', '{"provider":"email"}', '{}', now(), now());
  update public.profiles set role = 'admin' where id = adm;
  insert into public.projects (owner_id, kind, name) values (u1, 'local', 'bp-p1') returning id into p1;
  insert into public.projects (owner_id, kind, name) values (u2, 'local', 'bp-p2') returning id into p2;
  insert into public.technologies (tech_key, display_name, type) values ('npm:bp-a', 'bp-a(DB 이름)', 'mcp') returning id into ta;
  insert into public.technologies (tech_key, display_name, type, grade) values ('npm:bp-d', 'bp-d', 'mcp', 'danger') returning id into td;
  -- P-12e M1 뒤로 v1도 관문(내 기술 · 적용 후보 · 내 이력)을 거친다: ta는 u1의 내 기술로 둔다
  insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by) values (u1, p1, ta, 'manual', u1);

  -- u1: 본인 프로젝트로 확정 → 기술 이름은 DB에서, 같은 기술 두 번은 한 번 → 같은 id 다시는 'exists' · 한 줄 그대로
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.confirm_blueprint(b1, ' 첫 판 ', p1, jsonb_build_array(jsonb_build_array(jsonb_build_object('name', ' 개발 ', 'techs', jsonb_build_array(jsonb_build_object('id', ta, 'name', '가짜'), jsonb_build_object('id', ta))))));
  msg := msg || 'first=' || r || '(saved);';
  r := public.confirm_blueprint(b1, '첫 판', p1, '[[{"name":"개발"}]]');
  msg := msg || 'again=' || r || '(exists);';
  select count(*) into n from public.blueprints; msg := msg || 'own_rows=' || n || '(1);';
  select name || '|' || (board -> 0 -> 0 ->> 'name') || '|' || (board -> 0 -> 0 -> 'techs' -> 0 ->> 'name') || '|' || jsonb_array_length(board -> 0 -> 0 -> 'techs')
    into v from public.blueprints where id = b1;
  msg := msg || 'stored=' || v || '(첫 판|개발|bp-a(DB 이름)|1);';
  begin
    perform public.confirm_blueprint(gen_random_uuid(), '남의 프로젝트', p2, '[[{"name":"a"}]]');
    msg := msg || 'other_project_blocked=NO;';
  exception when others then msg := msg || 'other_project_blocked=YES;';
  end;
  begin
    perform public.confirm_blueprint(gen_random_uuid(), '위험', null, jsonb_build_array(jsonb_build_array(jsonb_build_object('name', 'a', 'techs', jsonb_build_array(jsonb_build_object('id', td))))));
    msg := msg || 'danger_blocked=NO;';
  exception when others then msg := msg || 'danger_blocked=YES;';
  end;
  begin
    perform public.confirm_blueprint(gen_random_uuid(), '없는 기술', null, jsonb_build_array(jsonb_build_array(jsonb_build_object('name', 'a', 'techs', jsonb_build_array(jsonb_build_object('id', gen_random_uuid()))))));
    msg := msg || 'missing_tech_blocked=NO;';
  exception when others then msg := msg || 'missing_tech_blocked=YES;';
  end;
  begin
    perform public.confirm_blueprint(gen_random_uuid(), '틀린 id', null, '[[{"name":"a","techs":[{"id":"drop"}]}]]');
    msg := msg || 'bad_tech_id_blocked=NO;';
  exception when others then msg := msg || 'bad_tech_id_blocked=YES;';
  end;
  begin
    perform public.confirm_blueprint(gen_random_uuid(), '  ', null, '[[{"name":"a"}]]');
    msg := msg || 'blank_name_blocked=NO;';
  exception when others then msg := msg || 'blank_name_blocked=YES;';
  end;
  begin
    perform public.confirm_blueprint(gen_random_uuid(), '빈 판', null, '[]');
    msg := msg || 'empty_board_blocked=NO;';
  exception when others then msg := msg || 'empty_board_blocked=YES;';
  end;
  begin
    perform public.confirm_blueprint(gen_random_uuid(), '나란히 다섯', null, '[[{"name":"a"},{"name":"b"},{"name":"c"},{"name":"d"},{"name":"e"}]]');
    msg := msg || 'five_parallel_blocked=NO;';
  exception when others then msg := msg || 'five_parallel_blocked=YES;';
  end;
  begin
    insert into public.blueprints (id, name, board) values (gen_random_uuid(), '직접 넣기', '[[{"name":"a","techs":[]}]]');
    msg := msg || 'direct_insert_blocked=NO;';
  exception when others then msg := msg || 'direct_insert_blocked=YES;';
  end;
  begin
    update public.blueprints set name = '고침' where id = b1;
    msg := msg || 'update_blocked=NO;';
  exception when others then msg := msg || 'update_blocked=YES;';
  end;
  begin
    delete from public.blueprints where id = b1;
    msg := msg || 'delete_blocked=NO;';
  exception when others then msg := msg || 'delete_blocked=YES;';
  end;
  execute 'reset role';

  -- 남: u1 것은 안 보이고, u1의 id로 확정하면 막힘. 관리자도 못 봄(불변 5)
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.blueprints; msg := msg || 'other_sees=' || n || '(0);';
  begin
    perform public.confirm_blueprint(b1, '남의 id', null, '[[{"name":"a"}]]');
    msg := msg || 'other_id_blocked=NO;';
  exception when others then msg := msg || 'other_id_blocked=YES;';
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.blueprints; msg := msg || 'admin_sees=' || n || '(0);';
  execute 'reset role';

  -- 로그인 안 한 사람: 읽기 · 함수 모두 막힘
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  begin
    perform count(*) from public.blueprints;
    msg := msg || 'anon_read_blocked=NO;';
  exception when others then msg := msg || 'anon_read_blocked=YES;';
  end;
  begin
    perform public.confirm_blueprint(gen_random_uuid(), 'anon', null, '[[{"name":"a"}]]');
    msg := msg || 'anon_rpc_blocked=NO;';
  exception when others then msg := msg || 'anon_rpc_blocked=YES;';
  end;
  execute 'reset role';

  raise exception 'BLUEPRINTS_RESULT %', msg;  -- 일부러 실패시켜 위의 모든 줄을 되돌린다
end $$;
