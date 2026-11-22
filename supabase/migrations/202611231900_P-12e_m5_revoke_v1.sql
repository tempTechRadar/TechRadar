-- P-12e M5(계획 컷 1순위): 옛 확정 함수 confirm_blueprint(v1)의 실행 권한을 거두고, 안 쓰는 blueprint_graph_clean의 p_extra를 없앤다. 작업 I-P-12e-m5.
-- 적용은 통합 PR 병합 · 배포 확인 뒤 사용자 승인으로(배포된 화면이 v2 confirm_blueprint_v2만 부르는지 먼저 본다). 시간이 안 되면 버린다.
-- 1) v1: 스튜디오(P-12e)는 confirm_blueprint_v2만 부른다. v1은 M1에서 v2로 넘기게 바꿔 두었지만(관문 우회 없음) 쓰지 않는 입구는 닫는다. 함수는 지우지 않는다(되돌리기 쉽게).
-- 2) p_extra: 템플릿 기술을 관문에 더해 주던 인자(11-21 사용자 결정 "고르기 칩"으로 M2가 넘기지 않음). 남겨 두면 나중의 definer 함수가 넘겨 관문을 건너뛸 수 있어 없앤다.
--    인자를 없애려면 지우고 다시 만들어야 한다: 본문은 M1(202611221000)과 같고 v_allowed 한 줄만 다르다. 부르는 곳(confirm_blueprint_v2 · save_blueprint_template)은 두 인자로 부르므로 그대로.
-- 3) "열린 템플릿" 규칙 하나로(보안 검토 · QA 관찰, Maestro: 새 마이그레이션 대신 M5에): is_open_template에도 202611221320의 "공개 목록 밖 기술 없음"을 더한다.
--    공개 뒤 기술이 목록 밖이 된 템플릿은 갤러리에서 빠지듯 그 사용기도 남(손님 포함)에게 안 보이고 새로 쓸 수 없다(쓴 사람은 계속 봄). 그 전까지는 알려진 한계.

revoke execute on function public.confirm_blueprint(uuid, text, uuid, jsonb) from public, anon, authenticated;

drop function public.blueprint_graph_clean(uuid, jsonb, uuid[]);
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

create or replace function public.is_open_template(p_template_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blueprint_templates t join public.profiles p on p.id = t.author_id
    where t.id = p_template_id and t.is_public and t.hidden_at is null and not p.is_demo
      and cardinality(public.template_unlisted_techs(t.graph)) = 0);
$$;
