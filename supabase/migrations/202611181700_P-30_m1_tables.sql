-- P-30 · M1(1·2순위) 테이블과 접근 규칙(RLS)
-- 출처: docs/erd.md 2.3·2.5·2.6·4절, docs/spec.md 7.2·9, CLAUDE.md 불변 5. categories는 P-2에서 만들었다.
-- 정해진 값은 enum 대신 text + check(erd E2). 모든 시각은 timestamptz(UTC).

-- ───────────────────────── 2.3 관리자가 고치는 목록
create table public.rule_lists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('allow_package', 'github_topic', 'hn_keyword', 'risk_pattern')),
  ecosystem text check (ecosystem in ('npm', 'pypi')),
  value text not null,
  pattern_id text,
  pattern_grade text check (pattern_grade in ('danger', 'caution')),
  enabled boolean not null default true,
  updated_by uuid references public.profiles (id),
  check ((kind = 'allow_package') = (ecosystem is not null)),
  check ((kind = 'risk_pattern') = (pattern_id is not null and pattern_grade is not null)),
  unique nulls not distinct (kind, ecosystem, value)
);

-- ───────────────────────── 2.3 같은 역할
create table public.tech_relations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tech_a uuid not null references public.technologies (id),
  tech_b uuid not null references public.technologies (id),
  kind text not null default 'same_role' check (kind in ('same_role')),
  status text not null default 'candidate' check (status in ('candidate', 'confirmed')),
  quote text,
  made_by text not null check (made_by in ('seed', 'rule', 'ai', 'admin')),
  confirmed_by uuid references public.profiles (id),
  confirmed_at timestamptz,
  is_simulated boolean not null default false,
  check (tech_a < tech_b),  -- 같은 짝을 두 번 넣지 않게 작은 id가 a
  check ((status = 'confirmed') = (confirmed_at is not null)),
  unique (tech_a, tech_b, kind)
);
create index tech_relations_tech_b on public.tech_relations (tech_b);

-- ───────────────────────── 2.5 적용 시나리오(참고 자료)
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  alert_id uuid not null references public.alerts (id),
  requested_by uuid not null references public.profiles (id),
  status text not null default 'generating' check (status in ('generating', 'done', 'failed')),
  body jsonb,
  sources jsonb,
  finished_at timestamptz
);
create index scenarios_alert_id on public.scenarios (alert_id);
create index scenarios_requested_by_day on public.scenarios (requested_by, created_at);  -- 사용자당 하루 5번(SPEC-4.2)

-- ───────────────────────── 2.6 내보내기, 기록, AI
create table public.exports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('install_prompt', 'local_import')),
  tech_count int not null check (tech_count >= 0),
  excluded_danger_count int not null default 0 check (excluded_danger_count >= 0),
  imported_lines int check (imported_lines >= 0),
  rejected_lines int check (rejected_lines >= 0)
);

create table public.grade_views (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id),
  tech_id uuid not null references public.technologies (id),
  viewed_at timestamptz not null default now()
);
create index grade_views_user_tech on public.grade_views (user_id, tech_id);

create table public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  purpose text not null check (purpose in ('draft', 'scenario', 'classify', 'chatbot')),
  user_id uuid references public.profiles (id),
  input_hash text not null,
  tokens_in int,
  tokens_out int,
  status text not null check (status in ('succeeded', 'failed')),
  error text
);
create index ai_calls_day on public.ai_calls (created_at);  -- 하루 한도는 이 테이블을 세서 건다(SPEC-9)
create index ai_calls_input_hash on public.ai_calls (input_hash);  -- 같은 입력은 다시 보내지 않음

create table public.chat_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id),
  question text not null,
  answer text not null check (char_length(answer) <= 800),
  wiki_pages text[]
);

-- ───────────────────────── 4. 접근 규칙(RLS) — 모든 새 테이블에 켠다(불변 5)
alter table public.rule_lists enable row level security;
alter table public.tech_relations enable row level security;
alter table public.scenarios enable row level security;
alter table public.exports enable row level security;
alter table public.grade_views enable row level security;
alter table public.ai_calls enable row level security;
alter table public.chat_logs enable row level security;

-- 로그인 안 한 사람은 어떤 표도 못 본다(P-2의 revoke는 그때 있던 표에만 걸렸으므로 새 표에 다시).
revoke all on public.rule_lists, public.tech_relations, public.scenarios, public.exports,
  public.grade_views, public.ai_calls, public.chat_logs from anon;
-- 지우기는 아무도(기록 보존). 끄기는 enabled·status로.
revoke delete on public.rule_lists, public.tech_relations, public.scenarios, public.exports,
  public.grade_views, public.ai_calls, public.chat_logs from authenticated;

