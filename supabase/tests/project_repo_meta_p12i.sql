-- P-12i 레포 기본 정보 시험(불변 2 · 4 · 5). rls_m1.sql과 같은 방식: 시험 줄을 만들고 끝에서 일부러 예외를 내 **모두 되돌린다**.
-- 결과는 오류 메시지 "REPO_META_RESULT ..."에 나온다. 괄호 안이 기대값.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  p1 uuid; n int; st text; msg text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rm-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rm-u2@example.test', '{"provider":"email"}', '{}', now(), now()),
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rm-adm@example.test', '{"provider":"email"}', '{}', now(), now());
  update public.profiles set role = 'admin' where id = adm;
  -- 서버(서비스 키 = 소유자)가 쓴다
  insert into public.projects (owner_id, kind, name, repo_url, repo_description, repo_language, repo_pushed_at, repo_meta_at)
    values (u1, 'repo', 'rm', 'https://github.com/o/rm', '설명', 'TypeScript', now(), now()) returning id into p1;
  -- 실패는 오류 종류만 남기고 예전 값은 그대로(불변 4)
  update public.projects set repo_meta_error = 'rate_limited' where id = p1;
  select repo_description || '/' || repo_meta_error into st from public.projects where id = p1; msg := msg || 'kept_on_error=' || st || '(설명/rate_limited);';
  begin
    update public.projects set repo_meta_error = 'gone' where id = p1;
    msg := msg || 'bad_error_kind_blocked=NO;';
  exception when others then msg := msg || 'bad_error_kind_blocked=YES;';
  end;
  begin
    update public.projects set repo_description = repeat('a', 301) where id = p1;
    msg := msg || 'long_description_blocked=NO;';
  exception when others then msg := msg || 'long_description_blocked=YES;';
  end;

  -- 본인은 읽는다
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.projects where id = p1 and repo_language = 'TypeScript'; msg := msg || 'owner_reads=' || n || '(1);';
  execute 'reset role';
  -- 남은 못 읽고 못 고친다(불변 5)
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.projects where id = p1; msg := msg || 'other_reads=' || n || '(0);';
  update public.projects set repo_description = '남이 고침' where id = p1;
  execute 'reset role';
  select repo_description into st from public.projects where id = p1; msg := msg || 'other_update_noop=' || st || '(설명);';
  -- 관리자는 읽기만(기존 projects_select)
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.projects where id = p1; msg := msg || 'admin_reads=' || n || '(1);';
  execute 'reset role';
  -- 손님(anon)은 못 읽는다
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    select count(*) into n from public.projects where id = p1; msg := msg || 'anon_reads=' || n || '(0);';
  exception when insufficient_privilege then msg := msg || 'anon_reads=0(0);';
  end;
  execute 'reset role';

  raise exception 'REPO_META_RESULT %', msg;
end $$;
