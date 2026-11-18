-- P-2 · 보안 점검(advisors) 경고 반영: security definer 함수의 실행 권한 좁히기
-- handle_new_user는 가입 트리거로만 돈다(API로 부를 일 없음). 트리거는 실행 권한과 상관없이 돈다.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- is_admin은 로그인한 사람의 RLS 규칙 안에서만 쓴다. 로그인 안 한 사람은 부를 수 없게.
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
-- save_judgment는 로그인한 사람이 자기 알림에 부르는 것이 목적이라 authenticated 실행을 남긴다(함수 안에서 본인 확인).
