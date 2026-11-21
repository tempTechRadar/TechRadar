# 입문 세트 (카탈로그 후보 45개)

> **상태: 초안, 사용자 승인 전.** 운영 DB에는 넣지 않았다. 작업 `I-P-12d-starter-set`(2026-11-21).
> 왜: 기본 지도를 교육생 · 나 같은 사용자에게 맞게(스킬 · 개념 · 새 개발 도구) 보이려 해도, 운영 공개 목록이 MCP뿐이다(다른 세션의 운영 읽기, 11-21: mcp 공개 15,701 · skill 공개 0/전체 9 · concept 0/1). 사용자 결정 "자동 + 입문 세트"(ADR 0030 6~8항).
> 넣는 방법: 시드 마이그레이션 초안 `supabase/migrations/202611211200_P-12d_starter_set.sql` + 되돌림 시험 `supabase/tests/starter_set_p12d.sql` + 파일 검사 시험 `lib/server/starter-set-migration.test.ts`.

## 확인 방법 (잰 것 / 당사자 말 / 팀 추정)
- **잰 것:** 45개 모두 공식 페이지를 2026-11-21에 열어 확인했다(서브에이전트 3개가 나눠 확인, 메인 Claude가 8개를 다시 열어 200 응답 · 내용 확인). 스킬 · 플러그인은 GitHub API로 파일을 읽었다(웹 화면이 아니라 같은 파일). npm 패키지는 `registry.npmjs.org/<이름>/latest`로 이름 · 라이선스를 확인했다(npmjs.com 웹 페이지는 자동 접근 403).
- **당사자 말:** "출처"의 페이지 문구(공식 문서 · README · SKILL.md 설명)를 근거로 한 줄을 썼다.
- **팀 추정:** 한국어 한 줄의 말투와 갈래(하는 일) 배정은 Claude가 정했다. 사람이 한 번 봐 주어야 한다.

## 규칙
- **키:** 개념 `concept:<id>`(코드의 `harness` · `subagents` · `slash-commands`와 같은 키), 스킬 `skill:anthropics/skills/<이름>`(`skillKey` 규칙), 플러그인 `plugin:anthropics/claude-plugins-official/<이름>`(**새 규칙**: 지금까지 플러그인 키가 없었다. 스킬과 같은 모양으로), 도구 `npm:<패키지>` · `pypi:<패키지>`(종류 `sdk` = 화면의 "패키지").
- **한 줄 근거(`one_liner_source`):** 새 값 체계 없이 확인한 공식 주소 그대로(레지스트리 줄이 레지스트리 주소를 쓰는 것과 같다). 그래서 공개 목록 조건(근거 있음 · gone 아님 · 시뮬레이션 아님)에 든다.
- **NEW에서 뺀다:** `signals.registry_backfill = true`. 오래된 도구라 들어온 날이 새로 나온 날이 아니고, 넣는 순간 45개가 "이번 주 NEW" · 적용 기회 알림으로 쏟아지지 않게(`isBulkFilled`). `signals.starter_set = true`는 고르기 규칙이 쓸 표시.
- **이미 있는 줄:** 이름 · 종류 · 상태 · 등급은 건드리지 않고 비어 있는 칸만 채운다. 한 줄과 근거는 짝으로(둘 중 하나라도 없던 줄만 둘 다). 사용자 저장소에서 처음 본 개념 줄도 근거가 생겨 공개된다(ADR 0031). `signals`는 있던 표시가 이긴다(이번 주 들어온 줄의 NEW를 덮지 않음).
- **갈래:** 시드에서 정해 두면 매일 분류 단계가 덮지 않는다(비어 있는 것만 채움).

