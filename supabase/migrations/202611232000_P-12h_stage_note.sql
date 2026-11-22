-- P-12h-2 T2 단계 메모: 청사진 graph의 단계에 note(200자, 앞뒤 공백 없앰, 비면 뺌)를 남긴다. 작업 I-P-12h-blueprint-revamp.
-- M5(202611231900) 뒤에 적용한다(M5 파일은 고치지 않음). 적용은 병합 · 배포 뒤 사용자 승인으로 M5 → 이 파일 순서.
-- 그전에 운영에서 확정하면 메모는 빠지고(옛 함수가 note를 버림) 화면 초안(이 브라우저)에는 남는다.
-- 1) blueprint_graph_clean: 본문은 M5와 같고 v_note 줄만 더했다. board(v1 투영 · 이력 목록 · 쓴 횟수)에는 메모를 넣지 않는다(이력 "불러오기"는 graph를 읽음).
-- 2) save_blueprint_template: 본문은 202611221100과 같고, 검사 전에 단계 메모를 빼는 줄만 더했다(템플릿은 남에게 보일 수 있어 개인 글을 싣지 않음).
-- 메모는 blueprints 표의 graph 칸에만 있고, 그 표는 본인만 읽는다(RLS, 불변 5). 시험: supabase/tests/stage_note_p12h.sql

create or replace function public.blueprint_graph_clean(p_uid uuid, p_graph jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_allowed uuid[]; v_ids text[] := '{}'; v_rows jsonb[] := '{}'; v_from int[] := '{}'; v_to int[] := '{}';
  v_stage jsonb; v_edge jsonb; v_id text; v_name text; v_note text; v_a int; v_b int; v_depth int[]; v_max int; k int;
  v_stages jsonb := '[]'; v_edges jsonb := '[]'; v_board jsonb := '[]'; v_col jsonb;
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
    v_rows := v_rows || (jsonb_build_object('id', v_id, 'name', v_name, 'x', (v_stage -> 'x'), 'y', (v_stage -> 'y'), 'techs', public.blueprint_clean_techs(v_allowed, v_stage -> 'techs'))
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
  return jsonb_build_object('graph', jsonb_build_object('v', 2, 'stages', v_stages, 'edges', v_edges), 'board', v_board);
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
