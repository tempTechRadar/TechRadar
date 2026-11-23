// 둘러보기(/guide, IA-27, 11-23 사용자 요청): 처음 쓰는 사람이 5분 안에 "무엇이고, 어떤 순서로 하고, 무엇이 보장되나"를 따라 하는 안내의 내용.
// 화면은 이 데이터만 그린다. 단계마다 근거 파일과 그 파일에 실제로 있는 문구를 같이 적어 두고, 시험(guide-steps.test.ts)이 파일을 읽어 확인한다:
// 화면 문구가 바뀌면 시험이 깨져서 안내가 낡은 채로 남지 않는다. 「」 안 글자는 실제 단추 · 칩 · 안내 이름이라 근거 문구 안에 있어야 한다.
// 소스 파일의 근거는 주석이 아니라 화면에 그려지는 글자(JSX 글 · 문자열 · aria-label)에서 찾는다(시험이 주석을 지우고 대조). 범례 · 약속 · 질문은 guide-sections.ts

/** 근거: 저장소 루트 기준 파일 경로 + 그 파일에 글자 그대로 있어야 하는 문구(4글자 이상) */
export type Evidence = { file: string; phrases: string[] };
/** none = 로그인 없이 다 됨, some = 보기는 되고 저장 · 확정만 로그인, required = 로그인해야 열림 */
export type LoginNeed = "none" | "some" | "required";

export type GuideStep = {
  id: "start" | "protect" | "choose" | "judge" | "compose" | "export";
  title: string;
  gist: string;
  actions: string[];
  /** 작은 글씨 덧붙임(파일 이름처럼 처음 쓰는 사람에게 꼭 필요하지 않은 것) */
  fine?: string;
  /** 등급이 처음 나오는 단계: 카드에 "등급 뜻 보기 ↓" */
  gradeLink?: boolean;
  href: string;
  hrefLabel: string;
  login: LoginNeed;
  evidence: Evidence[];
};

export const LOGIN_LABEL: Record<LoginNeed, string> = { none: "로그인 없이", some: "보기는 로그인 없이", required: "로그인 필요" };

/** 맨 위 두 줄: 문제(docs/문제정의.md 1절) → TechRadar가 해 주는 것(README) */
export const PROBLEM = "AI 코딩 도구로 만들다 보면 스킬 · MCP · 플러그인을 그때그때 하나씩 깔게 돼요. 그러다 보면 내가 무엇을 깔았는지, 그게 안전한지, 더 나은 게 나왔는지 한눈에 보기 어려워요.";
export const SOLUTION = "TechRadar는 내 레포에 깐 것을 읽어 하나하나 보안 등급을 붙이고, 바깥에서 변화가 생기면 알려 주고, 고른 목록을 설치 프롬프트로 만들어 다른 컴퓨터로 옮기게 해 줘요.";

/** 기준 문장 "지키고, 고르고, 옮긴다" = 메뉴 셋(ADR 0037) */
export const MOTTO: { verb: string; menu: string; href: string; what: string }[] = [
  { verb: "지키고", menu: "프로젝트", href: "/dashboard", what: "내 레포에 깐 기술의 등급을 보고 바깥 변화를 알림으로 받아요" },
  { verb: "고르고", menu: "지도", href: "/", what: "모든 기술을 하는 일별 지도에서 비교해 청사진에 담아요" },
  { verb: "옮긴다", menu: "청사진", href: "/blueprint", what: "담은 기술을 순서대로 놓고 설치 프롬프트로 내보내요" },
];

/** 6단계를 마치면 얻는 것 */
export const GAINS = [
  "내 레포에 깐 도구 목록과 하나하나의 보안 등급",
  "바깥에서 변화가 생기면 종으로 오는 알림과, 내가 남긴 판단 기록",
  "다른 컴퓨터의 Claude Code에 그대로 붙여 넣을 설치 프롬프트",
];
export const REGISTER_HREF = "/dashboard#repo-register";

