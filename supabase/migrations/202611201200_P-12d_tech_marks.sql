-- P-12d-marks: 알림 없이 기술에 남기는 판단(관심 · 적용 후보 · 보류). ADR 0028 2·"데이터가 바뀐다", 데이터설계 tech_marks.
-- judgments(알림당 하나, save_judgment로만)는 그대로 둔다. 쓰는 중은 저장소에서 읽은 것이라 여기 없다.
-- 쓰기는 set_tech_mark 하나로만: 알림 판단 · 표시 · 바뀐 기록을 한 거래로(불변 4), 같은 값이면 아무것도 안 함(불변 3).

create table public.tech_marks (
  user_id uuid not null references public.profiles (id),
  tech_id uuid not null references public.technologies (id),
  status text not null check (status in ('interest', 'candidate', 'hold')),
  reason text,
  updated_at timestamptz not null default now(),
  primary key (user_id, tech_id),
  check (status <> 'hold' or char_length(btrim(coalesce(reason, ''))) >= 5)  -- 보류는 이유 5자 이상(SPEC-4.1)
);
create index tech_marks_tech_id on public.tech_marks (tech_id);

-- 바뀐 기록(기록 화면·되돌리기 근거). 덧붙이기만. null = 표시 없음
create table public.tech_mark_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id),
  tech_id uuid not null references public.technologies (id),
  prev_status text check (prev_status in ('interest', 'candidate', 'hold')),
  new_status text check (new_status in ('interest', 'candidate', 'hold')),
  reason text
);
create index tech_mark_events_user on public.tech_mark_events (user_id, created_at desc);
create trigger tech_mark_events_append_only before update or delete on public.tech_mark_events
  for each row execute function public.block_change();
create trigger tech_mark_events_no_truncate before truncate on public.tech_mark_events
  for each statement execute function public.block_change();

-- p_status가 null이면 표시를 지운다. 돌려주는 값 = 이 호출로 판단한 알림 id들(흐름 화면 기록용).
-- 적용 후보 · 보류는 그 기술의 판단 대기 알림(본인 것)을 모두 save_judgment로 먼저 판단한다: 알림과 표시가 어긋나지 않게,
-- 한 거래라 하나라도 실패하면 판단도 표시도 전 상태 그대로(불변 4). 고친 버전은 사용자 값이 아니라 변경에서 가져온다(ADR 0012).
-- 위험 등급 기술은 그 기술의 가장 최근 보안 경고를 고친 버전과 함께 적용 후보로 판단했을 때만 적용 후보가 된다(ADR 0012).
create function public.set_tech_mark(p_tech_id uuid, p_status text, p_reason text default null)
returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_grade text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_prev public.tech_marks;
  v_alert record;
  v_judged uuid[] := '{}';
  v_latest record;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다';
  end if;
  if p_status is distinct from 'hold' then
    v_reason := null;  -- 이유는 보류에만 남긴다
  end if;
  -- 같은 사람 + 기술의 동시 호출(두 번 누름)을 한 줄로 세운다: 기록이 두 번 남지 않게(불변 3)
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || p_tech_id::text, 0));
  select grade into v_grade from public.technologies where id = p_tech_id;
  if not found then
    raise exception '기술을 찾지 못했다';
  end if;

  select * into v_prev from public.tech_marks where user_id = v_uid and tech_id = p_tech_id;

  if p_status in ('candidate', 'hold') then
    for v_alert in
      select a.id, c.curr_value ->> 'fixed_version' as fixed_version
      from public.alerts a join public.changes c on c.id = a.change_id
      where a.user_id = v_uid and a.status = 'pending' and c.tech_id = p_tech_id
      order by (a.kind = 'security') desc, a.created_at
    loop
      perform public.save_judgment(v_alert.id, p_status, v_reason,
        case when p_status = 'candidate' then nullif(v_alert.fixed_version, '') end);
      v_judged := v_judged || v_alert.id;
    end loop;
  end if;

  if p_status = 'candidate' and v_grade = 'danger' then
    select j.decision, j.fixed_version into v_latest
    from public.changes c
    join public.alerts a on a.change_id = c.id and a.user_id = v_uid and a.kind = 'security'
    left join public.judgments j on j.alert_id = a.id
    where c.tech_id = p_tech_id
    order by c.detected_at desc limit 1;
    if v_latest.decision is distinct from 'candidate' or coalesce(v_latest.fixed_version, '') = '' then
      raise exception '위험 등급 기술은 적용 후보가 될 수 없다(ADR 0012)';
    end if;
  end if;

  if v_prev.status is not distinct from p_status and v_prev.reason is not distinct from v_reason then
    return v_judged;  -- 표시가 같은 값: 표시·기록은 그대로(새로 온 대기 알림만 위에서 판단됨)
  end if;
  if p_status is null then
    delete from public.tech_marks where user_id = v_uid and tech_id = p_tech_id;
  else
    insert into public.tech_marks (user_id, tech_id, status, reason)
    values (v_uid, p_tech_id, p_status, v_reason)
    on conflict (user_id, tech_id) do update set status = excluded.status, reason = excluded.reason, updated_at = now();
  end if;
  insert into public.tech_mark_events (user_id, tech_id, prev_status, new_status, reason)
  values (v_uid, p_tech_id, v_prev.status, p_status, v_reason);
  return v_judged;
end;
$$;
revoke all on function public.set_tech_mark(uuid, text, text) from public, anon;
grant execute on function public.set_tech_mark(uuid, text, text) to authenticated;

-- 불변 5: 본인 것만 읽는다(관리자도 남의 표시는 못 본다). 쓰기는 위 함수로만
alter table public.tech_marks enable row level security;
alter table public.tech_mark_events enable row level security;
revoke all on public.tech_marks, public.tech_mark_events from anon;
create policy tech_marks_select_own on public.tech_marks for select to authenticated
  using (user_id = (select auth.uid()));
create policy tech_mark_events_select_own on public.tech_mark_events for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.tech_marks, public.tech_mark_events from authenticated;
grant select on public.tech_marks, public.tech_mark_events to authenticated;
