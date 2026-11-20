-- P-12a2 별명 규칙(가입 트리거·별명 고치기 트리거·대소문자 유니크)과 using_now 함수 시험(불변 5). rls_m0.sql과 같은 방식: 시험 계정과 줄을 만들고 끝에서 일부러 예외를 내 **모두 되돌린다**.
-- 마이그레이션 202611191700_P-12a2_nickname_using_now.sql을 적용한 뒤 그대로 돌린다. 결과는 오류 메시지 "P12A2_RESULT ..."에 나온다(괄호 안이 기대값).
-- 특수 글자는 chr()로 만든다(파일에 눈에 안 보이는 글자를 넣지 않으려고). 시험 별명은 실제 계정과 겹치지 않게 p12a2 접두사를 쓴다.
do $$
declare
  nicks text[] := array[
    'Radar', 'radar', 'me@x.com', 'user-0123abcd', 'me' || chr(65312) || 'x', chr(12644) || chr(12644), normalize('한글러', nfd), 'ok',
    chr(8195) || 'Radar', 'ab' || chr(917569), '한글', chr(128512) || chr(128512), 'a-b.c_d', 'a', repeat('가', 30), repeat('가', 31)
  ];
  keeps boolean[] := array[true, false, false, false, false, false, true, true, false, false, true, true, true, false, true, false];
  ids uuid[] := array(select gen_random_uuid() from generate_series(1, 16));
  g_id uuid := gen_random_uuid();
  t uuid; p uuid; msg text := ''; nick text; expect text; r record; ok_cnt int := 0;
