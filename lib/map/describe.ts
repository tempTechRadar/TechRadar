// 지도에 마우스를 올렸을 때 보일 한국어 한 줄(11-21 사용자 결정): 공식 소개는 대부분 영어라, 이미 아는 사실(분류 · 종류 · 인기 · 보안)로 문장을 만든다.
// AI 번역은 쓰지 않는다(비용 승인 전, 동결 뒤 다시 정함). DB · 화면을 모르는 순수 함수.
import { GRADE_KO, MANUAL_KIND, UNSORTED, type MapNode } from "./build-map.ts";

const NOUN: Record<string, string> = { MCP: "MCP 서버", 스킬: "스킬", 플러그인: "플러그인", "개발 도구": "개발 도구", 모델: "AI 모델", "연동 서비스": "연동 서비스", 개념: "개념", [MANUAL_KIND]: "기술" };

/** 1,234 → "1.2천", 34,000 → "3.4만", 3억 넘는 주간 다운로드 → "3억". 단위는 반올림한 뒤의 값으로 고른다(9,960 → "1만", "10천" 아님) */
export function compactKo(n: number): string {
  const unit = (v: number, d: number, name: string) => `${(v / d).toFixed(v / d >= 10 ? 0 : 1).replace(/\.0$/, "")}${name}`;
  if (n >= 99_950_000) return unit(n, 100_000_000, "억");
  if (n >= 9_950) return unit(n, 10_000, "만");
  if (n >= 1_000) return unit(n, 1_000, "천");
  return String(n);
}

type Describable = Pick<MapNode, "attrs" | "stars" | "weeklyDownloads" | "grade">;
/** 무엇인지 한 줄 + 인기 · 보안 한 줄. 예: ["결제·금융 쪽 MCP 서버", "별 1.2천 · 보안 통과"] */
export function describeKo(n: Describable): [string, string] {
  const noun = NOUN[n.attrs.kind] ?? n.attrs.kind;
  const area = n.attrs.sub && n.attrs.sub !== UNSORTED ? n.attrs.sub : n.attrs.field;
  const what = !area || area === UNSORTED ? `아직 분류 안 된 ${noun}` : `${area} 쪽 ${noun}`;
  const facts = [
    n.stars ? `별 ${compactKo(n.stars)}` : null,
    n.weeklyDownloads ? `주간 다운로드 ${compactKo(n.weeklyDownloads)}` : null,
    n.grade === "danger" || n.grade === "caution" || n.grade === "pass" ? `보안 ${GRADE_KO[n.grade]}` : null,
  ].filter(Boolean);
  return [what, facts.join(" · ")];
}
