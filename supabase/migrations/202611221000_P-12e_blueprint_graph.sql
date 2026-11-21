-- P-12e-blueprint-studio M1: 청사진을 자유 캔버스 그래프(v2)로 저장한다. 계획 .claude/plans-share/p12e-blueprint-studio.md "데이터 · DB".
-- 저장 모양 v2: {v:2, stages:[{id,name,x,y,techs:[{id,name}]}], edges:[{from,to}]}. 순서는 연결선이 정한다(가장 긴 경로 깊이, 같은 깊이 = 동시).
-- 기존 board 칸은 지우지 않고 graph에서 투영해 함께 저장한다(이력 · usageOf · exportText · parseBoard가 그대로 읽는다).
-- 관문(불변 1): 청사진에는 사람이 고른 기술만 — 내 기술 · 적용 후보 · 내 이력. 지금까지는 화면만 막고 DB 함수는 위험 등급만 막았다.
-- 옛 confirm_blueprint(v1, 지금 화면이 부름)도 이름 · 모양은 그대로 두고 판을 그래프로 바꿔 v2로 넘긴다: 관문을 건너뛰는 옛 길이 남지 않게
-- (v1로 아무 기술이나 이력에 넣고 v2가 "내 이력"으로 받아 주는 우회를 막는다). 추가 · 대체만, 지우는 것 없음. 실행 권한 회수는 M5.
-- 한도는 lib/blueprint/graph.ts LIMITS와 같다: 단계 1~48 · 깊이 ≤12 · 같은 깊이 ≤4 · 단계당 기술 ≤8 · 연결선 ≤200 · 단계 이름 1~20자 ·
-- 단계 id 영문·숫자·_·- 1~64자 · 자리 x·y 정수 ±100000.

alter table public.blueprints
  add column graph jsonb check (graph is null or (jsonb_typeof(graph) = 'object' and pg_column_size(graph) <= 262144)),
  add column template_id uuid;  -- 어느 템플릿에서 시작했나. 템플릿 표와 외래 키는 M2(202611221100)가 건다

-- 이 사람이 청사진에 넣을 수 있는 기술: 내 기술(숨기지 않았고 보관하지 않은 프로젝트) · 내 이력(확정한 청사진에 쓴 기술) · 적용 후보.
-- 적용 후보는 보드 칸 계산(lib/views/kanban.ts buildKanban)과 같다: 기술마다 지도 표시와 가장 최근 알림 판단을 견줘, 판단이 표시보다
-- 엄밀히 늦으면 판단이, 아니면 표시가 이긴다. 시각은 JS(Date.parse)처럼 밀리초까지만 견준다. 사용자가 직접 부르지 못한다.
create function public.blueprint_allowed_techs(p_uid uuid) returns table (tech_id uuid)
language sql stable security definer set search_path = '' as $$
  select m.tech_id from public.my_technologies m join public.projects p on p.id = m.project_id
   where m.owner_id = p_uid and m.hidden_at is null and p.archived_at is null and m.tech_id is not null
  union
  select (t ->> 'id')::uuid from public.blueprints b
    cross join lateral jsonb_array_elements(b.board) col
    cross join lateral jsonb_array_elements(col) st
    cross join lateral jsonb_array_elements(coalesce(st -> 'techs', '[]')) t
   where b.user_id = p_uid and t ->> 'id' is not null
  union
  select s.tech_id from (
    select coalesce(mk.tech_id, j.tech_id) as tech_id,
           case when j.judged_at is not null
                 and (mk.updated_at is null or date_trunc('milliseconds', j.judged_at) > date_trunc('milliseconds', mk.updated_at))
                then j.decision else mk.status end as state
      from (select tm.tech_id, tm.status, tm.updated_at from public.tech_marks tm where tm.user_id = p_uid) mk
      full join (
        select distinct on (c.tech_id) c.tech_id, jd.decision, jd.judged_at
          from public.alerts a join public.changes c on c.id = a.change_id join public.judgments jd on jd.alert_id = a.id
         where a.user_id = p_uid and a.status = 'done'
         order by c.tech_id, jd.judged_at desc, jd.id
      ) j on j.tech_id = mk.tech_id
  ) s where s.state = 'candidate' and s.tech_id is not null;
$$;
revoke all on function public.blueprint_allowed_techs(uuid) from public, anon, authenticated;

-- 본인용 같은 목록: 화면(서랍 · 하단 패널)이 DB 관문과 똑같은 목록을 읽게(JS로 따로 계산해 어긋나지 않게)
create function public.my_blueprint_tech_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.tech_id from public.blueprint_allowed_techs((select auth.uid())) a where (select auth.uid()) is not null;
$$;
revoke all on function public.my_blueprint_tech_ids() from public, anon;
grant execute on function public.my_blueprint_tech_ids() to authenticated;

