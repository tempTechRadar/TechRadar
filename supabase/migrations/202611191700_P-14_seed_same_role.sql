-- P-14: 같은 역할 처음 짝(시드, SPEC-4.4·SQ2, ADR 0015). 주인: 황재웅(B). 리뷰는 김영식(마이그레이션 규칙).
-- 초안 문서 docs/seed-same-role-pairs.md(브랜치 docs/P-14-seed-pairs)의 20쌍 중 **확신 "높음" 14쌍**만 넣는다. 근접 6쌍은 팀이 정한 뒤 따로.
-- 시드는 관리자 확인 없이 확정으로 넣는 예외다(ADR 0015): status = confirmed, made_by = seed, confirmed_by는 비움(확정한 사람이 없다), confirmed_at = 지금.
-- 이 마이그레이션은 알림을 만들지 않는다(알림은 관리자가 버튼으로 확정하거나 새 기술이 들어올 때만). 여러 번 돌려도 같다(on conflict).
-- 주의: 없는 기술은 얇은 줄로 먼저 만든다(depth thin, 등급 unknown). 지원 종료 표시(npm)가 붙은 기술도 상태는 기본값 active다: 상태는 수집기(P-9b·9c)가 정한다.

insert into public.technologies (tech_key, display_name, type)
select t.tech_key, substr(t.tech_key, 5), 'mcp'
from (values
  ('npm:mcp-proxy'), ('npm:supergateway'),
  ('npm:@modelcontextprotocol/server-filesystem'), ('npm:@cyanheads/filesystem-mcp-server'),
  ('npm:@playwright/mcp'), ('npm:@modelcontextprotocol/server-puppeteer'), ('npm:@browsermcp/mcp'), ('npm:@executeautomation/playwright-mcp-server'),
  ('npm:@modelcontextprotocol/server-brave-search'), ('npm:exa-mcp-server'), ('npm:tavily-mcp'),
  ('npm:@modelcontextprotocol/server-slack'), ('npm:slack-mcp-server'),
  ('npm:@modelcontextprotocol/server-postgres'), ('npm:@henkey/postgres-mcp-server'),
  ('npm:mcp-server-kubernetes'), ('npm:kubernetes-mcp-server'),
  ('npm:@modelcontextprotocol/server-gdrive'), ('npm:@isaacphi/mcp-gdrive'),
  ('npm:@notionhq/notion-mcp-server'), ('npm:@suekou/mcp-notion-server'),
  ('npm:@upstash/context7-mcp'), ('npm:@arabold/docs-mcp-server')
) as t(tech_key)
on conflict (tech_key) do nothing;

-- 짝은 작은 id가 tech_a(DB 제약). 이미 후보(candidate)로 있던 짝은 확정으로 올리고, 이미 확정된 것은 그대로 둔다.
insert into public.tech_relations (tech_a, tech_b, kind, status, quote, made_by, confirmed_at)
select least(a.id, b.id), greatest(a.id, b.id), 'same_role', 'confirmed',
  '같은 역할(처음 짝 목록, 공개 설명 기준 초안: docs/seed-same-role-pairs.md)', 'seed', now()
from (values
  ('npm:mcp-proxy', 'npm:supergateway'),
  ('npm:@modelcontextprotocol/server-filesystem', 'npm:@cyanheads/filesystem-mcp-server'),
  ('npm:@playwright/mcp', 'npm:@modelcontextprotocol/server-puppeteer'),
  ('npm:@playwright/mcp', 'npm:@browsermcp/mcp'),
  ('npm:@playwright/mcp', 'npm:@executeautomation/playwright-mcp-server'),
  ('npm:@modelcontextprotocol/server-brave-search', 'npm:exa-mcp-server'),
  ('npm:@modelcontextprotocol/server-brave-search', 'npm:tavily-mcp'),
  ('npm:exa-mcp-server', 'npm:tavily-mcp'),
  ('npm:@modelcontextprotocol/server-slack', 'npm:slack-mcp-server'),
  ('npm:@modelcontextprotocol/server-postgres', 'npm:@henkey/postgres-mcp-server'),
  ('npm:mcp-server-kubernetes', 'npm:kubernetes-mcp-server'),
  ('npm:@modelcontextprotocol/server-gdrive', 'npm:@isaacphi/mcp-gdrive'),
  ('npm:@notionhq/notion-mcp-server', 'npm:@suekou/mcp-notion-server'),
  ('npm:@upstash/context7-mcp', 'npm:@arabold/docs-mcp-server')
) as p(key_a, key_b)
join public.technologies a on a.tech_key = p.key_a
join public.technologies b on b.tech_key = p.key_b
on conflict (tech_a, tech_b, kind) do update
  set status = 'confirmed', confirmed_at = now()
  where public.tech_relations.status = 'candidate';
