// 내 레이더(PRD-F36): 내 기술을 판단 상태 고리로 나눈다. 쓰는 중 · 적용 후보 · 관심 · 보류·중단. 본인 데이터만 쓰는 순수 함수.
// 고리 기준(여기서 정함, PRD에 세부 없음): 가장 최근 판단이 적용 후보면 "적용 후보", 보류면 "보류·중단",
// 판단 전 알림이 남아 있으면 "관심", 아무것도 없으면 "쓰는 중".

export type Ring = "using" | "candidate" | "watching" | "hold";
export const RING_ORDER: Ring[] = ["using", "candidate", "watching", "hold"];
export const RING_KO: Record<Ring, string> = { using: "쓰는 중", candidate: "적용 후보", watching: "관심", hold: "보류·중단" };

export type RadarTech = { id: string; label: string; grade: "pass" | "caution" | "danger" | "unknown" };
/** 내 기술에 걸린 알림 하나와 그 판단(없으면 판단 전) */
export type RadarAlert = { myTechnologyId: string; createdAt: string; judgment: { decision: "candidate" | "hold"; judgedAt: string } | null };

export type RadarEntry = RadarTech & { ring: Ring };

function ringOf(alerts: RadarAlert[]): Ring {
  const judged = alerts.filter((a) => a.judgment).sort((a, b) => (a.judgment!.judgedAt < b.judgment!.judgedAt ? 1 : -1));
  const latest = judged[0]?.judgment;
  const pending = alerts.some((a) => !a.judgment && (!latest || a.createdAt > latest.judgedAt));
  if (pending) return "watching"; // 마지막 판단 뒤에 새로 온 알림이 있으면 다시 살펴볼 것
  if (latest) return latest.decision === "candidate" ? "candidate" : "hold";
  return "using";
}

/** 고리별로 나누고, 고리 안은 이름순(같은 입력이면 같은 그림) */
export function buildRadar(techs: RadarTech[], alerts: RadarAlert[]): Record<Ring, RadarEntry[]> {
  const byTech = new Map<string, RadarAlert[]>();
  for (const a of alerts) byTech.set(a.myTechnologyId, [...(byTech.get(a.myTechnologyId) ?? []), a]);
  const out: Record<Ring, RadarEntry[]> = { using: [], candidate: [], watching: [], hold: [] };
  for (const t of techs) {
    const ring = ringOf(byTech.get(t.id) ?? []);
    out[ring].push({ ...t, ring });
  }
  for (const r of RING_ORDER) out[r].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : a.id < b.id ? -1 : 1));
  return out;
}
