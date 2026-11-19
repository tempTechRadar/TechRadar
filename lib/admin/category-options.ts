// 갈래 고르기 칸의 선택지(P-18c, PRD-F24 "2단계: 큰 갈래 > 작은 갈래"). 순수 함수.
// 기술은 작은 갈래에만 붙이므로 작은 갈래만 고를 수 있게 큰 갈래로 묶는다. 작은 갈래가 없는 큰 갈래는 고를 것이 없어 뺀다.
export type CategoryRow = { id: string; name: string; parent_id: string | null };
export type CategoryGroup = { big: string; smalls: { id: string; name: string }[] };

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ko");

export function categoryOptions(rows: CategoryRow[]): CategoryGroup[] {
  const bigs = rows.filter((r) => r.parent_id === null).sort(byName);
  return bigs
    .map((b) => ({ big: b.name, smalls: rows.filter((r) => r.parent_id === b.id).sort(byName).map((r) => ({ id: r.id, name: r.name })) }))
    .filter((g) => g.smalls.length > 0);
}
