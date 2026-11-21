-- P-12e-blueprint-studio M3: 템플릿 사용기 · 도움이 됐어요 · 신고("이 조합 써봤어요", 계획 "데이터 · DB" M3). 작업 I-P-12e-template-notes.
-- P-24(202611201000 usage_notes + 202611201100 hide_author)를 그대로 본떴다: 수정 · 삭제 없음, 관리자 숨김만, 쓴 사람 · 숨긴 사람 칸은 처음부터 남이 못 읽음.
-- 템플릿만의 규칙(불변 5, ADR 0036): 사용기는 **열린 템플릿**(공개 · 숨기지 않음 · 시연 계정 아님)에만 보이고 쓸 수 있다.
-- 쓰기는 그 템플릿으로 청사진을 확정해 본 사람만(blueprints.template_id, "써봤어요"), 한 사람 한 템플릿에 한 글, 작가 본인 · 시연 계정은 못 쓴다(자기 홍보 · 가짜 후기 방지).
-- 템플릿이 비공개 · 숨김이 되면 그 사용기도 남에게 안 보인다(쓴 사람만 봄 — 관리자도 남의 비공개 템플릿은 못 보므로 ADR 0036 4). 사용기는 Claude에 넣지 않는다. M2 뒤에 적용, 추가만 한다.

create table public.template_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author_id uuid not null default auth.uid() references public.profiles (id),
  template_id uuid not null references public.blueprint_templates (id) on delete cascade,
  used_for text not null check (btrim(used_for) <> ''),
  result text not null check (btrim(result) <> ''),
  tip text not null check (btrim(tip) <> ''),
  helpful_count integer not null default 0 check (helpful_count >= 0),  -- 서버 칸: template_helpful_votes 트리거만 올린다
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id),
  check (char_length(used_for) + char_length(result) + char_length(tip) <= 500),  -- usage_notes와 같은 500자(lib/domain/usage-note.ts)
  check ((hidden_at is null) = (hidden_by is null)),
  unique (template_id, author_id)  -- 한 사람 한 템플릿에 한 글: 두 번 눌러도 한 줄(불변 3)
);
create index template_notes_template_created on public.template_notes (template_id, created_at desc);

