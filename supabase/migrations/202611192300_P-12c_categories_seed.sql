-- P-12c 갈래(하는 일) 처음 목록 시드(데이터설계 DQ2의 답, 2026-11-19). 작업 I-P-12c-map.
-- 큰 갈래 10개 = 사용자가 고른 추천 8개 + 운영 카탈로그 표본(5,565개 중 200개 + 낱말 빈도)을 보고 Claude가 더한 2개(업무·서비스 연동, 생활·정보).
-- 세부 갈래의 keywords는 자동 분류 규칙(lib/map/classify.ts)이 읽는다. 관리자가 고칠 수 있다(IA-17). 목록의 원본은 lib/map/classify.ts의 CATEGORY_SEED.
-- 다시 돌려도 같은 결과(이미 있으면 건너뜀). 기술의 갈래는 여기서 정하지 않는다: 매일 정기 실행의 분류 단계가 비어 있는 것만 채운다.

insert into public.categories (name, parent_id, keywords)
select v.name, null::uuid, null::text[]
from (values
  ('리서치'),
  ('기획·문서'),
  ('디자인'),
  ('프론트엔드'),
  ('백엔드·데이터'),
  ('검사·보안'),
  ('배포·운영'),
  ('AI 작업 방식'),
  ('업무·서비스 연동'),
  ('생활·정보')
) as v(name)
on conflict (name, parent_id) do nothing;

