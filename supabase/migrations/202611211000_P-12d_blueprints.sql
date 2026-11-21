-- P-12d-blueprint: 확정한 블루프린트(design.md 14절 ⑤ "이 조합으로 확정 → 내 이력"). 만드는 중인 판은 브라우저에만 두고, 확정한 것만 여기.
-- 내 이력(확정 목록 · 기술별 쓴 횟수)은 이 표를 읽어 화면이 센다. 본인만 읽는다(불변 5). 고치기 · 지우기는 없음(이력은 쌓이기만).
-- 쓰기는 DB 함수 confirm_blueprint 하나로만(tech_marks와 같은 방식): 판 모양 · 이름 길이 · 내 프로젝트 · 기술이 있는지 · 위험 등급을 DB가 다시 보고,
-- 기술 이름은 DB에서 다시 읽어 넣는다. 표에 직접 넣는 길은 막는다(화면 · 서버 검사를 건너뛰지 못하게).
-- id는 화면이 확정 내용마다 만들어 보낸다: 같은 확정을 다시 보내도(두 번 누름 · 재시도) 한 줄만 생긴다(불변 3).

create table public.blueprints (
  id uuid primary key,
  user_id uuid not null default auth.uid() references public.profiles (id),
  name text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  project_id uuid references public.projects (id) on delete set null,
  board jsonb not null check (jsonb_typeof(board) = 'array' and jsonb_array_length(board) between 1 and 12 and pg_column_size(board) <= 131072),
  created_at timestamptz not null default now()
);
create index blueprints_user on public.blueprints (user_id, created_at desc);
create index blueprints_project on public.blueprints (project_id);

alter table public.blueprints enable row level security;
revoke all on public.blueprints from anon, authenticated;
grant select on public.blueprints to authenticated;
create policy blueprints_select_own on public.blueprints for select to authenticated
  using (user_id = (select auth.uid()));

-- 확정 한 번. 돌려주는 값 'saved' = 새로 남김, 'exists' = 같은 id를 내가 이미 남김(다시 보낸 것). 남의 id · 틀린 값은 예외(아무것도 안 남음, 불변 4)
create function public.confirm_blueprint(p_id uuid, p_name text, p_project_id uuid, p_board jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_owner uuid;
  v_col jsonb; v_stage jsonb; v_tech jsonb;
  v_cols jsonb := '[]'; v_stages jsonb; v_techs jsonb;
  v_sname text; v_tid uuid; v_tname text; v_grade text; v_n int;
begin
  if v_uid is null then raise exception '로그인이 필요하다'; end if;
  if p_id is null then raise exception '확정 id가 없다'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception '블루프린트 이름은 1~60자'; end if;
  if p_project_id is not null and not exists (select 1 from public.projects where id = p_project_id and owner_id = v_uid) then
    raise exception '본인 프로젝트가 아니다';
  end if;
  select user_id into v_owner from public.blueprints where id = p_id;
  if found then
    if v_owner = v_uid then return 'exists'; end if;
    raise exception '이미 쓰인 확정 id';
  end if;
  if jsonb_typeof(p_board) is distinct from 'array' or jsonb_array_length(p_board) not between 1 and 12 then raise exception '단계 열은 1~12개'; end if;
  for v_col in select value from jsonb_array_elements(p_board) loop
    if jsonb_typeof(v_col) <> 'array' or jsonb_array_length(v_col) not between 1 and 4 then raise exception '나란히 단계는 1~4개'; end if;
    v_stages := '[]';
    for v_stage in select value from jsonb_array_elements(v_col) loop
      v_sname := btrim(coalesce(v_stage ->> 'name', ''));
      if jsonb_typeof(v_stage) <> 'object' or char_length(v_sname) not between 1 and 20 then raise exception '단계 이름은 1~20자'; end if;
      if jsonb_typeof(coalesce(v_stage -> 'techs', '[]')) <> 'array' or jsonb_array_length(coalesce(v_stage -> 'techs', '[]')) > 8 then raise exception '단계마다 기술은 8개까지'; end if;
      v_techs := '[]';
      for v_tech in select value from jsonb_array_elements(coalesce(v_stage -> 'techs', '[]')) loop
        v_tid := (v_tech ->> 'id')::uuid;  -- uuid 모양이 아니면 여기서 예외
        select display_name, grade into v_tname, v_grade from public.technologies where id = v_tid;
        if not found then raise exception '기술을 찾지 못했다'; end if;
        if v_grade = 'danger' then raise exception '위험 등급 기술은 블루프린트에 넣지 않는다'; end if;
        if not v_techs @> jsonb_build_array(jsonb_build_object('id', v_tid)) then  -- 같은 단계에 같은 기술은 한 번
          v_techs := v_techs || jsonb_build_array(jsonb_build_object('id', v_tid, 'name', v_tname));
        end if;
      end loop;
      v_stages := v_stages || jsonb_build_array(jsonb_build_object('name', v_sname, 'techs', v_techs));
    end loop;
    v_cols := v_cols || jsonb_build_array(v_stages);
  end loop;
  insert into public.blueprints (id, user_id, name, project_id, board) values (p_id, v_uid, v_name, p_project_id, v_cols)
  on conflict (id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then  -- 같은 id가 동시에 들어옴: 내 것이면 이미 남은 것
    select user_id into v_owner from public.blueprints where id = p_id;
    if v_owner = v_uid then return 'exists'; end if;
    raise exception '이미 쓰인 확정 id';
  end if;
  return 'saved';
end $$;
revoke all on function public.confirm_blueprint(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.confirm_blueprint(uuid, text, uuid, jsonb) to authenticated;
