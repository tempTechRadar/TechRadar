-- P-12r 한국어 개요 칸 되돌림 시험(운영 적용 전). 끝에서 일부러 예외를 내 **모두 되돌린다**(칸 · 제약 · 시험 줄이 남지 않음).
-- 돌리는 법: 한 번의 execute_sql에 [아래 전체]를 보낸다(마이그레이션 본문을 맨 앞에 붙임: 이 파일의 (1)). 여러 문장은 한 트랜잭션이라 마지막 예외로 전부 되돌아간다.
-- 결과는 오류 메시지 "ONE_LINER_KO_RESULT ..."에 나온다. 괄호 안이 기대값. 끝난 뒤 information_schema에 one_liner_ko 칸이 0개인지 따로 읽는다.

-- (1) 마이그레이션 본문
alter table public.technologies
  add column one_liner_ko text check (one_liner_ko is null or char_length(one_liner_ko) <= 200),
  add column one_liner_ko_src text,
  add column one_liner_ko_at timestamptz;
alter table public.ai_calls drop constraint ai_calls_purpose_check;
alter table public.ai_calls add constraint ai_calls_purpose_check
  check (purpose in ('draft', 'scenario', 'classify', 'chatbot', 'blueprint_check', 'translate'));

-- (2) 확인
do $$
declare n int; msg text := ''; ok boolean; tid uuid;
begin
  select count(*) into n from information_schema.columns where table_schema = 'public' and table_name = 'technologies' and column_name in ('one_liner_ko', 'one_liner_ko_src', 'one_liner_ko_at'); msg := msg || 'cols=' || n || '(3);';
  -- 옛 줄은 새 칸이 모두 비어 있다(공개 목록 · 옛 코드 읽기 영향 없음)
  select count(*) into n from public.technologies where one_liner_ko is not null or one_liner_ko_src is not null or one_liner_ko_at is not null; msg := msg || 'old_filled=' || n || '(0);';
  -- 길이 제약: 200자 안은 되고 201자는 막힌다
  insert into public.technologies (tech_key, display_name, type, one_liner_ko) values ('concept:ko-test', 'ko 시험', 'concept', repeat('가', 200)) returning id into tid;
  begin
    update public.technologies set one_liner_ko = repeat('가', 201) where id = tid; ok := true;
  exception when check_violation then ok := false; end;
  msg := msg || 'len201_blocked=' || (not ok) || '(true);';
  -- 허용 값: translate는 되고 모르는 값은 막힌다
  insert into public.ai_calls (purpose, input_hash, status) values ('translate', 'ko-test-hash', 'succeeded'); msg := msg || 'translate_ok=true(true);';
  begin
    insert into public.ai_calls (purpose, input_hash, status) values ('nope', 'ko-test-hash', 'succeeded'); ok := true;
  exception when check_violation then ok := false; end;
  msg := msg || 'bad_purpose_blocked=' || (not ok) || '(true);';
  -- 옛 값(blueprint_check)이 그대로 되는지
  insert into public.ai_calls (purpose, input_hash, status) values ('blueprint_check', 'ko-test-hash2', 'succeeded'); msg := msg || 'old_purpose_ok=true(true);';
  -- 사용자(authenticated)는 새 칸을 쓸 수 없다: 열 단위 권한이 category 열만이라 쓰기 권한 없음
  select count(*) into n from information_schema.column_privileges where table_schema = 'public' and table_name = 'technologies' and grantee = 'authenticated' and privilege_type = 'UPDATE' and column_name in ('one_liner_ko', 'one_liner_ko_src', 'one_liner_ko_at'); msg := msg || 'user_update_cols=' || n || '(0);';
  raise exception 'ONE_LINER_KO_RESULT %', msg;
end $$;
