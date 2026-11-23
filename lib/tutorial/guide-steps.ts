// 둘러보기(/guide, IA-27, 11-23 사용자 요청): 처음 쓰는 사람이 5분 안에 "무엇이고, 어떤 순서로 하고, 무엇이 보장되나"를 따라 하는 안내의 내용.
// 화면은 이 데이터만 그린다. 단계마다 근거 파일과 그 파일에 실제로 있는 문구를 같이 적어 두고, 시험(guide-steps.test.ts)이 파일을 읽어 확인한다:
// 화면 문구가 바뀌면 시험이 깨져서 안내가 낡은 채로 남지 않는다. 「」 안 글자는 실제 단추 · 칩 · 안내 이름이라 근거 문구 안에 있어야 한다.

/** 근거: 저장소 루트 기준 파일 경로 + 그 파일에 글자 그대로 있어야 하는 문구 */
export type Evidence = { file: string; phrases: string[] };
/** none = 로그인 없이 다 됨, some = 보기는 되고 저장 · 확정만 로그인, required = 로그인해야 열림 */
export type LoginNeed = "none" | "some" | "required";

export type GuideStep = {
  id: "start" | "protect" | "choose" | "judge" | "compose" | "export";
  title: string;
  gist: string;
  actions: string[];
  href: string;
  hrefLabel: string;
  login: LoginNeed;
  evidence: Evidence[];
};

export const LOGIN_LABEL: Record<LoginNeed, string> = { none: "로그인 없이", some: "보기는 로그인 없이", required: "로그인 필요" };

export const ONE_LINER = "AI 코딩 도구(Claude Code · Cursor · Codex 등)로 만드는 사람이 내가 깐 기술의 목록 · 보안 · 더 나은 대안을 한눈에 보고, 바깥 변화가 생기면 알림을 받아 판단하고 기록하며, 목록을 설치 프롬프트로 만들어 다른 컴퓨터에서도 다시 세팅하는 서비스예요.";

/** 기준 문장 "지키고, 고르고, 옮긴다" = 메뉴 셋(ADR 0037) */
export const MOTTO: { verb: string; menu: string; href: string; what: string }[] = [
  { verb: "지키고", menu: "프로젝트", href: "/dashboard", what: "내 레포에 깐 기술의 등급을 보고 바깥 변화를 알림으로 받아요" },
  { verb: "고르고", menu: "지도", href: "/", what: "모든 기술을 하는 일별 지도에서 비교해 청사진에 담아요" },
  { verb: "옮긴다", menu: "청사진", href: "/blueprint", what: "담은 기술을 순서대로 놓고 설치 프롬프트로 내보내요" },
];

export const INTRO_EVIDENCE: Evidence[] = [
  { file: "README.md", phrases: ["내가 깐 기술의 목록·보안·더 나은 대안", "다른 컴퓨터에서도 다시 세팅", "지키고, 고르고, 옮긴다"] },
  { file: "app/layout.tsx", phrases: ['<NavLink href="/dashboard"', ">프로젝트</NavLink>", '<NavLink href="/">지도</NavLink>', '<NavLink href="/blueprint">청사진'] },
];

/** 프로젝트 보드 숫자 띠 6칸(모양 예시에 이름만 쓴다) */
export const BAND_CELLS = ["오늘의 새 기술", "진행 중 프로젝트", "사용 중인 항목", "위험 발생", "판단 대기", "완료"];

/** 알림 세 종류와 생기는 조건(docs/GLOSSARY.md), 판단 주 단추 */
export const ALERT_KINDS: { name: string; when: string; primary: string }[] = [
  { name: "보안 경고", when: "내 레포가 쓰는 기술의 보안 등급이 위험으로 바뀌었어요", primary: "적용 후보로 · 고친 버전 X" },
  { name: "적용 기회", when: "내 기술과 같은 역할로 확인된 새 기술이 들어왔어요", primary: "써 볼 후보로" },
  { name: "모델 종료", when: "내 코드에 쓴 모델 이름이 공식 지원 종료 공지에 올랐어요", primary: "바꿀 후보로" },
];

export const EXPORT_KINDS = ["프롬프트", "CLAUDE.md 글", "다듬기용 메타프롬프트", "Mermaid 흐름도"];

