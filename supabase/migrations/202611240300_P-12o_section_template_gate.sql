-- P-12o 보안 검토 반영: 공개 목록 밖 기술 검사(template_unlisted_techs, 202611221320)가 섹션 공통 기술도 본다. 작업 I-P-12o-section-gate(FrontLead).
-- 섹션(202611240100)은 조합 템플릿 graph에 공통 기술을 남기는데, 이 검사는 stages[].techs만 봐서 내 저장소에서만 생긴 기술 · 시뮬레이터 · 사라진 기술이
-- 섹션에 있으면 공개 · 갤러리 · 템플릿 열기로 남에게 나갔다(불변 5). 같은 이름 · 모양으로 바꿔 set_template_public · public_blueprint_templates ·
-- blueprint_template_for_use가 그대로 새 검사를 쓴다. 시험: supabase/tests/section_template_gate_p12o.sql
create or replace function public.template_unlisted_techs(p_graph jsonb) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct coalesce(te.display_name, x ->> 'name', x ->> 'id') order by coalesce(te.display_name, x ->> 'name', x ->> 'id')), '{}')
    from (
      select x from jsonb_array_elements(coalesce(p_graph -> 'stages', '[]')) s cross join lateral jsonb_array_elements(coalesce(s -> 'techs', '[]')) x
      union all
      select x from jsonb_array_elements(case when jsonb_typeof(p_graph -> 'sections') = 'array' then p_graph -> 'sections' else '[]' end) s
        cross join lateral jsonb_array_elements(case when jsonb_typeof(s -> 'techs') = 'array' then s -> 'techs' else '[]' end) x
    ) t(x)
    left join public.technologies te on te.id::text = x ->> 'id'
   where te.id is null or te.status = 'gone' or te.one_liner_source is null or te.is_simulated;
$$;
revoke all on function public.template_unlisted_techs(jsonb) from public, anon, authenticated;

-- 이미 공개된 조합 중 섹션에 목록 밖 기술이 든 것은 한 번 비공개로 돌린다(작가는 계속 열고, 고친 뒤 다시 공개할 수 있다)
update public.blueprint_templates set is_public = false where is_public and cardinality(public.template_unlisted_techs(graph)) > 0;
