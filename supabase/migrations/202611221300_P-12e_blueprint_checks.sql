-- P-12e · M4: 확정한 청사진의 AI 점검 결과(blueprint_checks)와 ai_calls.purpose 'blueprint_check'.
-- 출처: 청사진 스튜디오 계획(P-12e) "확정본에서 '점검 받기'를 누를 때만 한 번 · 결과는 제안만, 청사진은 바꾸지 않는다(불변 1) · 하루 한도".
-- 모양은 scenarios(P-30)를 따른다: 사용자는 "요청"(blueprint_id · requested_by)만 만들고, 상태 · 본문 · 출처 · input_hash는 서버(서비스 키)만 쓴다.
-- 추가만 한다(새 표 + 허용 값 하나 더): 옛 코드는 그대로 돈다. 청사진은 본인만 읽으므로(blueprints_select_own) 점검도 본인만 읽는다(불변 5, 관리자도 못 봄).
-- 운영 적용 전에 같은 쪽의 supabase/tests/blueprint_checks_p12e.sql을 한 번 돌린다(끝에서 예외로 모두 되돌림).

create table public.blueprint_checks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  blueprint_id uuid not null references public.blueprints (id),
  requested_by uuid not null references public.profiles (id),
  status text not null default 'generating' check (status in ('generating', 'done', 'failed')),
  -- 점검 재료(청사진 · 코드 점검 사실 · 글)의 해시: 같은 확정본을 같은 재료로 다시 누르면 새로 부르지 않고 이전 결과를 다시 쓴다
  input_hash text,
  body jsonb check (body is null or (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 65536)),
  sources jsonb,
  finished_at timestamptz,
  check ((status = 'done') = (body is not null))  -- 끝난 줄에만 본문이 있다
);
-- 같은 확정본에 "만드는 중"은 하나만: 두 번 눌러도 Claude를 두 번 부르지 않는다(불변 3). 끝나거나 실패하면 다시 만들 수 있다
create unique index blueprint_checks_one_generating on public.blueprint_checks (blueprint_id) where status = 'generating';
create index blueprint_checks_reuse on public.blueprint_checks (blueprint_id, input_hash) where status = 'done';
create index blueprint_checks_requested_by_day on public.blueprint_checks (requested_by, created_at);  -- 사용자당 하루 3번

alter table public.blueprint_checks enable row level security;
revoke all on public.blueprint_checks from anon, authenticated;
grant select on public.blueprint_checks to authenticated;
-- 사용자는 "요청"만(본문 · 상태 · 해시는 서버): 열 grant로 두 칸만 열고, 상태는 기본값 'generating'이어야 한다
grant insert (blueprint_id, requested_by) on public.blueprint_checks to authenticated;

create policy blueprint_checks_select_own on public.blueprint_checks for select to authenticated
  using (requested_by = (select auth.uid()));
create policy blueprint_checks_insert_own on public.blueprint_checks for insert to authenticated
  with check (requested_by = (select auth.uid()) and status = 'generating'
    and exists (select 1 from public.blueprints b where b.id = blueprint_checks.blueprint_id and b.user_id = (select auth.uid())));

-- ai_calls.purpose에 'blueprint_check'를 더한다(제약 이름은 운영에서 읽어 확인함: ai_calls_purpose_check, 2026-11-21).
-- 값만 넓히는 변경이라 지금 있는 줄은 모두 통과하고, 옛 코드가 쓰는 값은 그대로 허용된다.
alter table public.ai_calls drop constraint ai_calls_purpose_check;
alter table public.ai_calls add constraint ai_calls_purpose_check
  check (purpose in ('draft', 'scenario', 'classify', 'chatbot', 'blueprint_check'));
