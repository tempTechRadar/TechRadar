# QA

상태는 Pass / Fail / No Run. 자동 채점과 사람이 눌러 본 QA를 나눠 적는다. 실행하지 못한 것은 No Run으로 둔다.

## Claude QA (자동·직접 실행)
| 검사 항목 | 입력이나 행동 | 기대 결과 | 실제 결과 | 상태 | 수행자, 날짜 | 증거 |
|---|---|---|---|---|---|---|
| RLS·불변 1·3·4·5 (P-2) | `supabase/tests/rls_m0.sql`: 사용자 2명·관리자 1명을 만들어 시험하고 전부 되돌림 | 남의 줄 0건, 남의 알림 판단·역할 바꾸기·서비스 키 판단·같은 알림 두 번·고친 버전 없는 적용 후보·짧은 보류 이유 모두 막힘, 실패 뒤 알림은 판단 대기 그대로, 관리자는 전체 읽기만 | 26개 모두 기대값. 시험 뒤 시험 계정 0개·데이터 0줄 | Pass | Claude, 2026-11-18 | `rls_m0.sql` 결과 메시지, PR(P-2) |
| erd ↔ 실제 DB 1차 대조 (P-2) | Supabase `list_tables` | M0 테이블 13개, 모두 RLS 켜짐 | 13개, RLS 켜짐, 출처 8줄 | Pass(팀 확인 대기) | Claude, 2026-11-18 | `docs/erd.md` 7절 |
| 내 버전 등급 칸·사용자 수정 막기 (P-3, 불변 5) | `supabase/tests/my_tech_grade_p3.sql`: 사용자 2명이 같은 기술 다른 버전, 사용자로 등급 고치기·숨김 시도, 끝에서 전부 되돌림 | 두 버전이 각자 등급, 등급 고치기 막힘, 본인 숨김은 됨, 등급 그대로 | `two_versions_two_grades=2`, `user_edit_grade_blocked=YES`, `user_hide_own=1`, `grade_kept=danger`. 시험 뒤 시험 계정 0개·기술 0줄. 사용자가 고칠 수 있는 칸 = `hidden_at`·`manual_name`·`version` | Pass | Claude, 2026-11-18 | `my_tech_grade_p3.sql` 결과 메시지, PR(P-3) |

## 사람 QA
| 검사 항목 | 방법 | 정상이면 보이는 것 | 주의점 | 상태 | 수행자, 날짜 | 증거 |
|---|---|---|---|---|---|---|

## 남은 오류
