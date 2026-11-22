-- P-12d 입문 세트(초안, 운영 적용 전 — 사용자 승인 필요). 작업 I-P-12d-starter-set, 목록과 근거는 docs/starter-set.md.
-- 왜: 공개 목록이 MCP뿐이라 교육생에게 맞는 스킬 · 플러그인 · 개념 · 개발 도구가 지도에 없다(11-21 사용자 "자동 + 입문 세트").
-- 45개 모두 공식 페이지를 2026-11-21에 열어 확인한 주소를 한 줄 설명의 근거(one_liner_source)로 둔다(관문 3: 근거 링크 없는 정보는 저장하지 않는다).
-- 공개 목록 조건(one_liner_source 있음 · gone 아님 · 시뮬레이션 아님)에 든다. 지도 500개에 오르는지는 고르기 규칙(lib/server/map-queries.ts)이 정한다: 얇고 별 신호가 없어 따로 몫이 필요(docs/starter-set.md 열린 질문 4).
-- 사용자 저장소에서 처음 본 개념 줄도 공개된다: 이름이 코드에 고정된 일반 개념이라 개인 정보가 없다(ADR 0031).
-- signals.registry_backfill = true: 오래된 도구라 "들어온 날 = 새로 나온 날"이 아니다 → NEW · 적용 기회 알림에서 뺀다(isBulkFilled). starter_set = true는 고르기 규칙이 쓸 표시.
-- 이미 있는 줄(사용자 저장소에서 처음 본 개념 · 스킬 등)은 비어 있는 칸만 채운다: 이름 · 종류 · 상태 · 등급은 건드리지 않는다. 여러 번 돌려도 같다.
-- 갈래는 이름으로 찾는다(categories 시드 202611192300). 정해 두면 매일 분류 단계가 덮지 않는다(비어 있는 것만 채움).
-- shortcut: 관리자가 갈래 이름을 바꾸거나 같은 이름을 다른 큰 갈래 밑에 또 만들면 이름 찾기가 비거나 엇갈린다 — 되돌림 시험의 no_category로 적용 전에 확인한다

insert into public.technologies (tech_key, display_name, type, category_id, one_liner, one_liner_source, repo_url, license, signals)
select v.tech_key, v.display_name, v.type,
  (select c.id from public.categories c where c.name = v.cat order by c.parent_id nulls last limit 1),
  v.one_liner, v.source, v.repo_url, v.license, '{"registry_backfill": true, "starter_set": true}'::jsonb
