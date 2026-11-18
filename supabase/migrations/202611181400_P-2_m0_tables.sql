-- P-2 · M0 얇은 한 줄에 필요한 테이블과 접근 규칙(RLS)
-- 출처: docs/erd.md 0·2·4절, docs/spec.md 3.1·10-1, ADR 0010·0012, CLAUDE.md 불변 1·3·4·5
-- 정해진 값은 enum 대신 text + check(erd E2). 모든 시각은 timestamptz(UTC).

-- ───────────────────────── 2.1 사람
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  nickname text not null unique check (char_length(nickname) between 2 and 30),
  role text not null default 'user' check (role in ('user', 'admin')),
  login_method text not null check (login_method in ('google', 'email_test')),
  is_public boolean not null default true,
  is_demo boolean not null default false
);

-- ───────────────────────── 2.3 갈래(technologies.category_id가 가리키므로 M0에 함께 만든다)
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  parent_id uuid references public.categories (id),
  keywords text[],
  unique nulls not distinct (name, parent_id)
);

-- ───────────────────────── 2.2 직접 입력
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('repo', 'local')),
  name text not null,
  repo_url text,
  memo text,
  archived_at timestamptz,
  check ((kind = 'repo') = (repo_url is not null)),
  unique (owner_id, repo_url)
);
create unique index projects_one_local_per_owner on public.projects (owner_id) where kind = 'local';

-- ───────────────────────── 2.3 기술 카탈로그
create table public.technologies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tech_key text not null unique,
  display_name text not null,
  type text not null check (type in ('mcp', 'skill', 'plugin', 'sdk', 'model', 'service', 'concept')),
  category_id uuid references public.categories (id),
  hosts text[],
  depth text not null default 'thin' check (depth in ('thin', 'thick')),
  thick_reasons text[],
  status text not null default 'active' check (status in ('active', 'dormant', 'deprecated', 'gone')),
  missed_count int not null default 0,
  last_checked_ok_at timestamptz,
  collect_error_kind text check (collect_error_kind in ('timeout', 'network', 'rate_limited', 'http_status', 'parse')),
  one_liner text,
  one_liner_source text,
  repo_url text,
  license text,
  last_activity_at timestamptz,
  last_activity_kind text check (last_activity_kind in ('release', 'commit')),
  is_official boolean not null default false,
  signals jsonb,
  category_score numeric,
  category_rank int,
  out_of_rank_days int not null default 0,
  grade text not null default 'unknown' check (grade in ('pass', 'caution', 'danger', 'unknown')),
  grade_reason text,
  grade_evidence jsonb,
  grade_rule_version text,
  graded_at timestamptz,
  is_simulated boolean not null default false
);

create table public.my_technologies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_id uuid not null references public.profiles (id),
  project_id uuid not null references public.projects (id),
  tech_id uuid references public.technologies (id),
  manual_name text,
  origin text not null check (origin in ('repo', 'manual', 'import')),
  source_file text,
  version text,
  unknown_origin boolean not null default false,
  hidden_at timestamptz,
  read_at timestamptz,
  collect_error_kind text check (collect_error_kind in ('timeout', 'network', 'rate_limited', 'http_status', 'parse')),
  added_by uuid not null references public.profiles (id),
  check (tech_id is not null or manual_name is not null),
  unique (project_id, tech_id),
  unique (project_id, manual_name)
);

-- ───────────────────────── 2.4 수집
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null unique,
  method text not null check (method in ('api', 'firecrawl')),
  priority int not null,
  enabled boolean not null default true
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  trigger text not null check (trigger in ('schedule', 'manual', 'simulator', 'user_reread', 'first_read', 'scoring')),
  started_by uuid references public.profiles (id),
  project_id uuid references public.projects (id),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'partial')),
  started_at timestamptz,
  finished_at timestamptz,
  item_count int not null default 0,
  attempt int not null default 1 check (attempt between 1 and 3),
  next_retry_at timestamptz
);

create table public.run_steps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_id uuid not null references public.runs (id),
  step_name text not null,
  status text not null check (status in ('waiting', 'running', 'succeeded', 'failed', 'awaiting_judgment')),
  input_summary text,
  output_summary text,
  api_url text,
  http_status int,
  duration_ms int,
  count_in int,
  count_out int,
  branch_counts jsonb,
  error_kind text check (error_kind in ('timeout', 'network', 'rate_limited', 'http_status', 'parse')),
  error_message text,
  started_at timestamptz,
  finished_at timestamptz
);
create index run_steps_run_id on public.run_steps (run_id);

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_id uuid not null references public.sources (id),
  tech_id uuid not null references public.technologies (id),
  metric text not null,
  prev_value jsonb,
  curr_value jsonb,
  change_size text,
  run_id uuid not null references public.runs (id),
  observed_at timestamptz not null,
  is_simulated boolean not null default false
);