export const STEPS: GuideStep[] = [
  {
    id: "start", title: "들어오기", login: "none", href: "/login", hrefLabel: "로그인 화면",
    gist: "구글 계정으로 가입하고 별명만 정하면 시작이에요. 로그인 전에도 지도 · 기술 상세 · 청사진(이 브라우저에만) · 템플릿 갤러리는 볼 수 있어요.",
    actions: [
      "메뉴 오른쪽 「로그인」을 누르고 「구글로 계속하기」를 눌러요.",
      "처음이면 설정 화면에 「가입을 마치려면 별명을 정해 주세요.」가 떠요. 별명을 정해 저장해요.",
      "이어지는 취향 질문에 답하거나 「건너뛰기」를 눌러요. 나중에 설정에서 고칠 수 있어요.",
    ],
    evidence: [
      { file: "app/layout.tsx", phrases: ["로그인</LoginLink>"] },
      { file: "app/login/google-login-button.tsx", phrases: ["구글로 계속하기"] },
      { file: "app/settings/page.tsx", phrases: ["가입을 마치려면 별명을 정해 주세요.", "취향 고치기"] },
      { file: "app/taste/taste-form.tsx", phrases: ["건너뛰기"] },
    ],
  },
  {
    id: "protect", title: "내 레포 지키기", login: "required", href: "/dashboard", hrefLabel: "프로젝트",
    gist: "공개 GitHub 저장소 주소 하나면, 그 레포에 깐 AI 코딩 도구를 읽어 하나하나 보안 등급을 붙여요.",
    actions: [
      "메뉴 「프로젝트」를 열고 「+ 레포 등록」 칸에 공개 저장소 주소를 넣어요.",
      "「등록하고 읽기」를 눌러요. package.json · requirements.txt · .mcp.json · .claude/skills와 Cursor · VS Code · Gemini CLI의 MCP 설정을 읽어요.",
      "「첫 점검」 띠(위험 · 주의 수)와 숫자 띠(「위험 발생」 · 「판단 대기」 …)로 지금 상태를 봐요.",
      "레포 이름을 누르면 레포 상세에서 「사용 중인 항목」과 등급을 한 줄씩 봐요.",
    ],
    evidence: [
      { file: "app/layout.tsx", phrases: [">프로젝트</NavLink>"] },
      { file: "app/dashboard/repo-manage.tsx", phrases: ["+ 레포 등록", "등록하고 읽기", "(공개 저장소)", "package.json, requirements.txt, .mcp.json, .claude/skills와 Cursor · VS Code · Gemini CLI의 MCP 설정"] },
      { file: "lib/alerts/first-check-band.ts", phrases: ["첫 점검: 위험 ${danger} · 주의 ${caution}"] },
      { file: "app/dashboard/widgets.tsx", phrases: BAND_CELLS.map((c) => `["${c}"`) },
      { file: "app/projects/[id]/page.tsx", phrases: ["사용 중인 항목"] },
    ],
  },
  {
    id: "choose", title: "지도에서 고르기", login: "none", href: "/", hrefLabel: "지도",
    gist: "모은 기술이 하는 일별로 한 지도에 놓여 있어요. 칩으로 좁히고, 점을 눌러 자세히 본 뒤 마음에 들면 청사진에 담아요.",
    actions: [
      "메뉴 「지도」에서 「새 기술」 기간(「오늘」 · 「이번 주」 · 「이번 달」), 「위험·주의」, 「사용 중」 칩으로 좁혀요.",
      "점을 누르면 옆에 상세 패널이 열려요. 등급, 같은 역할의 비교군, 출처를 봐요.",
      "「청사진에 담기」를 눌러요. 위험 등급은 바로 담기지 않아요. 보안 경고 알림에서 고친 버전과 함께 판단해요.",
    ],
    evidence: [
      { file: "app/layout.tsx", phrases: ['<NavLink href="/">지도</NavLink>'] },
      { file: "app/tech-map/controls.tsx", phrases: ["새 기술", "위험·주의 <b>", "사용 중 <b>"] },
      { file: "lib/map/view-config.ts", phrases: ['day: "오늘", week: "이번 주", month: "이번 달"'] },
      { file: "app/tech-map/side-panel.tsx", phrases: ["비교군", "청사진에 담기"] },
      { file: "app/tech-map/guest-pick.tsx", phrases: ["청사진에 담기</button>", "보안 위험 등급이라 바로 담을 수 없어요. 보안 경고 알림에서 고친 버전과 함께 판단해 주세요."] },
    ],
  },
  {
    id: "judge", title: "알림에 판단 남기기", login: "required", href: "/alerts", hrefLabel: "알림",
    gist: "바깥에서 변화가 생기면 종에 숫자가 떠요. 읽고 후보로 올리거나, 이유를 적어 보류해요. 판단은 기록일 뿐 아무것도 설치하지 않아요.",
    actions: [
      "메뉴 오른쪽 종의 숫자는 판단 대기 수예요. 눌러서 알림을 열어요.",
      "종류를 봐요. 「보안 경고」 · 「적용 기회」 · 「모델 종료」 세 가지예요.",
      "주 단추(「적용 후보로 · 고친 버전」 · 「써 볼 후보로」 · 「바꿀 후보로」)를 누르거나, 「보류…」를 펼쳐 이유를 5자 이상 적고 「보류 저장」을 눌러요.",
      "저장되면 「다음 판단 대기 →」로 이어서 판단해요.",
    ],
    evidence: [
      { file: "app/nav/alert-bell.tsx", phrases: ["배지 = 판단 대기 수"] },
      { file: "lib/alerts/to-alert-view.ts", phrases: ['label: "보안 경고"', 'label: "적용 기회"', 'label: "모델 종료"', "적용 후보로 · 고친 버전", '"써 볼 후보로"', '"바꿀 후보로"'] },
      { file: "app/alerts/[id]/judgment-form.tsx", phrases: ["저장하기 전에는 아무것도 바뀌지 않아요.", ">보류…</summary>", ">보류 저장</button>"] },
      { file: "lib/alerts/validate-judgment.ts", phrases: ["MIN_HOLD_REASON = 5"] },
      { file: "app/alerts/[id]/page.tsx", phrases: ["판단을 남겼을 뿐, 설치하거나 바꾼 것은 없어요.", "다음 판단 대기 →"] },
      { file: "docs/GLOSSARY.md", phrases: ["보안 등급이 위험으로 바뀌어 생기는 알림", "**확정된** 같은 역할이라 생기는 알림", "공식 지원 종료 공지"] },
    ],
  },
  {
    id: "compose", title: "청사진 짜기", login: "some", href: "/blueprint", hrefLabel: "청사진",
    gist: "담은 기술을 단계 순서대로 놓아 내 개발 환경의 설계도를 만들어요. 로그인 전에도 짤 수 있고, 그때 판은 이 브라우저에만 남아요.",
    actions: [
      "메뉴 「청사진」에서 위 막대 「＋ 단계」로 단계를 만들어요.",
      "아래 「기술」 패널에서 담은 기술을 단계로 끌어 놓아요. 목록 모드(좁은 화면 기본)에서는 고르고 「넣기」를 눌러요.",
      "앞 단계와 이어 순서를 정해요. 사용 중인 항목 · 담은 기술 · 확정 이력에 있는 기술만 넣을 수 있어요.",
    ],
    evidence: [
      { file: "app/layout.tsx", phrases: ['<NavLink href="/blueprint">청사진'] },
      { file: "app/blueprint/studio.tsx", phrases: [">＋ 단계</button>", "로그인 전 — 판은 이 브라우저에만 남아요."] },
      { file: "app/blueprint/dock.tsx", phrases: ['["tech", "기술"]', "끌기 · 넣기"] },
      { file: "app/blueprint/list-mode.tsx", phrases: [">넣기</button>", "앞 단계 잇기"] },
      { file: "lib/blueprint/knowledge.ts", phrases: ["사용 중인 항목 · 담은 기술 · 확정 이력에 있는 기술만 청사진에 넣을 수 있어요."] },
    ],
  },
  {
    id: "export", title: "옮기기", login: "some", href: "/blueprint", hrefLabel: "청사진",
    gist: "짠 청사진을 글로 복사해 Claude Code에 붙여 넣으면, 다른 컴퓨터에서도 같은 세팅을 다시 만들 수 있어요. 실제 설치는 Claude Code에서 직접 해요.",
    actions: [
      "청사진 위 막대의 「확정 · 내보내기」를 눌러요.",
      "형식을 골라요. 「프롬프트」 · 「CLAUDE.md 글」 · 「다듬기용 메타프롬프트」 · 「Mermaid 흐름도」.",
      "「복사」를 누르고 「복사했어요. Claude Code에 붙여 넣어 쓰세요.」가 뜨면 Claude Code에 붙여 넣어요.",
      "로그인했으면 「이대로 확정」으로 내 이력에 남겨요. 남이 공개한 틀은 「템플릿 갤러리」에서 가져와요.",
    ],
    evidence: [
      { file: "app/blueprint/studio.tsx", phrases: [">확정 · 내보내기</button>"] },
      { file: "app/blueprint/result-dialog.tsx", phrases: [...EXPORT_KINDS.map((k) => `"${k}`), ">복사</button>", "복사했어요. Claude Code에 붙여 넣어 쓰세요.", "이대로 확정"] },
      { file: "app/blueprint/gallery/page.tsx", phrases: ["<h1>템플릿 갤러리</h1>", "이 템플릿으로 시작"] },
      { file: "lib/blueprint/knowledge.ts", phrases: ["실제 설치는 Claude Code에서 직접 해요."] },
    ],
  },
];