from (values
  -- ① Claude Code 개념(type concept, 등급 없음). harness · subagents · slash-commands는 코드(lib/domain/services.ts)와 같은 키
  ('concept:skills', '스킬(Agent Skills)', 'concept', '에이전트·오케스트레이션', '할 일 설명서(SKILL.md)를 두면 AI가 필요할 때 꺼내 쓴다', 'https://code.claude.com/docs/en/skills', null, null),
  ('concept:subagents', '서브에이전트', 'concept', '에이전트·오케스트레이션', '특정 일을 따로 맡아 처리하는 작은 도우미 AI', 'https://code.claude.com/docs/en/sub-agents', null, null),
  ('concept:hooks', '훅(Hooks)', 'concept', '에이전트·오케스트레이션', '파일 수정 같은 정해진 순간에 내 명령을 자동으로 실행', 'https://code.claude.com/docs/en/hooks-guide', null, null),
  ('concept:slash-commands', '슬래시 명령', 'concept', '에이전트·오케스트레이션', '/로 시작하는 명령으로 모델 바꾸기 · 초기화 등을 바로 실행', 'https://code.claude.com/docs/en/commands', null, null),
  ('concept:harness', '지침 파일(CLAUDE.md · AGENTS.md)', 'concept', '메모리·컨텍스트', '프로젝트 규칙을 적어 두면 AI가 시작할 때마다 읽는 파일', 'https://code.claude.com/docs/en/memory', null, null),
  ('concept:mcp', 'MCP(Model Context Protocol)', 'concept', '에이전트·오케스트레이션', '외부 도구 · 데이터(DB, 슬랙 등)를 AI에 연결하는 표준', 'https://code.claude.com/docs/en/mcp', null, null),
  ('concept:plugins', '플러그인', 'concept', '에이전트·오케스트레이션', '스킬 · 훅 · MCP 등을 한 묶음으로 설치하는 꾸러미', 'https://code.claude.com/docs/en/plugins', null, null),
  ('concept:plugin-marketplaces', '플러그인 마켓', 'concept', '에이전트·오케스트레이션', '플러그인 목록을 모아 두고 팀이 받아 쓰게 하는 저장소', 'https://code.claude.com/docs/en/plugin-marketplaces', null, null),
  ('concept:output-styles', '답변 스타일', 'concept', '에이전트·오케스트레이션', '답의 말투 · 길이 · 형식을 세션 내내 정해 두는 설정', 'https://code.claude.com/docs/en/output-styles', null, null),
  ('concept:headless', '자동 실행 모드(claude -p)', 'concept', '에이전트·오케스트레이션', '대화 없이 스크립트 · CI에서 명령 한 줄로 실행', 'https://code.claude.com/docs/en/headless', null, null),
  ('concept:settings', '설정 파일', 'concept', '사람 확인', '모델 · 허용 명령 같은 동작을 JSON 파일로 정하는 곳', 'https://code.claude.com/docs/en/settings', null, null),
  ('concept:permission-modes', '권한 모드', 'concept', '사람 확인', 'AI가 묻지 않고 해도 되는 일의 범위를 고르는 방식', 'https://code.claude.com/docs/en/permission-modes', null, null),
  ('concept:plan-mode', '계획 모드', 'concept', '사람 확인', '고치기 전에 먼저 조사하고 계획만 보여 주는 모드', 'https://code.claude.com/docs/en/permission-modes#analyze-before-you-edit-with-plan-mode', null, null),
  ('concept:context-engineering', '컨텍스트 엔지니어링', 'concept', '메모리·컨텍스트', 'AI에게 넘길 정보를 골라 담고 관리하는 방법', 'https://www.anthropic.com/research/effective-context-engineering-for-ai-agents', null, null),
  -- ② Anthropic 공식 스킬(anthropics/skills, 키는 lib/domain/tech-key.ts skillKey 규칙)
  ('skill:anthropics/skills/docx', 'docx', 'skill', '문서·노트', '워드(.docx) 문서를 만들고 읽고 고친다', 'https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md', 'https://github.com/anthropics/skills', 'Apache-2.0'),
  ('skill:anthropics/skills/pdf', 'pdf', 'skill', '문서·노트', 'PDF 읽기 · 합치기 · 나누기 · 양식 채우기', 'https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md', 'https://github.com/anthropics/skills', 'Apache-2.0'),
  ('skill:anthropics/skills/pptx', 'pptx', 'skill', '문서·노트', '발표 슬라이드(.pptx)를 만들고 고친다', 'https://github.com/anthropics/skills/blob/main/skills/pptx/SKILL.md', 'https://github.com/anthropics/skills', 'Apache-2.0'),
  ('skill:anthropics/skills/xlsx', 'xlsx', 'skill', '데이터 분석', '엑셀 · CSV 표를 열고 고치고 새로 만든다', 'https://github.com/anthropics/skills/blob/main/skills/xlsx/SKILL.md', 'https://github.com/anthropics/skills', 'Apache-2.0'),
  ('skill:anthropics/skills/frontend-design', 'frontend-design', 'skill', '화면·컴포넌트', '뻔하지 않은 화면 디자인 방향을 잡아 준다', 'https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md', 'https://github.com/anthropics/skills', 'Apache-2.0'),
  ('skill:anthropics/skills/webapp-testing', 'webapp-testing', 'skill', '코드 검사·테스트', 'Playwright로 내 웹앱을 눌러 보며 시험한다', 'https://github.com/anthropics/skills/blob/main/skills/webapp-testing/SKILL.md', 'https://github.com/anthropics/skills', 'Apache-2.0'),
  ('skill:anthropics/skills/mcp-builder', 'mcp-builder', 'skill', '에이전트·오케스트레이션', '외부 서비스를 AI에 잇는 MCP 서버 만들기 안내', 'https://github.com/anthropics/skills/blob/main/skills/mcp-builder/SKILL.md', 'https://github.com/anthropics/skills', 'Apache-2.0'),
  ('skill:anthropics/skills/skill-creator', 'skill-creator', 'skill', '에이전트·오케스트레이션', '나만의 스킬을 만들고 시험하고 다듬는다', 'https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md', 'https://github.com/anthropics/skills', 'Apache-2.0'),
  ('skill:anthropics/skills/web-artifacts-builder', 'web-artifacts-builder', 'skill', '화면·컴포넌트', 'React · Tailwind로 여러 부품짜리 웹 결과물을 만든다', 'https://github.com/anthropics/skills/blob/main/skills/web-artifacts-builder/SKILL.md', 'https://github.com/anthropics/skills', 'Apache-2.0'),
  ('skill:anthropics/skills/doc-coauthoring', 'doc-coauthoring', 'skill', '문서·노트', '기획서 · 스펙 문서를 단계별로 같이 쓴다', 'https://github.com/anthropics/skills/blob/main/skills/doc-coauthoring/SKILL.md', 'https://github.com/anthropics/skills', null),
  -- ③ Anthropic 공식 플러그인(anthropics/claude-plugins-official, Apache-2.0). 키는 스킬과 같은 모양 plugin:<owner>/<repo>/<이름>(새 규칙, docs/starter-set.md)
  ('plugin:anthropics/claude-plugins-official/code-review', 'code-review', 'plugin', '코드 검사·테스트', '여러 검토 도우미가 PR을 자동으로 리뷰한다', 'https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/README.md', 'https://github.com/anthropics/claude-plugins-official', 'Apache-2.0'),
  ('plugin:anthropics/claude-plugins-official/commit-commands', 'commit-commands', 'plugin', 'git·이슈', '커밋 · 푸시 · PR 만들기를 명령 하나로', 'https://github.com/anthropics/claude-plugins-official/blob/main/plugins/commit-commands/README.md', 'https://github.com/anthropics/claude-plugins-official', 'Apache-2.0'),
  ('plugin:anthropics/claude-plugins-official/feature-dev', 'feature-dev', 'plugin', '에이전트·오케스트레이션', '코드 파악 → 설계 → 검토 순서로 기능을 만든다', 'https://github.com/anthropics/claude-plugins-official/blob/main/plugins/feature-dev/README.md', 'https://github.com/anthropics/claude-plugins-official', 'Apache-2.0'),
  ('plugin:anthropics/claude-plugins-official/frontend-design', 'frontend-design', 'plugin', '화면·컴포넌트', 'AI 티 안 나는 화면을 만들게 돕는다', 'https://github.com/anthropics/claude-plugins-official/blob/main/plugins/frontend-design/README.md', 'https://github.com/anthropics/claude-plugins-official', 'Apache-2.0'),
  ('plugin:anthropics/claude-plugins-official/security-guidance', 'security-guidance', 'plugin', '보안·감사', 'AI가 쓴 코드의 보안 구멍을 경고한다', 'https://github.com/anthropics/claude-plugins-official/blob/main/plugins/security-guidance/README.md', 'https://github.com/anthropics/claude-plugins-official', 'Apache-2.0'),
  ('plugin:anthropics/claude-plugins-official/learning-output-style', 'learning-output-style', 'plugin', '에이전트·오케스트레이션', '중요한 대목은 직접 코드를 쓰게 하는 학습 모드', 'https://github.com/anthropics/claude-plugins-official/blob/main/plugins/learning-output-style/README.md', 'https://github.com/anthropics/claude-plugins-official', 'Apache-2.0'),
  -- ④ 새 개발 도구(npm · PyPI 패키지가 있는 것만, type sdk = 화면의 "패키지"). 한 줄은 공식 페이지 기준
  ('npm:@anthropic-ai/claude-code', 'Claude Code', 'sdk', '에이전트·오케스트레이션', '터미널에서 AI에게 코드 수정과 명령 실행을 맡기는 도구', 'https://code.claude.com/docs/en/overview', 'https://github.com/anthropics/claude-code', null),
  ('npm:@openai/codex', 'OpenAI Codex CLI', 'sdk', '에이전트·오케스트레이션', '내 컴퓨터 터미널에서 도는 OpenAI 코딩 도우미', 'https://developers.openai.com/codex/cli', 'https://github.com/openai/codex', 'Apache-2.0'),
  ('npm:@github/copilot', 'GitHub Copilot CLI', 'sdk', '에이전트·오케스트레이션', '터미널에서 쓰는 GitHub Copilot(구독 필요)', 'https://github.com/features/copilot', 'https://github.com/github/copilot-cli', null),
  ('pypi:aider-chat', 'Aider', 'sdk', '에이전트·오케스트레이션', '터미널에서 AI와 짝으로 코딩하는 파이썬 도구', 'https://aider.chat', 'https://github.com/Aider-AI/aider', 'Apache-2.0'),
  ('npm:cline', 'Cline', 'sdk', '에이전트·오케스트레이션', 'VS Code와 터미널에서 파일을 고치는 AI 도우미', 'https://cline.bot', 'https://github.com/cline/cline', 'Apache-2.0'),
  ('npm:pnpm', 'pnpm', 'sdk', '화면·컴포넌트', '빠르고 디스크를 아끼는 npm 대신 패키지 관리자', 'https://pnpm.io/installation', 'https://github.com/pnpm/pnpm', 'MIT'),
  ('npm:vite', 'Vite', 'sdk', '화면·컴포넌트', '웹 화면을 빠르게 띄우고 묶어 주는 개발 서버', 'https://vite.dev', 'https://github.com/vitejs/vite', 'MIT'),
  ('npm:create-next-app', 'create-next-app', 'sdk', '화면·컴포넌트', '명령 한 줄로 Next.js 새 프로젝트를 만든다', 'https://nextjs.org/docs/app/api-reference/cli/create-next-app', 'https://github.com/vercel/next.js', 'MIT'),
  ('npm:typescript', 'TypeScript', 'sdk', '화면·컴포넌트', '자바스크립트에 타입을 붙여 실수를 미리 잡는다', 'https://www.typescriptlang.org/', 'https://github.com/microsoft/TypeScript', 'Apache-2.0'),
  ('npm:eslint', 'ESLint', 'sdk', '코드 검사·테스트', '코드의 실수와 나쁜 습관을 찾아 알려 준다', 'https://eslint.org', 'https://github.com/eslint/eslint', 'MIT'),
  ('npm:prettier', 'Prettier', 'sdk', '코드 검사·테스트', '코드 모양(띄어쓰기 · 줄바꿈)을 자동으로 맞춘다', 'https://prettier.io', 'https://github.com/prettier/prettier', 'MIT'),
  ('npm:vitest', 'Vitest', 'sdk', '코드 검사·테스트', 'Vite 기반의 빠른 자바스크립트 시험 도구', 'https://vitest.dev/guide/', 'https://github.com/vitest-dev/vitest', 'MIT'),
  ('npm:@playwright/test', 'Playwright Test', 'sdk', '코드 검사·테스트', '브라우저를 자동으로 눌러 화면을 시험한다', 'https://playwright.dev/docs/intro', 'https://github.com/microsoft/playwright', 'Apache-2.0'),
  ('npm:supabase', 'Supabase CLI', 'sdk', '데이터베이스', '내 컴퓨터에서 Supabase DB를 띄우고 관리한다', 'https://supabase.com/docs/guides/local-development/cli/getting-started', 'https://github.com/supabase/cli', 'MIT'),
  ('npm:vercel', 'Vercel CLI', 'sdk', '배포·클라우드', '터미널에서 Vercel에 배포하고 설정한다', 'https://vercel.com/docs/cli', 'https://github.com/vercel/vercel', 'Apache-2.0')
) as v(tech_key, display_name, type, cat, one_liner, source, repo_url, license)
on conflict (tech_key) do update set
  -- 한 줄과 근거는 짝으로: 둘 중 하나라도 없던 줄만 둘 다 바꾼다(남의 근거에 우리 글이 붙지 않게, 근거만 있고 글이 빈 줄도 채우게)
  one_liner = case when public.technologies.one_liner_source is null or public.technologies.one_liner is null then excluded.one_liner else public.technologies.one_liner end,
  one_liner_source = case when public.technologies.one_liner_source is null or public.technologies.one_liner is null then excluded.one_liner_source else public.technologies.one_liner_source end,
  category_id = coalesce(public.technologies.category_id, excluded.category_id),
  repo_url = coalesce(public.technologies.repo_url, excluded.repo_url),
  license = coalesce(public.technologies.license, excluded.license),
  -- 있던 표시가 이긴다(오른쪽이 이김): 이번 주 사용자 저장소로 들어온 줄의 registry_backfill=false(NEW)를 덮지 않는다. 객체가 아니면(jsonb null 등) 새로
  signals = excluded.signals || case when jsonb_typeof(public.technologies.signals) = 'object' then public.technologies.signals else '{}'::jsonb end;

-- 11-21 사용자 결정: concept:harness 이름을 공식 용어에 맞게(공식 용어집에서 harness = Claude Code 자체). 키는 그대로.
-- 코드가 처음 만든 이름 그대로일 때만 바꾼다(관리자가 고친 이름은 두기). lib/domain/services.ts CONCEPTS의 이름도 같이 바꿈
update public.technologies set display_name = '지침 파일(CLAUDE.md · AGENTS.md)' where tech_key = 'concept:harness' and display_name = '하네스(에이전트 지시 파일)';
