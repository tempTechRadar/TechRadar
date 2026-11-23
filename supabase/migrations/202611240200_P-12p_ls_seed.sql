-- P-12p C-4 · LS점프업 시드 2줄(초안, 운영 적용 전 — 사용자 승인 필요). 작업 I-P-12p-seed, 계획 p12p-map-polish.md C-4.
-- 왜: 지도의 "LS점프업" 보기에 넣을 herdr(도구)와 루프 하네스(개념)가 카탈로그에 없다(11-23 사용자 요청, 운영 읽기로 확인).
-- 출처는 모두 2026-11-23에 공개 페이지를 직접 열어 확인한 주소를 한 줄 설명의 근거(one_liner_source)로 둔다(관문 3: 근거 링크 없는 정보는 저장하지 않는다).
--   · herdr: https://github.com/herdrdev/herdr (옛 주소 ogulcancelik/herdr가 여기로 넘어옴, README · LICENSE가 Apache-2.0, 문서 https://herdr.dev)
--   · 루프 하네스: https://claude.com/resources/articles/harnessing-claudes-intelligence (Anthropic, 2026-04-02: "harness = 모델을 둘러싼 소프트웨어 뼈대: the loop, tools, context management, and guardrails")
-- herdr은 npm · PyPI 패키지가 아니다(npm `herdr`는 0.0.0 이름 선점용, PyPI 없음): 배포는 설치 스크립트 · Homebrew · 바이너리. 그래서 키는 `github:herdrdev/herdr`(GitHub 수집기가 저장소로 읽는 키, 소문자)이고 종류는 입문 세트의 개발 도구와 같은 sdk다.
-- 공개 목록 조건(one_liner_source 있음 · gone 아님 · 시뮬레이션 아님)에 든다. 지도에 오르는 것은 LS점프업의 고른 목록(LS_PICKS)이 정한다.
-- signals.registry_backfill = true: 새로 나온 날이 "들어온 날"이 아니므로 NEW · 적용 기회 알림에서 뺀다(isBulkFilled). ls_seed = true는 이 시드가 넣은 줄 표시.
-- 이미 있는 줄은 비어 있는 칸만 채운다(입문 세트 시드와 같은 규칙): 이름 · 종류 · 상태 · 등급은 건드리지 않는다. 여러 번 돌려도 같다.
-- 갈래는 이름으로 찾는다(categories 시드 202611192300).

insert into public.technologies (tech_key, display_name, type, category_id, one_liner, one_liner_source, repo_url, license, signals)
select v.tech_key, v.display_name, v.type,
  (select c.id from public.categories c where c.name = v.cat order by c.parent_id nulls last limit 1),
  v.one_liner, v.source, v.repo_url, v.license, '{"registry_backfill": true, "ls_seed": true}'::jsonb
from (values
  ('github:herdrdev/herdr', 'herdr', 'sdk', '에이전트·오케스트레이션', '여러 코딩 AI를 한 터미널에서 돌리고 막힌 곳을 알려 준다', 'https://github.com/herdrdev/herdr', 'https://github.com/herdrdev/herdr', 'Apache-2.0'),
  ('concept:loop-harness', '루프 하네스', 'concept', '에이전트·오케스트레이션', 'AI 모델을 둘러싼 반복 고리 · 도구 · 맥락 관리 · 안전장치 설계', 'https://claude.com/resources/articles/harnessing-claudes-intelligence', null, null)
) as v(tech_key, display_name, type, cat, one_liner, source, repo_url, license)
on conflict (tech_key) do update set
  -- 한 줄과 근거는 짝으로: 둘 중 하나라도 없던 줄만 둘 다 바꾼다(남의 근거에 우리 글이 붙지 않게)
  one_liner = case when public.technologies.one_liner_source is null or public.technologies.one_liner is null then excluded.one_liner else public.technologies.one_liner end,
  one_liner_source = case when public.technologies.one_liner_source is null or public.technologies.one_liner is null then excluded.one_liner_source else public.technologies.one_liner_source end,
  category_id = coalesce(public.technologies.category_id, excluded.category_id),
  repo_url = coalesce(public.technologies.repo_url, excluded.repo_url),
  license = coalesce(public.technologies.license, excluded.license),
  -- 있던 표시가 이긴다(오른쪽이 이김). 객체가 아니면(jsonb null 등) 새로
  signals = excluded.signals || case when jsonb_typeof(public.technologies.signals) = 'object' then public.technologies.signals else '{}'::jsonb end;