## ① Claude Code 개념 14개 (type `concept`, 등급 없음)
| 키 | 이름 | 갈래 | 한 줄 | 출처 |
|---|---|---|---|---|
| `concept:skills` | 스킬(Agent Skills) | 에이전트·오케스트레이션 | 할 일 설명서(SKILL.md)를 두면 AI가 필요할 때 꺼내 쓴다 | https://code.claude.com/docs/en/skills |
| `concept:subagents` | 서브에이전트 | 에이전트·오케스트레이션 | 특정 일을 따로 맡아 처리하는 작은 도우미 AI | https://code.claude.com/docs/en/sub-agents |
| `concept:hooks` | 훅(Hooks) | 에이전트·오케스트레이션 | 파일 수정 같은 정해진 순간에 내 명령을 자동으로 실행 | https://code.claude.com/docs/en/hooks-guide |
| `concept:slash-commands` | 슬래시 명령 | 에이전트·오케스트레이션 | /로 시작하는 명령으로 모델 바꾸기 · 초기화 등을 바로 실행 | https://code.claude.com/docs/en/commands |
| `concept:harness` | 지침 파일(CLAUDE.md · AGENTS.md) ※ | 메모리·컨텍스트 | 프로젝트 규칙을 적어 두면 AI가 시작할 때마다 읽는 파일 | https://code.claude.com/docs/en/memory |
| `concept:mcp` | MCP(Model Context Protocol) | 에이전트·오케스트레이션 | 외부 도구 · 데이터(DB, 슬랙 등)를 AI에 연결하는 표준 | https://code.claude.com/docs/en/mcp |
| `concept:plugins` | 플러그인 | 에이전트·오케스트레이션 | 스킬 · 훅 · MCP 등을 한 묶음으로 설치하는 꾸러미 | https://code.claude.com/docs/en/plugins |
| `concept:plugin-marketplaces` | 플러그인 마켓 | 에이전트·오케스트레이션 | 플러그인 목록을 모아 두고 팀이 받아 쓰게 하는 저장소 | https://code.claude.com/docs/en/plugin-marketplaces |
| `concept:output-styles` | 답변 스타일 | 에이전트·오케스트레이션 | 답의 말투 · 길이 · 형식을 세션 내내 정해 두는 설정 | https://code.claude.com/docs/en/output-styles |
| `concept:headless` | 자동 실행 모드(claude -p) | 에이전트·오케스트레이션 | 대화 없이 스크립트 · CI에서 명령 한 줄로 실행 | https://code.claude.com/docs/en/headless |
| `concept:settings` | 설정 파일 | 사람 확인 | 모델 · 허용 명령 같은 동작을 JSON 파일로 정하는 곳 | https://code.claude.com/docs/en/settings |
| `concept:permission-modes` | 권한 모드 | 사람 확인 | AI가 묻지 않고 해도 되는 일의 범위를 고르는 방식 | https://code.claude.com/docs/en/permission-modes |
| `concept:plan-mode` | 계획 모드 | 사람 확인 | 고치기 전에 먼저 조사하고 계획만 보여 주는 모드 | https://code.claude.com/docs/en/permission-modes#analyze-before-you-edit-with-plan-mode |
| `concept:context-engineering` | 컨텍스트 엔지니어링 | 메모리·컨텍스트 | AI에게 넘길 정보를 골라 담고 관리하는 방법 | https://www.anthropic.com/research/effective-context-engineering-for-ai-agents |

