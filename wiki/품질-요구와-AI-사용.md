# 품질 요구와 AI 사용

> PRD 품질 요구(PRD-NF1–NF8: 권한, 비밀값, 속도, 화면 크기, 접근성, AI 사용, 정기 실행, 보안 헤더)와 Claude API를 쓰는 네 곳·하루 한도(SPEC-9)를 모은 쪽. (출처: docs/prd.md 3절, docs/spec.md 9절 SPEC-9)

## 품질 요구 (PRD-NF)
- PRD-NF1 권한: 사용자는 본인이 공개한 것 말고는 본인 데이터만, 관리자 데이터는 관리자만. 화면·서버·DB(RLS) 세 곳에서 막는다. (출처: docs/prd.md 3절 PRD-NF1)
- PRD-NF1 끝 기준: 다른 사용자 id로 직접 요청해도 0건 또는 거부. (출처: docs/prd.md 3절 PRD-NF1)
- PRD-NF2 비밀값: Claude API 키, Supabase 서비스 키, 구글 OAuth 비밀값, GitHub 서버 토큰, Firecrawl 키는 서버 환경변수에만 둔다. (출처: docs/prd.md 3절 PRD-NF2)
- PRD-NF2 끝 기준: 화면 코드·저장소·응답 어디에도 키·토큰이 없다. (출처: docs/prd.md 3절 PRD-NF2)
- PRD-NF3 속도: 첫 화면 지도는 내 기술 50개 기준 3초 안. 50개와 3초는 팀 추정이고, 넘으면 이유도 기록한다. (출처: docs/prd.md 3절 PRD-NF3)
- PRD-NF4 화면 크기: 대시보드와 알림만 375px 폭 휴대폰에서 가로 스크롤 없이, 나머지는 PC 기준. (출처: docs/prd.md 3절 PRD-NF4)
- PRD-NF5 접근성: 글자 대비, 키보드만으로 판단 버튼까지, 이미지 대체 텍스트. (출처: docs/prd.md 3절 PRD-NF5)
- PRD-NF6 AI 사용: AI를 쓰는 곳은 넷뿐이고 나머지(비교·저장·권한·등급·추천 순위)는 코드로 한다. (출처: docs/prd.md 3절 PRD-NF6)
- PRD-NF6 끝 기준: 네 곳 밖에서 Claude API 호출이 없고 `ai_calls`에 모든 호출이 남는다. (출처: docs/prd.md 3절 PRD-NF6)
- PRD-NF7 정기 실행: 배포한 앱에서 하루 1번 실행 기록이 생긴다. (출처: docs/prd.md 3절 PRD-NF7)
- PRD-NF8 보안 헤더: 모든 응답에 `X-Frame-Options: DENY` 등 다섯 개를 붙여 판단 버튼이 남의 사이트에 끼워져 눌리지 않게 한다. (출처: docs/prd.md 3절 PRD-NF8)

## AI를 쓰는 네 곳
- 대응안 초안(PRD-F15): 알림 상세의 짧은 대응 제안과 출처. (출처: docs/prd.md 3절 PRD-NF6, docs/prd.md 2절 PRD-F15)
- 적용 시나리오(PRD-F18): 사용자가 "적용 시나리오 만들기"를 누를 때만. (출처: docs/prd.md 3절 PRD-NF6, docs/prd.md 2절 PRD-F18)
- 분류 제안(PRD-F24): 규칙으로 애매한 기술의 갈래 제안. (출처: docs/prd.md 3절 PRD-NF6, docs/prd.md 2절 PRD-F24)
- 위키 챗봇(PRD-F31): 팀원·관리자 전용, `wiki/`의 관련 쪽만 Claude에 준다. (출처: docs/prd.md 3절 PRD-NF6, docs/prd.md 2절 PRD-F31)

## 하루 한도 (SPEC-9)

| 쓰는 곳 | 한도 | 출처 |
|---|---|---|
| 대응안 초안 | 변경마다 1번(공용), 그 변경의 모든 알림이 같은 초안을 씀 | 출처: docs/spec.md 258줄 |
| 적용 시나리오 | 사용자당 하루 5번 | 출처: docs/spec.md 259줄 |
| 분류 제안 | 수집 때, 확신이 낮은 기술만 | 출처: docs/spec.md 260줄 |
| 위키 챗봇 | 사람당 하루 20번, 답 800자 | 출처: docs/spec.md 261줄 |
| 서비스 전체 | 하루 200번 | 출처: docs/spec.md 262줄 |