-- ───────────────────────── 2.5 사건과 판단
create table public.changes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('grade_to_danger', 'first_seen_danger', 'same_role_new', 'model_eol')),
  tech_id uuid not null references public.technologies (id),
  version text,
  cause_id text not null,
  danger_round int not null default 1,
  prev_value jsonb,
  curr_value jsonb,
  observation_id uuid references public.observations (id),
  dedupe_key text not null unique,  -- 불변 3: 같은 변경은 한 번만(SPEC-3.1)
  draft_response text,
  draft_sources jsonb,
  detected_at timestamptz not null default now(),
  is_simulated boolean not null default false
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id),
  change_id uuid not null references public.changes (id),
  my_technology_id uuid references public.my_technologies (id),
  kind text not null check (kind in ('security', 'opportunity', 'model_eol')),
  status text not null default 'pending' check (status in ('pending', 'done')),
  comparison jsonb,
  dedupe_key text not null,
  unique (user_id, dedupe_key)  -- 불변 3: 사람마다 알림 한 번
);
create index alerts_change_id on public.alerts (change_id);

create table public.judgments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  alert_id uuid not null unique references public.alerts (id),
  decision text not null check (decision in ('candidate', 'hold')),
  reason text,
  fixed_version text,  -- 보안 경고에서 적용 후보일 때 올릴 고친 버전(ADR 0012)
  action text not null check (action in ('candidate_recorded', 'hold_reason_recorded')),
  action_result text,
  judged_by uuid not null references public.profiles (id),
  judged_at timestamptz not null default now(),
  check (decision <> 'hold' or char_length(coalesce(reason, '')) >= 5),
  check ((decision = 'candidate') = (action = 'candidate_recorded'))
);

-- ───────────────────────── 2.6 바꾼 기록(덧붙이기만)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references public.profiles (id),
  actor_role text not null check (actor_role in ('user', 'admin', 'server')),
  action text not null,
  target_table text not null,
  target_id text not null,
  reason text
);

-- ───────────────────────── 도우미 함수
-- RLS 안에서 profiles를 다시 읽어도 규칙이 돌고 돌지 않게 security definer로 둔다.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin');
$$;

-- 가입하면 profiles 한 줄. 별명은 가입 화면(P-12)에서 정하고, 그 전에는 임시 별명.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_nick text := nullif(trim(new.raw_user_meta_data ->> 'nickname'), '');
begin
  -- 별명이 겹치거나 길이가 안 맞으면 임시 별명. 여기서 실패하면 가입 자체가 실패하기 때문.
  if v_nick is null or char_length(v_nick) not between 2 and 30
     or exists (select 1 from public.profiles where nickname = v_nick) then
    v_nick := 'user-' || left(new.id::text, 8);
  end if;
  insert into public.profiles (id, nickname, login_method)
  values (
    new.id,
    v_nick,
    case when new.raw_app_meta_data ->> 'provider' = 'google' then 'google' else 'email_test' end
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 불변 1: 판단은 로그인한 사람만 만든다. 서비스 키(auth.uid() 없음)로는 RLS를 건너뛰어도 막힌다.
create function public.judgments_require_user() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is null or new.judged_by <> (select auth.uid()) then
    raise exception 'judgments는 로그인한 사용자 본인만 만들 수 있다(불변 1)';
  end if;
  return new;
end;
$$;
create trigger judgments_require_user before insert on public.judgments
  for each row execute function public.judgments_require_user();

-- 판단 기록은 고치거나 지우지 않는다(바꾼 기록과 같이 보존).
create function public.block_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '%는 덧붙이기만 한다(고치기·지우기 금지)', tg_table_name;
end;
$$;
create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function public.block_change();
-- 판단은 고치지 않는다. 지우기는 시뮬레이터 가짜 변경에 걸린 판단만(SPEC-3.5 "가짜 표시 줄만 지우기").
create function public.judgments_keep() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and exists (
    select 1 from public.alerts a join public.changes c on c.id = a.change_id
    where a.id = old.alert_id and c.is_simulated
  ) then
    return old;
  end if;
  raise exception 'judgments는 덧붙이기만 한다(시뮬레이터 가짜 줄만 지울 수 있음)';
end;
$$;
create trigger judgments_append_only before update or delete on public.judgments
  for each row execute function public.judgments_keep();

-- 불변 1·4: 판단 저장과 알림 완료를 한 거래로. 실패하면 둘 다 그대로.
-- 본인 알림에만, 관리자도 남의 알림은 못 한다. 보안 경고의 적용 후보는 고친 버전이 필요(ADR 0012).
create function public.save_judgment(
  p_alert_id uuid, p_decision text, p_reason text default null, p_fixed_version text default null
) returns public.judgments
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_alert public.alerts;
  v_row public.judgments;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다';
  end if;
  select * into v_alert from public.alerts where id = p_alert_id for update;
  if not found or v_alert.user_id <> v_uid then
    raise exception '본인 알림에만 판단할 수 있다';
  end if;
  if v_alert.status <> 'pending' then
    raise exception '이미 판단한 알림이다';
  end if;
  if p_decision = 'candidate' and v_alert.kind = 'security' and coalesce(p_fixed_version, '') = '' then
    raise exception '보안 경고의 적용 후보에는 고친 버전이 필요하다(ADR 0012)';
  end if;
  insert into public.judgments (alert_id, decision, reason, fixed_version, action, judged_by)
  values (
    p_alert_id, p_decision, p_reason, p_fixed_version,
    case when p_decision = 'candidate' then 'candidate_recorded' else 'hold_reason_recorded' end,
    v_uid
  )
  returning * into v_row;
  update public.alerts set status = 'done' where id = p_alert_id;
  return v_row;
end;
$$;
revoke all on function public.save_judgment(uuid, text, text, text) from public, anon;
grant execute on function public.save_judgment(uuid, text, text, text) to authenticated;

-- ───────────────────────── 4. 접근 규칙(RLS) — 모든 테이블에 켠다(불변 5)
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.projects enable row level security;
alter table public.technologies enable row level security;
alter table public.my_technologies enable row level security;
alter table public.sources enable row level security;
alter table public.runs enable row level security;
alter table public.run_steps enable row level security;
alter table public.observations enable row level security;
alter table public.changes enable row level security;
alter table public.alerts enable row level security;
alter table public.judgments enable row level security;
alter table public.audit_logs enable row level security;

-- 로그인 안 한 사람은 어떤 표도 못 본다.
revoke all on all tables in schema public from anon;

-- profiles: 본인 읽기, 별명·공개 여부만 고치기(role 못 바꿈). 관리자 전체 읽기.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from authenticated;
grant update (nickname, is_public) on public.profiles to authenticated;

-- projects · my_technologies: 본인 읽기·쓰기(지우지 않고 보관·숨김). 관리자 읽기만.
create policy projects_select on public.projects for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy projects_update on public.projects for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy my_tech_select on public.my_technologies for select to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));
create policy my_tech_insert on public.my_technologies for insert to authenticated
  with check (owner_id = (select auth.uid()) and added_by = (select auth.uid())
    and exists (select 1 from public.projects p where p.id = my_technologies.project_id and p.owner_id = (select auth.uid())));
