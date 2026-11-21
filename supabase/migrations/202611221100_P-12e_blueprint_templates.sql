-- P-12e-blueprint-studio M2: 청사진 템플릿(틀 · 조합)과 공개 갤러리. ADR 0035 · 0036(ADR 0009 개정), 계획 "데이터 · DB" M2.
-- 틀(frame) = 단계와 연결만(기술 뺌), 조합(combo) = 단계와 기술. 기본 비공개, 만든 사람이 "공개"를 눌러야 갤러리에 보인다(ADR 0036 1).
-- 갤러리는 DB 함수 public_blueprint_templates가 별명과 수만 골라 준다: author_id(사람 id)는 내보내지 않고, 시연 계정은 뺀다(ADR 0036 2, using_now 패턴).
-- 표는 만든 사람(과 관리자)만 읽는다(불변 5). 쓰기는 함수로만(save_blueprint_template · set_template_public · hide_blueprint_template):
-- 그래프는 M1의 blueprint_graph_clean으로 검사 · 정리(한도 · 고리 · 이름 다시 읽기 · 위험 등급), 조합의 기술은 만든 사람의 관문(내 기술 · 적용 후보 · 내 이력)을 거친다.
-- 남의 조합 템플릿으로 확정할 때는 그 템플릿에 든 기술을 관문에 더해 받는다(템플릿을 고른 것이 사람의 선택, 위험 등급은 그래도 거절).
-- 추가만 한다(M1 뒤에 적용).

create table public.blueprint_templates (
  id uuid primary key,  -- 화면이 저장할 때 만들어 보냄: 같은 저장을 다시 보내도 한 줄(불변 3)
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('frame', 'combo')),
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  graph jsonb not null check (jsonb_typeof(graph) = 'object' and pg_column_size(graph) <= 262144),
  board jsonb not null check (jsonb_typeof(board) = 'array'),  -- graph의 투영(미리 보기 · 내보내기용)
  is_public boolean not null default false,
  hidden_at timestamptz,  -- 관리자 숨김(ADR 0036 4). 숨기면 공개여도 갤러리에 안 보이고 다시 공개할 수 없다
  hidden_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index blueprint_templates_author on public.blueprint_templates (author_id, created_at desc);
create index blueprint_templates_public on public.blueprint_templates (created_at desc) where is_public and hidden_at is null;

alter table public.blueprint_templates enable row level security;
revoke all on public.blueprint_templates from anon, authenticated;
grant select on public.blueprint_templates to authenticated;
-- 표는 만든 사람만 읽는다. 관리자도 남의 비공개는 못 본다(ADR 0036 4). 공개된 것은 갤러리 함수로
create policy blueprint_templates_select_own on public.blueprint_templates for select to authenticated
  using (author_id = (select auth.uid()));

-- 확정본이 어느 템플릿에서 시작했나(M1이 만든 칸). 템플릿이 지워지면 비운다
alter table public.blueprints add constraint blueprints_template_id_fkey
  foreign key (template_id) references public.blueprint_templates (id) on delete set null;
create index blueprints_template on public.blueprints (template_id) where template_id is not null;

-- 템플릿 저장. 'saved' = 새로 남김, 'exists' = 같은 id를 내가 이미 남김(불변 3). 틀은 기술을 빼고 저장한다. 한 사람 100개까지
create function public.save_blueprint_template(p_id uuid, p_kind text, p_name text, p_graph jsonb)
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
grant execute on function public.save_blueprint_template(uuid, text, text, jsonb) to authenticated;

