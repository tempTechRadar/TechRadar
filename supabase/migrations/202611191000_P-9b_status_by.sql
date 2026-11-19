-- P-9b · 기술 상태를 "누가 정했는지" 적는 칸(ADR 0021 "정한 출처", 데이터설계 8절)
-- 상태(active / dormant / deprecated / gone)를 여러 출처가 정한다: 공식 MCP 레지스트리(중단·삭제), GitHub(보관·12개월 무활동·404 두 번).
-- 칸이 없으면 한 출처의 "정상(active)"이 다른 출처가 정한 중단·사라짐을 되돌린다. 각 수집기는 자기가 정한 상태만 되돌린다.
-- 값: '<출처>:<그때의 상태>'(예 'github:dormant', 'mcp_registry:deprecated') 또는 null(기본 active이거나 정한 출처를 모름).
-- 적힌 상태가 지금 status와 다르면 다른 쪽이 status만 고친 것이라 정한 것으로 안 본다. 기존 줄은 null이라 아무도 되돌리지 않는다.
alter table public.technologies add column status_by text;