create policy my_tech_update on public.my_technologies for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.projects p where p.id = my_technologies.project_id and p.owner_id = (select auth.uid())));
revoke delete on public.projects, public.my_technologies from authenticated;

-- technologies · categories: 로그인한 사람 모두 읽기. 쓰기는 서버.
create policy technologies_select on public.technologies for select to authenticated using (true);
create policy categories_select on public.categories for select to authenticated using (true);
revoke insert, update, delete on public.technologies, public.categories from authenticated;

-- sources: 관리자만.
create policy sources_admin on public.sources for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete on public.sources from authenticated;

-- runs · run_steps: 본인이 시작한 처음 읽기·다시 읽기만. 관리자 전체.
create policy runs_select on public.runs for select to authenticated
  using ((started_by = (select auth.uid()) and trigger in ('user_reread', 'first_read')) or (select public.is_admin()));
create policy run_steps_select on public.run_steps for select to authenticated
  using (exists (select 1 from public.runs r where r.id = run_steps.run_id
    and ((r.started_by = (select auth.uid()) and r.trigger in ('user_reread', 'first_read')) or (select public.is_admin()))));
revoke insert, update, delete on public.runs, public.run_steps from authenticated;

-- observations · changes: 본인 알림에 이어진 것만. 관리자 전체. 쓰기는 서버.
create policy changes_select on public.changes for select to authenticated
  using ((select public.is_admin())
    or exists (select 1 from public.alerts a where a.change_id = changes.id and a.user_id = (select auth.uid())));
create policy observations_select on public.observations for select to authenticated
  using ((select public.is_admin())
    or exists (select 1 from public.changes c join public.alerts a on a.change_id = c.id
      where c.observation_id = observations.id and a.user_id = (select auth.uid())));
revoke insert, update, delete on public.observations, public.changes from authenticated;

-- alerts: 본인 읽기. 만들기는 서버, 상태는 save_judgment로만.
create policy alerts_select on public.alerts for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
revoke insert, update, delete on public.alerts from authenticated;

-- judgments: 본인 알림 것 읽기, 관리자 읽기만. 만들기는 save_judgment로만.
create policy judgments_select on public.judgments for select to authenticated
  using (judged_by = (select auth.uid()) or (select public.is_admin()));
revoke insert, update, delete on public.judgments from authenticated;

-- audit_logs: 본인 줄과 관리자 전체 읽기. 쓰기는 서버, 고치기·지우기는 아무도.
create policy audit_select on public.audit_logs for select to authenticated
  using (actor_id = (select auth.uid()) or (select public.is_admin()));
revoke insert, update, delete on public.audit_logs from authenticated;

-- ───────────────────────── 처음 값: 출처(erd 2.4, spec 8)
insert into public.sources (name, method, priority) values
  ('osv', 'api', 1),
  ('mcp_registry', 'api', 1),
  ('github', 'api', 1),
  ('npm_downloads', 'api', 1),
  ('pypi_downloads', 'api', 1),
  ('hf', 'api', 3),
  ('hn', 'api', 3),
  ('firecrawl_skills_sh', 'firecrawl', 3);
