-- P-12p C-4 LS점프업 시드 되돌림 시험. starter_set_p12d.sql과 같은 방식: 끝에서 일부러 예외를 내 **모두 되돌린다**.
-- 돌리는 법(운영 적용 전): 한 번의 execute_sql에 [아래 (1) 준비] → [마이그레이션 202611240200_P-12p_ls_seed.sql 본문 × 2(멱등 확인)] → [아래 (3) do 블록]을 이어 붙여 보낸다.
--   한 요청 안의 여러 문장은 한 트랜잭션이라 마지막 예외로 전부 되돌아간다(준비 줄 · 시드 줄 모두 남지 않음). 끝난 뒤 signals->>'ls_seed' 줄이 0개인지 따로 읽는다.
-- 결과는 오류 메시지 "LS_SEED_RESULT ..."에 나온다. 괄호 안이 기대값.

-- (1) 준비: 미리 있던 줄(운영에 이미 있으면 이 트랜잭션 안에서만 바꾼다 → 끝에서 되돌아감)
--   남의 근거 · 글 · 이름이 있고 이번 주 NEW 표시(registry_backfill=false)인 줄: 하나도 덮이지 않아야 하고, 비어 있던 저장소 · 라이선스 칸만 채워져야 한다
insert into public.technologies (tech_key, display_name, type, one_liner, one_liner_source, signals)
  values ('github:herdrdev/herdr', 'herdr(시험 이름)', 'sdk', '기존 글', 'https://example.test/src', '{"registry_backfill": false}')
  on conflict (tech_key) do update set display_name = 'herdr(시험 이름)', one_liner = '기존 글', one_liner_source = 'https://example.test/src', repo_url = null, license = null, signals = '{"registry_backfill": false}';
--   루프 하네스는 새 줄로 들어가야 한다(운영에 이미 있으면 지워 새로 시험)
delete from public.technologies where tech_key = 'concept:loop-harness';

-- (2) 마이그레이션 본문 × 2

-- (3) 확인
do $$
declare n int; v text; msg text := '';
begin
  select count(*) into n from public.technologies where tech_key in ('github:herdrdev/herdr', 'concept:loop-harness'); msg := msg || 'rows=' || n || '(2);';
  select count(*) into n from public.technologies where signals ->> 'ls_seed' = 'true'; msg := msg || 'ls_seed=' || n || '(2: 있던 herdr 줄에도 표시가 붙음 — signals = excluded || 있던 값이라 ls_seed 키는 새로 받고 registry_backfill은 있던 false가 이김);';
  -- 공개 목록 조건(lib/server/map-queries.ts listedTechs · isListed)
  select count(*) into n from public.technologies
    where tech_key in ('github:herdrdev/herdr', 'concept:loop-harness') and one_liner_source is not null and one_liner is not null and status <> 'gone' and is_simulated = false;
  msg := msg || 'listed=' || n || '(2);';
  select count(*) into n from public.technologies where tech_key in ('github:herdrdev/herdr', 'concept:loop-harness') and category_id is null; msg := msg || 'no_category=' || n || '(0);';
  select count(*) into n from public.technologies where tech_key in ('github:herdrdev/herdr', 'concept:loop-harness') and one_liner_source !~ '^https://'; msg := msg || 'bad_source=' || n || '(0);';
  -- 있던 줄: 이름 · 한 줄 · 근거는 그대로, 비어 있던 저장소 · 라이선스만 채움, NEW 표시(false)가 이김
  select display_name || '|' || one_liner || '|' || one_liner_source || '|' || coalesce(repo_url, '-') || '|' || coalesce(license, '-') || '|' || (signals ->> 'registry_backfill') into v
    from public.technologies where tech_key = 'github:herdrdev/herdr';
  msg := msg || 'herdr=' || v || '(herdr(시험 이름)|기존 글|https://example.test/src|https://github.com/herdrdev/herdr|Apache-2.0|false);';
  -- 새 줄: 종류 · 이름 · 근거 · NEW에서 빠짐
  select type || '|' || display_name || '|' || one_liner_source || '|' || (signals ->> 'registry_backfill') into v from public.technologies where tech_key = 'concept:loop-harness';
  msg := msg || 'loop=' || v || '(concept|루프 하네스|https://claude.com/resources/articles/harnessing-claudes-intelligence|true);';
  -- 멱등: 본문을 두 번 돌려도 줄이 늘지 않는다(위 rows=2가 그 증거). 같은 키가 한 줄인지 한 번 더
  select count(*) into n from (select tech_key from public.technologies where tech_key in ('github:herdrdev/herdr', 'concept:loop-harness') group by tech_key having count(*) > 1) d; msg := msg || 'dup=' || n || '(0);';
  raise exception 'LS_SEED_RESULT %', msg;
end $$;
