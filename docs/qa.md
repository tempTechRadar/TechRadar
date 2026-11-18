# QA

상태는 Pass / Fail / No Run. 자동 채점과 사람이 눌러 본 QA를 나눠 적는다. 실행하지 못한 것은 No Run으로 둔다.

## Claude QA (자동·직접 실행)
| 검사 항목 | 입력이나 행동 | 기대 결과 | 실제 결과 | 상태 | 수행자, 날짜 | 증거 |
|---|---|---|---|---|---|---|
| RLS·불변 1·3·4·5 (P-2) | `supabase/tests/rls_m0.sql`: 사용자 2명·관리자 1명을 만들어 시험하고 전부 되돌림 | 남의 줄 0건, 남의 알림 판단·역할 바꾸기·서비스 키 판단·같은 알림 두 번·고친 버전 없는 적용 후보·짧은 보류 이유 모두 막힘, 실패 뒤 알림은 판단 대기 그대로, 관리자는 전체 읽기만 | 26개 모두 기대값. 시험 뒤 시험 계정 0개·데이터 0줄 | Pass | Claude, 2026-11-18 | `rls_m0.sql` 결과 메시지, PR(P-2) |
| erd ↔ 실제 DB 1차 대조 (P-2) | Supabase `list_tables` | M0 테이블 13개, 모두 RLS 켜짐 | 13개, RLS 켜짐, 출처 8줄 | Pass(팀 확인 대기) | Claude, 2026-11-18 | `docs/erd.md` 7절 |
| 내 버전 등급 칸·사용자 수정 막기 (P-3, 불변 5) | `supabase/tests/my_tech_grade_p3.sql`: 사용자 2명이 같은 기술 다른 버전, 사용자로 등급 고치기·숨김 시도, 끝에서 전부 되돌림 | 두 버전이 각자 등급, 등급 고치기 막힘, 본인 숨김은 됨, 등급 그대로 | `two_versions_two_grades=2`, `user_edit_grade_blocked=YES`, `user_hide_own=1`, `grade_kept=danger`. 시험 뒤 시험 계정 0개·기술 0줄. 사용자가 고칠 수 있는 칸 = `hidden_at`·`manual_name`·`version` | Pass | Claude, 2026-11-18 | `my_tech_grade_p3.sql` 결과 메시지, PR(P-3) |
| P-3 실제 DB 끝까지 (PRD-F4·F6·F10·F11, 불변 2·3) | 스크래치패드 스크립트로 `registerAndRead` 직접 호출. 시험 계정 1개(비밀번호 없음), 저장소 파일은 가짜(`mcp-remote` 0.1.15·`@anthropic-ai/sdk` ^0.30.0·react, `.mcp.json`에 같은 mcp-remote와 직접 만든 서버), OSV·DB는 진짜. 같은 저장소 두 번 읽기 + 실제 GitHub(`tempTechRadar/TechRadar`) 읽기. 끝에서 전부 지움 | react 빠짐, mcp-remote 0.1.15 위험, 변경 1건, 다시 읽어도 1건, 실행 기록 단계 6개, 실행이 닫힘 | 내 기술 3줄(mcp-remote 위험·원인 GHSA-6xpm-ggf7-wc3p, anthropic sdk 버전 모름 → 주의, 직접 만든 서버 → 찾지 못함), react 없음, 변경 1건(두 번째 읽기 뒤에도 1건), 수집 자료 2건(두 번째 읽기는 바뀐 값 없어 0건), 단계 fetch_repo→extract_my_tech→fetch_osv→grade→is_event→save_change, 실행 2개 모두 `failed`로 닫힘(알림 만들기 P-7이 아직 자리만이라 예상대로). 실제 GitHub 읽기: AI 도구 0개, 성공. 시험 뒤 계정·줄 모두 0 | Pass(알림 단계 제외) | Claude, 2026-11-18 | PR #33 |
| RLS·불변 5 (P-30 M1 테이블 7개) | `supabase/tests/rls_m1.sql`: 사용자 2명·관리자 1명, 7개 표에 줄을 만들고 끝에서 전부 되돌림 | 남의 시나리오·내보내기·등급 열람 0건, 관리자 전용 표(목록·AI 호출·챗봇) 사용자 0건, 본문을 채운 시나리오 요청 막힘, 남의 알림에 시나리오 요청·남 이름으로 열람 기록·목록 추가 막힘, 사용자 관계 확정 0줄, 시나리오 상태 고치기 막힘, 관리자는 관계 확정만(인용 고치기 막힘), 지우기 막힘, 로그인 안 한 사람 막힘, 허용 목록 28줄 | 24개 모두 기대값(보안 검토 반영 뒤 한 줄 더함). 시험 뒤 시험 계정 0개·시험 줄 0(허용 목록 28줄만 남음). 사용자가 넣을 수 있는 시나리오 칸 = `alert_id`·`requested_by`. 보안 점검 새 경고 없음 | Pass | Claude, 2026-11-18 | `rls_m1.sql` 결과 메시지, PR(P-30) |
| 등급 정답 사례 G1–G9 (P-10, SPEC-2·10) | `lib/domain/gold-cases.test.ts`: G1–G4는 2026-11-18에 실제로 조회한 OSV 응답(`lib/domain/fixtures/`)을 `gradeFromOsv`에, G6–G9는 `sim/skills/`의 가상 스킬 4개를 `scanRiskPatterns`+`gradeFromFindings`에 넣음 | G1–G4 위험(원인 id·고친 버전 일치), G5 최신 버전 OSV 0건, G6·G7 위험(P1·P2만), G8 주의(P3만), G9 통과(발견 0) | 시험 9개 모두 기대값 + `todo` 1개. G2 고친 버전 0.16.6, G4 1.28.1(처음 취약점의 고친 버전으로는 위험이 남아 규칙을 고침, SPEC-1). G5는 OSV 0건까지만 확인(2026-11-18 조회 기록), 기대 등급 "통과"는 저장소 정보(P-9) 뒤라 `todo` | Pass(G5 등급은 No Run, P-9 뒤) | Claude, 2026-11-18 | PR(P-10) |
| 위험 패턴 검사 단위 (P-10, SPEC-2) | `lib/domain/risk-patterns.test.ts` | P1·P2·P3 찾는 줄과 아닌 줄(코드 검토가 재현한 놓침·잘못 울림 포함), 이어 쓴 명령, CRLF 줄 번호, 입력 순서·파일 이름 대소문자 무관, 긴 줄은 '통과' 아님, 발견 50개 상한에서 위험 유지, 소문자 머리글 비밀값 가림 | 15개 모두 기대값. **알려진 한계:** P2는 SPEC 그대로 "같은 파일"이라 정상 API 호출도 걸림(I-035 열린 질문 ①), GET 주소·문장 지시문·`allowed-tools` 여러 줄 목록은 못 찾음(③) | Pass |
| 고친 버전·버전 비교·패키지 걸러내기 (P-10 보강, SPEC-1) | `lib/domain/read-grade.test.ts` 새 시험 3개 | 백포트 줄은 내 줄에서, 안 고친 게 있으면 null, 사전 배포 < 정식 < post, 다른 패키지의 고친 버전·GIT 해시는 제외 | 3개 모두 기대값(백포트 시험은 고치기 전에 실패하는 것을 먼저 확인했고, 버전 비교·패키지 걸러내기 2개는 고친 뒤에 썼다. G2·G4의 고친 버전도 고치기 전 실패 확인) | Pass | Claude, 2026-11-18 | PR(P-10) | Claude, 2026-11-18 | PR(P-10) |

## 사람 QA
| 검사 항목 | 방법 | 정상이면 보이는 것 | 주의점 | 상태 | 수행자, 날짜 | 증거 |
|---|---|---|---|---|---|---|

## 남은 오류
