-- P-23 user_tastes 권한 시험. rls_m0.sql과 같은 방식: 끝에서 일부러 예외를 내 모두 되돌린다(실제 DB에 아무것도 남지 않음).
-- 기대: 본인은 한 줄을 넣고 고치고 읽는다. 남의 줄 넣기·읽기·고치기, created_at 정하기, 4개째 관심 분야, 모르는 도구, 지우기는 막힌다. 로그인 안 한 사람은 못 읽는다.
-- 막힘은 insufficient_privilege·check 위반만 "막힘"으로 센다. 다른 오류는 시험을 멈춰 눈에 띄게 한다.
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); n int; msg text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p23-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p23-u2@example.test', '{"provider":"email"}', '{}', now(), now());
  insert into public.user_tastes (user_id, build, interests) values (u2, 'docs', array['리서치']);  -- 남의 줄(서버가 만든 것)

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.user_tastes (user_id, build, tools, interests) values (u1, 'web', array['cursor'], array['리서치', '디자인', '프론트엔드']);
  get diagnostics n = row_count; msg := msg || 'own_insert=' || n || '(1);';
  update public.user_tastes set build = 'data' where user_id = u1;
  get diagnostics n = row_count; msg := msg || 'own_update=' || n || '(1);';
  select count(*) into n from public.user_tastes; msg := msg || 'visible_rows=' || n || '(1);';
  update public.user_tastes set build = 'web' where user_id = u2;
  get diagnostics n = row_count; msg := msg || 'other_update=' || n || '(0);';

  begin insert into public.user_tastes (user_id) values (u2); msg := msg || 'other_insert=OPEN;';
  exception when insufficient_privilege or unique_violation then msg := msg || 'other_insert=blocked;'; end;
  begin update public.user_tastes set created_at = now() where user_id = u1; msg := msg || 'created_at=OPEN;';
  exception when insufficient_privilege then msg := msg || 'created_at=blocked;'; end;
  begin update public.user_tastes set interests = array['a','b','c','d'] where user_id = u1; msg := msg || 'four_interests=OPEN;';
  exception when check_violation then msg := msg || 'four_interests=blocked;'; end;
  begin update public.user_tastes set tools = array['evil'] where user_id = u1; msg := msg || 'bad_tool=OPEN;';
  exception when check_violation then msg := msg || 'bad_tool=blocked;'; end;
  begin delete from public.user_tastes where user_id = u1; msg := msg || 'delete=OPEN;';
  exception when insufficient_privilege then msg := msg || 'delete=blocked;'; end;

  execute 'reset role';
  execute 'set local role anon';
  begin perform 1 from public.user_tastes; msg := msg || 'anon_read=OPEN;';
  exception when insufficient_privilege then msg := msg || 'anon_read=blocked;'; end;
  execute 'reset role';

  raise exception 'ROLLBACK_OK %', msg;  -- 기대: own_insert=1(1);own_update=1(1);visible_rows=1(1);other_update=0(0);other_insert=blocked;created_at=blocked;four_interests=blocked;bad_tool=blocked;delete=blocked;anon_read=blocked;
end $$;
