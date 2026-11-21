-- P-12f M6: 로그인 전에도 공개 템플릿 갤러리 · 템플릿 열기 · 사용기 읽기(계획 P-12f 3 "비로그인 이용", ADR 0036 개정). 작업 I-P-12f-guest.
-- 손님(anon)에게 여는 것은 **이미 모두에게 공개된 것뿐**: 공개 · 숨기지 않음 · 시연 계정 아닌 템플릿, 숨기지 않은 사용기의 안전한 칸.
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

-- 기술 사용기(P-24) 읽기: 숨기지 않은 글의 안전한 칸만. 도움이 됐어요 · 신고 표는 손님에게 닫혀 있다
grant select (id, created_at, tech_id, used_for, result, tip, helpful_count, hidden_at) on public.usage_notes to anon;
create policy usage_notes_select_anon on public.usage_notes for select to anon using (hidden_at is null);

-- 템플릿 사용기(M3) 읽기: 숨기지 않은 · 열린 템플릿의 글만. is_open_template은 "열렸나"만 답한다
grant execute on function public.is_open_template(uuid) to anon;
grant select (id, created_at, template_id, used_for, result, tip, helpful_count, hidden_at) on public.template_notes to anon;
create policy template_notes_select_anon on public.template_notes for select to anon using (hidden_at is null and public.is_open_template(template_id));