/** 등급 뜻과 색(app/tokens.css 토큰 이름). shape: 채운 점 · 점선 고리 */
export const GRADES: { name: string; meaning: string; token: string; shape: "dot" | "ring" }[] = [
  { name: "위험", meaning: "알려진 취약점이 있어요.", token: "--danger", shape: "dot" },
  { name: "주의", meaning: "확인할 점이 있어요.", token: "--caution", shape: "dot" },
  { name: "통과", meaning: "알려진 취약점이 없어요.", token: "--pass", shape: "dot" },
  { name: "찾지 못함", meaning: "근거를 하나도 확인하지 못했어요. 위험하지 않다는 뜻이 아니에요.", token: "--unknown", shape: "dot" },
  { name: "수집 오류", meaning: "읽기 자체가 실패했어요. \"변화 없음\"으로 단정하지 않고 따로 보여요.", token: "--err-line", shape: "ring" },
  { name: "판단 대기", meaning: "내 판단을 기다리는 알림이에요. 등급이 아니라 알림의 상태예요.", token: "--pending", shape: "dot" },
];

export const GRADE_EVIDENCE: Evidence[] = [
  { file: "app/tokens.css", phrases: ["--danger: #", "--caution: #", "--pass: #", "--unknown: #", "--pending: #", "--err-line: #", "수집 오류 = 회색 점선", "판단 대기 = 얼음 파랑"] },
  { file: "app/tech-map/side-panel.tsx", phrases: ["알려진 취약점이 있어요.", "확인할 점이 있어요.", "알려진 취약점 없음", "위험하지 않다는 뜻이 아니에요"] },
  { file: "docs/GLOSSARY.md", phrases: ["근거를 하나도 확인하지 못하면", "읽기에 실패한 상태", "\"변화 없음\"·\"삭제됨\"으로 단정하지 않고"] },
];

