-- P-12a2 (작업 I-P-12a2-nickname-db, PRD-F1·F34·NF1, IA-1·IA-19, ADR 0009, 불변 5): 별명 규칙을 DB로, "쓰고 있어요" 수·별명을 세는 함수.
-- 새 칸은 없다(인덱스 1개·함수 5개·트리거 1개). 코드는 이 함수가 없어도 안 깨지게 만들었다(조회 실패는 "불러오지 못했어요"로 보임).
-- 같은 SQL을 다시 돌려도 오류가 나지 않게 썼다(인덱스·함수는 if not exists / create or replace, 트리거는 지우고 다시 만듦).

-- 1) 대소문자만 다른 별명(`Admin`·`admin`)이 둘 다 저장되던 것을 막는다. 기존 유니크(profiles_nickname_key)는 그대로 둔다.
create unique index if not exists profiles_nickname_lower_key on public.profiles (lower(nickname));

-- 2) 별명 규칙을 한 곳에: 가입 트리거와 별명 고치기(직접 PATCH 포함)가 같은 함수를 쓴다. 규칙은 `lib/domain/nickname.ts`와 같다.
--    PG 정규식에는 유니코드 범주(\p{..})가 없어 자주 쓰는 제어(C0·C1)·서식(Cf)·줄/문단 구분·빈칸으로 보이는 글자를 범위로 적었다: JS보다 조금 좁을 수 있다.
--    nickname_clean: NFC로 맞추고 앞뒤 공백(JS trim()과 같은 집합)을 뗀다. 비면 null.
create or replace function public.nickname_clean(p_raw text) returns text
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(normalize(coalesce(p_raw, ''), nfc),
    '^[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$', '', 'g'), '');
$$;

--    nickname_problem: 규칙에 안 맞으면 이유, 맞으면 null. 앞뒤를 이미 정리한(nickname_clean) 값을 준다.
create or replace function public.nickname_problem(p_nick text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_nick is null or char_length(p_nick) not between 2 and 30 then '길이는 2~30자로 해 주세요'
    when p_nick ~ '[\u0001-\u001f\u007f-\u009f\u00ad\u0600-\u0605\u061c\u06dd\u070f\u0890\u0891\u08e2\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb\u115f\u1160\u3164\uffa0\u2800\U000110bd\U00013430-\U0001343f\U0001d173-\U0001d17a\U000e0001\U000e0020-\U000e007f]'
      then '제어·서식 문자나 빈칸으로 보이는 글자는 쓸 수 없어요'
    when p_nick ~ '[@\uff20\ufe6b]' then '@는 쓸 수 없어요'
    when p_nick ~* '^user-[0-9a-f]{8}$' then '임시 별명 모양은 쓸 수 없어요'
  end;
$$;

-- 3) 가입 트리거: 구글 가입은 별명 메타데이터가 없어 임시 별명이 되고, 이메일 테스트 로그인의 signUp 메타데이터는 클라이언트가 정할 수 있어 규칙을 거친다.
--    안 맞거나 대소문자만 다른 중복이면 임시 별명(`user-` + id 앞 8자). 같은 별명으로 동시에 가입해 충돌하면 임시 별명으로 다시 시도한다.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_nick text := public.nickname_clean(new.raw_user_meta_data ->> 'nickname');
  v_provider text := case when new.raw_app_meta_data ->> 'provider' = 'google' then 'google' else 'email_test' end;
  v_temp text := 'user-' || left(new.id::text, 8);
begin
  -- 여기서 실패하면 가입 자체가 실패하기 때문에 던지지 않는다.
  if public.nickname_problem(v_nick) is not null
     or exists (select 1 from public.profiles where lower(nickname) = lower(v_nick)) then
    v_nick := v_temp;
  end if;
  begin
    insert into public.profiles (id, nickname, login_method) values (new.id, v_nick, v_provider);
  exception when unique_violation then
    insert into public.profiles (id, nickname, login_method) values (new.id, v_temp, v_provider);
  end;
  return new;
end;
$$;

-- 4) 별명 고치기(설정 화면이 아니라 anon 키와 본인 JWT로 직접 PATCH해도): 같은 규칙을 거친다. 안 맞으면 막고, 맞으면 NFC·공백 정리한 값으로 저장한다.
--    별명이 바뀔 때만 돈다(role·공개 여부만 바꾸는 갱신은 건드리지 않음).
create or replace function public.profiles_nickname_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_clean text := public.nickname_clean(new.nickname);
  v_problem text := public.nickname_problem(v_clean);
begin
  if v_problem is not null then
    raise exception '별명을 쓸 수 없어요: %', v_problem using errcode = 'check_violation';
  end if;
  new.nickname := v_clean;
  return new;
end;
$$;
drop trigger if exists profiles_nickname_guard on public.profiles;
create trigger profiles_nickname_guard before update of nickname on public.profiles
  for each row when (new.nickname is distinct from old.nickname) execute function public.profiles_nickname_guard();

-- 5) "쓰고 있어요"(PRD-F34): 그 기술을 쓰는 **공개한 사람**의 수와 별명(가나다순 최대 20개). 숨김을 켠 사람(is_public=false)·숨긴 기술(hidden_at)·
--    보관한 프로젝트(archived_at)·시연 계정(is_demo, 가짜 사용자처럼 보이지 않게)은 빠진다. 같은 사람이 여러 프로젝트에서 써도 한 번만 센다.
--    my_technologies는 본인·관리자만 읽을 수 있어(RLS) 사용자 권한으로는 남의 줄을 셀 수 없다: security definer로 **수와 별명만** 돌려주고 원본 줄은 내보내지 않는다.
create or replace function public.using_now(p_tech_id uuid) returns table (user_count integer, nicknames text[])
language sql stable security definer set search_path = '' as $$
  with owners as (
    select distinct p.id, p.nickname
    from public.my_technologies m
    join public.profiles p on p.id = m.owner_id
    left join public.projects pr on pr.id = m.project_id
    where m.tech_id = p_tech_id and m.hidden_at is null and p.is_public and not p.is_demo and pr.archived_at is null
  )
  select (select count(*) from owners)::integer,
         coalesce((select array_agg(s.nickname order by s.sort_key, s.nickname) from (select nickname, lower(nickname) as sort_key from owners order by lower(nickname), nickname limit 20) s), '{}'::text[]);
$$;
revoke execute on function public.using_now(uuid) from public, anon;
grant execute on function public.using_now(uuid) to authenticated;
