-- P-12o 2단계 청사진 섹션: graph에 sections([{id, name, stageIds, techs}])를 남긴다. 작업 I-P-12o-sections(FrontLead), 사용자 인터뷰(11-23 오후).
-- 202611240000 뒤에 적용한다(앞 파일은 고치지 않음). 운영 적용은 사용자 승인 뒤, PR 병합 전에 먼저(CLAUDE.md 10절).
-- 그전에 운영에서 확정하면 섹션은 빠지고(옛 함수가 sections를 버림) 화면 초안에는 남는다(코드는 sections가 없어도 깨지지 않음).
-- 1) blueprint_graph_clean: 본문은 202611232200(관계선)과 같고 sections 정리 줄만 더했다. 규칙은 lib/blueprint/sections.ts cleanSections와 같다:
--    맞지 않는 섹션은 그 섹션만 빼고(판을 거절하지 않음) 24개까지 · id 영문·숫자·_·- 1~64자(단계 id와도 안 겹침) · 이름 1~20자 ·
--    단계는 이 graph에 있고 다른 섹션과 안 겹치며 2개 이상 · 공통 기술은 단계 기술과 같은 관문(blueprint_clean_techs: 내 기술 · 적용 후보 · 내 이력, 위험 제외, 8개).
--    비면 sections 키를 넣지 않는다(옛 판 그대로). board(v1 투영 · 이력 목록 · 쓴 횟수)에는 섹션을 넣지 않는다.
-- 2) save_blueprint_template: 틀 템플릿은 단계 기술과 함께 섹션 공통 기술도 비운다(틀 = 단계 모양만). 조합 템플릿에는 섹션이 남는다(개인 글 아님).
-- 섹션은 blueprints · blueprint_templates의 graph 칸에만 있고 읽기 권한은 그 표의 정책 그대로다(불변 5). 시험: supabase/tests/sections_p12o.sql