※ `concept:harness`는 운영에 이미 있는 줄(사용자 저장소에서 처음 봄)이라 **이름은 "하네스(에이전트 지시 파일)" 그대로 남는다**(시드는 이름을 안 바꿈). 그런데 공식 용어집은 "harness = Claude Code 자체, Claude는 그 안의 모델"이라고 한다(https://code.claude.com/docs/en/glossary "Agentic harness"). 이름을 "지침 파일(CLAUDE.md · AGENTS.md)"로 바꿀지는 결정이 필요하다(아래 열린 질문 1).

## ② Anthropic 공식 스킬 10개 (type `skill`, 저장소 anthropics/skills, 기본 브랜치 main)
| 키 | 갈래 | 한 줄 | 출처(SKILL.md) | 라이선스 |
|---|---|---|---|---|
| `skill:anthropics/skills/docx` | 문서·노트 | 워드(.docx) 문서를 만들고 읽고 고친다 | https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md | Apache-2.0 |
| `skill:anthropics/skills/pdf` | 문서·노트 | PDF 읽기 · 합치기 · 나누기 · 양식 채우기 | …/skills/pdf/SKILL.md | Apache-2.0 |
| `skill:anthropics/skills/pptx` | 문서·노트 | 발표 슬라이드(.pptx)를 만들고 고친다 | …/skills/pptx/SKILL.md | Apache-2.0 |
| `skill:anthropics/skills/xlsx` | 데이터 분석 | 엑셀 · CSV 표를 열고 고치고 새로 만든다 | …/skills/xlsx/SKILL.md | Apache-2.0 |
| `skill:anthropics/skills/frontend-design` | 화면·컴포넌트 | 뻔하지 않은 화면 디자인 방향을 잡아 준다 | …/skills/frontend-design/SKILL.md | Apache-2.0 |
| `skill:anthropics/skills/webapp-testing` | 코드 검사·테스트 | Playwright로 내 웹앱을 눌러 보며 시험한다 | …/skills/webapp-testing/SKILL.md | Apache-2.0 |
| `skill:anthropics/skills/mcp-builder` | 에이전트·오케스트레이션 | 외부 서비스를 AI에 잇는 MCP 서버 만들기 안내 | …/skills/mcp-builder/SKILL.md | Apache-2.0 |
| `skill:anthropics/skills/skill-creator` | 에이전트·오케스트레이션 | 나만의 스킬을 만들고 시험하고 다듬는다 | …/skills/skill-creator/SKILL.md | Apache-2.0 |
| `skill:anthropics/skills/web-artifacts-builder` | 화면·컴포넌트 | React · Tailwind로 여러 부품짜리 웹 결과물을 만든다 | …/skills/web-artifacts-builder/SKILL.md | Apache-2.0 |
| `skill:anthropics/skills/doc-coauthoring` | 문서·노트 | 기획서 · 스펙 문서를 단계별로 같이 쓴다 | …/skills/doc-coauthoring/SKILL.md | LICENSE.txt 없음 |

(…는 `https://github.com/anthropics/skills/blob/main`. 마이그레이션에는 전체 주소.) 라이선스는 폴더마다 `LICENSE.txt` 첫 줄을 메인 Claude가 직접 읽어 확인했다(9개 Apache License 2.0, doc-coauthoring은 파일 없음 → 칸 비움).

## ③ Anthropic 공식 플러그인 6개 (type `plugin`, 저장소 anthropics/claude-plugins-official, Apache-2.0)
설치: `/plugin install <이름>@claude-plugins-official`. 옛 주소 `anthropics/claude-code/plugins/`에는 이제 README만 있다("Anthropic's plugins are developed in claude-plugins-official").

| 키 | 갈래 | 한 줄 | 출처(README) |
|---|---|---|---|
| `plugin:…/code-review` | 코드 검사·테스트 | 여러 검토 도우미가 PR을 자동으로 리뷰한다 | https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-review/README.md |
| `plugin:…/commit-commands` | git·이슈 | 커밋 · 푸시 · PR 만들기를 명령 하나로 | …/plugins/commit-commands/README.md |
| `plugin:…/feature-dev` | 에이전트·오케스트레이션 | 코드 파악 → 설계 → 검토 순서로 기능을 만든다 | …/plugins/feature-dev/README.md |
| `plugin:…/frontend-design` | 화면·컴포넌트 | AI 티 안 나는 화면을 만들게 돕는다 | …/plugins/frontend-design/README.md |
| `plugin:…/security-guidance` | 보안·감사 | AI가 쓴 코드의 보안 구멍을 경고한다 | …/plugins/security-guidance/README.md |
| `plugin:…/learning-output-style` | 에이전트·오케스트레이션 | 중요한 대목은 직접 코드를 쓰게 하는 학습 모드 | …/plugins/learning-output-style/README.md |

(`plugin:…` = `plugin:anthropics/claude-plugins-official`.) security-guidance의 plugin.json 작성자는 개인 이름이지만 Anthropic이 관리한다고 밝힌 `plugins/` 폴더 안에 있다.

## ④ 새 개발 도구 15개 (type `sdk`, npm · PyPI 패키지가 있는 것만)
| 키 | 이름 | 갈래 | 한 줄 | 출처 | 라이선스 |
|---|---|---|---|---|---|
| `npm:@anthropic-ai/claude-code` | Claude Code | 에이전트·오케스트레이션 | 터미널에서 AI에게 코드 수정과 명령 실행을 맡기는 도구 | https://code.claude.com/docs/en/overview | 칸 비움("SEE LICENSE IN README.md") |
| `npm:@openai/codex` | OpenAI Codex CLI | 에이전트·오케스트레이션 | 내 컴퓨터 터미널에서 도는 OpenAI 코딩 도우미 | https://developers.openai.com/codex/cli | Apache-2.0 |
| `npm:@github/copilot` | GitHub Copilot CLI | 에이전트·오케스트레이션 | 터미널에서 쓰는 GitHub Copilot(구독 필요) | https://github.com/features/copilot | 칸 비움 |
| `pypi:aider-chat` | Aider | 에이전트·오케스트레이션 | 터미널에서 AI와 짝으로 코딩하는 파이썬 도구 | https://aider.chat | Apache-2.0 |
| `npm:cline` | Cline | 에이전트·오케스트레이션 | VS Code와 터미널에서 파일을 고치는 AI 도우미 | https://cline.bot | Apache-2.0 |
| `npm:pnpm` | pnpm | 화면·컴포넌트 | 빠르고 디스크를 아끼는 npm 대신 패키지 관리자 | https://pnpm.io/installation | MIT |
| `npm:vite` | Vite | 화면·컴포넌트 | 웹 화면을 빠르게 띄우고 묶어 주는 개발 서버 | https://vite.dev | MIT |
| `npm:create-next-app` | create-next-app | 화면·컴포넌트 | 명령 한 줄로 Next.js 새 프로젝트를 만든다 | https://nextjs.org/docs/app/api-reference/cli/create-next-app | MIT |
| `npm:typescript` | TypeScript | 화면·컴포넌트 | 자바스크립트에 타입을 붙여 실수를 미리 잡는다 | https://www.typescriptlang.org/ | Apache-2.0 |
| `npm:eslint` | ESLint | 코드 검사·테스트 | 코드의 실수와 나쁜 습관을 찾아 알려 준다 | https://eslint.org | MIT |
| `npm:prettier` | Prettier | 코드 검사·테스트 | 코드 모양(띄어쓰기 · 줄바꿈)을 자동으로 맞춘다 | https://prettier.io | MIT |
| `npm:vitest` | Vitest | 코드 검사·테스트 | Vite 기반의 빠른 자바스크립트 시험 도구 | https://vitest.dev/guide/ | MIT |
| `npm:@playwright/test` | Playwright Test | 코드 검사·테스트 | 브라우저를 자동으로 눌러 화면을 시험한다 | https://playwright.dev/docs/intro | Apache-2.0 |
| `npm:supabase` | Supabase CLI | 데이터베이스 | 내 컴퓨터에서 Supabase DB를 띄우고 관리한다 | https://supabase.com/docs/guides/local-development/cli/getting-started | MIT |
| `npm:vercel` | Vercel CLI | 배포·클라우드 | 터미널에서 Vercel에 배포하고 설정한다 | https://vercel.com/docs/cli | Apache-2.0 |

Vite · TypeScript · ESLint · Prettier 공식 사이트는 200 응답과 레지스트리의 homepage가 같은지만 봤다(설치 안내 문구는 안 읽음). Claude Code는 공식 문서가 npm이 아니라 native 설치를 권한다(npm 패키지는 있음).

## 넣지 않은 것 (확인은 했음)
| 후보 | 이유 |
|---|---|
| Gemini CLI (`npm:@google/gemini-cli`, Apache-2.0) | README: 개인 무료 사용과 Google AI Pro/Ultra가 2026-06-18에 Antigravity CLI로 옮겨 갔고, 지금은 Code Assist Standard/Enterprise용으로 안내. 교육생 추천으로 넣을지 결정 필요(열린 질문 3) |
| Cursor | 앱이라 npm · PyPI 패키지가 없다. 키 규칙이 없음(열린 질문 2) |
| GitHub CLI (gh) | 패키지 없음(winget · brew · MSI 등). 라이선스 확인 못 함 |
| Windsurf | windsurf.com이 devin.ai/desktop으로 영구 이동, "Devin Desktop is the new name for Windsurf". 앱 |
| Continue (`npm:@continuedev/cli`) | README: "no longer actively maintained and is read-only" |
| Jest (`npm:jest`) | 확인함. Vitest와 겹쳐 뺌(바꿔 넣을 수 있음) |
| AGENTS.md를 따로 | https://agents.md 확인. `concept:harness`가 CLAUDE.md · AGENTS.md를 함께 다룸 |
| Agent SDK를 따로 | https://code.claude.com/docs/en/agent-sdk/overview 확인. 개념 `headless`와 겹쳐 뺌 |

## 넣는 방법
1. **승인:** 이 목록(특히 갈래 · 한 줄 말투, 열린 질문 1~4)을 사용자가 본다.
2. **되돌림 시험(운영, 적용 전):** `execute_sql` 한 번에 [시험 파일의 (1) 준비] + [마이그레이션 본문 × 2] + [시험 파일의 (3) do 블록]을 이어 보낸다. 한 요청 안의 여러 문장은 한 트랜잭션이라 마지막 예외로 모두 되돌아간다. 기대값은 시험 파일 괄호 안(준비 ①: 개념 이름 그대로 · 근거만 채움, ②: 남의 글 · 근거 · 저장소 · NEW 표시 그대로, ③: 글이 빈 줄은 둘 다 우리 것). 끝난 뒤 `signals->>'starter_set'` 줄이 0개인지(흔적 0) 따로 읽는다. ※ 운영에 `gone`인 키가 있으면 listed가, 이번 주 들어온 키가 있으면 still_new가 기대값과 다르게 나온다 → 그 줄을 따로 본다.
3. **적용:** 사용자 승인 뒤 `apply_migration`. 적용 뒤 공개 목록 수를 다시 읽어 `docs/connectors.md`에 기록.
4. **로그인 전 지도 캐시:** 10분 캐시라 최대 10분 뒤 보인다.

## 열린 질문
1. `concept:harness` 이름: 운영 줄 이름 "하네스(에이전트 지시 파일)"를 공식 용어에 맞게 "지침 파일(CLAUDE.md · AGENTS.md)"로 바꿀지(바꾸면 `lib/domain/services.ts` CONCEPTS의 이름도 같이).
2. 앱(Cursor · Devin Desktop)처럼 패키지가 없는 도구의 종류 · 키(`service:`는 "공식 MCP가 있는 서비스"로 정해 둠).
3. Gemini CLI를 넣을지.
4. **(중요) 이대로면 지도에 안 오를 수 있다.** 고르기 규칙(`lib/server/map-queries.ts` ③ 개발 분야 · 스킬 · 플러그인 · 개념, 두꺼운 것 → 별 많은 순, 500개)에서 입문 세트는 얇고 별 신호가 없다(두께를 보는 수집기도 얇은 줄은 건너뛰어 별이 나중에 생기지도 않음). 같은 갈래의 두껍고 별 많은 MCP 수천 개에 밀린다(코드 리뷰 지적, 코드로 확인). → `signals.starter_set`을 늘 넣는 몫(위험 · NEW처럼)으로 두거나 정렬 앞에 두기. 다른 세션 담당 파일이라 여기서는 안 고침.
