-- P-12d-my-tech-tags: 사용자가 기술에 직접 붙이는 "내 태그". 본인만 읽고 붙이고 뗀다(불변 5). 공개하지 않는다(ADR 0009의 공개는 별명·수뿐).
-- 같은 기술에 같은 태그(대소문자 무시)는 한 줄(유일 색인, 다시 붙여도 늘지 않음, 불변 3). 고치기는 없다(떼고 다시 붙인다).
-- 칸 단위 권한: 사용자는 tech_id·tag만 넣는다. user_id는 기본값(auth.uid())이고 정책이 본인인지 한 번 더 본다(11-21 권한 점검 의심 3에서 배운 것).
-- 한도(기술당 10개, 종류 50개, 합 1,000개)는 DB 트리거가 지킨다: 서버를 건너뛴 직접 호출(사용자 토큰으로 PostgREST)이나 동시 요청도 못 넘게.
-- 서버(lib/server/my-tech-tags.ts)도 같은 값으로 먼저 보고 쉬운 말로 알려 준다. 비밀값 모양 거르기는 서버만 한다
-- (shortcut: 직접 호출하면 비밀값 모양도 넣을 수 있다. 본인만 읽는 줄이라 남에게 새지 않는다. 막으려면 쓰기를 security definer 함수 하나로 모은다).

create table public.my_tech_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  tech_id uuid not null references public.technologies (id),
  -- 제어 문자: C0(\x01–\x1f)·DEL·C1(\x7f–\x9f). 서버 normalizeTag와 같은 범위(NUL은 text에 들어오지 못한다)
  tag text not null check (char_length(tag) between 1 and 30 and tag = btrim(tag) and tag !~ '[\x01-\x1f\x7f-\x9f]'),
  created_at timestamptz not null default now()
);
create unique index my_tech_tags_one on public.my_tech_tags (user_id, tech_id, lower(tag));
create index my_tech_tags_tech_id on public.my_tech_tags (tech_id);  -- 기술 쪽 외래 키 확인용

-- 한도. 같은 사람의 넣기를 잠금으로 줄 세워(트랜잭션 끝까지) 동시에 넣어도 센 수가 어긋나지 않게 한다. 문구 첫머리 "태그 한도:"를 서버가 알아본다
create function public.my_tech_tags_limits() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('my_tech_tags:' || new.user_id::text, 0));
  -- 같은 기술에 같은 태그가 이미 있으면 한도를 세지 않는다: 유일 색인이 "이미 붙어 있음"(23505)으로 막게(한도 꽉 찬 때 다시 붙여도 한도 오류가 아니게, 불변 3)
  if exists (select 1 from public.my_tech_tags where user_id = new.user_id and tech_id = new.tech_id and lower(tag) = lower(new.tag)) then
    return new;
  end if;
  if (select count(*) from public.my_tech_tags where user_id = new.user_id and tech_id = new.tech_id) >= 10 then
    raise exception '태그 한도: 기술당 10개';
  end if;
  if (select count(*) from public.my_tech_tags where user_id = new.user_id) >= 1000 then
    raise exception '태그 한도: 합 1000개';
  end if;
  if not exists (select 1 from public.my_tech_tags where user_id = new.user_id and lower(tag) = lower(new.tag))
     and (select count(distinct lower(tag)) from public.my_tech_tags where user_id = new.user_id) >= 50 then
    raise exception '태그 한도: 종류 50개';
  end if;
  return new;
end $$;
revoke all on function public.my_tech_tags_limits() from public, anon, authenticated;
create trigger my_tech_tags_limits before insert on public.my_tech_tags
  for each row execute function public.my_tech_tags_limits();

alter table public.my_tech_tags enable row level security;
revoke all on public.my_tech_tags from anon, authenticated;
grant select (id, user_id, tech_id, tag, created_at) on public.my_tech_tags to authenticated;
grant insert (tech_id, tag) on public.my_tech_tags to authenticated;
grant delete on public.my_tech_tags to authenticated;

create policy my_tech_tags_select_own on public.my_tech_tags for select to authenticated
  using (user_id = (select auth.uid()));
create policy my_tech_tags_insert_own on public.my_tech_tags for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy my_tech_tags_delete_own on public.my_tech_tags for delete to authenticated
  using (user_id = (select auth.uid()));
