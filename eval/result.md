# 채점 결과 (PRD-F30)

- 언제: 2026. 11. 21. 19시 26분 28초 · 등급 규칙 v1 · 정답: eval/gold.json (SPEC-10)
- 사건: 맞게 울림 6 · 맞게 조용함 6 · **놓침 0** · **잘못 울림 0** (사례 12)
- 등급 맞음 12/12 · 실행 실패 0

| 사례 | 대상 | 출처 | 기대 등급 | 실제 등급 | 등급 | 사건 판정 | 비고 |
|---|---|---|---|---|---|---|---|
| G1 | npm mcp-remote | 실수집 | 위험 | 위험 | 맞음 | 맞음 |  |
| G2 | npm @modelcontextprotocol/inspector | 실수집 | 위험 | 위험 | 맞음 | 맞음 |  |
| G3 | npm @modelcontextprotocol/server-filesystem | 실수집 | 위험 | 위험 | 맞음 | 맞음 |  |
| G4 | PyPI mcp | 실수집 | 위험 | 위험 | 맞음 | 맞음 |  |
| G5a | @modelcontextprotocol/inspector 최신 | 실수집 | 통과 또는 주의 | 통과 | 맞음 | 맞음 |  |
| G5b | @modelcontextprotocol/server-filesystem 최신 | 실수집 | 통과 또는 주의 | 통과 | 맞음 | 맞음 |  |
| G5c | mcp-remote 최신 | 실수집 | 통과 또는 주의 | 통과 | 맞음 | 맞음 |  |
| G5d | mcp 최신 | 실수집 | 통과 또는 주의 | 통과 | 맞음 | 맞음 |  |
| G6 | 시험용 스킬 skill-a-remote-exec | 가상 | 위험 | 위험 | 맞음 | 맞음 |  |
| G7 | 시험용 스킬 skill-b-secret-leak | 가상 | 위험 | 위험 | 맞음 | 맞음 |  |
| G8 | 시험용 스킬 skill-c-wide-permission | 가상 | 주의 | 주의 | 맞음 | 맞음 |  |
| G9 | 시험용 스킬 skill-d-clean | 가상 | 통과 | 통과 | 맞음 | 맞음 |  |

## 사건 종류·경계 사례 (eval/gold.json `edgeCases`)

- 사건: 맞게 울림 18 · 맞게 조용함 26 · **놓침 0** · **잘못 울림 0** · **결과 다름 0** (사례 44) · 실행 실패 0
- 결과 다름 = 사건 수는 맞지만 앱이 낸 결과가 정답과 다름(예: 수집 오류를 변화 없음으로 봄).
- 진짜 함수: queryOsv·gradeFromOsv·causeIdsOf·isChanged·planDanger·changeKey·decideAlerts·decideOpportunityAlerts·validateJudgment·saveJudgment(저장 실패는 시연 스위치의 failingRpc를 끼움).
- 손으로 따라 쓴 수집기 분기(DB에 묶여 부를 수 없음, lib/eval/edge.ts): checkOne(오류 → 수집 오류)·gradeOf(등급 읽기 실패 → parse)·applyResult(위험 아니면 비교)·readLatestChange(원인·별칭이 같은 변경의 가장 큰 회차)·saveGrade(위험 아님 시각)·createSecurityAlerts(이미 있는 알림 키). 이 순서가 수집기와 어긋나면 채점이 못 잡는다.
- 판단 저장 실패(조치·저장 실패)는 앱 쪽만 본다: 진짜 saveJudgment가 실패를 돌려주는지, 흐름의 조치 상자가 실패로 칠해지는지(actionOutcomeOf), 메모리 속 알림 한 줄이 그대로인지.
- 채점 밖(DB가 있어야 함): save_judgment 한 거래 안의 되돌림(DB 함수 자체)·저장은 됐는데 응답이 끊긴 경우, changes.dedupe_key·alerts(user_id, dedupe_key) 유일 제약, 수집기 전체 흐름(runBatch·실행 기록).

| 종류 | 사례 | 맞음 | 놓침 | 잘못 울림 | 결과 다름 |
|---|---|---|---|---|---|
| 보안 경고 | 6 | 6 | 0 | 0 | 0 |
| 적용 기회 | 13 | 13 | 0 | 0 | 0 |
| 변화 없음 | 3 | 3 | 0 | 0 | 0 |
| 수집 실패 | 10 | 10 | 0 | 0 | 0 |
| 거절·보류 | 6 | 6 | 0 | 0 | 0 |
| 두 번 입력 | 5 | 5 | 0 | 0 | 0 |
| 조치·저장 실패 | 1 | 1 | 0 | 0 | 0 |

