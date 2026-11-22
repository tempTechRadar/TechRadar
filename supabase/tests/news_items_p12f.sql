-- P-12f M7 시험(불변 3 · 5). blueprint_checks_p12e.sql과 같은 방식: 시험 줄을 만들고 끝에서 일부러 예외를 내 **모두 되돌린다**.
-- 마이그레이션 202611221700_P-12f_news_items.sql을 적용한 뒤에 돌린다(적용 전에는 표가 없어 실패).
-- 결과는 오류 메시지 "NEWS_ITEMS_RESULT ..."에 나온다. 괄호 안이 기대값, ...blocked=YES가 막혀야 할 것.
do $$
declare
  u1 uuid := gen_random_uuid(); n int; msg text := '';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ni-u1@example.test', '{"provider":"email"}', '{}', now(), now());

  -- 서버(서비스 키): 넣기 · 같은 주소는 한 줄 · 한도 검사
  insert into public.news_items (source_key, title, url, published_at) values ('t', '첫 소식', 'https://example.com/a', now());
  insert into public.news_items (source_key, title, url, published_at) values ('t', '같은 주소', 'https://example.com/a', now()) on conflict (url) do nothing;
  get diagnostics n = row_count; msg := msg || 'same_url_inserted=' || n || '(0);';
  begin
    insert into public.news_items (source_key, title, url, published_at) values ('t', '같은 주소 다시', 'https://example.com/a', now());
    msg := msg || 'duplicate_url_blocked=NO;';
  exception when unique_violation then msg := msg || 'duplicate_url_blocked=YES;';
  end;
  begin
    insert into public.news_items (source_key, title, url, published_at) values ('t', 'http', 'http://example.com/b', now());
    msg := msg || 'http_url_blocked=NO;';
  exception when check_violation then msg := msg || 'http_url_blocked=YES;';
  end;
  begin
    insert into public.news_items (source_key, title, url, published_at) values ('t', repeat('가', 301), 'https://example.com/c', now());
    msg := msg || 'long_title_blocked=NO;';
  exception when check_violation then msg := msg || 'long_title_blocked=YES;';
  end;
  begin
    insert into public.news_items (source_key, title, url, summary, published_at) values ('t', 's', 'https://example.com/d', repeat('나', 401), now());
    msg := msg || 'long_summary_blocked=NO;';
  exception when check_violation then msg := msg || 'long_summary_blocked=YES;';
  end;
  select count(*) into n from public.news_items; msg := msg || 'rows=' || n || '(1);';

  -- 로그인한 사용자: 읽기만
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.news_items; msg := msg || 'user_sees=' || n || '(1);';
  begin
    insert into public.news_items (source_key, title, url, published_at) values ('t', '사용자가 넣음', 'https://example.com/u', now());
    msg := msg || 'user_insert_blocked=NO;';
  exception when others then msg := msg || 'user_insert_blocked=YES;';
  end;
  begin
    update public.news_items set title = '바꿈';
    get diagnostics n = row_count; msg := msg || 'user_update_rows=' || n || '(blocked);';
  exception when others then msg := msg || 'user_update_blocked=YES;';
  end;
  begin
    delete from public.news_items;
    get diagnostics n = row_count; msg := msg || 'user_delete_rows=' || n || '(blocked);';
  exception when others then msg := msg || 'user_delete_blocked=YES;';
  end;
  execute 'reset role';

  -- 로그인 안 한 사람: 읽기는 되고(공개 소식) 쓰기는 막힘
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  select count(*) into n from public.news_items; msg := msg || 'anon_sees=' || n || '(1);';
  begin
    insert into public.news_items (source_key, title, url, published_at) values ('t', '손님이 넣음', 'https://example.com/g', now());
    msg := msg || 'anon_insert_blocked=NO;';
  exception when others then msg := msg || 'anon_insert_blocked=YES;';
  end;
  begin
    delete from public.news_items;
    get diagnostics n = row_count; msg := msg || 'anon_delete_rows=' || n || '(blocked);';
  exception when others then msg := msg || 'anon_delete_blocked=YES;';
  end;
  execute 'reset role';

  -- 출처 줄
  select count(*) into n from public.sources where name = 'news' and enabled and method = 'api' and priority = 3; msg := msg || 'sources_news=' || n || '(1);';

  raise exception 'NEWS_ITEMS_RESULT %', msg;  -- 일부러 실패시켜 위의 모든 줄을 되돌린다
end $$;