export const INTRO_EVIDENCE: Evidence[] = [
  { file: "docs/문제정의.md", phrases: ["스킬·MCP·플러그인을 소식", "내가 무엇을 깔았는지, 그게 안전한지, 더 나은 것이 나왔는지를 한눈에 볼 수 없다"] },
  { file: "README.md", phrases: ["내가 깐 기술의 목록·보안·더 나은 대안", "다른 컴퓨터에서도 다시 세팅", "지키고, 고르고, 옮긴다"] },
  { file: "app/layout.tsx", phrases: ['<NavLink href="/dashboard"', ">프로젝트</NavLink>", '<NavLink href="/">지도</NavLink>', '<NavLink href="/blueprint">청사진'] },
  { file: "app/dashboard/repo-manage.tsx", phrases: ['id="repo-register"'] },
];

/** 프로젝트 보드 숫자 띠 6칸(모양 예시에 이름만 쓴다) */
export const BAND_CELLS = ["오늘의 새 기술", "진행 중 프로젝트", "사용 중인 항목", "위험 발생", "판단 대기", "완료"];

/** 알림 세 종류와 생기는 조건(docs/spec.md 3절), 판단 주 단추(숫자 자리는 n.n) */
export const ALERT_KINDS: { name: string; when: string; primary: string }[] = [
  { name: "보안 경고", when: "내 레포가 쓰는 패키지의 보안 등급이 위험으로 바뀌었어요. 스킬의 위험 패턴은 지금은 등급만 바뀌고 알림은 없어요.", primary: "적용 후보로 · 고친 버전 n.n" },
  { name: "적용 기회", when: "내 기술과 같은 역할로 확정된 새 기술이 내가 등록한 뒤 들어왔고, 위험이 아니고, 별 수를 알면 100개 이상이에요.", primary: "써 볼 후보로" },
  { name: "모델 종료", when: "내 코드에 쓴 모델 이름이 공식 지원 종료 공지에 올랐어요.", primary: "바꿀 후보로" },
];

export const EXPORT_KINDS = ["프롬프트", "CLAUDE.md 글", "다듬기용 메타프롬프트", "Mermaid 흐름도"];

