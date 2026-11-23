// 둘러보기(/guide)의 단계 밖 절: 쓰는 말 · 등급과 표시 · 약속 · 자주 묻는 질문 · 더 있는 화면, 그리고 모양 예시(app/guide/mocks.tsx) 글자 대조용 목록.
// 근거 규칙은 guide-steps.ts와 같다(시험이 파일을 읽어 대조). 등급 뜻은 docs/spec.md 1절이 원본이다.
import type { Evidence, LoginNeed } from "./guide-steps.ts";

/** 처음 나오는 어려운 말(소개 아래 접기 상자) */
export const TERMS: { word: string; mean: string }[] = [
  { word: "레포", mean: "GitHub에 올린 프로젝트 저장소예요. TechRadar는 공개 저장소만 읽어요." },
  { word: "MCP", mean: "AI 코딩 도구가 바깥 도구 · 서비스를 부를 수 있게 이어 주는 서버예요(.mcp.json 같은 설정에 적혀요)." },
  { word: "스킬", mean: "Claude Code가 필요할 때 꺼내 쓰는 지시 · 스크립트 묶음이에요(.claude/skills 폴더)." },
  { word: "청사진", mean: "단계마다 쓸 기술을 붙여 만드는 내 작업 설계 판이에요." },
  { word: "비교군", mean: "내가 쓰는 기술과 같은 역할로 관리자가 확인한 다른 기술이에요." },
  { word: "설치 프롬프트", mean: "다른 컴퓨터의 Claude에 붙여 넣으면 하나씩 확인받으며 설치하게 하는 글이에요." },
  { word: "메타프롬프트", mean: "AI에게 \"이 청사진을 검토해 같은 형식으로 고쳐 줘\"라고 맡기는 다듬기용 글이에요." },
  { word: "Mermaid", mean: "글로 쓰는 흐름도 형식이에요. README에 넣으면 그림으로 보여요." },
];
export const TERM_EVIDENCE: Evidence[] = [
  { file: "docs/GLOSSARY.md", phrases: ["내 작업 설계 판", "하나씩 확인받으며 설치하게 하는 글"] },
  { file: "app/tech-map/side-panel.tsx", phrases: ["관리자 확인"] },
  { file: "lib/blueprint/export-text.ts", phrases: ["아래 청사진을 검토해서 같은 형식으로 고쳐 줘."] },
  { file: "app/blueprint/result-dialog.tsx", phrases: ["Mermaid 흐름도(README용"] },
];

/** 등급 4개(docs/spec.md 1절). 등급은 기술에 하나씩 붙는다 */
export const GRADES: { name: string; meaning: string; token: string }[] = [
  { name: "위험", meaning: "지금 버전에 심각한(HIGH · CRITICAL) 알려진 취약점이 있거나, 원격 실행 · 비밀값 유출 같은 위험한 코드 모양을 찾았어요.", token: "--danger" },
  { name: "주의", meaning: "가벼운(MODERATE · LOW) 취약점, 12개월 넘게 멈춤, 라이선스 없음, 중단 · 사라짐, 넓은 권한처럼 확인할 점이 있어요.", token: "--caution" },
  { name: "통과", meaning: "알려진 취약점이 없고, 저장소가 최근 3개월 안에 움직였고 라이선스가 있어요. 그 확인이 7일 안이에요.", token: "--pass" },
  { name: "찾지 못함", meaning: "확인할 근거를 찾지 못했어요(이름만 넣은 기술, 확인이 7일보다 낡은 것 등). 위험하지 않다는 뜻이 아니에요.", token: "--unknown" },
];
/** 등급이 아닌 표시 2개: 등급 옆이나 알림에 붙는다 */
export const MARKS: { name: string; meaning: string; token: string; shape: "ring" | "dot" }[] = [
  { name: "수집 오류", meaning: "읽기가 실패했다는 표시예요. 등급은 그대로 두고 옆에 \"수집 오류(마지막 확인 날짜)\"를 붙여요. \"변화 없음\"으로 단정하지 않아요.", token: "--err-line", shape: "ring" },
  { name: "판단 대기", meaning: "아직 내가 판단하지 않은 알림이에요. 적용 후보나 보류를 저장하면 완료가 돼요.", token: "--pending", shape: "dot" },
];
export const GRADE_EVIDENCE: Evidence[] = [
  { file: "app/tokens.css", phrases: ["--danger: #", "--caution: #", "--pass: #", "--unknown: #", "--pending: #", "--err-line: #"] },
  { file: "docs/spec.md", phrases: ["**HIGH·CRITICAL**", "P1(원격 실행)", "P2(비밀값 밖으로 보냄)", "**MODERATE·LOW**", "12개월 넘게 커밋·릴리스 없음", "③ 라이선스 없음", "**중단**·**사라짐**", "P3(넓은 권한)", "확인한 시각이 7일 안, 마지막 푸시가 90일(최근 3개월) 안", "근거를 하나도 확인하지 못함(이름만 직접 추가", "등급 옆에 **\"수집 오류 (마지막 확인 {날짜})\"**"] },
  { file: "app/tech-map/side-panel.tsx", phrases: ["위험하지 않다는 뜻이 아니에요"] },
  { file: "docs/GLOSSARY.md", phrases: ["판단(적용 후보 / 보류)이 저장되면 완료가 된다"] },
];

