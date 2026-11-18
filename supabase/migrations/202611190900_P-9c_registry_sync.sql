-- P-9c · 공식 MCP 레지스트리 수집(spec 8절, 데이터설계 7·8절, ADR 0019)
-- ① sources: 바뀐 것만 읽는 기준(last_synced_at)과, 첫날 전체 읽기처럼 한 실행에 다 못 읽을 때 이어 가는 자리(sync_started_at·sync_cursor).
--    레지스트리 목록은 서버 이름순이라 중간에 멈추면 "여기까지 읽었다"를 시각으로 적을 수 없다. 끝까지 읽은 뒤에만 last_synced_at을 올린다.
-- ② rule_lists: 공식 조직 목록(kind 'official_org'). 이 목록에 맞는 서버는 두껍게 본다(데이터설계 8절 관문 2 "공식"). 관리자가 고친다(IA-17·P-18).
alter table public.sources
  add column last_synced_at timestamptz,
  add column sync_started_at timestamptz,
  add column sync_cursor text;

alter table public.rule_lists drop constraint rule_lists_kind_check;
alter table public.rule_lists add constraint rule_lists_kind_check
  check (kind in ('allow_package', 'github_topic', 'hn_keyword', 'risk_pattern', 'official_org'));

-- 처음 목록: 데이터설계 8절의 예(anthropics, modelcontextprotocol, openai). 팀 추정이라 관리자가 고친다.
insert into public.rule_lists (kind, value) values
  ('official_org', 'modelcontextprotocol'),
  ('official_org', 'anthropics'),
  ('official_org', 'openai')
on conflict do nothing;
