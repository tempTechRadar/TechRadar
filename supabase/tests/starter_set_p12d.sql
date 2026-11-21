-- P-12d 입문 세트 되돌림 시험. blueprints_p12d.sql과 같은 방식: 끝에서 일부러 예외를 내 **모두 되돌린다**.
-- 돌리는 법(운영 적용 전): 한 번의 execute_sql에 [아래 (1) 준비] → [마이그레이션 202611211200_P-12d_starter_set.sql 본문 × 2(멱등 확인)] → [아래 (3) do 블록]을 이어 붙여 보낸다.
--   한 요청 안의 여러 문장은 한 트랜잭션이라 마지막 예외로 전부 되돌아간다(준비 줄 · 시드 줄 모두 남지 않음). 끝난 뒤 signals->>'starter_set' 줄이 0개인지 따로 읽는다.
-- 결과는 오류 메시지 "STARTER_SET_RESULT ..."에 나온다. 괄호 안이 기대값.

-- (1) 준비: 미리 있던 줄 두 가지(운영에 이미 있으면 그 줄을 이 트랜잭션 안에서만 바꾼다 → 끝에서 되돌아감)
--   ① 사용자 저장소에서 처음 본 개념: 이름은 그대로, 근거 · 갈래만 채워져야 한다
insert into public.technologies (tech_key, display_name, type) values ('concept:harness', '하네스(시험 이름)', 'concept')
  on conflict (tech_key) do update set display_name = '하네스(시험 이름)', one_liner = null, one_liner_source = null;
--   ② 남의 근거 · 글 · 저장소가 있는 줄 + 이번 주 NEW 표시: 하나도 덮이지 않아야 한다
insert into public.technologies (tech_key, display_name, type, one_liner, one_liner_source, repo_url, signals)
  values ('npm:prettier', 'prettier', 'sdk', '기존 글', 'https://example.test/src', 'https://example.test/repo', '{"registry_backfill": false}')
  on conflict (tech_key) do update set one_liner = '기존 글', one_liner_source = 'https://example.test/src', repo_url = 'https://example.test/repo', signals = '{"registry_backfill": false}';
--   ③ 근거만 있고 글이 빈 줄: 둘 다 우리 것으로
insert into public.technologies (tech_key, display_name, type, one_liner, one_liner_source) values ('npm:eslint', 'eslint', 'sdk', null, 'https://example.test/old')
  on conflict (tech_key) do update set one_liner = null, one_liner_source = 'https://example.test/old';

-- (2) 마이그레이션 본문 × 2

-- (3) 확인
do $$
declare n int; v text; msg text := '';
begin
  select count(*) into n from public.technologies where signals ->> 'starter_set' = 'true'; msg := msg || 'rows=' || n || '(45);';
  -- 공개 목록 조건(lib/server/map-queries.ts listedTechs · isListed)에 드는 수. 운영에 gone인 키가 있으면 작게 나온다 → 그 줄을 따로 본다
  select count(*) into n from public.technologies
    where signals ->> 'starter_set' = 'true' and one_liner_source is not null and one_liner is not null and status <> 'gone' and is_simulated = false;
  msg := msg || 'listed=' || n || '(45);';
  select count(*) into n from public.technologies where signals ->> 'starter_set' = 'true' and category_id is null; msg := msg || 'no_category=' || n || '(0);';
  -- NEW에서 빠짐(isBulkFilled). 준비 ②의 prettier만 있던 false가 이긴다. 운영에 이번 주 들어온 키가 더 있으면 그만큼 늘어난다
  select string_agg(tech_key, ',') into v from public.technologies where signals ->> 'starter_set' = 'true' and signals ->> 'registry_backfill' is distinct from 'true';
  msg := msg || 'still_new=' || coalesce(v, '-') || '(npm:prettier);';
  select string_agg(type || ':' || c, ',' order by type) into v from (select type, count(*) c from public.technologies where signals ->> 'starter_set' = 'true' group by type) t;
  msg := msg || 'types=' || v || '(concept:14,plugin:6,sdk:15,skill:10);';
  select display_name || '|' || one_liner_source into v from public.technologies where tech_key = 'concept:harness';
  msg := msg || 'harness=' || v || '(하네스(시험 이름)|https://code.claude.com/docs/en/memory);';
  select one_liner || '|' || one_liner_source || '|' || repo_url into v from public.technologies where tech_key = 'npm:prettier';
  msg := msg || 'prettier=' || v || '(기존 글|https://example.test/src|https://example.test/repo);';
  select one_liner_source into v from public.technologies where tech_key = 'npm:eslint';
  msg := msg || 'eslint=' || v || '(https://eslint.org);';
  select count(*) into n from public.technologies where signals ->> 'starter_set' = 'true' and one_liner_source !~ '^https://'; msg := msg || 'bad_source=' || n || '(0);';
  raise exception 'STARTER_SET_RESULT %', msg;
end $$;
