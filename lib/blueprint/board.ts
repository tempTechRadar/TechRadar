// 청사진 판(v1, 열 · 행): 왼쪽 → 오른쪽 = 순서, 같은 열 = 동시에(나란히). DB · 화면을 모르는 순수 함수.
// P-12e 스튜디오부터 편집은 그래프(graph.ts)로 하고, 판은 저장 · 내보내기 · 이력용 투영(toBoardView)과 옛 판 읽기(fromV1)에만 쓴다.
export type BlueprintTech = { id: string; name: string };
/** note = 단계 메모(P-12h-2 T2, 200자, 앞뒤 공백 없음, 비면 키 자체가 없음) */
export type Stage = { id: string; name: string; techs: BlueprintTech[]; note?: string };
export type Board = Stage[][];

export const STAGE_NAME_MAX = 20;
export const MAX_COLUMNS = 12;
export const MAX_PARALLEL = 4;
export const MAX_TECHS = 8;

let seq = 0;
export const cleanName = (name: string) => name.trim().slice(0, STAGE_NAME_MAX);
export const newStage = (name: string, techs: BlueprintTech[] = []): Stage => ({ id: `s${Date.now().toString(36)}${++seq}`, name: cleanName(name), techs: [...techs] });
export const fromNames = (cols: string[][]): Board => cols.map((c) => c.map((n) => newStage(n)));

const mapStage = (b: Board, id: string, f: (s: Stage) => Stage): Board => b.map((c) => c.map((s) => (s.id === id ? f(s) : s)));

/** 기술 붙이기: 같은 기술은 한 번, 단계마다 최대 8개. 위험 등급 막기는 부르는 쪽(서랍 · 서버)이 한다 */
export function putTech(b: Board, id: string, tech: BlueprintTech): Board {
  return mapStage(b, id, (s) => (s.techs.some((t) => t.id === tech.id) || s.techs.length >= MAX_TECHS ? s : { ...s, techs: [...s.techs, tech] }));
}
