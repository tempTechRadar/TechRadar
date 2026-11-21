-- P-12f: 공개 목록 밖 기술이 든 조합 템플릿은 공개하지 않는다(통합 보안 검토 의심 1 → 2026-11-22 사용자 결정 (가)). 작업 I-P-12f-guest.
-- 까닭: 관문(내 기술 · 적용 후보 · 내 이력)에는 내 비공개 저장소에서만 생긴 기술도 들어 있어, 공개하면 그 이름이 갤러리 · 템플릿 열기로 손님에게까지 보인다.
-- 기술 상세는 같은 기술을 "id를 알아도 열지 않는다"(ADR 0029 4항, lib/server/map-queries.ts listedTechs)고 막으므로 갤러리도 같은 규칙.
-- 공개 목록 = 사라지지 않음 · 공식 설명 출처 있음 · 시뮬레이터 아님(listedTechs와 같은 조건). 지운 기술(없는 id)도 목록 밖으로 센다.
-- 공개로 바꾸는 set_template_public에서 거절한다(템플릿 저장은 늘 비공개로 새로 만들고 고치기가 없어 공개된 그래프가 바뀌는 길은 없다).
-- 공개한 뒤 기술이 목록 밖이 되는 경우는 아래 (1) 한 번 비공개로 돌리기 · (2) 갤러리 · 열기에서 남에게 빼기로 막는다.
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

-- 공개한 뒤에 기술이 목록 밖이 되는 경우(수집이 gone으로 바꿈 · 시뮬레이터 표시)도 막는다(보안 검토):
-- (1) 이 마이그레이션 때 이미 그런 공개 조합은 한 번 비공개로 돌린다(적용 전 운영 확인: 공개 템플릿 0개)
update public.blueprint_templates set is_public = false where is_public and cardinality(public.template_unlisted_techs(graph)) > 0;
-- (2) 갤러리 · 템플릿 열기는 남에게(작가 본인 말고) 목록 밖 기술이 든 템플릿을 내보내지 않는다. 나머지는 M2 · M6과 같다
create or replace function public.public_blueprint_templates(p_kind text default null, p_limit int default 60, p_offset int default 0)
returns table (id uuid, kind text, name text, graph jsonb, board jsonb, author_nickname text, uses integer, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.kind, t.name, t.graph, t.board, case when p.is_public then coalesce(nullif(btrim(p.nickname), ''), '익명') else '익명' end,
         (select count(distinct b.user_id) from public.blueprints b join public.profiles bp on bp.id = b.user_id
           where b.template_id = t.id and b.user_id <> t.author_id and not bp.is_demo)::integer, t.created_at
    from public.blueprint_templates t join public.profiles p on p.id = t.author_id
   where t.is_public and t.hidden_at is null and not p.is_demo and (p_kind is null or t.kind = p_kind)
     and cardinality(public.template_unlisted_techs(t.graph)) = 0
   order by 7 desc, t.created_at desc, t.id
   limit least(greatest(coalesce(p_limit, 60), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;
create or replace function public.blueprint_template_for_use(p_id uuid)
returns table (id uuid, kind text, name text, graph jsonb)
language sql stable security definer set search_path = '' as $$
  select t.id, t.kind, t.name, t.graph from public.blueprint_templates t join public.profiles p on p.id = t.author_id
   where t.id = p_id
     and (t.author_id = (select auth.uid())
          or (t.is_public and t.hidden_at is null and not p.is_demo and cardinality(public.template_unlisted_techs(t.graph)) = 0));
$$;
