# TechRadar

AI 코딩 도구(Claude Code·Cursor·Codex 등)로 만드는 사람이 **내가 깐 기술의 목록·보안·더 나은 대안**을 한눈에 보고, 바깥 변화가 생기면 알림을 받아 **판단하고 기록**하며, 목록을 **설치 프롬프트**로 만들어 다른 컴퓨터에서도 다시 세팅할 수 있게 하는 서비스입니다. 기준 문장: **지키고, 고르고, 옮긴다.**

> **상태(2026-11-20, main `240b4e4` 기준):** 개발 단계, **코드 동결 11-23(월) 18:00 · 제출 23:59**. 합친 PR 191개(열린 PR 0개). 수집(OSV·GitHub·레지스트리·다운로드·스킬 폴더)부터 알림·판단·기록, 대응안 초안·적용 시나리오(Claude), 첫 화면 기술 지도(로그인 전에도 보임), 알림 없는 판단(관심·적용 후보·보류), 취향·추천, 사용기·신고, 설치 프롬프트(알파), 흐름 화면·시뮬레이터·실패 시연·채점, 관리자 화면, 위키 18쪽과 위키 챗봇까지 main과 운영에 있습니다. 남은 큰 일은 사람 QA(No Run), 지도 속도(3초 목표, 지금 4.3초), 발표 자료 빈칸, erd 팀 대조(동결 직후), 위키 갱신입니다. 조각별 현황은 [plan](docs/plan.md) 4절, 제출물 현황은 [체크리스트](docs/제출물-체크리스트.md).
> 운영 배포는 앱 파일이 바뀐 병합만 GitHub Actions가 부르므로(ADR 0023) main보다 늦을 수 있습니다.

## 링크

| 무엇 | 위치 |
|---|---|
| 서비스(배포 주소) | https://techradar-theta.vercel.app |
| 발표 자료 | [`slides/index.html`](slides/index.html) (초안 15장, "▢ 채울 것" 빈칸 있음). **발표 주소: https://techradar-slides.vercel.app** (서비스와 별개 Vercel 프로젝트, `slides/index.html` 한 파일. 외부 파일 없이 열려 그대로 오프라인 파일로 씀). 슬라이드를 고치면 다시 올린다 |
| QA | [QA(영역 A·B·공용)](docs/qa.md) · [QA(영역 C)](docs/qa-c.md) · [위키 챗봇 정답표](docs/wiki-chat.md). 구글 QA 시트는 없음(표를 위 md 파일로 대신함) |
| 관리자 쓰는 법 | [관리자 사용설명서](docs/관리자-사용설명서.md) |
| 위키 | [위키 목차](wiki/index.md) (출처 달린 팀 문서 요약 18쪽), 챗봇은 배포 주소의 `/admin/chat`(관리자만) |

## 팀원

