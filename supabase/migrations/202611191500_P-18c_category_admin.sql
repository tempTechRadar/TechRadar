-- P-18c · 관리자가 기술의 갈래(category_id)를 정하거나 고친다(PRD-F24·F27, IA-17, 불변 5).
-- P-2가 로그인 사용자의 technologies 쓰기를 모두 막았다(쓰기는 서버). 여기서는 관리자에게 갈래 세 칸(갈래·정한 사람·시각)만 연다.
-- 같은 역할 확정(P-30 tech_relations_admin_confirm + 열 권한)과 같은 방식이다. 사유는 서버 동작이 audit_logs(서버 연결)에 남긴다(P-18b).
-- 정한 사람·시각 칸은 화면의 "관리자가 정함" 표시이고, 나중에 규칙·Claude 분류 제안(서버)이 관리자가 정한 갈래를 덮어쓰지 않게 하는 표시다(ADR 0021과 같은 생각).
-- category_score·category_rank(갈래 안 점수·순위)는 P-21 서버 칸이라 열지 않는다.
-- 갈래 목록(categories) 시드는 이 파일에 없다: 처음 목록은 팀 결정(데이터설계 DQ2).

alter table public.technologies
  add column category_set_by uuid references public.profiles (id),
  add column category_set_at timestamptz;

-- 정한 사람과 시각은 함께 있거나 함께 없다
alter table public.technologies
  add constraint technologies_category_set_pair check ((category_set_by is null) = (category_set_at is null));

-- 관리자만, 본인 이름으로, 작은 갈래(부모가 있는 갈래)로만. 비우기(null)는 받지 않는다.
create policy technologies_admin_set_category on public.technologies for update to authenticated
  using ((select public.is_admin()))
  with check (
    (select public.is_admin())
    and category_set_by = (select auth.uid())
    and category_id is not null
    and exists (select 1 from public.categories c where c.id = technologies.category_id and c.parent_id is not null)
  );

-- 열 권한: 이 세 칸 말고는 관리자도 못 바꾼다(등급·상태·이름·점수는 그대로 서버만). P-2의 revoke update는 그대로 두고 세 칸만 준다.
-- 일반 계정도 열 권한은 받지만 위 정책(using is_admin)이 update를 0줄로 만든다(tech_relations와 같은 구조).
grant update (category_id, category_set_by, category_set_at) on public.technologies to authenticated;