/** 약속(제품 불변 규칙, CLAUDE.md 3절)을 사용자 말로 */
export const PROMISES: { title: string; body: string; evidence: Evidence }[] = [
  { title: "내가 저장하기 전에는 아무것도 바뀌지 않아요", body: "판단은 기록일 뿐 설치하지 않아요. 관리자도 내 판단을 대신하거나 건너뛸 수 없어요.", evidence: { file: "CLAUDE.md", phrases: ["사람이 승인하기 전에는 어떤 조치도 실행하지 않는다. 관리자도 승인을 건너뛸 수 없다."] } },
  { title: "못 읽으면 못 읽었다고 말해요", body: "읽기에 실패하면 \"수집 오류\"로 보여 줘요. \"변화 없음\"이나 \"통과\"로 넘기지 않아요.", evidence: { file: "CLAUDE.md", phrases: ["수집 실패는 \"수집 오류\"로 기록한다."] } },
  { title: "내 레포 · 판단 · 기록은 나만 봐요", body: "다른 사람에게는 설정에서 켠 별명과 '쓰고 있어요' 수, 내가 공개한 청사진 템플릿만 보여요.", evidence: { file: "app/login/page.tsx", phrases: ["내 판단·기록은 나만 봐요.", "설정에서 켠 별명과"] } },
  { title: "같은 변화로 알림이 두 번 오지 않아요", body: "같은 변경을 다시 읽어도 알림은 한 번만 생겨요.", evidence: { file: "CLAUDE.md", phrases: ["같은 변경을 다시 읽어도 사건·조치가 두 번 생기지 않는다(멱등)."] } },
];