insert into public.categories (name, parent_id, keywords)
select v.name, p.id, v.keywords
from (values
  ('웹 검색·수집', '리서치', array['web search', 'search engine', 'serp', 'crawl', 'crawler', 'scrape', 'scraping', 'scraper', 'firecrawl', 'browse the web']),
  ('논문·지식', '리서치', array['paper', 'papers', 'arxiv', 'scholar', 'academic', 'wikipedia', 'citation']),
  ('뉴스·트렌드', '리서치', array['news', 'trends', 'trend', 'rss', 'headlines']),
  ('문서·노트', '기획·문서', array['docs', 'document', 'documents', 'notes', 'notebook', 'notion', 'markdown', 'wiki', 'confluence', 'pdf', 'write', 'writing', 'draft']),
  ('작업·일정', '기획·문서', array['task', 'tasks', 'todo', 'project management', 'jira', 'linear', 'asana', 'trello', 'calendar', 'schedule', 'planner', 'pmo']),
  ('회의·협업', '기획·문서', array['meeting', 'meetings', 'workspace', 'collaborate', 'collaboration', 'teams', 'transcripts', 'minutes']),
  ('디자인 도구', '디자인', array['figma', 'design', 'canva', 'ui kit', 'mockup', 'brand visuals']),
  ('이미지·영상 생성', '디자인', array['generate images', 'image generation', 'images', 'image', 'video', 'videos', 'photo', 'photos', 'sprite', 'pixel art', 'voiceover', 'dubbing']),
  ('3D·CAD', '디자인', array['3d', 'cad', 'pcb', 'kicad', 'render', 'stl', 'scene']),
  ('브라우저 자동화', '프론트엔드', array['browser', 'playwright', 'puppeteer', 'selenium', 'screenshot', 'screenshots', 'headless']),
  ('화면·컴포넌트', '프론트엔드', array['frontend', 'react', 'component', 'components', 'css', 'tailwind', 'ui', 'web page', 'html pages', 'widget']),
  ('데이터베이스', '백엔드·데이터', array['database', 'sql', 'postgres', 'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'supabase', 'elasticsearch', 'query']),
  ('API·웹훅', '백엔드·데이터', array['graphql', 'webhook', 'webhooks', 'endpoint', 'openapi']),
  ('데이터 분석', '백엔드·데이터', array['analytics', 'analyst', 'dataset', 'statistics', 'statistical', 'spreadsheet', 'excel', 'csv', 'bigquery', 'warehouse', 'metrics', 'dashboard', 'dashboards']),
  ('파일·저장소', '백엔드·데이터', array['file', 'files', 'storage', 's3', 'drive', 'upload', 'convert', 'compress']),
  ('코드 검사·테스트', '검사·보안', array['code review', 'lint', 'test', 'tests', 'testing', 'qa']),
  ('보안·감사', '검사·보안', array['security', 'vulnerability', 'vulnerabilities', 'cve', 'audit', 'scan', 'secret', 'secrets', 'spoofing', 'dmarc', 'compliance', 'risk']),
  ('검증·서명', '검사·보안', array['verify', 'verified', 'verification', 'proof', 'proofs', 'signed', 'attested', 'notary', 'cryptographic']),
  ('배포·클라우드', '배포·운영', array['deploy', 'deployment', 'vercel', 'netlify', 'aws', 'azure', 'gcp', 'cloudflare', 'kubernetes', 'docker', 'container', 'containers', 'terraform']),
  ('서버·인프라', '배포·운영', array['server management', 'ssh', 'vps', 'gpu', 'compute', 'infrastructure', 'dns', 'domain', 'domains', 'stack generator']),
  ('모니터링·로그', '배포·운영', array['monitoring', 'monitor', 'logs', 'observability', 'sentry', 'datadog', 'grafana', 'incident', 'uptime']),
  ('git·이슈', '배포·운영', array['github', 'gitlab', 'git', 'pull request', 'issues', 'repository', 'repos', 'commit']),
  ('메모리·컨텍스트', 'AI 작업 방식', array['memory', 'memories', 'rag', 'embedding', 'embeddings', 'vector', 'knowledge base', 'knowledge graph']),
  ('에이전트·오케스트레이션', 'AI 작업 방식', array['multi-agent', 'orchestration', 'prompt', 'prompts', 'llm', 'subagent', 'skill', 'skills', 'a2a']),
  ('사람 확인', 'AI 작업 방식', array['human-in-the-loop', 'approval', 'approvals', 'approve', 'mandate', 'permit', 'escalate', 'review page']),
  ('결제·금융', '업무·서비스 연동', array['payment', 'payments', 'pay', 'invoice', 'invoices', 'stripe', 'crypto', 'wallet', 'usdc', 'x402', 'bank', 'banking', 'finance', 'stock', 'trading', 'accounting', 'books', 'checkout', 'mortgage']),
  ('마케팅·소셜', '업무·서비스 연동', array['seo', 'ads', 'marketing', 'social', 'instagram', 'tiktok', 'twitter', 'linkedin', 'facebook', 'brand', 'influencer', 'posts', 'campaigns', 'outreach']),
  ('커뮤니케이션', '업무·서비스 연동', array['email', 'emails', 'inbox', 'slack', 'discord', 'chat', 'sms', 'whatsapp', 'telegram', 'call', 'calls', 'phone']),
  ('미디어·콘텐츠', '업무·서비스 연동', array['youtube', 'audio', 'podcast', 'music', 'voice', 'radio', 'film', 'films', 'captions', 'transcription']),
  ('커머스·영업', '업무·서비스 연동', array['shop', 'shopify', 'ecommerce', 'amazon', 'seller', 'crm', 'sales', 'prospects', 'leads', 'catalog', 'orders']),
  ('여행·장소', '생활·정보', array['travel', 'hotel', 'hotels', 'flight', 'flights', 'booking', 'restaurants', 'places', 'weather', 'maps', 'beach']),
  ('건강·운동', '생활·정보', array['health', 'medical', 'medicine', 'calorie', 'calories', 'fitness', 'workout', 'gym', 'meditation', 'food']),
  ('법·세금·공공 데이터', '생활·정보', array['legal', 'law', 'case law', 'legislation', 'regulations', 'tax', 'patent', 'government', 'public data', 'census', 'official sources'])
) as v(name, parent, keywords)
join public.categories p on p.name = v.parent and p.parent_id is null
on conflict (name, parent_id) do nothing;
