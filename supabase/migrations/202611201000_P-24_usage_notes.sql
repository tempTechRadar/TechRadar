-- P-24 사용기·도움이 됐어요·신고(PRD-F35, ADR 0003). 작업 I-P-24-usage-notes.
-- 표 3개를 한 파일에 둔다: 관리자 숨김·신고 처리 화면(24b)이 나중에 와도 새 마이그레이션이 필요 없게 그 권한까지 지금 열어 둔다.
-- 사용기는 등급에 영향이 없고 Claude에 넣지 않는다. 글은 앱이 글자 그대로 보여 준다(해석하지 않음).

-- ───────────────────────── usage_notes: 사용기(수정·삭제 없음, 숨김만)
create table public.usage_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author_id uuid not null references public.profiles (id),
  tech_id uuid not null references public.technologies (id),
  used_for text not null check (btrim(used_for) <> ''),
  result text not null check (btrim(result) <> ''),
  tip text not null check (btrim(tip) <> ''),
  helpful_count integer not null default 0 check (helpful_count >= 0),  -- 서버 칸: helpful_votes 트리거만 올린다
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id),
  check (char_length(used_for) + char_length(result) + char_length(tip) <= 500),  -- 세 칸 합쳐 500자(글자 수 기준, 이모지 하나가 1)
  check ((hidden_at is null) = (hidden_by is null))
);
create index usage_notes_tech_created on public.usage_notes (tech_id, created_at desc);

-- ───────────────────────── helpful_votes: 도움이 됐어요(한 사람 한 번, 취소 없음)
create table public.helpful_votes (
  note_id uuid not null references public.usage_notes (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

-- ───────────────────────── reports: 신고(한 사람이 같은 글을 한 번)
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  note_id uuid not null references public.usage_notes (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id),
  reason text not null check (char_length(btrim(reason)) between 1 and 200),
  handled_by uuid references public.profiles (id),
  handled_at timestamptz,
  handle_reason text check (handle_reason is null or char_length(handle_reason) <= 200),
  unique (note_id, reporter_id),
  check ((handled_by is null) = (handled_at is null))
);

alter table public.usage_notes enable row level security;
alter table public.helpful_votes enable row level security;
alter table public.reports enable row level security;
revoke all on public.usage_notes, public.helpful_votes, public.reports from anon;
revoke delete on public.usage_notes, public.helpful_votes, public.reports from authenticated;  -- 지우기는 아무도(기록 보존)
revoke insert, update on public.usage_notes, public.helpful_votes, public.reports from authenticated;

-- usage_notes: 숨기지 않은 글은 모두 읽기. 숨긴 글은 쓴 사람과 관리자만. 쓰기는 본인 글 한 줄(서버 칸 제외), 수정 없음, 숨김은 관리자만.
grant insert (author_id, tech_id, used_for, result, tip) on public.usage_notes to authenticated;
grant update (hidden_at, hidden_by) on public.usage_notes to authenticated;
create policy usage_notes_select on public.usage_notes for select to authenticated
  using (hidden_at is null or author_id = (select auth.uid()) or (select public.is_admin()));
create policy usage_notes_insert_own on public.usage_notes for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy usage_notes_admin_hide on public.usage_notes for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and (hidden_by is null or hidden_by = (select auth.uid())));

-- helpful_votes: 본인 줄만 읽기(누른 상태 표시용, 개수는 usage_notes.helpful_count). 누르기는 보이는 남의 글에만.
grant insert (note_id, user_id) on public.helpful_votes to authenticated;
create policy helpful_votes_select_own on public.helpful_votes for select to authenticated using (user_id = (select auth.uid()));
create policy helpful_votes_insert_own on public.helpful_votes for insert to authenticated
  with check (user_id = (select auth.uid())
    and exists (select 1 from public.usage_notes n where n.id = note_id and n.author_id <> (select auth.uid())));

-- 누른 수는 글에 붙은 숫자로 센다(남의 투표 줄을 읽지 않아도 되게). 트리거는 소유자 권한으로 돌아 열 권한과 무관하다.
create function public.usage_notes_count_helpful() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.usage_notes set helpful_count = helpful_count + 1 where id = new.note_id;
  return null;
end $$;
revoke execute on function public.usage_notes_count_helpful() from public, anon, authenticated;
create trigger helpful_votes_count after insert on public.helpful_votes
  for each row execute function public.usage_notes_count_helpful();

-- reports: 보이는 남의 글만 신고. 본인 신고만 읽기, 관리자는 전체 읽기와 처리 칸(처리자·시각·이유) 쓰기.
grant insert (note_id, reporter_id, reason) on public.reports to authenticated;
grant update (handled_by, handled_at, handle_reason) on public.reports to authenticated;
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));
create policy reports_insert_own on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid())
    and exists (select 1 from public.usage_notes n where n.id = note_id and n.author_id <> (select auth.uid())));
create policy reports_admin_handle on public.reports for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and handled_by = (select auth.uid()));
