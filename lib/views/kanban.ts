// 내 레이더 칸반(ADR 0028 2·3, design.md 13절 4): 관심 → 적용 후보 → 쓰는 중, 보류. 본인 데이터만 쓰는 순수 함수.
// 쓰는 중 = 저장소에서 읽은 내 기술(사람이 옮기지 않음). 관심 · 적용 후보 · 보류 = 그 기술의 내 표시(tech_marks)와 알림 판단 중 더 최근 것(알림 상세에서 판단하면 표시는 안 바뀌므로).
// 내 기술이면서 표시도 있으면 두 칸에 한 번씩 보인다(쓰는 중인데 대안으로 바꿀 후보로 올린 것 등).

export type Column = "interest" | "candidate" | "using" | "hold";
export const COLUMN_ORDER: Column[] = ["interest", "candidate", "using", "hold"];
export const COLUMN_KO: Record<Column, string> = { interest: "관심", candidate: "적용 후보", using: "쓰는 중", hold: "보류" };
type Grade = "pass" | "caution" | "danger" | "unknown";

export type KanbanInput = {
  /** 내 기술(저장소에서 읽은 것). techId가 없으면 이름만 넣은 기술 */
  mine: { id: string; techId: string | null; name: string; grade: Grade; projectName: string }[];
  marks: { techId: string; name: string; grade: Grade; status: "interest" | "candidate" | "hold"; reason: string | null; updatedAt: string }[];
  /** 판단한 알림(알림이 가리키는 기술 기준) */
  judged: { techId: string; name: string; grade: Grade; decision: "candidate" | "hold"; reason: string | null; judgedAt: string }[];
};
export type Card = { key: string; techId: string | null; name: string; grade: Grade; note: string | null; from: "repo" | "mark" | "alert"; myTechId: string | null };

const byName = (a: Card, b: Card) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.key < b.key ? -1 : 1);

export function buildKanban(input: KanbanInput): Record<Column, Card[]> {
  const out: Record<Column, Card[]> = { interest: [], candidate: [], using: [], hold: [] };
  for (const m of input.mine) out.using.push({ key: `mine:${m.id}`, techId: m.techId, name: m.name, grade: m.grade, note: m.projectName || null, from: "repo", myTechId: m.id });
  const at = (iso: string) => Date.parse(iso) || 0;
  const latest = new Map<string, KanbanInput["judged"][number]>(); // 기술마다 알림 판단 중 가장 최근
  for (const j of input.judged) if (!latest.has(j.techId) || at(latest.get(j.techId)!.judgedAt) < at(j.judgedAt)) latest.set(j.techId, j);
  for (const m of input.marks) {
    const j = latest.get(m.techId);
    if (j && at(j.judgedAt) > at(m.updatedAt)) continue; // 표시 뒤에 알림에서 다시 판단함: 판단이 이긴다
    latest.delete(m.techId);
    out[m.status].push({ key: `mark:${m.techId}`, techId: m.techId, name: m.name, grade: m.grade, note: m.reason, from: "mark", myTechId: null });
  }
  for (const j of latest.values()) out[j.decision].push({ key: `alert:${j.techId}`, techId: j.techId, name: j.name, grade: j.grade, note: j.reason, from: "alert", myTechId: null });
  for (const c of COLUMN_ORDER) out[c].sort(byName);
  return out;
}
