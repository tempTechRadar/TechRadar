// 확정한 블루프린트(blueprints 표의 board 칸)의 모양: 단계 id 없이 [[{name, techs:[{id,name}]}]]. 판(Board)과 오가는 변환,
// 화면에서 온 값 검사(경계: 서버 액션이 부른다), 내 이력의 기술별 쓴 횟수.
import { isUuid } from "../domain/my-tech-view.ts";
import { cleanName, MAX_COLUMNS, MAX_PARALLEL, MAX_TECHS, newStage, type Board, type BlueprintTech } from "./board.ts";
import { parseGraph, type Graph } from "./graph.ts";

export type StoredStage = { name: string; techs: BlueprintTech[] };
export type StoredBoard = StoredStage[][];
/** graph = v2 확정본(선 · 메모 포함, 옛 확정본은 null → board로 연다) */
export type BlueprintRecord = { id: string; name: string; projectId: string | null; projectName: string | null; createdAt: string; board: StoredBoard; graph?: Graph | null };
export type TechUsage = { n: number; projects: number; stages: string[] };

/** 내 이력으로 읽는 확정 수(쓴 횟수도 이만큼에서 센다. 넘으면 화면이 "최근 n개만"이라고 알림) */
export const HISTORY_LIMIT = 200;

export const toStored = (b: Board): StoredBoard => b.map((c) => c.map((s) => ({ name: s.name, techs: s.techs.map((t) => ({ id: t.id, name: t.name })) })));
export const toBoard = (s: StoredBoard): Board => s.map((c) => c.map((x) => newStage(x.name, x.techs)));

type Parsed = { ok: true; cols: { name: string; techIds: string[] }[][] } | { ok: false; message: string };
const fail = (message: string): Parsed => ({ ok: false, message });

/** 화면에서 온 판을 믿지 않고 다시 본다: 열 1~12개, 열마다 단계 1~4개, 이름 1~20자, 단계마다 기술 id 8개까지(이름은 서버가 DB에서 다시 읽음) */
export function parseBoard(raw: unknown): Parsed {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_COLUMNS) return fail(`단계 열은 1~${MAX_COLUMNS}개여야 해요.`);
  const cols: { name: string; techIds: string[] }[][] = [];
  for (const col of raw) {
    if (!Array.isArray(col) || col.length === 0 || col.length > MAX_PARALLEL) return fail(`나란히 놓는 단계는 1~${MAX_PARALLEL}개여야 해요.`);
    const out: { name: string; techIds: string[] }[] = [];
    for (const s of col as unknown[]) {
      const v = (s ?? {}) as { name?: unknown; techs?: unknown };
      const name = typeof v.name === "string" ? cleanName(v.name) : "";
      if (!name) return fail("이름이 빈 단계가 있어요.");
      const ids = Array.isArray(v.techs) ? v.techs.map((t) => (t as { id?: unknown })?.id) : [];
      if (ids.length > MAX_TECHS || !ids.every(isUuid)) return fail(`"${name}" 단계의 기술이 맞지 않아요(단계마다 ${MAX_TECHS}개까지).`);
      out.push({ name, techIds: [...new Set(ids)] });
    }
    cols.push(out);
  }
  return { ok: true, cols };
}

/** DB에서 읽은 판도 다시 본다(예전 줄 · 잘못 쓴 줄 하나가 화면 전체를 깨지 않게): 모양이 맞고 기술마다 이름이 있으면 그대로, 아니면 null */
export function readStored(raw: unknown): StoredBoard | null {
  if (!parseBoard(raw).ok) return null;
  const ok = (raw as StoredBoard).every((c) => c.every((s) => (s.techs ?? []).every((t) => typeof t.name === "string")));
  return ok ? (raw as StoredBoard).map((c) => c.map((s) => ({ name: cleanName(s.name), techs: s.techs ?? [] }))) : null;
}

/** 내 이력: 기술마다 확정한 블루프린트에 쓴 횟수 · 프로젝트 수(프로젝트 없이 확정한 것은 세지 않음) · 단계 */
export function usageOf(history: BlueprintRecord[]): Map<string, TechUsage> {
  const acc = new Map<string, { n: number; projects: Set<string>; stages: Set<string> }>();
  for (const h of history) for (const s of h.board.flat()) for (const t of s.techs) {
    const x = acc.get(t.id) ?? { n: 0, projects: new Set<string>(), stages: new Set<string>() };
    x.n += 1;
    if (h.projectId) x.projects.add(h.projectId);
    x.stages.add(s.name);
    acc.set(t.id, x);
  }
  return new Map([...acc].map(([id, x]) => [id, { n: x.n, projects: x.projects.size, stages: [...x.stages] }]));
}

/**
 * DB에서 읽은 graph 칸(확정본 하나를 열 때). 쓰는 곳은 DB 함수 confirm_blueprint_v2 하나뿐이지만, 경계라 parseGraph로 다시 본다.
 * 비었거나(옛 v1 확정본) 모양이 다르면 null — 화면은 board를 fromV1로 바꿔 연다(화면 전체가 깨지지 않게)
 */
export function readStoredGraph(raw: unknown): Graph | null {
  if (raw === null || raw === undefined) return null;
  const parsed = parseGraph(raw);
  return parsed.ok ? parsed.graph : null;
}
