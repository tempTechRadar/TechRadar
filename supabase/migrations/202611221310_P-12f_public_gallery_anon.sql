-- P-12f M6: 로그인 전에도 공개 템플릿 갤러리 · 템플릿 열기 · 템플릿 사용기 읽기(계획 P-12f 3 "비로그인 이용", ADR 0036 개정). 작업 I-P-12f-guest.
-- 손님(anon)에게 여는 것은 **이미 모두에게 공개된 것뿐**: 공개 · 숨기지 않음 · 시연 계정 아닌 템플릿, 그 템플릿의 숨기지 않은 사용기의 안전한 칸.
-- 기술 사용기(P-24 usage_notes) 글은 손님에게 닫아 둔다(2026-11-22 사용자 결정): 이미 쓴 사람들이 "로그인한 사람만 본다"는 전제로 썼다. 손님에게는 글 수만.
-- 개인 데이터(내 기술 · 판단 · 알림 · 프로젝트 · 태그 · 청사진 · 비공개 템플릿 · 쓴 사람 id)는 그대로 닫혀 있다(불변 5). 쓰기 권한은 하나도 주지 않는다.
-- M2 · M3 뒤에 적용, 추가만 한다(blueprint_template_for_use만 같은 모양으로 바꿈).

-- 템플릿 하나 열기: 로그인 전이면 열린 템플릿만(auth.uid()가 null이라 "내 것" 조건은 늘 거짓). 나머지는 M2와 같다
create or replace function public.blueprint_template_for_use(p_id uuid)
returns table (id uuid, kind text, name text, graph jsonb)
language sql stable security definer set search_path = '' as $$
  select t.id, t.kind, t.name, t.graph from public.blueprint_templates t join public.profiles p on p.id = t.author_id
   where t.id = p_id
     and (t.author_id = (select auth.uid()) or (t.is_public and t.hidden_at is null and not p.is_demo));
$$;
-- 갤러리 함수는 원래 공개 · 숨김 아님 · 시연 아님만 돌려주고 author_id를 내보내지 않는다(M2). 손님에게도 같은 결과
grant execute on function public.public_blueprint_templates(text, int, int) to anon;
grant execute on function public.blueprint_template_for_use(uuid) to anon;

-- 기술 사용기(P-24): 글은 손님에게 닫힌 그대로, 숨기지 않은 글의 수만("사용기 n개 — 로그인하면 볼 수 있어요")
-- 공개 목록 기술만(lib/server/map-queries.ts listedTechs와 같은 규칙: 사라짐 · 저장소에서만 생긴 줄 · 시뮬레이터 제외), 아니면 0
create function public.usage_note_count(p_tech_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.usage_notes n join public.technologies t on t.id = n.tech_id
   where n.tech_id = p_tech_id and n.hidden_at is null and t.status <> 'gone' and t.one_liner_source is not null and not t.is_simulated;
$$;
revoke execute on function public.usage_note_count(uuid) from public;
grant execute on function public.usage_note_count(uuid) to anon, authenticated;

-- 템플릿 사용기(M3) 읽기: 숨기지 않은 · 열린 템플릿의 글만. is_open_template은 "열렸나"만 답한다
grant execute on function public.is_open_template(uuid) to anon;
grant select (id, created_at, template_id, used_for, result, tip, helpful_count, hidden_at) on public.template_notes to anon;
create policy template_notes_select_anon on public.template_notes for select to anon using (hidden_at is null and public.is_open_template(template_id));

-- 갤러리 "도움 순"(P-12f 9): 템플릿마다 숨기지 않은 사용기의 "도움이 됐어요" 합을 DB에서 센다
-- (보는 사람 토큰으로 줄을 읽으면 관리자 · 쓴 사람에게만 숨긴 글이 더해져 순서가 달라지고, 1000줄 한도에서 말없이 잘린다). 열린 템플릿만
create function public.template_helpful_totals(p_ids uuid[]) returns table (template_id uuid, helpful integer)
language sql stable security definer set search_path = '' as $$
  select n.template_id, sum(n.helpful_count)::integer from public.template_notes n
   where n.template_id = any (p_ids[1:100]) and n.hidden_at is null and public.is_open_template(n.template_id)
   group by n.template_id;
$$;
revoke execute on function public.template_helpful_totals(uuid[]) from public;
grant execute on function public.template_helpful_totals(uuid[]) to anon, authenticated;