-- rule_lists: 관리자만 읽기·쓰기. 고친 사람은 본인으로(바꾼 기록 audit_logs는 화면 P-18이 함께 남긴다).
create policy rule_lists_admin_select on public.rule_lists for select to authenticated using ((select public.is_admin()));
create policy rule_lists_admin_insert on public.rule_lists for insert to authenticated
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
create policy rule_lists_admin_update on public.rule_lists for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()) and updated_by = (select auth.uid()));

-- tech_relations: 모두 읽기. 만들기는 서버. 관리자는 확정만(상태·확정한 사람·시각 칸만).
create policy tech_relations_select on public.tech_relations for select to authenticated using (true);
create policy tech_relations_admin_confirm on public.tech_relations for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()) and confirmed_by = (select auth.uid()));
revoke insert, update on public.tech_relations from authenticated;
grant update (status, confirmed_by, confirmed_at) on public.tech_relations to authenticated;

-- scenarios: 본인 알림에만 요청·읽기. 결과(상태·본문)는 서버가 쓴다. 관리자 읽기.
create policy scenarios_select on public.scenarios for select to authenticated
  using (requested_by = (select auth.uid()) or (select public.is_admin()));
create policy scenarios_insert_own on public.scenarios for insert to authenticated
  with check (requested_by = (select auth.uid()) and status = 'generating'
    and exists (select 1 from public.alerts a where a.id = scenarios.alert_id and a.user_id = (select auth.uid())));
revoke update on public.scenarios from authenticated;

-- exports · grade_views: 본인 읽기·만들기. 관리자 읽기.
create policy exports_select on public.exports for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy exports_insert_own on public.exports for insert to authenticated with check (user_id = (select auth.uid()));
create policy grade_views_select on public.grade_views for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy grade_views_insert_own on public.grade_views for insert to authenticated with check (user_id = (select auth.uid()));
revoke update on public.exports, public.grade_views from authenticated;

-- ai_calls: 관리자 읽기. 쓰기는 서버.
create policy ai_calls_admin_select on public.ai_calls for select to authenticated using ((select public.is_admin()));
revoke insert, update on public.ai_calls from authenticated;

-- chat_logs: 관리자(팀원) 읽기·만들기.
create policy chat_logs_admin_select on public.chat_logs for select to authenticated using ((select public.is_admin()));
create policy chat_logs_admin_insert on public.chat_logs for insert to authenticated
  with check ((select public.is_admin()) and user_id = (select auth.uid()));
revoke update on public.chat_logs from authenticated;

-- ───────────────────────── 처음 값: 허용 목록(SPEC-7.2). 지금은 lib/domain/manifest.ts가 같은 목록을 쓴다.
-- 관리자 화면(P-18)이 이 표를 고치기 시작하면 코드가 이 표를 읽도록 바꾼다(두 곳이 어긋나지 않게).
insert into public.rule_lists (kind, ecosystem, value) values
  ('allow_package', 'npm', '@anthropic-ai/sdk'), ('allow_package', 'npm', '@anthropic-ai/claude-code'),
  ('allow_package', 'npm', '@anthropic-ai/claude-agent-sdk'), ('allow_package', 'npm', 'openai'),
  ('allow_package', 'npm', '@openai/agents'), ('allow_package', 'npm', 'ai'), ('allow_package', 'npm', '@ai-sdk/*'),
  ('allow_package', 'npm', '@modelcontextprotocol/*'), ('allow_package', 'npm', 'mcp-remote'),
  ('allow_package', 'npm', '@google/genai'), ('allow_package', 'npm', 'langchain'), ('allow_package', 'npm', '@langchain/*'),
  ('allow_package', 'npm', 'llamaindex'), ('allow_package', 'npm', '@mastra/core'),
  ('allow_package', 'pypi', 'anthropic'), ('allow_package', 'pypi', 'claude-agent-sdk'), ('allow_package', 'pypi', 'openai'),
  ('allow_package', 'pypi', 'openai-agents'), ('allow_package', 'pypi', 'mcp'), ('allow_package', 'pypi', 'fastmcp'),
  ('allow_package', 'pypi', 'langchain'), ('allow_package', 'pypi', 'langchain-*'), ('allow_package', 'pypi', 'langgraph'),
  ('allow_package', 'pypi', 'llama-index'), ('allow_package', 'pypi', 'crewai'), ('allow_package', 'pypi', 'autogen-agentchat'),
  ('allow_package', 'pypi', 'google-genai'), ('allow_package', 'pypi', 'litellm');