| 사례 | 종류 | 대상 | 출처 | 기대 결과 | 실제 결과 | 판정 | 비고 |
|---|---|---|---|---|---|---|---|
| E-sec-new-danger | 보안 경고 | mcp-remote 0.1.15: 통과였다가 OSV에 CRITICAL | SPEC-3.1 보안 등급 바뀜 · G1 | 새 변경 grade_to_danger r1 · change:npm:mcp-remote@0.1.15:GHSA-6xpm-ggf7-wc3p:r1 | 새 변경 grade_to_danger r1 · change:npm:mcp-remote@0.1.15:GHSA-6xpm-ggf7-wc3p:r1 | 맞음 |  |
| E-sec-first-seen | 보안 경고 | PyPI mcp 1.9.3: 처음 등록부터 위험 | SPEC-3.1 처음 확인한 위험 · G4 | 새 변경 first_seen_danger r1 · change:pypi:mcp@1.9.3:GHSA-3qhf-m339-9g5v:r1 | 새 변경 first_seen_danger r1 · change:pypi:mcp@1.9.3:GHSA-3qhf-m339-9g5v:r1 | 맞음 |  |
| E-sec-danger-again | 보안 경고 | inspector 0.14.0: 위험 → 고쳐짐 → 다시 위험 | SPEC-3.1 위험이 된 회차 · G2 | 새 변경 grade_to_danger r2 · change:npm:@modelcontextprotocol/inspector@0.14.0:GHSA-7f8r-222p-6f5g:r2 | 새 변경 grade_to_danger r2 · change:npm:@modelcontextprotocol/inspector@0.14.0:GHSA-7f8r-222p-6f5g:r2 | 맞음 |  |
| E-sec-fixed | 보안 경고 | mcp-remote 0.1.15: 위험이었는데 OSV가 '없음'({})으로 답함(가상) | SPEC-3.4 위험 → 위험 아님(고쳐짐)은 알림 없음 | 바뀜(사건 아님) | 바뀜(사건 아님) | 맞음 |  |
| E-sec-other-cause | 보안 경고 | mcp-remote 0.1.15: 다른 원인(가상 GHSA-bbbb)의 변경만 있는데 새 원인 GHSA-6xpm | SPEC-3.1 중복 막기 키(원인이 다르면 다른 변경) · G1 | 새 변경 grade_to_danger r1 · change:npm:mcp-remote@0.1.15:GHSA-6xpm-ggf7-wc3p:r1 | 새 변경 grade_to_danger r1 · change:npm:mcp-remote@0.1.15:GHSA-6xpm-ggf7-wc3p:r1 | 맞음 |  |
| E-sec-fixed-then-danger | 보안 경고 | 두 번 읽음: 첫 번째 '없음'({}), 두 번째 다시 CRITICAL | SPEC-3.1 위험이 된 회차(고쳐짐 → 다시 위험) · G1 | 변경 1 · 알림 2 | 변경 1 · 알림 2 | 맞음 |  |
| E-same-danger | 변화 없음 | server-filesystem 2025.3.28: 어제와 같은 위험을 다시 읽음 | SPEC-3.4 같은 값을 다시 읽음 · SPEC-3.1 · G3 · 불변 3 | 위험 이어짐(새 변경 없음) | 위험 이어짐(새 변경 없음) | 맞음 |  |
| E-same-danger-alias | 변화 없음 | mcp-remote 0.1.15: 같은 위험이 별칭(CVE-2025-6514)으로 저장돼 있음 | SPEC-3.1 같은 취약점의 별칭은 같은 원인 · 불변 3 · G1 | 위험 이어짐(새 변경 없음) | 위험 이어짐(새 변경 없음) | 맞음 |  |
| E-same-none | 변화 없음 | mcp-remote 0.16.6(최신): 어제도 오늘도 취약점 0건 | SPEC-3.4 같은 값을 다시 읽음 · G5c | 변화 없음 | 변화 없음 | 맞음 |  |
| E-collect-404 | 수집 실패 | OSV가 404 | 불변 2 · SPEC-3.4 수집 실패 · SPEC-8 | 수집 오류 | 수집 오류 | 맞음 | http_status |
| E-collect-404-was-danger | 수집 실패 | 위험이던 기술을 다시 묻는데 OSV가 404 | 불변 2(사라짐·고쳐짐으로 단정 안 함) · SPEC-1 수집 오류 · G1 | 수집 오류 | 수집 오류 | 맞음 | http_status |
| E-collect-503 | 수집 실패 | OSV가 503 | 불변 2 · SPEC-8 | 수집 오류 | 수집 오류 | 맞음 | http_status |
| E-collect-429 | 수집 실패 | OSV 한도 초과 429 | 불변 2 · SPEC-8 | 수집 오류 | 수집 오류 | 맞음 | rate_limited |
| E-collect-network | 수집 실패 | 연결 실패 | 불변 2 · SPEC-8 | 수집 오류 | 수집 오류 | 맞음 | network |
| E-collect-timeout | 수집 실패 | 시간 초과 | 불변 2 · SPEC-8 | 수집 오류 | 수집 오류 | 맞음 | timeout |
| E-collect-shape | 수집 실패 | 200인데 모양이 다름([]) | 불변 2 · SPEC-8 | 수집 오류 | 수집 오류 | 맞음 | parse |
| E-collect-html | 수집 실패 | 200인데 HTML(점검 화면) | 불변 2 · SPEC-8 | 수집 오류 | 수집 오류 | 맞음 | parse |
| E-collect-grade-parse | 수집 실패 | 200이고 모양도 맞지만 심각도 칸이 숫자(등급으로 못 읽음) | 불변 2 · SPEC-8 · 수집기 gradeOf(해석 실패) | 수집 오류 | 수집 오류 | 맞음 | parse |
| E-collect-next-page | 수집 실패 | 200인데 첫 쪽만 오고 다음 쪽 표시(next_page_token)가 붙음(가상) | 불변 2 · SPEC-3.4 수집 실패 · intent I-P-3-osv-404 열린 질문(next_page_token 무시) | 수집 오류 | 수집 오류 | 맞음 | parse |
| E-opp-basic | 적용 기회 | 확정된 같은 역할 + 등록 뒤 들어온 새 기술 + 통과 | SPEC-3.2 조건 1·2·3 | 알림 1(u1) | 알림 1(u1) | 맞음 |  |
| E-opp-candidate-only | 적용 기회 | 같은 역할이 후보일 뿐(확정 아님) | SPEC-3.2 조건 1 · SPEC-4.4 · ADR 0015 | 알림 0 | 알림 0 | 맞음 |  |
| E-opp-new-danger | 적용 기회 | 새 기술이 위험 | SPEC-3.2 조건 3 | 알림 0 | 알림 0 | 맞음 |  |
| E-opp-deprecated | 적용 기회 | 새 기술이 지원 종료(deprecated) | SPEC-3.2 · 추가 규칙 I-P-14-skip-deprecated-new-tech(spec에는 아직 없음) | 알림 0 | 알림 0 | 맞음 |  |
| E-opp-unknown-grade | 적용 기회 | 새 기술이 찾지 못함(위험 아님) | SPEC-3.2 조건 3(위험이 아님) | 알림 1(u1) | 알림 1(u1) | 맞음 |  |
| E-opp-old-tech | 적용 기회 | 새 기술도 확정도 내가 등록하기 전 | SPEC-3.2 조건 2 | 알림 0 | 알림 0 | 맞음 |  |
| E-opp-confirmed-later | 적용 기회 | 새 기술은 전부터 있었지만 등록 뒤에 같은 역할로 확정 | SPEC-3.2 조건 2(괄호) | 알림 1(u1) | 알림 1(u1) | 맞음 |  |
| E-opp-sim-demo-only | 적용 기회 | 시뮬레이터 가짜 변경: 시연 계정에만 | SPEC-3.5 | 알림 1(u-demo) | 알림 1(u-demo) | 맞음 |  |
| E-opp-stars-below | 적용 기회 | 새 기술의 별 수가 알려져 있고 99(하한 100 미만) | SPEC-3.2 조건 4 · ADR 0033 · ADR 0014 개정 | 알림 0 | 알림 0 | 맞음 |  |
| E-opp-stars-at-min | 적용 기회 | 새 기술의 별 수가 알려져 있고 정확히 100(하한) | SPEC-3.2 조건 4 · ADR 0033 · ADR 0014 개정 | 알림 1(u1) | 알림 1(u1) | 맞음 |  |
| E-opp-stars-unknown | 적용 기회 | 새 기술의 별 수를 모름(null): 낮다고 단정하지 않는다(불변 2) | SPEC-3.2 조건 4 · ADR 0033 · ADR 0014 개정 | 알림 1(u1) | 알림 1(u1) | 맞음 |  |
| E-opp-flagged | 적용 기회 | 별은 5000인데 의심 표시(candidate_flags)가 붙은 별 후보 | SPEC-3.2 조건 4 · ADR 0033 · ADR 0014 개정 | 알림 0 | 알림 0 | 맞음 |  |
| E-opp-sim-low-stars | 적용 기회 | 시뮬레이터 변경은 별 3개·의심 표시여도 조건 4를 적용하지 않음(시연 계정에만) | SPEC-3.2 조건 4 · ADR 0033 · ADR 0014 개정 | 알림 1(u-demo) | 알림 1(u-demo) | 맞음 |  |
| E-twice-danger | 두 번 입력 | G1 위험을 두 번 읽음(쓰는 사람 2명) | 불변 3 · SPEC-3.1 중복 막기 키 · G1 | 변경 1 · 알림 2 | 변경 1 · 알림 2 | 맞음 |  |
| E-twice-danger-save-failed | 두 번 입력 | 첫 읽기 뒤 등급 저장이 실패한 채로 다시 읽음 | 불변 3 · SPEC-3.1 정기 OSV 재확인 문단 · G1 | 변경 1 · 알림 2 | 변경 1 · 알림 2 | 맞음 |  |
| E-twice-second-user | 두 번 입력 | 이어지는 위험: u1은 이미 받음, u2는 아직 → u2만 새 알림 | SPEC-3.1 처음 확인한 위험(두 번째 사용자도 받음) · 불변 3 · G1 | 변경 0 · 알림 1 | 변경 0 · 알림 1 | 맞음 |  |
| E-twice-collect-error | 두 번 입력 | 두 번 다 404 | 불변 2·3 | 변경 0 · 알림 0 | 변경 0 · 알림 0 | 맞음 |  |
| E-twice-opp | 두 번 입력 | 같은 적용 기회를 두 번 정함 | 불변 3 · SPEC-3.2 중복 막기 키 | 알림 1(u1) | 알림 1(u1) | 맞음 |  |
| E-judge-hold-short | 거절·보류 | 보류 이유 1자 | SPEC-4.1 보류 이유 5자 이상(입력 검사만) | 입력 검사 거절(저장 안 함) | 입력 검사 거절(저장 안 함) | 맞음 | 보류하는 이유를 5자 이상 적어 주세요. |
| E-judge-hold-spaces | 거절·보류 | 보류 이유가 빈칸으로 5자를 채움 | SPEC-4.1 보류 이유 5자 이상(입력 검사만) | 입력 검사 거절(저장 안 함) | 입력 검사 거절(저장 안 함) | 맞음 | 보류하는 이유를 5자 이상 적어 주세요. |
| E-judge-hold-keeps-version | 거절·보류 | 보류(=거절): 고친 버전으로 바꾸지 않음 | SPEC-4.1 '보류해도 버전은 그대로' · 불변 4 중 '거절 시 기존 값 보존'의 입력 쪽(저장 실패 되돌림은 DB라 채점 밖) | 저장으로 넘김 · hold · 고친 버전 없음 | 저장으로 넘김 · hold · 고친 버전 없음 | 맞음 |  |
| E-judge-candidate-no-fix | 거절·보류 | 고친 버전이 없는 보안 경고를 적용 후보로 | SPEC-5.2 · ADR 0012 | 입력 검사 거절(저장 안 함) | 입력 검사 거절(저장 안 함) | 맞음 | 고친 버전이 아직 없어서 적용 후보로 저장할 수 없어요. 보류로 남겨 주세요. |
| E-judge-candidate-fix | 거절·보류 | 보안 경고를 고친 버전으로 적용 후보 | SPEC-4.3 · ADR 0012 · G1 | 저장으로 넘김 · candidate · 고친 버전 0.1.16 | 저장으로 넘김 · candidate · 고친 버전 0.1.16 | 맞음 |  |
| E-judge-unknown | 거절·보류 | 정해진 두 가지 밖의 판단(approve) | SPEC-4.1 할 수 있는 일 · 불변 1 | 입력 검사 거절(저장 안 함) | 입력 검사 거절(저장 안 함) | 맞음 | 적용 후보나 보류 중에서 골라 주세요. |
| E-judge-save-failed | 조치·저장 실패 | 적용 후보를 눌렀는데 판단 저장(save_judgment)이 실패 | 불변 4(저장 실패 시 기존 값 보존, 처리 완료로 표시 안 함) · SPEC-4.1 · docs/flow.md 4절 ⑤ 저장 실패 시연(P-20c failingRpc) | 저장 실패 · 처리 완료 아님 · 조치 상자 실패 · 알림 판단 대기 · 기존 값 보존 | 저장 실패 · 처리 완료 아님 · 조치 상자 실패 · 알림 판단 대기 · 기존 값 보존 | 맞음 | 저장하지 못했어요. 다시 시도해 주세요. 알림은 아직 판단 대기예요. |

## 전체 (등급 사례 + 경계 사례)

- 사례 56 · 맞게 울림 24 · 맞게 조용함 32 · **놓침 0** · **잘못 울림 0** · **결과 다름 0** · 실행 실패 0