/** 약속(제품 불변 규칙, CLAUDE.md 3절)을 사용자 말로 */
export const PROMISES: { title: string; body: string; evidence: Evidence }[] = [
  { title: "내가 저장하기 전에는 아무것도 바뀌지 않아요", body: "판단은 기록일 뿐 설치하지 않아요. 관리자도 내 판단을 대신하거나 건너뛸 수 없어요.", evidence: { file: "CLAUDE.md", phrases: ["사람이 승인하기 전에는 어떤 조치도 실행하지 않는다. 관리자도 승인을 건너뛸 수 없다."] } },
  { title: "못 읽으면 못 읽었다고 말해요", body: "읽기에 실패하면 \"수집 오류\"로 보여 줘요. \"변화 없음\"이나 \"통과\"로 넘기지 않아요.", evidence: { file: "CLAUDE.md", phrases: ["수집 실패는 \"수집 오류\"로 기록한다."] } },
  { title: "내 레포 · 판단 · 기록은 나만 봐요", body: "다른 사람에게 보이는 것은 설정에서 켠 별명과 '쓰고 있어요' 수, 내가 공개한 청사진 템플릿, 내가 쓴 사용기뿐이에요.", evidence: { file: "CLAUDE.md", phrases: ["\"쓰고 있어요\"의 별명과 수, 본인이 공개를 누른 청사진 템플릿과 그 사용기의 별명뿐"] } },
  { title: "같은 변화로 알림이 두 번 오지 않아요", body: "같은 변경을 다시 읽어도 알림은 한 번만 생겨요.", evidence: { file: "CLAUDE.md", phrases: ["같은 변경을 다시 읽어도 사건·조치가 두 번 생기지 않는다(멱등)."] } },
];

/** 약속 · 범례와 겹치지 않는 질문만 */
export const FAQ: { q: string; a: string; evidence: Evidence }[] = [
  { q: "로그인하지 않고 무엇을 볼 수 있나요?", a: "지도, 기술 상세, 청사진, 템플릿 갤러리를 볼 수 있어요. 청사진 판은 이 브라우저에만 남고, 확정 · 내 레포 · 알림 · 기록은 로그인한 뒤에 열려요.", evidence: { file: "app/blueprint/studio.tsx", phrases: ["로그인 전 — 판은 이 브라우저에만 남아요. 확정 · 템플릿은"] } },
  { q: "비공개 저장소도 등록할 수 있나요?", a: "아니요. 공개 GitHub 저장소 주소만 받아요. 비밀번호 · 토큰도 받지 않아요.", evidence: { file: "docs/adr/0002-v1-범위.md", phrases: ["비공개 저장소는 GitHub 로그인 연동이 필요해 다음 버전으로 미뤘다."] } },
  { q: "알림은 메일로도 오나요?", a: "아니요. 앱 안에서만 와요. 메뉴 오른쪽 종에 판단 대기 수가 떠요.", evidence: { file: "docs/ia.md", phrases: ["**v1은 앱 안만.**"] } },
  { q: "\"통과\"면 안전하다는 뜻인가요?", a: "알려진 문제가 없고 최근까지 관리된다는 뜻이에요. 위험 패턴은 코드의 문구로 찾는 것이라, 찾지 못했다고 안전하다는 보장은 아니에요.", evidence: { file: "docs/GLOSSARY.md", phrases: ["찾지 못했다고 안전하다는 뜻은 아니다."] } },
  { q: "위험 등급 기술은 왜 청사진에 바로 못 담나요?", a: "알려진 위험이 있어 청사진에는 넣지 않아요. 보안 경고 알림에서 「적용 후보로 · 고친 버전」을 고르면 그 고친 버전이 설치 프롬프트에 들어가요. 고친 버전이 아직 없으면 보류만 할 수 있어요.", evidence: { file: "docs/adr/0012-M0-확인-범위와-보안-경고의-적용-후보.md", phrases: ["설치 프롬프트에는 그 버전으로 **고정**해 들어간다.", "고친 버전이 없으면(OSV에 고친 버전 없음) 보안 경고에는 [보류]만 있다."] } },
  { q: "다른 컴퓨터에 내가 쓰던 도구를 다시 깔고 싶어요.", a: "청사진에서 「확정 · 내보내기」로 프롬프트를 복사해 그 컴퓨터의 Claude Code에 붙여 넣어요. 지금 컴퓨터에 깐 목록은 「설치 프롬프트 · 내 컴퓨터 목록 가져오기」 화면에서 가져와요.", evidence: { file: "app/projects/install/page.tsx", phrases: ["<h1>설치 프롬프트 · 내 컴퓨터 목록 가져오기</h1>"] } },
];
/** 질문 5의 "청사진에 넣지 않음"은 DB가 막는다(화면 말이 아니라 규칙 근거) */
export const FAQ_EXTRA_EVIDENCE: Evidence[] = [
  { file: "supabase/migrations/202611221000_P-12e_blueprint_graph.sql", phrases: ["위험 등급 기술은 청사진에 넣지 않는다"] },
  { file: "app/blueprint/studio.tsx", phrases: [">확정 · 내보내기</button>"] },
  { file: "app/login/page.tsx", phrases: ["비밀번호·토큰은 받지 않아요."] },
];

