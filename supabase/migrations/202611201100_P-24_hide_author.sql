-- P-24 보강: 쓴 사람(author_id)·숨긴 사람(hidden_by) 칸을 다른 사람이 읽지 못하게 한다(영식 코드 검토 11-20).
-- 화면은 쓴 사람을 "사용자"로만 보여 주는데, 표 전체 읽기가 열려 있으면 DB를 직접 불러 누가 쓴 글인지 알 수 있었다.
-- 202611201000_P-24_usage_notes.sql 뒤에 적용한다(적용 여부와 상관없이 다시 돌려도 같다).

-- 칸 읽기 권한: 안전한 칸만. 가짜 DB 시험은 이걸 못 보므로 supabase/tests/usage_notes_p24.sql로 확인한다.
revoke select on public.usage_notes from authenticated;
grant select (id, created_at, tech_id, used_for, result, tip, helpful_count, hidden_at) on public.usage_notes to authenticated;

-- 정책이 author_id를 직접 읽으면 칸 권한에 걸려 오류가 날 수 있다. 쓴 사람 확인은 소유자 권한 함수로 옮긴다.
create or replace function public.is_note_author(p_note_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usage_notes n where n.id = p_note_id and n.author_id = (select auth.uid()));
$$;
-- 남이 쓴, 숨기지 않은 글인가(도움이 됐어요·신고를 할 수 있는 글)
create or replace function public.is_open_note_of_other(p_note_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usage_notes n where n.id = p_note_id and n.hidden_at is null and n.author_id <> (select auth.uid()));
$$;
-- 화면용: 넘긴 글들 중 내가 쓴 글의 id만(쓴 사람 칸을 읽지 않고 "내 글" 표시)
create or replace function public.my_usage_note_ids(p_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select n.id from public.usage_notes n where n.id = any (p_ids) and n.author_id = (select auth.uid());
$$;
revoke execute on function public.is_note_author(uuid), public.is_open_note_of_other(uuid), public.my_usage_note_ids(uuid[]) from public, anon;
grant execute on function public.is_note_author(uuid), public.is_open_note_of_other(uuid), public.my_usage_note_ids(uuid[]) to authenticated;

-- 정책 다시 만들기(같은 규칙, author_id 대신 함수)
drop policy if exists usage_notes_select on public.usage_notes;
create policy usage_notes_select on public.usage_notes for select to authenticated
  using (hidden_at is null or public.is_note_author(id) or (select public.is_admin()));

drop policy if exists helpful_votes_insert_own on public.helpful_votes;
create policy helpful_votes_insert_own on public.helpful_votes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_open_note_of_other(note_id));

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and public.is_open_note_of_other(note_id));