export const STEPS: GuideStep[] = [
  {
    id: "start", title: "들어오기", login: "none", href: "/login", hrefLabel: "로그인",
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
      { file: "app/taste/taste-form.tsx", phrases: [" 건너뛰기</Link>"] },
    ],
  },
  {
    id: "protect", title: "내 레포 지키기", login: "required", href: "/dashboard", hrefLabel: "프로젝트", gradeLink: true,
    gist: "레포(GitHub 저장소)에 깐 라이브러리 · MCP · 스킬 목록을 읽어 하나하나 보안 등급을 붙여요. 공개 저장소 주소 하나면 돼요.",
    actions: [
      "메뉴 「프로젝트」를 열고 「+ 레포 등록」 칸에 공개 저장소 주소를 넣어요.",
      "「등록하고 읽기」를 눌러요. 레포의 설정 파일을 읽어 사용 중인 도구를 찾아요.",
      "「첫 점검」 띠(위험 · 주의 수)와 숫자 띠(「위험 발생」 · 「판단 대기」 …)로 지금 상태를 봐요.",
      "레포 이름을 누르면 레포 상세에서 「사용 중인 항목」과 등급을 한 줄씩 봐요.",
    ],
    fine: "읽는 파일: package.json · requirements.txt · .mcp.json · .claude/skills와 Cursor · VS Code · Gemini CLI의 MCP 설정",
    evidence: [
      { file: "app/layout.tsx", phrases: [">프로젝트</NavLink>"] },
      { file: "app/dashboard/repo-manage.tsx", phrases: ["+ 레포 등록", "등록하고 읽기", "(공개 저장소)", "package.json, requirements.txt, .mcp.json, .claude/skills와 Cursor · VS Code · Gemini CLI의 MCP 설정"] },
      { file: "lib/alerts/first-check-band.ts", phrases: ["첫 점검: 위험 ${danger} · 주의 ${caution}"] },
      { file: "app/dashboard/widgets.tsx", phrases: BAND_CELLS.map((c) => `["${c}"`) },
      { file: "app/projects/[id]/page.tsx", phrases: ["`사용 중인 항목 ${shown.length}`"] },
    ],
  },
  {
    id: "choose", title: "지도에서 고르기", login: "none", href: "/", hrefLabel: "지도", gradeLink: true,
    gist: "모은 기술이 하는 일별로 한 지도에 놓여 있어요. 칩으로 좁히고, 점을 눌러 자세히 본 뒤 마음에 들면 청사진(내 개발 환경 설계도)에 담아요.",
    actions: [
      "메뉴 「지도」에서 「새 기술」 기간(「오늘」 · 「이번 주」 · 「이번 달」), 「위험·주의」, 「사용 중」 칩으로 좁혀요.",
      "점을 누르면 옆에 상세 패널이 열려요. 등급과 출처를 보고, 내가 쓰는 기술이면 같은 역할의 비교군도 봐요.",
      "「청사진에 담기」를 눌러요. 위험 등급은 청사진 단계에 넣을 수 없어요(로그인했으면 담을 때, 로그인 전에는 단계에 넣을 때 막혀요).",
    ],
    evidence: [
      { file: "app/layout.tsx", phrases: ['<NavLink href="/">지도</NavLink>'] },
      { file: "app/tech-map/controls.tsx", phrases: ['aria-hidden="true">새 기술</span>', "위험·주의 <b>", "사용 중 <b>"] },
      { file: "lib/map/view-config.ts", phrases: ['day: "오늘", week: "이번 주", month: "이번 달"'] },
      { file: "app/tech-map/side-panel.tsx", phrases: ["{n.mine ? <Card title={`비교군"] },
      { file: "app/tech-map/guest-pick.tsx", phrases: ["청사진에 담기</button>", "보안 위험 등급이라 바로 담을 수 없어요."] },
      { file: "app/blueprint/tech-tree-tab.tsx", phrases: ["✕ 위험 등급이라 넣지 않아요"] },
    ],
  },
  {
    id: "judge", title: "알림에 판단 남기기", login: "required", href: "/alerts", hrefLabel: "알림",
    gist: "바깥에서 변화가 생기면 종에 숫자가 떠요. 처음엔 알림이 없을 수 있어요. 오면 읽고, 후보로 올리거나 이유를 적어 보류해요. 판단은 기록일 뿐 아무것도 설치하지 않아요.",
    actions: [
      "메뉴 오른쪽 종의 숫자는 판단 대기 수예요. 눌러서 알림을 열어요.",
      "종류를 봐요. 「보안 경고」 · 「적용 기회」 · 「모델 종료」 세 가지예요.",
      "주 단추(「적용 후보로 · 고친 버전」 · 「써 볼 후보로」 · 「바꿀 후보로」)를 누르거나, 「보류…」를 펼쳐 이유를 5자 이상 적고 「보류 저장」을 눌러요. 고친 버전이 아직 없으면 보류만 할 수 있어요.",
      "저장되면 「다음 판단 대기 →」로 이어서 판단해요.",
    ],
    evidence: [
      { file: "app/nav/alert-bell.tsx", phrases: ["`알림, 판단 대기 ${pending}건`"] },
      { file: "lib/alerts/to-alert-view.ts", phrases: ['label: "보안 경고"', 'label: "적용 기회"', 'label: "모델 종료"', "적용 후보로 · 고친 버전", '"써 볼 후보로"', '"바꿀 후보로"'] },
      { file: "app/alerts/[id]/judgment-form.tsx", phrases: ["저장하기 전에는 아무것도 바뀌지 않아요.", ">보류…</summary>", ">보류 저장</button>"] },
      { file: "lib/alerts/validate-judgment.ts", phrases: ["MIN_HOLD_REASON = 5", "고친 버전이 아직 없어서 적용 후보로 저장할 수 없어요. 보류로 남겨 주세요."] },
      { file: "app/alerts/[id]/page.tsx", phrases: ["판단을 남겼을 뿐, 설치하거나 바꾼 것은 없어요.", "다음 판단 대기 →"] },
      { file: "docs/spec.md", phrases: ["**위험이 아닌 것 → 위험**", "스킬이 위험이 돼도 변경·알림(SPEC-3.1)은 아직 만들지 않는다(등급만)", "내 기술과 같은 역할로 **확정**됨", "내가 **등록한 시각 이후에**", "새 기술의 등급이 **위험이 아님**", "**알려져 있으면 100 이상**"] },
      { file: "docs/GLOSSARY.md", phrases: ["공식 지원 종료 공지"] },
    ],
  },
  {
    id: "compose", title: "청사진 짜기", login: "some", href: "/blueprint", hrefLabel: "청사진",
    gist: "담은 기술을 단계 순서대로 놓아 내 개발 환경의 설계도를 만들어요. 로그인 전에도 짤 수 있고, 그때 판은 이 브라우저에만 남아요.",
    actions: [
      "메뉴 「청사진」에서 위 막대 「＋ 단계」로 단계를 만들어요.",
      "아래 「기술」 패널의 카드를 단계로 끌어 놓아요. 목록 모드(좁은 화면 기본)에서는 기술을 고르고 「넣기」를 눌러요.",
      "목록 모드에서 「앞 단계 고르기」로 앞 단계를 고르고 「잇기」를 눌러 순서를 정해요. 사용 중인 항목 · 담은 기술 · 확정 이력에 있는 기술만 넣을 수 있어요.",
    ],
    evidence: [
      { file: "app/layout.tsx", phrases: ['<NavLink href="/blueprint">청사진'] },
      { file: "app/blueprint/studio.tsx", phrases: [">＋ 단계</button>", "로그인 전 — 판은 이 브라우저에만 남아요."] },
      { file: "app/blueprint/dock.tsx", phrases: ['["tech", "기술"]'] },
      { file: "app/blueprint/tech-tree-tab.tsx", phrases: ["이 카드를 단계로 끌어 놓으세요."] },
      { file: "app/blueprint/stage-node.tsx", phrases: ["아래에서 기술을 끌어 놓아요"] },
      { file: "app/blueprint/list-mode.tsx", phrases: [">넣기</button>", "<label>앞 단계 고르기", ">잇기</button>"] },
      { file: "lib/blueprint/knowledge.ts", phrases: ["사용 중인 항목 · 담은 기술 · 확정 이력에 있는 기술만 청사진에 넣을 수 있어요."] },
    ],
  },
  {
    id: "export", title: "옮기기", login: "some", href: "/blueprint", hrefLabel: "청사진",
    gist: "짠 청사진을 글로 복사해 Claude Code에 붙여 넣으면, 다른 컴퓨터에서도 같은 세팅을 다시 만들 수 있어요. 실제 설치는 Claude Code에서 직접 해요.",
    actions: [
      "청사진 위 막대의 「확정 · 내보내기」를 눌러요.",
      "형식을 골라요. 모르겠으면 처음 골라져 있는 「프롬프트」 그대로 두면 돼요. 「CLAUDE.md 글」 · 「다듬기용 메타프롬프트」 · 「Mermaid 흐름도」도 있어요.",
      "「복사」를 누르고 「복사했어요. Claude Code에 붙여 넣어 쓰세요.」가 뜨면 Claude Code에 붙여 넣어요.",
      "로그인했으면 「이대로 확정」으로 내 이력에 남겨요. 남이 공개한 틀은 「템플릿 갤러리」에서 가져와요.",
    ],
    evidence: [
      { file: "app/blueprint/studio.tsx", phrases: [">확정 · 내보내기</button>"] },
      { file: "app/blueprint/result-dialog.tsx", phrases: [...EXPORT_KINDS.map((k) => `"${k}`), 'useState<ExportKind>("prompt")', ">복사</button>", "복사했어요. Claude Code에 붙여 넣어 쓰세요.", "이대로 확정"] },
      { file: "app/blueprint/gallery/page.tsx", phrases: ["<h1>템플릿 갤러리</h1>"] },
      { file: "lib/blueprint/knowledge.ts", phrases: ["실제 설치는 Claude Code에서 직접 해요."] },
    ],
  },
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
