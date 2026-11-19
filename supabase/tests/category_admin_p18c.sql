-- P-18c 갈래 확정 RLS 시험(불변 5). rls_m1.sql과 같은 방식: 시험 줄을 만들고 끝에서 일부러 예외를 내 **모두 되돌린다**.
-- 결과는 오류 메시지 "CATEGORY_P18C_RESULT ..."에 나온다. 괄호 안이 기대값, ...blocked=YES가 막혀야 할 것.
-- technologies는 공용 카탈로그라 주인이 없다. 그래서 "남의 것"은 다른 사람 이름으로 정하기와 갈래 밖 칸 고치기로 본다.
do $$
declare
  u1 uuid := gen_random_uuid(); adm uuid := gen_random_uuid();
  t1 uuid; big uuid; small uuid; set_by uuid; n int; msg text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p18c-u1@example.test', '{"provider":"email"}', '{}', now(), now()),
    (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p18c-adm@example.test', '{"provider":"email"}', '{}', now(), now());
  update public.profiles set role = 'admin' where id = adm;
  insert into public.categories (name) values ('p18c 큰 갈래') returning id into big;
  insert into public.categories (name, parent_id) values ('p18c 작은 갈래', big) returning id into small;
  insert into public.technologies (tech_key, display_name, type) values ('npm:p18c-a', 'a', 'mcp') returning id into t1;

  -- 일반 계정: 갈래 칸도 0줄, 다른 칸은 권한 오류
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.technologies set category_id = small, category_set_by = u1, category_set_at = now() where id = t1;
  get diagnostics n = row_count; msg := msg || 'user_set_category=' || n || '(0);';
  begin
    update public.technologies set grade = 'pass' where id = t1;
    msg := msg || 'user_edit_grade_blocked=NO;';
  exception when others then msg := msg || 'user_edit_grade_blocked=YES;';
  end;
  execute 'reset role';

  -- 관리자: 작은 갈래를 본인 이름으로 = 1줄. 그 밖은 막힘
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update public.technologies set category_id = small, category_set_by = adm, category_set_at = now() where id = t1;
  get diagnostics n = row_count; msg := msg || 'admin_set_category=' || n || '(1);';
  begin
    update public.technologies set category_id = small, category_set_by = u1, category_set_at = now() where id = t1;
    msg := msg || 'admin_as_other_blocked=NO;';
  exception when others then msg := msg || 'admin_as_other_blocked=YES;';
  end;
  begin
    update public.technologies set category_id = big, category_set_by = adm, category_set_at = now() where id = t1;
    msg := msg || 'admin_big_category_blocked=NO;';
  exception when others then msg := msg || 'admin_big_category_blocked=YES;';
  end;
  begin
    update public.technologies set category_id = null, category_set_by = adm, category_set_at = now() where id = t1;
    msg := msg || 'admin_clear_category_blocked=NO;';
  exception when others then msg := msg || 'admin_clear_category_blocked=YES;';
  end;
  begin
    update public.technologies set category_id = small, category_set_by = adm, category_set_at = null where id = t1;
    msg := msg || 'admin_by_without_at_blocked=NO;';
  exception when others then msg := msg || 'admin_by_without_at_blocked=YES;';
  end;
  begin
    update public.technologies set grade = 'pass', status = 'gone' where id = t1;
    msg := msg || 'admin_edit_grade_status_blocked=NO;';
  exception when others then msg := msg || 'admin_edit_grade_status_blocked=YES;';
  end;
  begin
    update public.technologies set category_rank = 1, category_score = 9 where id = t1;
    msg := msg || 'admin_edit_rank_score_blocked=NO;';
  exception when others then msg := msg || 'admin_edit_rank_score_blocked=YES;';
  end;
  begin
    insert into public.technologies (tech_key, display_name, type) values ('npm:p18c-new', 'n', 'mcp');
    msg := msg || 'admin_insert_tech_blocked=NO;';
  exception when others then msg := msg || 'admin_insert_tech_blocked=YES;';
  end;
  begin
    delete from public.technologies where id = t1;
    get diagnostics n = row_count; msg := msg || 'admin_delete_rows=' || n || '(blocked);';
  exception when others then msg := msg || 'admin_delete_blocked=YES;';
  end;
  execute 'reset role';

  select category_set_by into set_by from public.technologies where id = t1;
  msg := msg || 'set_by_is_admin=' || (set_by = adm) || '(true);';

  raise exception 'CATEGORY_P18C_RESULT %', msg;  -- 일부러 실패시켜 위의 모든 줄을 되돌린다
end $$;
