-- P-12d my_tech_tags(내 태그) 권한 시험(불변 3·5). user_tastes_p23.sql과 같은 방식: 끝에서 일부러 예외를 내 모두 되돌린다(실제 DB에 아무것도 남지 않음).
-- 실행: 운영 Supabase(techradar) SQL 편집기에 붙여 넣거나 MCP execute_sql로. 운영에 쓰고 ROLLBACK으로 되돌리는 일이라 사용자 승인 뒤에만, 다른 SQL 시험과 동시에 돌리지 않는다.
-- 결과: 실행은 "오류"로 끝나는 것이 정상이다. 메시지 "ROLLBACK_OK ..."에 항목=실제값(기대값)이 나온다. 맨 아래 주석의 기대 문자열과 같아야 한다.
-- 기대: 본인은 tech_id·tag만 넣고(user_id는 기본값 = 본인) 자기 줄만 읽고 지운다. 남의 user_id로 넣기, created_at 정하기, 고치기,
-- 남의 줄 읽기·지우기, 대소문자만 다른 같은 태그, 규칙 밖 글자(앞뒤 공백·31자·줄바꿈)는 막힌다. 로그인 안 한 사람은 못 읽고 못 넣는다.
-- 막힘은 insufficient_privilege·check 위반·unique 위반·한도 트리거(raise_exception, 문구 "태그 한도:" 확인)만 "막힘"으로 센다. 다른 오류는 시험을 멈춰 눈에 띄게 한다.
-- 한도 시험: u3은 종류 50개, u4는 합 1,000개(기술 101개를 만들어 쓴다).
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid();
  t1 uuid; techs uuid[]; n int; owner uuid; msg text := ''; i int; j int;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12d-tags-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12d-tags-u2@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12d-tags-u3@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u4, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p12d-tags-u4@example.test', '{"provider":"email"}', '{}', now(), now());
  insert into public.technologies (tech_key, display_name, type) values ('npm:p12d-tags-pkg', 'p12d-tags', 'mcp') returning id into t1;
  with made as (
    insert into public.technologies (tech_key, display_name, type)
    select 'npm:p12d-tags-' || lpad(g::text, 3, '0'), 'p12d-tags-' || g, 'mcp' from generate_series(1, 101) g returning id, tech_key)
  select array_agg(id order by tech_key) into techs from made;
  insert into public.my_tech_tags (user_id, tech_id, tag) values (u2, t1, '남의태그');  -- 남의 줄(서버 권한으로 만든 것)

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.my_tech_tags (tech_id, tag) values (t1, 'React');
  get diagnostics n = row_count; msg := msg || 'own_insert=' || n || '(1);';
  select user_id into owner from public.my_tech_tags where tag = 'React';
  msg := msg || 'default_owner_is_me=' || (owner = u1) || '(true);';
  select count(*) into n from public.my_tech_tags; msg := msg || 'visible_rows=' || n || '(1);';
  delete from public.my_tech_tags where tag = '남의태그';
  get diagnostics n = row_count; msg := msg || 'other_delete=' || n || '(0);';

  begin insert into public.my_tech_tags (user_id, tech_id, tag) values (u2, t1, 'x'); msg := msg || 'other_owner_insert=OPEN;';
  exception when insufficient_privilege then msg := msg || 'other_owner_insert=blocked;'; end;
  begin insert into public.my_tech_tags (tech_id, tag, created_at) values (t1, 'y', now() - interval '1 year'); msg := msg || 'created_at=OPEN;';
  exception when insufficient_privilege then msg := msg || 'created_at=blocked;'; end;
  begin update public.my_tech_tags set tag = 'Vue' where tag = 'React'; msg := msg || 'update=OPEN;';
  exception when insufficient_privilege then msg := msg || 'update=blocked;'; end;
  begin insert into public.my_tech_tags (tech_id, tag) values (t1, 'react'); msg := msg || 'case_duplicate=OPEN;';
  exception when unique_violation then msg := msg || 'case_duplicate=blocked;'; end;
  begin insert into public.my_tech_tags (tech_id, tag) values (t1, ' 공백'); msg := msg || 'untrimmed=OPEN;';
  exception when check_violation then msg := msg || 'untrimmed=blocked;'; end;
  begin insert into public.my_tech_tags (tech_id, tag) values (t1, repeat('가', 31)); msg := msg || 'too_long=OPEN;';
  exception when check_violation then msg := msg || 'too_long=blocked;'; end;
  begin insert into public.my_tech_tags (tech_id, tag) values (t1, 'a' || chr(10) || 'b'); msg := msg || 'newline=OPEN;';
  exception when check_violation then msg := msg || 'newline=blocked;'; end;

  begin insert into public.my_tech_tags (tech_id, tag) values (t1, 'a' || chr(133) || 'b'); msg := msg || 'c1_control=OPEN;';
  exception when check_violation then msg := msg || 'c1_control=blocked;'; end;

  -- DB 한도(트리거): 기술당 10개째까지는 들어가고 11개째는 막힌다(서버를 건너뛴 직접 호출도)
  for i in 2..10 loop insert into public.my_tech_tags (tech_id, tag) values (t1, 't' || i); end loop;
  select count(*) into n from public.my_tech_tags where tech_id = t1; msg := msg || 'tags_on_tech=' || n || '(10);';
  begin insert into public.my_tech_tags (tech_id, tag) values (t1, 't11'); msg := msg || 'eleventh=OPEN;';
  exception when raise_exception then msg := msg || 'eleventh=' || case when sqlerrm like '태그 한도: 기술당%' then 'blocked' else sqlerrm end || ';'; end;
  -- 한도 꽉 찬 기술에 이미 있는 태그를 다시 붙이면 한도 오류가 아니라 "이미 있음"(유일 색인)
  begin insert into public.my_tech_tags (tech_id, tag) values (t1, 'T2'); msg := msg || 'full_duplicate=OPEN;';
  exception when unique_violation then msg := msg || 'full_duplicate=unique;'; when raise_exception then msg := msg || 'full_duplicate=limit;'; end;

  -- 종류 50개(u3): 기술 5개에 10개씩 k1..k50 → 51번째 새 종류는 막히고, 있는 종류는 다른 기술에 붙는다
  perform set_config('request.jwt.claims', json_build_object('sub', u3, 'role', 'authenticated')::text, true);
  for j in 1..5 loop for i in 1..10 loop
    insert into public.my_tech_tags (tech_id, tag) values (techs[j], 'k' || ((j - 1) * 10 + i));
  end loop; end loop;
  begin insert into public.my_tech_tags (tech_id, tag) values (techs[6], 'new-kind'); msg := msg || 'kind_51=OPEN;';
  exception when raise_exception then msg := msg || 'kind_51=' || case when sqlerrm like '태그 한도: 종류%' then 'blocked' else sqlerrm end || ';'; end;
  insert into public.my_tech_tags (tech_id, tag) values (techs[6], 'K1');
  get diagnostics n = row_count; msg := msg || 'old_kind_new_tech=' || n || '(1);';

  -- 합 1,000개(u4): 기술 100개에 k1..k10 → 1,001번째는 막힌다
  perform set_config('request.jwt.claims', json_build_object('sub', u4, 'role', 'authenticated')::text, true);
  for j in 1..100 loop for i in 1..10 loop
    insert into public.my_tech_tags (tech_id, tag) values (techs[j], 'k' || i);
  end loop; end loop;
  begin insert into public.my_tech_tags (tech_id, tag) values (techs[101], 'k1'); msg := msg || 'row_1001=OPEN;';
  exception when raise_exception then msg := msg || 'row_1001=' || case when sqlerrm like '태그 한도: 합%' then 'blocked' else sqlerrm end || ';'; end;
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);

  delete from public.my_tech_tags where tag = 'React';
  get diagnostics n = row_count; msg := msg || 'own_delete=' || n || '(1);';

  -- 관리자도 남의 태그를 못 본다(erd 4절 "관리자도 못 봄")
  execute 'reset role';
  update public.profiles set role = 'admin' where id = u1;
  execute 'set local role authenticated';
  select count(*) into n from public.my_tech_tags where user_id = u2; msg := msg || 'admin_sees_other=' || n || '(0);';

  execute 'reset role';
  execute 'set local role anon';
  begin perform 1 from public.my_tech_tags; msg := msg || 'anon_read=OPEN;';
  exception when insufficient_privilege then msg := msg || 'anon_read=blocked;'; end;
  begin insert into public.my_tech_tags (tech_id, tag) values (t1, 'anon'); msg := msg || 'anon_insert=OPEN;';
  exception when insufficient_privilege then msg := msg || 'anon_insert=blocked;'; end;
  begin delete from public.my_tech_tags; msg := msg || 'anon_delete=OPEN;';
  exception when insufficient_privilege then msg := msg || 'anon_delete=blocked;'; end;
  execute 'reset role';

  raise exception 'ROLLBACK_OK %', msg;
  -- 기대: own_insert=1(1);default_owner_is_me=true(true);visible_rows=1(1);other_delete=0(0);other_owner_insert=blocked;created_at=blocked;update=blocked;case_duplicate=blocked;untrimmed=blocked;too_long=blocked;newline=blocked;c1_control=blocked;tags_on_tech=10(10);eleventh=blocked;full_duplicate=unique;kind_51=blocked;old_kind_new_tech=1(1);row_1001=blocked;own_delete=1(1);admin_sees_other=0(0);anon_read=blocked;anon_insert=blocked;anon_delete=blocked;
end $$;