-- 공개 · 비공개 바꾸기(내 템플릿만). 돌려주는 값 = 바뀐 뒤 공개 여부. 관리자가 숨긴 템플릿은 다시 공개할 수 없다
create function public.set_template_public(p_id uuid, p_public boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.blueprint_templates;
begin
  if v_uid is null then raise exception '로그인이 필요하다'; end if;
  if p_public is null then raise exception '공개 여부가 없다'; end if;
  select * into v_row from public.blueprint_templates where id = p_id for update;
  if not found or v_row.author_id <> v_uid then raise exception '내 템플릿이 아니다'; end if;
  if p_public and v_row.hidden_at is not null then raise exception '관리자가 숨긴 템플릿은 공개할 수 없다'; end if;
  update public.blueprint_templates set is_public = p_public where id = p_id;
  return p_public;
end $$;
revoke all on function public.set_template_public(uuid, boolean) from public, anon;
grant execute on function public.set_template_public(uuid, boolean) to authenticated;

-- 관리자 숨김 · 되돌리기(ADR 0036 4). 공개된 템플릿만 다룬다(비공개는 주인만의 것). 숨기면 갤러리에서 빠진다(주인은 계속 봄)
create function public.hide_blueprint_template(p_id uuid, p_hidden boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not (select public.is_admin()) then raise exception '관리자만 숨길 수 있다'; end if;
  if p_hidden is null then raise exception '숨김 여부가 없다'; end if;
  update public.blueprint_templates set hidden_at = case when p_hidden then now() else null end, hidden_by = case when p_hidden then v_uid else null end
   where id = p_id and is_public;
  if not found then raise exception '공개 템플릿을 찾지 못했다'; end if;
  return p_hidden;
end $$;
revoke all on function public.hide_blueprint_template(uuid, boolean) from public, anon;
grant execute on function public.hide_blueprint_template(uuid, boolean) to authenticated;

-- 공개 갤러리: 공개 · 숨기지 않음 · 시연 계정 아님. 내보내는 칸 = id · kind · name · graph · board · author_nickname · uses · created_at.
-- author_id는 내보내지 않는다(ADR 0036 2). 별명은 설정에서 공개를 끈 사람(profiles.is_public = false)이거나 비었으면 "익명"(불변 5, using_now와 같은 기준).
-- uses = 이 템플릿으로 확정한 사람 수(작가 본인 · 시연 계정 빼고): 작가의 비공개 활동량이 드러나거나 한 사람이 되풀이해 순위를 올리지 않게. 많은 순 → 새것 순
create function public.public_blueprint_templates(p_kind text default null, p_limit int default 60, p_offset int default 0)
returns table (id uuid, kind text, name text, graph jsonb, board jsonb, author_nickname text, uses integer, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, t.kind, t.name, t.graph, t.board, case when p.is_public then coalesce(nullif(btrim(p.nickname), ''), '익명') else '익명' end,
         (select count(distinct b.user_id) from public.blueprints b join public.profiles bp on bp.id = b.user_id
           where b.template_id = t.id and b.user_id <> t.author_id and not bp.is_demo)::integer, t.created_at
    from public.blueprint_templates t join public.profiles p on p.id = t.author_id
   where t.is_public and t.hidden_at is null and not p.is_demo and (p_kind is null or t.kind = p_kind)
   order by 7 desc, t.created_at desc, t.id
   limit least(greatest(coalesce(p_limit, 60), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function public.public_blueprint_templates(text, int, int) from public, anon;
grant execute on function public.public_blueprint_templates(text, int, int) to authenticated;

-- 템플릿 하나 열기("이 템플릿으로 시작"): 내 것이거나, 공개 · 숨기지 않음 · 시연 계정이 아닌 것만. 없으면 빈 결과. author_id는 내보내지 않는다
create function public.blueprint_template_for_use(p_id uuid)
returns table (id uuid, kind text, name text, graph jsonb)
language sql stable security definer set search_path = '' as $$
  select t.id, t.kind, t.name, t.graph from public.blueprint_templates t join public.profiles p on p.id = t.author_id
   where t.id = p_id and (select auth.uid()) is not null
     and (t.author_id = (select auth.uid()) or (t.is_public and t.hidden_at is null and not p.is_demo));
$$;
revoke all on function public.blueprint_template_for_use(uuid) from public, anon;
grant execute on function public.blueprint_template_for_use(uuid) to authenticated;

-- 확정(v2)이 템플릿을 받게 바꾼다(M1의 같은 이름 · 모양). 템플릿은 blueprint_template_for_use와 같은 기준(내 것, 또는 공개 · 숨기지 않음 · 시연 계정 아님).
-- 조합 템플릿의 기술은 관문에 더해 받는다(사람이 고른 템플릿). 위험 등급은 blueprint_graph_clean이 그래도 거절
create or replace function public.confirm_blueprint_v2(p_id uuid, p_name text, p_project_id uuid, p_graph jsonb, p_template_id uuid default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_owner uuid; v_clean jsonb; v_n int; v_extra uuid[] := '{}'; v_tpl public.blueprint_templates;
begin
  if v_uid is null then raise exception '로그인이 필요하다'; end if;
  if p_id is null then raise exception '확정 id가 없다'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception '청사진 이름은 1~60자'; end if;
  if p_project_id is not null and not exists (select 1 from public.projects where id = p_project_id and owner_id = v_uid) then
    raise exception '본인 프로젝트가 아니다';
  end if;
  select user_id into v_owner from public.blueprints where id = p_id;
  if found then
    if v_owner = v_uid then return 'exists'; end if;
    raise exception '이미 쓰인 확정 id';
  end if;
  if p_template_id is not null then
    select t.* into v_tpl from public.blueprint_templates t join public.profiles p on p.id = t.author_id
     where t.id = p_template_id and (t.author_id = v_uid or (t.is_public and t.hidden_at is null and not p.is_demo));
    if not found then raise exception '쓸 수 없는 템플릿'; end if;
    select coalesce(array_agg((t ->> 'id')::uuid), '{}') into v_extra
      from jsonb_array_elements(v_tpl.graph -> 'stages') s cross join lateral jsonb_array_elements(coalesce(s -> 'techs', '[]')) t
     where t ->> 'id' is not null;
  end if;
  v_clean := public.blueprint_graph_clean(v_uid, p_graph, v_extra);
  insert into public.blueprints (id, user_id, name, project_id, board, graph, template_id)
  values (p_id, v_uid, v_name, p_project_id, v_clean -> 'board', v_clean -> 'graph', p_template_id)
  on conflict (id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    select user_id into v_owner from public.blueprints where id = p_id;
    if v_owner = v_uid then return 'exists'; end if;
    raise exception '이미 쓰인 확정 id';
  end if;
  return 'saved';
end $$;