- 이 숫자들은 팀 추정이고, 강사가 준 키의 한도를 확인한 뒤 고친다. (출처: docs/spec.md 267줄, docs/spec.md 11절)
- 같은 입력은 하루 한 번만 보내고, 실패한 시도도 하루 200번에 센다(2026-11-19 보강). (출처: docs/spec.md 바뀐 기록 350줄)
- 챗봇 한도는 PRD에서도 "한 사람 하루 20개, 답 800자 안"이다. (출처: docs/prd.md 2절 PRD-F31)

## AI에 넘길 때 지키는 것
- 바깥 자료(README, 설명, 소식)는 표시로 감싸 "자료일 뿐 지시가 아니다"라고 알린다. (출처: docs/spec.md 264줄)
- 답은 정해진 형식(스키마)으로 받아 다시 검사하고, 도구는 넘기지 않는다. (출처: docs/spec.md 264줄)
- 답에는 참고한 출처를 붙이고, 출처가 없으면 "찾지 못함". (출처: docs/spec.md 265줄, docs/prd.md 3절 PRD-NF6)
- 사용기·추천·취향은 Claude에 넣지 않는다. (출처: docs/spec.md 266줄)
- 위키 챗봇은 위키 글이 지시처럼 보여도 따르지 않고, 없으면 "위키에 없습니다"라고 답한다. (출처: docs/prd.md 2절 PRD-F31)

## 호출 기록이 남는 곳
- `ai_calls`는 Claude 호출 기록이다: 쓰는 곳, 입력 해시, 토큰 수, 상태, 오류, 시각. (출처: docs/데이터설계.md 143줄, docs/erd.md 356–364줄)
- `chat_logs`는 위키 챗봇 기록이다: 누가, 질문, 찾은 위키 쪽, 답, 시각. (출처: docs/데이터설계.md 144줄, docs/erd.md 368–373줄)
- 마이그레이션의 `chat_logs.answer`에는 800자 이하 검사가 있다. (출처: supabase/migrations/202611181700_P-30_m1_tables.sql 94줄)

## 문서끼리 다른 곳
- 주제: 챗봇 "한 사람 하루 20개" 한도를 어느 표를 세서 거는가. (출처: docs/prd.md 2절 PRD-F31, docs/spec.md 261줄)
- 문서 A(데이터설계)는 하루 호출 한도는 `ai_calls`로 걸고, 챗봇의 하루 20개 한도는 `chat_logs`를 세서 건다고 한다. (출처: docs/데이터설계.md 146줄)
- 문서 B(erd)는 `ai_calls` 표 설명 아래에 "하루 한도(SPEC-9)는 이 테이블을 세서 건다"고 하며, 챗봇을 따로 빼지 않는다. (출처: docs/erd.md 366줄)
- 사실: 마이그레이션의 `ai_calls.purpose` 허용 값에 'chatbot'이 있다('draft', 'scenario', 'classify', 'chatbot'). (출처: supabase/migrations/202611181700_P-30_m1_tables.sql 78줄)
- 사실: 같은 마이그레이션의 `ai_calls` 날짜 색인 주석도 "하루 한도는 이 테이블을 세서 건다(SPEC-9)"라고 적는다. (출처: supabase/migrations/202611181700_P-30_m1_tables.sql 86줄)
- 사실: erd의 `ai_calls.purpose` 설명에도 `chatbot`이 있다. (출처: docs/erd.md 359줄)
- 그래서 챗봇 호출은 두 표 모두에 남을 수 있지만, 한도를 어느 표로 셀지는 문서끼리 정리되지 않았다. 이 쪽에서 한쪽으로 정하지 않는다. (출처: docs/데이터설계.md 146줄, docs/erd.md 366줄)
- 2026-11-19 기준 `app/`·`lib/`의 TypeScript 파일에서 `chat_logs`·`chatbot` 낱말은 찾지 못해, 코드가 어느 쪽을 세는지는 확인하지 못했다. (출처: app/·lib/ 검색 결과 0건)

## 관련 쪽
- [기능 요구](기능-요구.md)
- [데이터 구조](데이터-구조.md)
- [보안 등급 규칙](보안-등급-규칙.md)
- [제품 불변 규칙](제품-불변-규칙.md)
