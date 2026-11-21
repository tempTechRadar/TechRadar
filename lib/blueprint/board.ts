// 블루프린트 판(design.md 14절 ⑤): 왼쪽 → 오른쪽 = 순서, 같은 열 = 동시에(나란히). DB · 화면을 모르는 순수 함수.
// 모든 바꾸기는 새 판을 돌려준다(되돌리기 = 전 판을 그대로 다시 쓰기). 빈 열은 바로 치운다.
export type BlueprintTech = { id: string; name: string };
export type Stage = { id: string; name: string; techs: BlueprintTech[] };
export type Board = Stage[][];
export type Spot = { c: number; r: number; s: Stage };

export const STAGE_NAME_MAX = 20;
export const MAX_COLUMNS = 12;
export const MAX_PARALLEL = 4;
export const MAX_TECHS = 8;

let seq = 0;
export const cleanName = (name: string) => name.trim().slice(0, STAGE_NAME_MAX);
export const newStage = (name: string, techs: BlueprintTech[] = []): Stage => ({ id: `s${Date.now().toString(36)}${++seq}`, name: cleanName(name), techs: [...techs] });
export const fromNames = (cols: string[][]): Board => cols.map((c) => c.map((n) => newStage(n)));

const tidy = (b: Board): Board => b.filter((c) => c.length > 0);
const without = (b: Board, id: string): Board => b.map((c) => c.filter((s) => s.id !== id));
const mapStage = (b: Board, id: string, f: (s: Stage) => Stage): Board => b.map((c) => c.map((s) => (s.id === id ? f(s) : s)));

export function find(b: Board, id: string): Spot | null {
  for (let c = 0; c < b.length; c++) {
    const r = b[c].findIndex((s) => s.id === id);
    if (r >= 0) return { c, r, s: b[c][r] };
  }
  return null;
}

/** at번째 열 앞에 새 단계 열(at = 열 수면 맨 끝). 열이 가득이거나 이름이 비면 그대로 */
export function addColumn(b: Board, at: number, name: string): Board {
  if (b.length >= MAX_COLUMNS || !cleanName(name)) return b;
  return [...b.slice(0, at), [newStage(name)], ...b.slice(at)];
}
/** c번째 열에 나란히 하나 더 */
export function addParallel(b: Board, c: number, name: string): Board {
  if (!b[c] || b[c].length >= MAX_PARALLEL || !cleanName(name)) return b;
  return b.map((col, i) => (i === c ? [...col, newStage(name)] : col));
}
export const removeStage = (b: Board, id: string): Board => tidy(without(b, id));
export const renameStage = (b: Board, id: string, name: string): Board => (cleanName(name) ? mapStage(b, id, (s) => ({ ...s, name: cleanName(name) })) : b);

export type Target = { col: number; newColumn: boolean };
/** 끌어 놓기: 새 열로(col 앞 틈) 또는 그 열에 나란히. 열 번호는 빼기 전 번호(빈 열은 넣은 뒤 치움). 못 옮기면 같은 판 */
export function moveStage(b: Board, id: string, to: Target): Board {
  const f = find(b, id);
  if (!f) return b;
  if (!to.newColumn && (f.c === to.col || (b[to.col]?.length ?? MAX_PARALLEL) >= MAX_PARALLEL)) return b;
  if (to.newColumn && b.length >= MAX_COLUMNS && b[f.c].length > 1) return b;
  const rest = without(b, id);
  const next = to.newColumn ? [...rest.slice(0, to.col), [f.s], ...rest.slice(to.col)] : rest.map((c, i) => (i === to.col ? [...c, f.s] : c));
  return tidy(next);
}
/** 새 열을 만들 수 있는지(나란히에서 떼는 ← → · 떼기): 열이 가득이면 못 함 */
export const canSplitOut = (b: Board, c: number) => b[c].length === 1 || b.length < MAX_COLUMNS;
/** 이웃 열에 나란히 붙일 수 있는지(끌어 놓기의 키보드 대안) */
export const canJoin = (b: Board, c: number, d: -1 | 1) => !!b[c + d] && b[c + d].length < MAX_PARALLEL;
export const join = (b: Board, id: string, d: -1 | 1): Board => { const f = find(b, id); return f && canJoin(b, f.c, d) ? moveStage(b, id, { col: f.c + d, newColumn: false }) : b; };
/** ← →(끌지 않는 대안): 혼자면 이웃 열과 자리 바꿈, 나란히면 떼어 바로 앞 · 뒤 새 열로 */
export function shift(b: Board, id: string, d: -1 | 1): Board {
  const f = find(b, id);
  if (!f) return b;
  if (b[f.c].length > 1) return moveStage(b, id, { col: d < 0 ? f.c : f.c + 1, newColumn: true });
  const t = f.c + d;
  if (t < 0 || t >= b.length) return b;
  const next = [...b];
  [next[f.c], next[t]] = [next[t], next[f.c]];
  return next;
}
/** ↑ ↓: 같은 열 안에서 자리 바꿈 */
export function lift(b: Board, id: string, d: -1 | 1): Board {
  const f = find(b, id);
  if (!f || !b[f.c][f.r + d]) return b;
  const col = [...b[f.c]];
  [col[f.r], col[f.r + d]] = [col[f.r + d], col[f.r]];
  return b.map((c, i) => (i === f.c ? col : c));
}
/** 떼기: 나란히에서 떼어 바로 뒤 새 열로 */
export const split = (b: Board, id: string): Board => { const f = find(b, id); return f && b[f.c].length > 1 ? moveStage(b, id, { col: f.c + 1, newColumn: true }) : b; };

/** 기술 붙이기: 같은 기술은 한 번, 단계마다 최대 8개. 위험 등급 막기는 부르는 쪽(서랍 · 서버)이 한다 */
export function putTech(b: Board, id: string, tech: BlueprintTech): Board {
  return mapStage(b, id, (s) => (s.techs.some((t) => t.id === tech.id) || s.techs.length >= MAX_TECHS ? s : { ...s, techs: [...s.techs, tech] }));
}
export const removeTech = (b: Board, id: string, techId: string): Board => mapStage(b, id, (s) => ({ ...s, techs: s.techs.filter((t) => t.id !== techId) }));