/** 메뉴에서 바로 가는 길이 없던 화면 */
export const MORE_SCREENS: { title: string; href: string; what: string; login: LoginNeed; evidence: Evidence }[] = [
  { title: "기록 찾기", href: "/history", what: "판단을 기다리는 알림과 지금까지 남긴 판단을 이유와 함께 다시 찾아요.", login: "required", evidence: { file: "app/history/page.tsx", phrases: ["<h1>기록 찾기</h1>"] } },
  { title: "설치 프롬프트 · 내 컴퓨터 목록 가져오기", href: "/projects/install", what: "사용 중인 항목으로 설치 프롬프트를 만들고, 내 컴퓨터에 깐 목록을 가져와요.", login: "required", evidence: { file: "app/projects/install/page.tsx", phrases: ["<h1>설치 프롬프트 · 내 컴퓨터 목록 가져오기</h1>"] } },
  { title: "내 실행 기록", href: "/projects/runs", what: "내 저장소를 읽은 실행(처음 읽기 · 다시 읽기)이 단계마다 어떻게 됐는지 봐요.", login: "required", evidence: { file: "app/projects/runs/page.tsx", phrases: ["<h1>내 실행 기록</h1>"] } },
];

/** 장면 그림(app/guide/mocks.tsx · scene-stage.tsx) 글자와 장면에서 쳐지는 글자는 아래 실제 화면 파일 중 하나에 있어야 한다(시험이 주석을 지운 소스에서 찾음) */
export const MOCK_FILES = ["app/guide/mocks.tsx", "app/guide/scene-stage.tsx"];
export const MOCK_SOURCES = [
  "app/layout.tsx", "app/login/google-login-button.tsx", "app/settings/page.tsx", "app/settings/settings-form.tsx", "app/taste/taste-form.tsx",
  "app/dashboard/repo-manage.tsx", "app/dashboard/widgets.tsx", "app/tech-map/controls.tsx", "app/tech-map/side-panel.tsx", "app/tech-map/guest-pick.tsx", "lib/map/view-config.ts",
  "app/alerts/[id]/judgment-form.tsx", "app/alerts/[id]/page.tsx", "app/blueprint/studio.tsx", "app/blueprint/dock.tsx", "app/blueprint/stage-node.tsx",
  "app/blueprint/list-mode.tsx", "app/blueprint/result-dialog.tsx",
];
/** 실제 화면에 없는, 그림을 위한 자리 글자(숫자 자리 n · 이름 자리 · 그림 설명). 여기에 없는 글자는 실제 화면 글자여야 한다 */
export const MOCK_PLACEHOLDERS = [
  "n", "취향 질문", "내 레포 이름", "사용 중인 항목 n", "첫 점검: 위험 n · 주의 n", "기술 이름", "비교군 · 출처", "종 숫자 = 판단 대기 수",
  "위 막대", "단계 1", "단계 2", "또는 끌어 놓기", "로그인했으면", "그림 · 누를 수 없어요", "모양 예시", "실제 화면에서 이렇게 생긴 걸 찾아요. 숫자는 왼쪽 순서",
  "1", "내 별명", "시연", "실제 화면에서 이 순서로 눌러요. 숫자는 왼쪽 순서", // I-tutorial-motion: 담은 수 배지 · 쳐지는 별명 · 장면 이름표
];
