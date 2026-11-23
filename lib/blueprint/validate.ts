// 검증 독 · 확정 창 "고칠 것"(P-12j H4): 판에서 실제로 셀 수 있는 것만 본다(데이터 정직성 규칙 2). "누락된 의존성 · 호환 충돌"은 데이터가 없어 다루지 않는다.
// blocks = 확정을 막는 것(DB도 거절), 아니면 알려만 준다. 화면 · DB를 모르는 순수 함수.
import { layers, limitProblems, type Graph } from "./graph.ts";

export type IssueKind = "no-stages" | "unnamed" | "limit" | "cycle" | "outside" | "danger" | "collect-error" | "empty-stage";
/** target: 누르면 고를 곳(단계 · 단계 안 기술), 판 전체 문제면 null */
export type Issue = { kind: IssueKind; target: { stageId: string; techId?: string } | null; message: string; blocks: boolean };
/** 서랍(관문 목록)에서 아는 것: 등급 · 수집 오류. 서랍에 없는 기술 = 관문 밖 */
export type TechFacts = Map<string, { grade: string; collectError?: boolean }>;

export function validateGraph(g: Graph, info: TechFacts, opts: { guest?: boolean } = {}): Issue[] {
  const out: Issue[] = [];
  if (!g.stages.length) out.push({ kind: "no-stages", target: null, message: "단계를 하나 이상 만들어 주세요.", blocks: true });
  for (const s of g.stages) if (!s.name.trim()) out.push({ kind: "unnamed", target: { stageId: s.id }, message: "이름 없는 단계가 있어요. 이름을 적어 주세요.", blocks: true });
  const l = layers(g);
  // 한도 · 고리 문장은 limitProblems 그대로(확정 창과 같은 말). 고리면 끝 문장이 고리
  const limits = limitProblems(g);
  limits.forEach((message, i) => out.push({ kind: !l.ok && i === limits.length - 1 ? "cycle" : "limit", target: null, message, blocks: true }));
  for (const s of g.stages) {
    if (!s.techs.length) out.push({ kind: "empty-stage", target: { stageId: s.id }, message: `"${s.name}" 단계에 기술이 없어요.`, blocks: false });
    for (const t of s.techs) {
      const f = info.get(t.id), at = { stageId: s.id, techId: t.id };
      // 손님은 관문이 없어(이 브라우저 판) 막지 않는다: 확정은 로그인 안내
      if (!f) { if (!opts.guest) out.push({ kind: "outside", target: at, message: `${t.name}(${s.name}): 아직 담지 않은 기술이에요. "청사진에 담기"를 누르거나 빼 주세요.`, blocks: true }); continue; }
      if (f.grade === "danger") out.push({ kind: "danger", target: at, message: `${t.name}(${s.name}): 보안 위험 등급이에요.`, blocks: false });
      if (f.collectError) out.push({ kind: "collect-error", target: at, message: `${t.name}(${s.name}): 수집 오류로 지난번 값을 보여 줘요("변화 없음"이 아니에요).`, blocks: false });
    }
  }
  return out;
}
