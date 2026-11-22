// 블루프린트 단계 지식(design.md 14절 ⑤ "처음엔 고정 목록"): 단계 → 맞는 기술 분류, 다음에 흔히 오는 단계, 나란히 하기 좋은 단계, 템플릿, 인터뷰.
// 분류 이름은 카탈로그 "하는 일" · "세부 갈래"(categories 시드)와 같은 글자다. 앱은 AI를 부르지 않는다.
import type { Board } from "./board.ts";

/** 판단 = 청사진으로 가는 관문(11-21 화면 개편 C): 알림 상세 · 보드 · 청사진 서랍에 같은 글로 */
/** 청사진 화면의 관문 말(U2 뒤 사용자: 지도 "청사진에 담기"와 같은 말). 알림 판단 화면은 BLUEPRINT_GATE("적용 후보")를 그대로 쓴다 */
export const STUDIO_GATE = "내 기술 · 담은 기술 · 확정 이력에 있는 기술만 청사진에 넣을 수 있어요. 실제 설치는 Claude Code에서 직접 해요.";
export const BLUEPRINT_GATE = "내 기술 · 적용 후보 · 확정 이력에 있는 기술만 청사진에 넣을 수 있어요. 실제 설치는 Claude Code에서 직접 해요.";

/** 단계 이름 → 서랍에 보일 기술 분류(하는 일 또는 세부 갈래). 목록에 없는 단계(직접 쓴 이름)는 거르지 않는다 */
export const STAGE_FIELDS: Record<string, string[]> = {
  문제정의: ["리서치", "기획·문서"], 리서치: ["리서치"], "솔루션 후보": ["리서치"], 기획: ["기획·문서"],
  디자인: ["디자인"], 프론트엔드: ["프론트엔드", "디자인"], 백엔드: ["백엔드·데이터"],
  개발: ["백엔드·데이터", "프론트엔드", "AI 작업 방식", "git·이슈"], 테스트: ["검사·보안"],
  "코드 리뷰": ["검사·보안", "git·이슈"], QA: ["검사·보안", "브라우저 자동화"], 문서화: ["기획·문서"],
  배포: ["배포·운영"], 모니터링: ["모니터링·로그", "보안·감사"], 회고: ["기획·문서"],
};
const NEXT: Record<string, string[]> = {
  문제정의: ["리서치", "기획"], 리서치: ["기획", "솔루션 후보"], "솔루션 후보": ["기획"], 기획: ["디자인", "개발", "백엔드"],
  디자인: ["프론트엔드", "개발"], 프론트엔드: ["테스트", "QA"], 백엔드: ["테스트", "QA"], 개발: ["테스트", "코드 리뷰"],
  테스트: ["QA", "배포"], "코드 리뷰": ["QA", "배포"], QA: ["배포", "문서화"], 문서화: ["배포"], 배포: ["모니터링", "회고"], 모니터링: ["회고"], 회고: [],
};
const SIDE: Record<string, string[]> = {
  디자인: ["백엔드"], 프론트엔드: ["백엔드"], 백엔드: ["프론트엔드", "디자인"], 테스트: ["코드 리뷰"], "코드 리뷰": ["테스트"], QA: ["문서화"], 문서화: ["QA"], 개발: ["문서화"],
};
export const TEMPLATES: { name: string; desc: string; cols: string[][] }[] = [
  { name: "초보자 기본 개발 단계", desc: "처음이라면 이 순서를 추천해요", cols: [["문제정의"], ["기획"], ["디자인"], ["개발"], ["테스트"], ["배포"]] },
  { name: "빠른 시제품", desc: "아이디어를 빨리 만들어 볼 때", cols: [["기획"], ["개발"], ["배포"]] },
  { name: "팀 프로젝트(나란히)", desc: "디자인과 백엔드를 동시에", cols: [["문제정의"], ["기획"], ["디자인", "백엔드"], ["프론트엔드"], ["QA"], ["배포"]] },
];

/** 단계에 맞는 기술인지: 그 단계의 분류가 기술의 하는 일 · 세부 갈래 중 하나와 같으면. 목록에 없는 단계는 모두 맞음 */
/** 단계 이름의 분류. 사용자가 지은 이름이 "constructor" 같은 객체 기본 속성과 겹쳐도 목록에 없는 단계로 본다 */
export const stageFields = (stage: string): string[] | undefined => (Object.hasOwn(STAGE_FIELDS, stage) ? STAGE_FIELDS[stage] : undefined);
export function fitsStage(stage: string, tech: { field: string | null; sub: string | null }): boolean {
  const fields = stageFields(stage);
  return !fields || fields.includes(tech.field ?? "") || fields.includes(tech.sub ?? "");
}

const have = (b: Board) => new Set(b.flat().map((s) => s.name));
const prevOf = (n: string) => Object.keys(NEXT).filter((k) => NEXT[k].includes(n));
/** 틈(gap = 그 번호 열 앞)에 넣을 추천: 앞 열의 다음 단계 + 뒤 열의 앞 단계, 이미 있는 것은 빼고 4개까지 */
export function recommendAt(b: Board, gap: number): string[] {
  const before = b[gap - 1] ?? [], after = b[gap] ?? [];
  const start = gap === 0 ? ["문제정의", "기획", "리서치"] : [];
  const pool = [...start, ...before.flatMap((s) => NEXT[s.name] ?? []), ...after.flatMap((s) => prevOf(s.name))];
  const used = have(b);
  return [...new Set(pool)].filter((n) => !used.has(n)).slice(0, 4);
}
/** c번째 열에 나란히 할 추천 3개까지 */
export function recommendBeside(b: Board, c: number): string[] {
  const used = have(b);
  return [...new Set((b[c] ?? []).flatMap((s) => SIDE[s.name] ?? []))].filter((n) => !used.has(n)).slice(0, 3);
}

/** 인터뷰(grilling처럼 한 번에 한 질문, 첫 보기가 추천) */
export const QUESTIONS: { id: string; q: string; opts: [string, string][] }[] = [
  { id: "what", q: "무엇을 만드나요?", opts: [["web", "웹 서비스"], ["data", "데이터 분석·리서치"], ["auto", "자동화 도구"]] },
  { id: "team", q: "혼자 하나요, 팀으로 하나요?", opts: [["solo", "혼자"], ["team", "팀(2~4명)"]] },
  { id: "design", q: "화면 디자인이 중요한가요?", opts: [["yes", "중요해요"], ["light", "간단하면 돼요"]] },
  { id: "data", q: "데이터를 저장하나요?", opts: [["yes", "네(DB 필요)"], ["no", "아니요"]] },
  { id: "test", q: "검사는 어느 정도로 할까요?", opts: [["basic", "기본 테스트만"], ["full", "꼼꼼히(코드 리뷰·QA 따로)"]] },
  { id: "ship", q: "배포까지 하나요?", opts: [["yes", "네, 배포까지"], ["local", "내 컴퓨터에서만"]] },
];
export function buildFromAnswers(a: Record<string, string>): string[][] {
  const cols: string[][] = [["문제정의"]];
  if (a.what === "data") cols.push(["리서치"]);
  cols.push(["기획"]);
  const ui = a.what !== "data" && a.design === "yes";
  if (ui && a.team === "team" && a.data === "yes") cols.push(["디자인", "백엔드"], ["프론트엔드"]);
  else {
    if (ui) cols.push(["디자인"]);
    cols.push(["개발"]);
  }
  if (a.test === "full") cols.push(["테스트", "코드 리뷰"], ["QA"]);
  else cols.push(["테스트"]);
  if (a.ship === "yes") cols.push(["배포"]);
  return cols;
}