export const FAQ: { q: string; a: string; evidence: Evidence }[] = [
  { q: "로그인하지 않고 무엇을 볼 수 있나요?", a: "지도, 기술 상세, 청사진, 템플릿 갤러리를 볼 수 있어요. 청사진 판은 이 브라우저에만 남고, 확정 · 내 레포 · 알림 · 기록은 로그인한 뒤에 열려요.", evidence: { file: "app/blueprint/studio.tsx", phrases: ["로그인 전 — 판은 이 브라우저에만 남아요. 확정 · 템플릿은"] } },
  { q: "비공개 저장소도 등록할 수 있나요?", a: "아니요. 공개 GitHub 저장소 주소만 받아요. 비밀번호 · 토큰도 받지 않아요.", evidence: { file: "app/dashboard/repo-manage.tsx", phrases: ["(공개 저장소)"] } },
  { q: "판단하면 내 컴퓨터에 무언가 설치되나요?", a: "아니요. 판단은 기록만 남겨요. 실제 설치는 청사진에서 내보낸 글을 Claude Code에 붙여 넣어 직접 해요.", evidence: { file: "app/alerts/[id]/page.tsx", phrases: ["판단을 남겼을 뿐, 설치하거나 바꾼 것은 없어요."] } },
  { q: "\"찾지 못함\"과 \"수집 오류\"는 무엇이 다른가요?", a: "찾지 못함은 읽기는 했지만 등급을 매길 근거를 찾지 못한 것, 수집 오류는 읽기 자체가 실패한 것이에요. 둘 다 \"안전하다\"는 뜻이 아니에요.", evidence: { file: "docs/GLOSSARY.md", phrases: ["수집 오류(읽기 자체가 실패)와 다르다."] } },
  { q: "위험 등급 기술은 왜 청사진에 바로 못 담나요?", a: "알려진 취약점이 있어서예요. 보안 경고 알림에서 고친 버전을 보고 판단하면 그 버전으로 담을 수 있어요.", evidence: { file: "app/tech-map/guest-pick.tsx", phrases: ["보안 위험 등급이라 바로 담을 수 없어요."] } },
  { q: "다른 컴퓨터에 내가 쓰던 도구를 다시 깔고 싶어요.", a: "청사진에서 「확정 · 내보내기」로 프롬프트를 복사해 그 컴퓨터의 Claude Code에 붙여 넣어요. 반대로 지금 컴퓨터의 목록은 「설치 프롬프트 · 내 컴퓨터 목록 가져오기」 화면에서 가져와요.", evidence: { file: "app/projects/install/page.tsx", phrases: ["<h1>설치 프롬프트 · 내 컴퓨터 목록 가져오기</h1>"] } },
];

/** 메뉴에서 바로 가는 길이 없던 화면 */
export const MORE_SCREENS: { title: string; href: string; what: string; login: LoginNeed; evidence: Evidence }[] = [
  { title: "기록 찾기", href: "/history", what: "판단을 기다리는 알림과 지금까지 남긴 판단을 이유와 함께 다시 찾아요.", login: "required", evidence: { file: "app/history/page.tsx", phrases: ["<h1>기록 찾기</h1>"] } },
  { title: "설치 프롬프트 · 내 컴퓨터 목록 가져오기", href: "/projects/install", what: "사용 중인 항목으로 설치 프롬프트를 만들고, 내 컴퓨터에 깐 목록을 가져와요.", login: "required", evidence: { file: "app/projects/install/page.tsx", phrases: ["<h1>설치 프롬프트 · 내 컴퓨터 목록 가져오기</h1>"] } },
  { title: "내 실행 기록", href: "/projects/runs", what: "내 저장소를 읽은 실행(처음 읽기 · 다시 읽기)이 단계마다 어떻게 됐는지 봐요.", login: "required", evidence: { file: "app/projects/runs/page.tsx", phrases: ["<h1>내 실행 기록</h1>"] } },
];

/** 「」로 감싼 실제 화면 이름을 뽑는다 */
export function uiNames(text: string): string[] {
  return [...text.matchAll(/「([^」]+)」/g)].map((m) => m[1]);
}

/** 글을 보통 글 / 화면 이름 조각으로 나눈다(화면이 화면 이름만 굵게 그리게) */
export function splitUiNames(text: string): { text: string; ui: boolean }[] {
  return text.split(/(「[^」]+」)/).filter(Boolean).map((part) => (part.startsWith("「") && part.endsWith("」") ? { text: part.slice(1, -1), ui: true } : { text: part, ui: false }));
}

/** 주소 해시(#step-3)를 단계 번호(0부터)로. 없거나 틀리면 null */
export function stepFromHash(hash: string, count: number): number | null {
  const m = /^#step-(\d+)$/.exec(hash);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= count ? n - 1 : null;
}

export const stepHash = (index: number): string => `#step-${index + 1}`;

/** ← → 이동: 끝에서 멈춘다(돌아가지 않음: 처음 쓰는 사람이 6에서 1로 튀면 헷갈린다) */
export function moveStep(index: number, delta: -1 | 1, count: number): number {
  return Math.min(count - 1, Math.max(0, index + delta));
}
