-- 관리자가 일반 계정을 관리자로 지정한다(작업 I-P-admin-grant, IA-12 회원별 등록 · 안내서 2장 관리자 페이지 · 불변 5).
-- profiles.role은 로그인한 사람이 고칠 수 없다(열 권한은 nickname · is_public뿐, 202611181400). 그래서 이 함수로만 바꾼다:
--   1) 부른 사람이 관리자인지 DB가 다시 확인한다(화면 · 서버 검사와 별개, 불변 5).
--   2) 역할 변경과 바꾼 기록(audit_logs: 담당자 · 시각 · 사유)을 한 거래에서 함께 쓴다. 기록 없이 역할만 바뀌는 일이 없다.
--   3) 시연 계정(is_demo)은 여럿이 같이 쓰는 로그인이라 관리자로 만들지 않는다.
--   4) 낮추기(관리자 → 일반)는 넣지 않았다(요청 범위 밖. 마지막 관리자를 잃는 위험을 따로 정해야 함).
--      잘못 지정했을 때 되돌리기(김영식, SQL 편집기): update public.profiles set role = 'user' where id = '<대상 id>';
--      그리고 기록을 남긴다: insert into public.audit_logs (actor_id, actor_role, action, target_table, target_id, reason)
--      values (null, 'server', 'revoke_admin', 'profiles', '<대상 id>', '<사유>');
-- 돌려주는 값: 'granted'(바꿈) · 'already'(이미 관리자) · 'not_found' · 'demo' · 'reason'(사유 5~300자 아님). 관리자가 아니면 42501 오류.

create function public.admin_grant_admin(p_target uuid, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  v_role text;
  v_demo boolean;
begin
  if v_actor is null or not public.is_admin() then
    raise exception '관리자만 할 수 있다' using errcode = '42501';
  end if;
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

revoke execute on function public.admin_grant_admin(uuid, text) from public, anon;
grant execute on function public.admin_grant_admin(uuid, text) to authenticated;