| 이름 | GitHub | 영역 | 맡은 것 |
|---|---|---|---|
| 김영식 | [sikomar00](https://github.com/sikomar00) | A 지키기 (내 기술·보안) | 뼈대 앱·DB 마이그레이션, 저장소 읽기·수집기, 등급·위험 패턴, 로그인·첫 점검·지도 |
| 황재웅 | [hjw12345-git](https://github.com/hjw12345-git) | B 고르기 (알림·판단·기록) | 알림 목록·상세, 판단 저장, 대응안 초안·적용 시나리오(Claude), 적용 기회·비교표, 대시보드·기록 찾기 |
| 차세일 | [csaeil](https://github.com/csaeil) | C 옮기기·운영 | 실행 기록·흐름 화면, 정기 실행·지금 실행, 시뮬레이터·실패 시연·채점, 관리자 화면, 설치 프롬프트, 위키·챗봇 |

## 대표 PR과 리뷰

PR마다 팀원 1명 이상이 승인한 뒤 합쳤습니다(main 보호는 11-18부터, 그 전 PR #1–#24는 리뷰 없이 합침). 전체 목록은 [GitHub의 합친 PR](https://github.com/tempTechRadar/TechRadar/pulls?q=is%3Apr+is%3Amerged).

| 사람 | PR | 무엇 | 승인한 사람 |
|---|---|---|---|
| 김영식 | [#33](https://github.com/tempTechRadar/TechRadar/pull/33) | 등록 → 저장소 읽기 → OSV → 등급 → 변경(P-3, 얇은 한 줄의 앞부분) | 황재웅 |
| 김영식 | [#87](https://github.com/tempTechRadar/TechRadar/pull/87) | 정기 OSV 재확인: 매일 다시 묻고 새로 위험해지면 변경·알림(P-9d) | 황재웅 |
| 황재웅 | [#43](https://github.com/tempTechRadar/TechRadar/pull/43) | 판단 저장(적용 후보·보류)과 상세 판단 카드(P-8) | 김영식 |
| 황재웅 | [#120](https://github.com/tempTechRadar/TechRadar/pull/120) | 적용 시나리오: 알림 상세 카드와 Claude 호출(P-15) | 김영식 |
| 차세일 | [#46](https://github.com/tempTechRadar/TechRadar/pull/46) | 흐름 화면 완성: 화살표 건수·상자 상세·실행 목록·내 실행 기록(P-20) | 김영식 |
| 차세일 | [#125](https://github.com/tempTechRadar/TechRadar/pull/125) | 위키 챗봇: 위키 쪽만 근거, 출처 표시, 없으면 "위키에 없습니다"(P-26) | 황재웅 |

## 어디부터 읽나

| 순서 | 문서 | 무엇 |
|---|---|---|
| 1 | [문제정의](docs/문제정의.md) | 누가 무엇을 놓쳐 어떤 손해를 보나, 인터뷰 근거 |
| 2 | [IA](docs/ia.md) · [사용자 여정](docs/uj.md) | 화면과 하루 흐름 |
| 3 | [PRD](docs/prd.md) | 요구, 필수 8가지 대응, 만드는 순서, 안 할 것 |
| 4 | [데이터설계](docs/데이터설계.md) · [ERD](docs/erd.md) | 관계, 권한, 카탈로그 기준 / 테이블과 칸(정본) |
| 5 | [spec](docs/spec.md) · [흐름](docs/flow.md) | 사건 기준, 승인 규칙, 알림 문구 / 흐름 화면의 상자와 화살표 |
| 6 | [plan](docs/plan.md) | 누가 어느 조각을 언제, 먼저 필요한 것, 끝 기준 |
| 7 | [결정 기록](docs/adr/) · [용어집](docs/GLOSSARY.md) | 왜 그렇게 정했나, 말의 뜻 |
| — | [작업 의도](docs/intent.md) · [작업 로그](docs/worklog.md) · [체크리스트](docs/제출물-체크리스트.md) | 진행 기록 |
| — | [인터뷰](interviews/) · [서브에이전트](docs/agents.md) · [커넥터](docs/connectors.md) · [오류와 해결](docs/debug-note.md) · [팀 스킬](.claude/skills/) | 과정 기록 |
| — | [채점](eval/result.md) · [시뮬레이터 입력](sim/) · [흐름 정의](flow/flow.json) · [수집 샘플](watch/samples/) | 확인 자료 |
| — | [관리자 사용설명서](docs/관리자-사용설명서.md) · [QA(영역 A·B·공용)](docs/qa.md) · [QA(영역 C)](docs/qa-c.md) · [위키](wiki/index.md) | 관리자 화면 쓰는 법(쉬운 말), 영역 C 확인 결과, 출처 달린 팀 문서 요약 |

## 팀 규칙
- 팀 공용 규칙: [CLAUDE.md](CLAUDE.md), [rules/](rules/)
- 조각 하나 = 브랜치 하나, `main`에 직접 커밋하지 않고 PR은 팀원 1명 이상 리뷰 후 합칩니다.
- 비밀값은 `.env`에만 둡니다. 저장소·문서·채팅에 쓰지 않습니다.

## 실행 방법
Node 20.9 이상(팀은 24)이 필요합니다.

```bash
npm install
cp .env.example .env.local   # 값은 각자 직접 넣는다(채팅·문서에 쓰지 않음)
npm run dev                  # http://localhost:3000
npm test                     # 단위 테스트
npm run typecheck && npm run build
```

키를 넣기 전에는 첫 화면에 "Supabase 연결 전"이 보이는 것이 정상입니다.