-- 한 단계의 기술 목록 정리: 이름은 DB에서 다시 읽고(화면이 보낸 name은 버림), 없는 기술 · 위험 등급 · 고른 적 없는 기술은 거절, 같은 기술은 한 번
create function public.blueprint_clean_techs(p_allowed uuid[], p_techs jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_tech jsonb; v_tid uuid; v_tname text; v_grade text; v_list jsonb := '[]';
begin
  if jsonb_typeof(coalesce(p_techs, '[]')) <> 'array' or jsonb_array_length(coalesce(p_techs, '[]')) > 8 then raise exception '단계마다 기술은 8개까지'; end if;
  for v_tech in select value from jsonb_array_elements(coalesce(p_techs, '[]')) loop
    v_tid := (v_tech ->> 'id')::uuid;  -- uuid 모양이 아니면 여기서 예외
    select t.display_name, t.grade into v_tname, v_grade from public.technologies t where t.id = v_tid;
    if not found then raise exception '기술을 찾지 못했다'; end if;
    if v_grade = 'danger' then raise exception '위험 등급 기술은 청사진에 넣지 않는다: %', v_tname; end if;
    if v_tid is null or v_tid <> all(p_allowed) then raise exception '고른 적 없는 기술은 청사진에 넣지 않는다(내 기술 · 적용 후보 · 내 이력만): %', v_tname; end if;
    if not v_list @> jsonb_build_array(jsonb_build_object('id', v_tid)) then
      v_list := v_list || jsonb_build_array(jsonb_build_object('id', v_tid, 'name', v_tname));
    end if;
  end loop;
  return v_list;
end $$;
revoke all on function public.blueprint_clean_techs(uuid[], jsonb) from public, anon, authenticated;

-- 깊이 = 시작 단계(들어오는 선 없음)에서의 가장 긴 경로(0부터). 단계 번호 1..p_n, 연결선 p_from[k] → p_to[k]. 다 못 돌면 사이클
create function public.blueprint_depths(p_n int, p_from int[], p_to int[]) returns int[]
language plpgsql immutable set search_path = '' as $$
declare
  v_indeg int[] := array_fill(0, array[p_n]); v_depth int[] := array_fill(0, array[p_n]); v_queue int[] := '{}';
  v_done int := 0; v_m int := coalesce(array_length(p_from, 1), 0); i int; k int;
begin
  for k in 1..v_m loop v_indeg[p_to[k]] := v_indeg[p_to[k]] + 1; end loop;
  for i in 1..p_n loop if v_indeg[i] = 0 then v_queue := v_queue || i; end if; end loop;
  while v_done < coalesce(array_length(v_queue, 1), 0) loop
    v_done := v_done + 1; i := v_queue[v_done];
    for k in 1..v_m loop
      continue when p_from[k] <> i;
      v_depth[p_to[k]] := greatest(v_depth[p_to[k]], v_depth[i] + 1);
      v_indeg[p_to[k]] := v_indeg[p_to[k]] - 1;
      if v_indeg[p_to[k]] = 0 then v_queue := v_queue || p_to[k]; end if;
    end loop;
  end loop;
  if v_done < p_n then raise exception '연결선이 돌아 순서를 정할 수 없다(사이클)'; end if;
  return v_depth;
end $$;
revoke all on function public.blueprint_depths(int, int[], int[]) from public, anon, authenticated;

-- graph v2 검사 · 정리 · 투영. 돌려주는 값 {graph, board}. 틀리면 예외(아무것도 안 남음, 불변 4). 사용자가 직접 부르지 못한다.
-- board(v1 모양)는 깊이마다 열 하나, 같은 깊이 안은 y → x → id 순(graph.ts toBoardView와 같음, id는 ASCII라 COLLATE "C" = JS 글자 순)
create function public.blueprint_graph_clean(p_uid uuid, p_graph jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_allowed uuid[]; v_ids text[] := '{}'; v_rows jsonb[] := '{}'; v_from int[] := '{}'; v_to int[] := '{}';
  v_stage jsonb; v_edge jsonb; v_id text; v_name text; v_a int; v_b int; v_depth int[]; v_max int; k int;
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
    v_rows := v_rows || jsonb_build_object('id', v_id, 'name', v_name, 'x', (v_stage -> 'x'), 'y', (v_stage -> 'y'), 'techs', public.blueprint_clean_techs(v_allowed, v_stage -> 'techs'));
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

-- 옛 판(v1 board [[{name, techs}]]) → 그래프: 이웃한 열의 모든 짝을 잇는다(graph.ts fromV1과 같음). 투영하면 같은 board가 나온다
create function public.blueprint_graph_from_board(p_board jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_stages jsonb := '[]'; v_edges jsonb := '[]'; v_col jsonb; v_stage jsonb; c int := 0; r int; p int;
begin
  if jsonb_typeof(p_board) is distinct from 'array' or jsonb_array_length(p_board) not between 1 and 12 then raise exception '단계 열은 1~12개'; end if;
  for v_col in select value from jsonb_array_elements(p_board) loop
    if jsonb_typeof(v_col) <> 'array' or jsonb_array_length(v_col) not between 1 and 4 then raise exception '나란히 단계는 1~4개'; end if;
    r := 0;
    for v_stage in select value from jsonb_array_elements(v_col) loop
      v_stages := v_stages || jsonb_build_array(jsonb_build_object('id', 'c' || c || 'r' || r, 'name', v_stage -> 'name', 'x', c * 320, 'y', r * 160, 'techs', coalesce(v_stage -> 'techs', '[]')));
      if c > 0 then
        for p in 0..jsonb_array_length(p_board -> (c - 1)) - 1 loop
          v_edges := v_edges || jsonb_build_array(jsonb_build_object('from', 'c' || (c - 1) || 'r' || p, 'to', 'c' || c || 'r' || r));
        end loop;
      end if;
      r := r + 1;
    end loop;
    c := c + 1;
  end loop;
  return jsonb_build_object('v', 2, 'stages', v_stages, 'edges', v_edges);
end $$;
revoke all on function public.blueprint_graph_from_board(jsonb) from public, anon, authenticated;

-- 확정 한 번(v2). 'saved' = 새로 남김, 'exists' = 같은 id를 내가 이미 남김(다시 보낸 것, 불변 3). 남의 id · 틀린 값은 예외(불변 4).
-- p_template_id는 M2가 템플릿 확인을 넣기 전까지 비워야 한다(같은 이름 · 모양으로 M2가 함수를 바꾼다). 인자 5개는 RPC 이름 붙은 인자라 그대로 둔다
create function public.confirm_blueprint_v2(p_id uuid, p_name text, p_project_id uuid, p_graph jsonb, p_template_id uuid default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_owner uuid; v_clean jsonb; v_n int;
begin
  if v_uid is null then raise exception '로그인이 필요하다'; end if;
  if p_id is null then raise exception '확정 id가 없다'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception '청사진 이름은 1~60자'; end if;
  if p_project_id is not null and not exists (select 1 from public.projects where id = p_project_id and owner_id = v_uid) then
    raise exception '본인 프로젝트가 아니다';
  end if;
  if p_template_id is not null then raise exception '템플릿은 아직 쓸 수 없다'; end if;
  select user_id into v_owner from public.blueprints where id = p_id;
  if found then
    if v_owner = v_uid then return 'exists'; end if;
    raise exception '이미 쓰인 확정 id';
  end if;
  v_clean := public.blueprint_graph_clean(v_uid, p_graph);
  insert into public.blueprints (id, user_id, name, project_id, board, graph, template_id)
  values (p_id, v_uid, v_name, p_project_id, v_clean -> 'board', v_clean -> 'graph', p_template_id)
  on conflict (id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then  -- 같은 id가 동시에 들어옴: 내 것이면 이미 남은 것
    select user_id into v_owner from public.blueprints where id = p_id;
    if v_owner = v_uid then return 'exists'; end if;
    raise exception '이미 쓰인 확정 id';
  end if;
  return 'saved';
end $$;
revoke all on function public.confirm_blueprint_v2(uuid, text, uuid, jsonb, uuid) from public, anon;
grant execute on function public.confirm_blueprint_v2(uuid, text, uuid, jsonb, uuid) to authenticated;

-- 옛 확정(v1, 지금 화면): 같은 이름 · 인자 · 권한 그대로, 판을 그래프로 바꿔 v2로 넘긴다(관문 · 검사를 같이 받고 graph 칸도 채워진다).
-- 원래 v1처럼 같은 id를 내가 이미 남겼으면 판을 보기 전에 'exists'(다시 보낸 판이 달라도 성공, 불변 3)
create or replace function public.confirm_blueprint(p_id uuid, p_name text, p_project_id uuid, p_board jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.blueprints where id = p_id and user_id = (select auth.uid())) then return 'exists'; end if;
  return public.confirm_blueprint_v2(p_id, p_name, p_project_id, public.blueprint_graph_from_board(p_board));
end $$;
