-- P-12f: 공개 목록 밖 기술이 든 조합 템플릿은 공개하지 않는다(통합 보안 검토 의심 1 → 2026-11-22 사용자 결정 (가)). 작업 I-P-12f-guest.
-- 까닭: 관문(내 기술 · 적용 후보 · 내 이력)에는 내 비공개 저장소에서만 생긴 기술도 들어 있어, 공개하면 그 이름이 갤러리 · 템플릿 열기로 손님에게까지 보인다.
-- 기술 상세는 같은 기술을 "id를 알아도 열지 않는다"(ADR 0029 4항, lib/server/map-queries.ts listedTechs)고 막으므로 갤러리도 같은 규칙.
-- 공개 목록 = 사라지지 않음 · 공식 설명 출처 있음 · 시뮬레이터 아님(listedTechs와 같은 조건). 지운 기술(없는 id)도 목록 밖으로 센다.
-- 막는 곳은 공개로 바꾸는 set_template_public 한 곳: 템플릿 저장(save_blueprint_template)은 늘 비공개로 새로 만들고 고치기가 없어, 공개된 그래프가 바뀌는 길이 없다.
-- 거절 문구에 기술 이름을 넣는다: 이 함수는 작가 본인만 부를 수 있다(내 템플릿이 아니면 먼저 거절). M2 뒤에 적용, 같은 이름 · 모양으로 바꾼다.

-- 그래프에 든 공개 목록 밖 기술(이름 순, 지운 기술은 그래프에 남은 이름으로). 내부용: 실행 권한 없음
create function public.template_unlisted_techs(p_graph jsonb) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct coalesce(te.display_name, x ->> 'name', x ->> 'id') order by coalesce(te.display_name, x ->> 'name', x ->> 'id')), '{}')
    from jsonb_array_elements(coalesce(p_graph -> 'stages', '[]')) s
    cross join lateral jsonb_array_elements(coalesce(s -> 'techs', '[]')) x
    left join public.technologies te on te.id::text = x ->> 'id'
   where te.id is null or te.status = 'gone' or te.one_liner_source is null or te.is_simulated;
$$;
revoke all on function public.template_unlisted_techs(jsonb) from public, anon, authenticated;

-- 공개 · 비공개 바꾸기(M2와 같고, 공개로 바꿀 때 목록 밖 기술 검사 하나를 더함)
create or replace function public.set_template_public(p_id uuid, p_public boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.blueprint_templates;
  v_unlisted text[];
begin
  if v_uid is null then raise exception '로그인이 필요하다'; end if;
  if p_public is null then raise exception '공개 여부가 없다'; end if;
  select * into v_row from public.blueprint_templates where id = p_id for update;
  if not found or v_row.author_id <> v_uid then raise exception '내 템플릿이 아니다'; end if;
  if p_public and v_row.hidden_at is not null then raise exception '관리자가 숨긴 템플릿은 공개할 수 없다'; end if;
  if p_public then
    v_unlisted := public.template_unlisted_techs(v_row.graph);
    if cardinality(v_unlisted) > 0 then
      raise exception '공개 목록에 없는 기술 %개: %', cardinality(v_unlisted), array_to_string(v_unlisted, ', ');
    end if;
  end if;
  update public.blueprint_templates set is_public = p_public where id = p_id;
  return p_public;
end $$;