begin
  -- 가입 트리거: 규칙에 맞으면 그대로(NFC·앞뒤 공백 정리), 아니면 임시 별명(user- + id 앞 8자)
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select ids[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12a2-' || i || '@example.test', '{"provider":"email"}',
         json_build_object('nickname', nicks[i])::jsonb, now(), now()
  from generate_series(1, 16) i;
  for i in 1..16 loop
    select nickname into nick from public.profiles where id = ids[i];
    expect := case when keeps[i] then public.nickname_clean(nicks[i]) else 'user-' || left(ids[i]::text, 8) end;
    if nick = expect then ok_cnt := ok_cnt + 1; else msg := msg || 'signup_case_' || i || '_WRONG(' || nick || ');'; end if;
  end loop;
  msg := msg || 'signup_cases_ok=' || ok_cnt || '(16);';
  -- 구글 가입(별명 메타데이터 없음): 임시 별명 + login_method=google
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (g_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12a2-google@example.test', '{"provider":"google"}', '{}', now(), now());
  select nickname into nick from public.profiles where id = g_id;
  msg := msg || 'google_temp=' || (nick = 'user-' || left(g_id::text, 8)) || '(true);';
  select login_method into nick from public.profiles where id = g_id;
  msg := msg || 'google_login_method=' || nick || '(google);';

  -- 별명 직접 고치기(anon 키 + 본인 JWT로 PATCH하는 것과 같은 경로): 같은 규칙, 맞으면 정리해 저장
  perform set_config('request.jwt.claims', json_build_object('sub', ids[8], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin update public.profiles set nickname = 'x@y.com' where id = ids[8]; msg := msg || 'upd_at_blocked=NO;'; exception when check_violation then msg := msg || 'upd_at_blocked=YES;'; end;
  begin update public.profiles set nickname = 'ab' || chr(8203) || 'cd' where id = ids[8]; msg := msg || 'upd_zero_width_blocked=NO;'; exception when check_violation then msg := msg || 'upd_zero_width_blocked=YES;'; end;
  begin update public.profiles set nickname = 'user-0123abcd' where id = ids[8]; msg := msg || 'upd_temp_shape_blocked=NO;'; exception when check_violation then msg := msg || 'upd_temp_shape_blocked=YES;'; end;
  begin update public.profiles set nickname = 'ab' || chr(917569) where id = ids[8]; msg := msg || 'upd_tag_char_blocked=NO;'; exception when check_violation then msg := msg || 'upd_tag_char_blocked=YES;'; end;
  begin update public.profiles set nickname = chr(12644) || chr(12644) where id = ids[8]; msg := msg || 'upd_filler_blocked=NO;'; exception when check_violation then msg := msg || 'upd_filler_blocked=YES;'; end;
  begin update public.profiles set nickname = 'a' where id = ids[8]; msg := msg || 'upd_short_blocked=NO;'; exception when check_violation then msg := msg || 'upd_short_blocked=YES;'; end;
  begin update public.profiles set nickname = 'RADAR' where id = ids[8]; msg := msg || 'upd_case_dup_blocked=NO;'; exception when unique_violation then msg := msg || 'upd_case_dup_blocked=YES;'; end;
  update public.profiles set nickname = chr(8195) || '새별명 ' || chr(8195) where id = ids[8];
  select nickname into nick from public.profiles where id = ids[8]; msg := msg || 'upd_ok_trimmed=' || (nick = '새별명') || '(true);';
  update public.profiles set nickname = normalize('각각', nfd) where id = ids[8];
  select nickname into nick from public.profiles where id = ids[8]; msg := msg || 'upd_nfd_to_nfc=' || (nick = normalize('각각', nfc)) || '(true);';
  update public.profiles set is_public = false where id = ids[8];
  update public.profiles set is_public = true where id = ids[8];
  msg := msg || 'upd_public_flag_ok=true(true);';
  execute 'reset role';
  update public.profiles set nickname = 'ok' where id = ids[8];

  -- using_now: 공개한 사람만(숨긴 기술·숨김 켠 사람·보관 프로젝트·시연 계정 제외), 같은 사람은 한 번만
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12a2-using', 'u', 'mcp') returning id into t;
  for i in 1..8 loop
    insert into public.projects (owner_id, kind, name, repo_url, archived_at) values (ids[i], 'repo', 'p' || i, 'https://github.com/x/p12a2-' || i, case when i = 5 then now() else null end) returning id into p;
    insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by, hidden_at) values (ids[i], p, t, 'repo', ids[i], case when i = 3 then now() else null end);
  end loop;
  insert into public.projects (owner_id, kind, name, repo_url) values (ids[7], 'repo', 'p7b', 'https://github.com/x/p12a2-7b') returning id into p;
  insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by) values (ids[7], p, t, 'repo', ids[7]);
  update public.profiles set is_public = false where id = ids[4];
  update public.profiles set is_demo = true where id = ids[6];
  -- 센다: 1(Radar)·2(임시)·7(NFC, 프로젝트 둘이어도 한 번)·8(ok) = 4. 3 숨긴 기술, 4 숨김 켬, 5 보관 프로젝트, 6 시연 계정은 뺀다
  perform set_config('request.jwt.claims', json_build_object('sub', ids[8], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.using_now(t);
  msg := msg || 'using_count=' || r.user_count || '(4);using_names_len=' || cardinality(r.nicknames) || '(4);';
  msg := msg || 'using_has_hidden_tech_user=' || (('user-' || left(ids[3]::text, 8)) = any(r.nicknames)) || '(false);';
  msg := msg || 'using_has_private_user=' || (('user-' || left(ids[4]::text, 8)) = any(r.nicknames)) || '(false);';
  msg := msg || 'using_has_archived_user=' || (('user-' || left(ids[5]::text, 8)) = any(r.nicknames)) || '(false);';
  msg := msg || 'using_has_demo_user=' || (('user-' || left(ids[6]::text, 8)) = any(r.nicknames)) || '(false);';
  msg := msg || 'using_has_public_user=' || ('Radar' = any(r.nicknames)) || '(true);';
  msg := msg || 'using_multi_project_once=' || (cardinality(array(select x from unnest(r.nicknames) x where x = normalize('한글러', nfc))) = 1) || '(true);';
  select * into r from public.using_now(gen_random_uuid()); msg := msg || 'using_unknown_tech=' || r.user_count || '(0);';
  select * into r from public.using_now(null); msg := msg || 'using_null_arg=' || r.user_count || '(0);';
  execute 'reset role';
  -- 호출한 사람이 숨김을 켜도 호출은 되고, 그 사람만 빠진다
  update public.profiles set is_public = false where id = ids[8];
  perform set_config('request.jwt.claims', json_build_object('sub', ids[8], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.using_now(t); msg := msg || 'using_caller_private_count=' || r.user_count || '(3);';
  execute 'reset role';
  -- 실행 권한: 로그인 안 한 사람은 못 부르고, 로그인한 사람은 부른다
  msg := msg || 'anon_execute=' || has_function_privilege('anon', 'public.using_now(uuid)', 'execute') || '(false);';
  msg := msg || 'authenticated_execute=' || has_function_privilege('authenticated', 'public.using_now(uuid)', 'execute') || '(true);';

  -- 20개 한도: 공개한 사람 25명이 쓰면 수는 25, 별명 목록은 20
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12a2-many-' || i || '@example.test', '{"provider":"email"}',
         json_build_object('nickname', 'p12a2many' || lpad(i::text, 2, '0'))::jsonb, now(), now()
  from generate_series(1, 25) i;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12a2-many', 'm', 'mcp') returning id into t;
  for r in select id from public.profiles where nickname like 'p12a2many%' loop
    insert into public.projects (owner_id, kind, name, repo_url) values (r.id, 'repo', 'm', 'https://github.com/x/p12a2-many-' || r.id) returning id into p;
    insert into public.my_technologies (owner_id, project_id, tech_id, origin, added_by) values (r.id, p, t, 'repo', r.id);
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', ids[1], 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from public.using_now(t);
  msg := msg || 'many_count=' || r.user_count || '(25);many_names_len=' || cardinality(r.nicknames) || '(20);many_first=' || r.nicknames[1] || '(p12a2many01);';
  execute 'reset role';

  raise exception 'P12A2_RESULT %', msg;  -- 일부러 실패시켜 위의 모든 줄을 되돌린다
end $$;
