-- P-12e M4 시험(불변 3 · 5). blueprints_p12d.sql과 같은 방식: 시험 줄을 만들고 끝에서 일부러 예외를 내 **모두 되돌린다**.
-- 마이그레이션 202611221300_P-12e_blueprint_checks.sql을 적용한 뒤에 돌린다(적용 전에는 표가 없어 실패).
-- 결과는 오류 메시지 "BLUEPRINT_CHECKS_RESULT ..."에 나온다. 괄호 안이 기대값, ...blocked=YES가 막혀야 할 것.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid(); c1 uuid; n int; msg text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bc-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bc-u2@example.test', '{"provider":"email"}', '{}', now(), now()),
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bc-adm@example.test', '{"provider":"email"}', '{}', now(), now());
  update public.profiles set role = 'admin' where id = adm;
  insert into public.blueprints (id, user_id, name, board) values
    (b1, u1, 'bc-1', '[[{"name":"a","techs":[]}]]'), (b2, u2, 'bc-2', '[[{"name":"a","techs":[]}]]');

  -- u1: 본인 청사진에 점검 요청은 되고, 상태 · 본문 · 해시를 직접 쓰는 것과 남의 청사진 · 남의 이름 요청은 막힌다
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.blueprint_checks (blueprint_id, requested_by) values (b1, u1) returning id into c1;
  select count(*) into n from public.blueprint_checks; msg := msg || 'own_rows=' || n || '(1);';
  begin
    insert into public.blueprint_checks (blueprint_id, requested_by) values (b1, u1);
    msg := msg || 'second_generating_blocked=NO;';
  exception when unique_violation then msg := msg || 'second_generating_blocked=YES;';
  end;
  begin
    insert into public.blueprint_checks (blueprint_id, requested_by) values (b2, u1);
    msg := msg || 'other_blueprint_blocked=NO;';
  exception when others then msg := msg || 'other_blueprint_blocked=YES;';
  end;
  begin
    insert into public.blueprint_checks (blueprint_id, requested_by) values (b1, u2);
    msg := msg || 'as_other_user_blocked=NO;';
  exception when others then msg := msg || 'as_other_user_blocked=YES;';
  end;
  begin
    insert into public.blueprint_checks (blueprint_id, requested_by, body) values (b1, u1, '{"fake": true}');
    msg := msg || 'with_body_blocked=NO;';
  exception when others then msg := msg || 'with_body_blocked=YES;';
  end;
  begin
    insert into public.blueprint_checks (blueprint_id, requested_by, input_hash) values (b1, u1, 'forged');
    msg := msg || 'with_hash_blocked=NO;';
  exception when others then msg := msg || 'with_hash_blocked=YES;';
  end;
  begin
    update public.blueprint_checks set status = 'done' where id = c1;
    get diagnostics n = row_count; msg := msg || 'own_update_rows=' || n || '(blocked);';
  exception when others then msg := msg || 'own_update_blocked=YES;';
  end;
  begin
    delete from public.blueprint_checks where id = c1;
    get diagnostics n = row_count; msg := msg || 'own_delete_rows=' || n || '(blocked);';
  exception when others then msg := msg || 'own_delete_blocked=YES;';
  end;
  execute 'reset role';

  -- 서버(서비스 키): 끝낸 줄에는 본문이 있어야 한다 · 끝나면 다시 요청할 수 있다
  begin
    update public.blueprint_checks set status = 'done', body = null where id = c1;
    msg := msg || 'done_without_body_blocked=NO;';
  exception when check_violation then msg := msg || 'done_without_body_blocked=YES;';
  end;
  update public.blueprint_checks set status = 'done', body = '{"suggestions": []}', input_hash = 'h1', finished_at = now() where id = c1;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.blueprint_checks (blueprint_id, requested_by) values (b1, u1);
  get diagnostics n = row_count; msg := msg || 'again_after_done=' || n || '(1);';
  select count(*) into n from public.blueprint_checks where blueprint_id = b1; msg := msg || 'own_rows_now=' || n || '(2);';
  execute 'reset role';

  -- 남과 관리자: 보이지 않는다(청사진처럼 본인만, 불변 5)
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.blueprint_checks; msg := msg || 'other_sees=' || n || '(0);';
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.blueprint_checks; msg := msg || 'admin_sees=' || n || '(0);';
  execute 'reset role';

  -- 로그인 안 한 사람
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  begin
    perform count(*) from public.blueprint_checks;
    msg := msg || 'anon_read_blocked=NO;';
  exception when others then msg := msg || 'anon_read_blocked=YES;';
  end;
  execute 'reset role';

  -- ai_calls: 새 값은 되고, 모르는 값은 막히고, 옛 값은 그대로 된다
  insert into public.ai_calls (purpose, user_id, input_hash, status) values ('blueprint_check', u1, 'h1', 'succeeded');
  get diagnostics n = row_count; msg := msg || 'ai_calls_blueprint_check=' || n || '(1);';
  insert into public.ai_calls (purpose, user_id, input_hash, status) values ('scenario', u1, 'h2', 'succeeded');
  get diagnostics n = row_count; msg := msg || 'ai_calls_scenario=' || n || '(1);';
  begin
    insert into public.ai_calls (purpose, user_id, input_hash, status) values ('bogus', u1, 'h3', 'succeeded');
    msg := msg || 'ai_calls_bogus_blocked=NO;';
  exception when check_violation then msg := msg || 'ai_calls_bogus_blocked=YES;';
  end;

  raise exception 'BLUEPRINT_CHECKS_RESULT %', msg;  -- 일부러 실패시켜 위의 모든 줄을 되돌린다
end $$;
