-- 관리자가 다른 관리자를 일반 계정으로 되돌린다(작업 I-P-admin-revoke, 202611232300 admin_grant_admin의 짝, IA-12 · 불변 5).
-- 지정과 같은 방식: 부른 사람이 관리자인지 DB가 다시 보고, role 변경과 audit_logs(담당자 · 시각 · 사유)를 한 거래로 쓴다. 서비스 키로 바꾸지 않는다.
-- 막는 것:
--   1) 자기 자신은 되돌리지 않는다('self'). 실수로 스스로 관리자 화면을 잃지 않게.
--   2) 관리자가 한 명만 남게 되면 되돌리지 않는다('last_admin').
--   3) 동시에 일어나는 역할 변경(지정 · 되돌리기)은 거래 잠금 하나(pg_advisory_xact_lock)로 한 줄로 세운다. 잠금을 얻은 "뒤에" 부른 사람이
--      지금도 관리자인지 다시 본다(코드 리뷰 지적: 관리자 A·C가 동시에 서로 되돌리면, 먼저 끝난 쪽 때문에 일반이 된 사람이 남은 쪽을 되돌리는 틈).
--      잠금이 하나뿐이라 줄 잠금 순서가 엇갈려 생기는 교착도 없다.
-- 같은 이유로 admin_grant_admin(202611232300, 운영 적용됨)도 여기서 같은 잠금 · 재확인 순서로 다시 만든다(이름 · 인자 · 돌려주는 값은 그대로).
-- 돌려주는 값(되돌리기): 'revoked' · 'not_admin'(이미 일반) · 'not_found' · 'self' · 'last_admin' · 'reason'(사유 5~300자 아님). 관리자가 아니면 42501 오류.

create or replace function public.admin_grant_admin(p_target uuid, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_role text;
  v_demo boolean;
begin
  if v_actor is null then raise exception '관리자만 할 수 있다' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('techradar_admin_role_change'));
  if not public.is_admin() then raise exception '관리자만 할 수 있다' using errcode = '42501'; end if;
  if char_length(v_reason) not between 5 and 300 then return 'reason'; end if;
  select role, is_demo into v_role, v_demo from public.profiles where id = p_target for update;
  if not found then return 'not_found'; end if;
  if v_demo then return 'demo'; end if;
  if v_role = 'admin' then return 'already'; end if;
  update public.profiles set role = 'admin' where id = p_target;
  insert into public.audit_logs (actor_id, actor_role, action, target_table, target_id, reason)
  values (v_actor, 'admin', 'grant_admin', 'profiles', p_target::text, v_reason);
  return 'granted';
end $$;

create function public.admin_revoke_admin(p_target uuid, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_role text;
  v_admins int;
begin
  if v_actor is null then raise exception '관리자만 할 수 있다' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('techradar_admin_role_change'));
  -- 잠금을 기다리는 사이 다른 관리자가 나를 되돌렸을 수 있다: 잠근 뒤 새로 확인한다
  if not public.is_admin() then raise exception '관리자만 할 수 있다' using errcode = '42501'; end if;
  if char_length(v_reason) not between 5 and 300 then return 'reason'; end if;
  if p_target = v_actor then return 'self'; end if;
  select role into v_role from public.profiles where id = p_target for update;
  if not found then return 'not_found'; end if;
  if v_role <> 'admin' then return 'not_admin'; end if;
  select count(*) into v_admins from public.profiles where role = 'admin';
  if v_admins <= 1 then return 'last_admin'; end if;
  update public.profiles set role = 'user' where id = p_target;
  insert into public.audit_logs (actor_id, actor_role, action, target_table, target_id, reason)
  values (v_actor, 'admin', 'revoke_admin', 'profiles', p_target::text, v_reason);
  return 'revoked';
end $$;

revoke execute on function public.admin_grant_admin(uuid, text) from public, anon;
grant execute on function public.admin_grant_admin(uuid, text) to authenticated;
revoke execute on function public.admin_revoke_admin(uuid, text) from public, anon;
grant execute on function public.admin_revoke_admin(uuid, text) to authenticated;