create or replace function public.blueprint_graph_clean(p_uid uuid, p_graph jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_allowed uuid[]; v_ids text[] := '{}'; v_rows jsonb[] := '{}'; v_from int[] := '{}'; v_to int[] := '{}';
  v_stage jsonb; v_edge jsonb; v_id text; v_name text; v_note text; v_a int; v_b int; v_depth int[]; v_max int; k int;
  v_stages jsonb := '[]'; v_edges jsonb := '[]'; v_board jsonb := '[]'; v_col jsonb;
  v_techs jsonb; v_ends text[] := '{}'; v_link jsonb; v_lf text; v_lt text; v_seen text[] := '{}'; v_links jsonb := '[]';
  v_sec jsonb; v_sid text; v_sname text; v_members text[]; v_used text[] := '{}'; v_sids text[] := '{}'; v_sections jsonb := '[]'; v_stechs jsonb;
begin
  if jsonb_typeof(p_graph) is distinct from 'object' or (p_graph -> 'v') is distinct from '2'::jsonb then raise exception '청사진 모양이 v2가 아니다'; end if;
  if jsonb_typeof(p_graph -> 'stages') is distinct from 'array' or jsonb_array_length(p_graph -> 'stages') not between 1 and 48 then raise exception '단계는 1~48개'; end if;
  if jsonb_typeof(coalesce(p_graph -> 'edges', '[]')) <> 'array' or jsonb_array_length(coalesce(p_graph -> 'edges', '[]')) > 200 then raise exception '연결선은 200개까지'; end if;
  select coalesce(array_agg(a.tech_id) filter (where a.tech_id is not null), '{}') into v_allowed from public.blueprint_allowed_techs(p_uid) a;

  for v_stage in select value from jsonb_array_elements(p_graph -> 'stages') loop
    v_id := v_stage ->> 'id';
    if jsonb_typeof(v_stage -> 'id') is distinct from 'string' or v_id !~ '^[A-Za-z0-9_-]{1,64}$' or v_id = any(v_ids) then raise exception '단계 id는 영문·숫자·_·- 1~64자, 겹치지 않게'; end if;
    v_name := btrim(coalesce(v_stage ->> 'name', ''));
    if jsonb_typeof(v_stage -> 'name') is distinct from 'string' or char_length(v_name) not between 1 and 20 then raise exception '단계 이름은 1~20자'; end if;
    if jsonb_typeof(v_stage -> 'x') is distinct from 'number' or jsonb_typeof(v_stage -> 'y') is distinct from 'number'
       or (v_stage ->> 'x')::numeric <> trunc((v_stage ->> 'x')::numeric) or (v_stage ->> 'y')::numeric <> trunc((v_stage ->> 'y')::numeric)
       or abs((v_stage ->> 'x')::numeric) > 100000 or abs((v_stage ->> 'y')::numeric) > 100000 then raise exception '단계 자리(x, y)는 ±100000 안의 정수'; end if;
    v_ids := v_ids || v_id;
    -- 단계 메모(T2): 글이 아니면 버리고, 앞뒤 공백 없애 200자, 비면 키를 넣지 않는다(lib/blueprint/graph.ts cleanNote와 같음)
    v_note := case when jsonb_typeof(v_stage -> 'note') = 'string' then regexp_replace(left(regexp_replace(v_stage ->> 'note', '^\s+|\s+$', '', 'g'), 200), '^\s+|\s+$', '', 'g') else '' end;
    v_techs := public.blueprint_clean_techs(v_allowed, v_stage -> 'techs');
    select v_ends || coalesce(array_agg((t ->> 'id') || '@' || v_id), '{}') into v_ends from jsonb_array_elements(v_techs) t; -- 관계선이 이을 수 있는 끝
    v_rows := v_rows || (jsonb_build_object('id', v_id, 'name', v_name, 'x', (v_stage -> 'x'), 'y', (v_stage -> 'y'), 'techs', v_techs)
      || case when v_note <> '' then jsonb_build_object('note', v_note) else '{}'::jsonb end);
  end loop;

  for v_edge in select value from jsonb_array_elements(coalesce(p_graph -> 'edges', '[]')) loop
    v_a := array_position(v_ids, v_edge ->> 'from'); v_b := array_position(v_ids, v_edge ->> 'to');
    if jsonb_typeof(v_edge) <> 'object' or v_a is null or v_b is null then raise exception '연결선이 없는 단계를 가리킨다'; end if;
    if v_a = v_b then raise exception '단계를 자기 자신에 잇지 않는다'; end if;
    if exists (select 1 from unnest(v_from, v_to) e(f, t) where e.f = v_a and e.t = v_b) then raise exception '같은 연결선이 두 번 있다'; end if;
    v_from := v_from || v_a; v_to := v_to || v_b;
    v_edges := v_edges || jsonb_build_array(jsonb_build_object('from', v_ids[v_a], 'to', v_ids[v_b]));
  end loop;

  -- 기술 관계선(P-12j H2): 사용자가 그은 표시(검증 · 호환 아님). 끝("기술id@단계id")이 이 graph의 기술이 아니거나 자기 자신 · 겹침 · 모양 틀림이면
  -- 그 선만 빼고 앞에서 100개(lib/blueprint/graph.ts cleanLinks와 같음). 메모처럼 판 전체를 거절하지 않는다
  if jsonb_typeof(p_graph -> 'links') = 'array' then
    for v_link in select value from jsonb_array_elements(p_graph -> 'links') loop
      exit when jsonb_array_length(v_links) >= 100;
      v_lf := case when jsonb_typeof(v_link -> 'from') = 'string' then v_link ->> 'from' end;
      v_lt := case when jsonb_typeof(v_link -> 'to') = 'string' then v_link ->> 'to' end;
      continue when v_lf is null or v_lt is null or v_lf = v_lt or v_lf <> all(v_ends) or v_lt <> all(v_ends) or (v_lf || '|' || v_lt) = any(v_seen);
      v_seen := v_seen || (v_lf || '|' || v_lt);
      v_links := v_links || jsonb_build_array(jsonb_build_object('from', v_lf, 'to', v_lt));
    end loop;
  end if;

  -- 섹션(P-12o): 맞지 않는 섹션만 빼고 24개까지(lib/blueprint/sections.ts cleanSections와 같음). 단계는 이 graph에 있고 안 겹치며 2개 이상,
  -- 공통 기술은 단계 기술과 같은 관문(blueprint_clean_techs). 공통 기술이 관문 밖이면 단계 기술처럼 판 전체를 거절한다(불변 1 · 4: 몰래 빼지 않음)
  if jsonb_typeof(p_graph -> 'sections') = 'array' then
    for v_sec in select value from jsonb_array_elements(p_graph -> 'sections') loop
      exit when jsonb_array_length(v_sections) >= 24;
      continue when jsonb_typeof(v_sec) <> 'object' or jsonb_typeof(v_sec -> 'id') <> 'string' or jsonb_typeof(v_sec -> 'name') <> 'string' or jsonb_typeof(v_sec -> 'stageIds') <> 'array';
      v_sid := v_sec ->> 'id'; v_sname := btrim(left(v_sec ->> 'name', 20));
      continue when v_sid !~ '^[A-Za-z0-9_-]{1,64}$' or v_sid = any(v_sids) or v_sid = any(v_ids) or v_sname = '';
      -- 글인 단계 id만, 처음 나온 차례로 한 번씩, 이 graph에 있고 앞 섹션이 안 쓴 것만
      select coalesce(array_agg(m order by o), '{}') into v_members
        from (select e #>> '{}' as m, min(o) as o from jsonb_array_elements(v_sec -> 'stageIds') with ordinality as x(e, o)
               where jsonb_typeof(e) = 'string' group by e #>> '{}') y
       where m = any(v_ids) and m <> all(v_used);
      continue when coalesce(array_length(v_members, 1), 0) < 2;
      v_stechs := public.blueprint_clean_techs(v_allowed, coalesce(v_sec -> 'techs', '[]'));
      v_used := v_used || v_members; v_sids := v_sids || v_sid;
      v_sections := v_sections || jsonb_build_array(jsonb_build_object('id', v_sid, 'name', v_sname, 'stageIds', to_jsonb(v_members), 'techs', v_stechs));
    end loop;
  end if;

  v_depth := public.blueprint_depths(array_length(v_ids, 1), v_from, v_to);
  select max(d) into v_max from unnest(v_depth) d;
  if v_max + 1 > 12 then raise exception '단계 깊이는 12까지'; end if;
  for k in 0..v_max loop
    select jsonb_agg(jsonb_build_object('name', u.r ->> 'name', 'techs', u.r -> 'techs') order by (u.r ->> 'y')::numeric, (u.r ->> 'x')::numeric, (u.r ->> 'id') collate "C"), count(*)
      into v_col, v_a from unnest(v_rows, v_depth) as u(r, dp) where u.dp = k;
    if v_a > 4 then raise exception '같은 깊이의 단계는 4개까지'; end if;
    v_board := v_board || jsonb_build_array(v_col);
  end loop;
  select jsonb_agg(r) into v_stages from unnest(v_rows) r;
  return jsonb_build_object('graph', jsonb_build_object('v', 2, 'stages', v_stages, 'edges', v_edges)
    || case when jsonb_array_length(v_links) > 0 then jsonb_build_object('links', v_links) else '{}'::jsonb end
    || case when jsonb_array_length(v_sections) > 0 then jsonb_build_object('sections', v_sections) else '{}'::jsonb end, 'board', v_board);
end $$;
revoke all on function public.blueprint_graph_clean(uuid, jsonb) from public, anon, authenticated;

create or replace function public.save_blueprint_template(p_id uuid, p_kind text, p_name text, p_graph jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_owner uuid; v_graph jsonb := p_graph; v_clean jsonb; v_n int;
begin
  if v_uid is null then raise exception '로그인이 필요하다'; end if;
  if p_id is null then raise exception '템플릿 id가 없다'; end if;
  if p_kind is null or p_kind not in ('frame', 'combo') then raise exception '템플릿 종류는 틀 · 조합 중 하나'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception '템플릿 이름은 1~60자'; end if;
  select author_id into v_owner from public.blueprint_templates where id = p_id;
  if found then
    if v_owner = v_uid then return 'exists'; end if;
    raise exception '이미 쓰인 템플릿 id';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('blueprint_templates:' || v_uid::text, 0));
  -- 잠금 뒤 다시 본다: 같은 저장이 동시에 두 번 오면 두 번째는 한도 오류가 아니라 exists(불변 3)
  if exists (select 1 from public.blueprint_templates where id = p_id and author_id = v_uid) then return 'exists'; end if;
  if (select count(*) from public.blueprint_templates where author_id = v_uid) >= 100 then raise exception '템플릿 한도: 100개'; end if;
  if p_kind = 'frame' and jsonb_typeof(p_graph -> 'stages') = 'array' then  -- 틀: 단계마다 기술을 비운다
    select jsonb_set(p_graph, '{stages}', coalesce(jsonb_agg(s || jsonb_build_object('techs', '[]'::jsonb)), '[]')) into v_graph
      from jsonb_array_elements(p_graph -> 'stages') s;
  end if;
  if p_kind = 'frame' and jsonb_typeof(v_graph -> 'sections') = 'array' then  -- 틀: 섹션 공통 기술도 비운다(P-12o, 단계 모양만)
    select jsonb_set(v_graph, '{sections}', coalesce(jsonb_agg(case when jsonb_typeof(x) = 'object' then x || jsonb_build_object('techs', '[]'::jsonb) else x end), '[]')) into v_graph
      from jsonb_array_elements(v_graph -> 'sections') x;
  end if;
  -- 템플릿은 틀 · 조합이라 개인 글을 싣지 않는다: 단계 메모(T2)를 빼고 검사 · 저장
  if jsonb_typeof(v_graph -> 'stages') = 'array' then
    select jsonb_set(v_graph, '{stages}', coalesce(jsonb_agg(s - 'note'), '[]')) into v_graph from jsonb_array_elements(v_graph -> 'stages') s;
  end if;
  v_clean := public.blueprint_graph_clean(v_uid, v_graph);
  insert into public.blueprint_templates (id, author_id, kind, name, graph, board)
  values (p_id, v_uid, p_kind, v_name, v_clean -> 'graph', v_clean -> 'board')
  on conflict (id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    select author_id into v_owner from public.blueprint_templates where id = p_id;
    if v_owner = v_uid then return 'exists'; end if;
    raise exception '이미 쓰인 템플릿 id';
  end if;
  return 'saved';
end $$;
revoke all on function public.save_blueprint_template(uuid, text, text, jsonb) from public, anon;
