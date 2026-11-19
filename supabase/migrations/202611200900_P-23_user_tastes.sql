-- P-23 취향 질문 저장(PRD-F32, IA-1b·IA-19). 작업 I-P-23-recommend.
-- 사람마다 한 줄. 본인만 읽고 쓴다(관리자도 못 봄 — IA-1b "개인 정보"). 지우기는 아무도.
-- 관심 분야 이름이 맞는 갈래인지는 앱이 검사한다(갈래 이름은 관리자가 고칠 수 있어 DB에 굳히지 않음).
create table public.user_tastes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  build text check (build in ('web', 'automation', 'data', 'docs', 'unsure')),
  tools text[] not null default '{}' check (tools <@ array['claude_code', 'cursor', 'codex_other', 'none']),
  interests text[] not null default '{}' check (cardinality(interests) <= 3)
);

alter table public.user_tastes enable row level security;
revoke all on public.user_tastes from anon;
revoke delete on public.user_tastes from authenticated;
-- 서버 칸(created_at)은 사용자가 정하지 못한다: 쓰는 세 칸만 연다(열 권한은 가짜 DB 시험이 못 보므로 supabase/tests/user_tastes_p23.sql로 확인).
revoke insert, update on public.user_tastes from authenticated;
grant insert (user_id, build, tools, interests) on public.user_tastes to authenticated;
grant update (build, tools, interests) on public.user_tastes to authenticated;

create policy user_tastes_select_own on public.user_tastes for select to authenticated using (user_id = (select auth.uid()));
create policy user_tastes_insert_own on public.user_tastes for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_tastes_update_own on public.user_tastes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
