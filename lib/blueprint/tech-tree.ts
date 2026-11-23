// 청사진 하단 패널 기술 트리(P-12h S2, 유니티 프로젝트 창): 기술을 기준 1~2단으로 묶은 폴더. DB · 화면을 모르는 순수 함수.
// 기준: 내 판단(적용 후보 → 관심 → 보류 → 내 기술 → 그 외, 순서 고정) · 하는 일 · 세부 갈래 · 내 태그 · 프로젝트(지도 view-config DIMS 방식).
// 폴더 안 차례는 넘겨받은 순서 그대로(부르는 쪽이 filterPool 규칙으로 정렬). 빈 폴더는 만들지 않는다.
export type Judgment = "candidate" | "interest" | "hold" | "mine" | "other";
export type TreeDim = "judgment" | "field" | "sub" | "tag" | "project";
/** 트리 한 칸에 놓이는 기술. tags · projects는 여러 개면 그 폴더마다 한 번씩 */
export type TreeItem = { id: string; judgment: Judgment; field: string | null; sub: string | null; tags: string[]; projectNames: string[] };
/** path = 1단부터 이 폴더까지의 이름, key = path를 JSON으로(이름에 "/"가 있어도 겹치지 않게) */
export type Folder<T extends TreeItem> = { key: string; path: string[]; name: string; count: number; items: T[]; children: Folder<T>[] };

export const DIM_KO: Record<TreeDim, string> = { judgment: "내 판단", field: "하는 일", sub: "세부 갈래", tag: "내 태그", project: "프로젝트" };
export const JUDGMENT_ORDER: Judgment[] = ["candidate", "interest", "hold", "mine", "other"];
// U2(11-22 사용자): 지도 "담기" · 별과 말을 맞춤 — 적용 후보 폴더 = "담은 기술", 관심 = "★ 관심"
export const JUDGMENT_KO: Record<Judgment, string> = { candidate: "담은 기술", interest: "★ 관심", hold: "보류", mine: "사용 중", other: "그 외" };
const NONE: Record<Exclude<TreeDim, "judgment">, string> = { field: "아직 분류 안 됨", sub: "아직 분류 안 됨", tag: "태그 없음", project: "프로젝트 없음" };

/** 한 기술이 그 기준에서 들어갈 폴더 이름들(내 판단은 늘 하나, 태그 · 프로젝트는 여럿일 수 있음) */
export function folderNames(item: TreeItem, dim: TreeDim): string[] {
  if (dim === "judgment") return [JUDGMENT_KO[item.judgment]];
  if (dim === "field") return [item.field ?? NONE.field];
  if (dim === "sub") return [item.sub ?? NONE.sub];
  const list = dim === "tag" ? item.tags : item.projectNames;
  return list.length ? [...new Set(list)] : [NONE[dim]];
}

/** 폴더 차례: 내 판단은 고정, 나머지는 이름순이고 "없음 · 분류 안 됨"은 맨 뒤 */
function order(dim: TreeDim, names: string[]): string[] {
  if (dim === "judgment") return JUDGMENT_ORDER.map((j) => JUDGMENT_KO[j]).filter((n) => names.includes(n));
  const none = NONE[dim];
  return [...names].sort((a, b) => (a === none ? 1 : b === none ? -1 : a.localeCompare(b, "ko")));
}

/** dims = [1단] 또는 [1단, 2단](2단은 1단과 다른 기준만 — 같으면 무시) */
export function buildTechTree<T extends TreeItem>(items: T[], dims: TreeDim[], parent: string[] = []): Folder<T>[] {
  const [dim, next] = dims;
  if (!dim) return [];
  const groups = new Map<string, T[]>();
  for (const it of items) for (const n of folderNames(it, dim)) { const g = groups.get(n); if (g) g.push(it); else groups.set(n, [it]); }
  return order(dim, [...groups.keys()]).map((name) => {
    const list = groups.get(name)!, path = [...parent, name];
    return { key: JSON.stringify(path), path, name, count: list.length, items: list, children: next && next !== dim ? buildTechTree(list, [next], path) : [] };
  });
}

/** 그 기술이 든 첫 폴더부터 가장 깊은 폴더까지의 key(펼치고 고를 차례). 없으면 [] */
export function pathTo<T extends TreeItem>(fs: Folder<T>[], id: string): string[] {
  const f = fs.find((x) => x.items.some((t) => t.id === id));
  return f ? [f.key, ...pathTo(f.children, id)] : [];
}

type Judgeable = { id: string; mark: "candidate" | null; projects: number; note?: string | null };
export type Judged<T> = T & { judgment: Judgment; droppable: boolean; note: string | null };
/** 트리 칸의 판단과 넣을 수 있는지(불변 1). 같은 기술은 한 번.
 *  판단: 적용 후보(서랍 계산) → 관심 · 보류(사람이 고른 것, 이유 포함) → 내 기술 · 그 외(서랍) → 찾은 것은 그 외.
 *  넣을 수 있는지는 판단과 따로 서랍(pool)에 있는지로만 — 손님은 판단이 없어 찾은 것도 넣는다 */
export function judgeTechs<T extends Judgeable>(src: { pool: T[]; interest: T[]; hold: T[]; found: T[]; guest: boolean }): Judged<T>[] {
  const out = new Map<string, Judged<T>>(), inPool = new Map(src.pool.map((t) => [t.id, t]));
  const put = (t: T, judgment: Judgment, droppable: boolean) => { if (!out.has(t.id)) out.set(t.id, { ...t, judgment, droppable, note: t.note ?? null }); };
  const judged = (t: T): T => ({ ...(inPool.get(t.id) ?? t), note: t.note ?? null }); // 서랍에도 있으면 서랍 정보(프로젝트 등) + 판단 이유
  for (const t of src.pool) if (t.mark === "candidate") put(t, "candidate", true);
  for (const t of src.interest) put(judged(t), "interest", inPool.has(t.id));
  for (const t of src.hold) put(judged(t), "hold", inPool.has(t.id));
  for (const t of src.pool) put(t, t.projects > 0 ? "mine" : "other", true);
  for (const t of src.found) put(inPool.get(t.id) ?? t, "other", inPool.has(t.id) || src.guest);
  return [...out.values()];
}

/** 2단으로 고를 수 있는 기준: 1단과 다른 것만 */
export const secondDims = (first: TreeDim): TreeDim[] => (Object.keys(DIM_KO) as TreeDim[]).filter((d) => d !== first);
