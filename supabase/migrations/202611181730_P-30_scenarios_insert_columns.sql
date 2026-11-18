-- P-30 보안 검토 반영: 사용자는 시나리오를 "요청"만 한다. 본문·출처·상태·끝난 시각은 서버만 쓴다(erd 2.5).
-- 앞 마이그레이션은 행 정책만 있어서 사용자가 body·sources를 채워 넣은 채로 만들 수 있었다.
revoke insert on public.scenarios from authenticated;
grant insert (alert_id, requested_by) on public.scenarios to authenticated;
-- exports·grade_views는 사용자 본인의 행동 기록이라 본인이 만드는 것이 erd 4절 규칙이다(숫자를 부풀려도 본인 기록뿐).
