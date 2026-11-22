// 프로젝트 관리 보드 W4 · W6 계산(P-12i D2). DB · 화면을 모르는 순수 함수.
const WEEK_MS = 7 * 86_400_000;
export type ChangeKind = "security" | "opportunity" | "model_eol";
export type WeekRow = { from: string; security: number; opportunity: number; model_eol: number; total: number };

/** W4 "추이": 지금부터 거꾸로 7일씩 weeks칸(오래된 칸 먼저). 범위 밖 · 모르는 종류 · 날짜가 깨진 줄은 안 셈 */
export function weeklyChanges(alerts: { kind: string; createdAt: string }[], now: Date, weeks = 6): WeekRow[] {
  const rows: WeekRow[] = Array.from({ length: weeks }, (_, i) => ({ from: new Date(now.getTime() - (weeks - i) * WEEK_MS).toISOString(), security: 0, opportunity: 0, model_eol: 0, total: 0 }));
  for (const a of alerts) {
    const ago = Math.floor((now.getTime() - Date.parse(a.createdAt)) / WEEK_MS);
    const row = Number.isFinite(ago) && ago >= 0 && ago < weeks ? rows[weeks - 1 - ago] : undefined;
    if (!row || !(a.kind === "security" || a.kind === "opportunity" || a.kind === "model_eol")) continue;
    row[a.kind]++; row.total++;
  }
  return rows;
}

export type CheckTech = { techId: string | null; myTechId: string; name: string; concept: boolean };
export type Checked = { checked: number; total: number; ratio: number | null; unchecked: { techId: string; myTechId: string; name: string }[] };
/** W6 점검한 비율(주요 지표 grade_views): 등급이 있는 카탈로그 기술만(개념 · 이름만 넣은 것 빼고), 같은 기술은 한 번. 셀 것이 없으면 ratio null(0%와 다르게) */
export function checkedRatio(techs: CheckTech[], viewed: Set<string>): Checked {
  const by = new Map<string, CheckTech>();
  for (const t of techs) if (t.techId && !t.concept && !by.has(t.techId)) by.set(t.techId, t);
  const all = [...by.values()], checked = all.filter((t) => viewed.has(t.techId!)).length;
  return { checked, total: all.length, ratio: all.length ? checked / all.length : null,
    unchecked: all.filter((t) => !viewed.has(t.techId!)).map((t) => ({ techId: t.techId!, myTechId: t.myTechId, name: t.name })).sort((a, b) => a.name.localeCompare(b.name)) };
}