create table public.template_helpful_votes (
  note_id uuid not null references public.template_notes (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

create table public.template_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  note_id uuid not null references public.template_notes (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id),
  reason text not null check (char_length(btrim(reason)) between 1 and 200),
  handled_by uuid references public.profiles (id),
  handled_at timestamptz,
  handle_reason text check (handle_reason is null or char_length(handle_reason) <= 200),
  unique (note_id, reporter_id),
  check ((handled_by is null) = (handled_at is null))
);

alter table public.template_notes enable row level security;
alter table public.template_helpful_votes enable row level security;
alter table public.template_reports enable row level security;
revoke all on public.template_notes, public.template_helpful_votes, public.template_reports from anon, authenticated;

-- 정책이 남의 칸(author_id) · 남의 표(blueprint_templates는 작가만 읽음)를 읽어야 해서 소유자 권한 함수로 본다(P-24 hide_author와 같은 까닭)
-- 열린 템플릿: 공개 · 숨기지 않음 · 작가가 시연 계정 아님(public_blueprint_templates와 같은 기준)
create function public.is_open_template(p_template_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blueprint_templates t join public.profiles p on p.id = t.author_id
    where t.id = p_template_id and t.is_public and t.hidden_at is null and not p.is_demo);
$$;
-- 나는 시연 계정인가(시연 계정의 글 · 누름은 진짜 사용자 후기처럼 보이므로 받지 않는다, M2 uses와 같은 기준)
create function public.is_demo_viewer() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_demo from public.profiles p where p.id = (select auth.uid())), false);
$$;
-- 내가 사용기를 쓸 수 있는 템플릿: 열려 있고, 내가 작가 · 시연 계정이 아니고, 그 템플릿으로 확정한 청사진이 있다
create function public.can_note_template(p_template_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and not public.is_demo_viewer() and public.is_open_template(p_template_id)
    and not exists (select 1 from public.blueprint_templates t where t.id = p_template_id and t.author_id = (select auth.uid()))
    and exists (select 1 from public.blueprints b where b.template_id = p_template_id and b.user_id = (select auth.uid()));
$$;
create function public.is_template_note_author(p_note_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.template_notes n where n.id = p_note_id and n.author_id = (select auth.uid()));
$$;
-- 남이 쓴, 숨기지 않은, 열린 템플릿의 글인가(도움이 됐어요 · 신고를 할 수 있는 글). 시연 계정은 누르지 않는다
create function public.is_open_template_note_of_other(p_note_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not public.is_demo_viewer() and exists (select 1 from public.template_notes n where n.id = p_note_id and n.hidden_at is null
    and n.author_id <> (select auth.uid()) and public.is_open_template(n.template_id));
$$;
-- 화면용: 넘긴 글들 중 내가 쓴 글의 id만(쓴 사람 칸을 읽지 않고 "내 글" 표시)
create function public.my_template_note_ids(p_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select n.id from public.template_notes n where n.id = any (p_ids) and n.author_id = (select auth.uid());
$$;
revoke execute on function public.is_open_template(uuid), public.is_demo_viewer(), public.can_note_template(uuid), public.is_template_note_author(uuid),
  public.is_open_template_note_of_other(uuid), public.my_template_note_ids(uuid[]) from public, anon;
grant execute on function public.is_open_template(uuid), public.is_demo_viewer(), public.can_note_template(uuid), public.is_template_note_author(uuid),
  public.is_open_template_note_of_other(uuid), public.my_template_note_ids(uuid[]) to authenticated;

-- template_notes: 읽기는 안전한 칸만. 남에게는 숨기지 않은 · 열린 템플릿의 글만, 쓴 사람은 모두, 관리자는 열린 템플릿의 글(숨긴 글 포함)
grant select (id, created_at, template_id, used_for, result, tip, helpful_count, hidden_at) on public.template_notes to authenticated;
grant insert (template_id, used_for, result, tip) on public.template_notes to authenticated;  -- author_id는 기본값(auth.uid())
grant update (hidden_at, hidden_by) on public.template_notes to authenticated;
create policy template_notes_select on public.template_notes for select to authenticated
  using ((hidden_at is null and public.is_open_template(template_id)) or public.is_template_note_author(id)
    or ((select public.is_admin()) and public.is_open_template(template_id)));
create policy template_notes_insert_own on public.template_notes for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_note_template(template_id));
create policy template_notes_admin_hide on public.template_notes for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and (hidden_by is null or hidden_by = (select auth.uid())));

-- template_helpful_votes: 본인 줄만 읽기(누른 상태 표시용, 개수는 template_notes.helpful_count). 누르기는 보이는 남의 글에만, 한 번
grant select (note_id, user_id, created_at) on public.template_helpful_votes to authenticated;
grant insert (note_id, user_id) on public.template_helpful_votes to authenticated;
create policy template_helpful_votes_select_own on public.template_helpful_votes for select to authenticated using (user_id = (select auth.uid()));
create policy template_helpful_votes_insert_own on public.template_helpful_votes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_open_template_note_of_other(note_id));

create function public.template_notes_count_helpful() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.template_notes set helpful_count = helpful_count + 1 where id = new.note_id;
  return null;
end $$;
revoke execute on function public.template_notes_count_helpful() from public, anon, authenticated;
create trigger template_helpful_votes_count after insert on public.template_helpful_votes
  for each row execute function public.template_notes_count_helpful();

-- template_reports: 보이는 남의 글만 신고. 본인 신고만 읽기, 관리자는 전체 읽기와 처리 칸 쓰기
grant select on public.template_reports to authenticated;
grant insert (note_id, reporter_id, reason) on public.template_reports to authenticated;
grant update (handled_by, handled_at, handle_reason) on public.template_reports to authenticated;
create policy template_reports_select on public.template_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));
create policy template_reports_insert_own on public.template_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and public.is_open_template_note_of_other(note_id));
create policy template_reports_admin_handle on public.template_reports for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and handled_by = (select auth.uid()));
