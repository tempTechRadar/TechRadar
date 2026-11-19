// 저장된 경계 사례 채점 결과 읽기(PRD-F30, /admin/demo 채점 칸). 주인: 차세일(C).
// 경계 사례 채점(edge.ts)은 OSV 응답을 globalThis.fetch 자리에 잠깐 넣는다. 서버에서 돌리면 같은 순간의 다른 요청(정기 수집·DB 호출)이
// 가짜 응답을 받을 수 있어(불변 2) 화면에서는 다시 돌리지 않고, `npm run eval`이 저장한 결과(eval/result.json)만 읽어 보여 준다.
import type { Reader } from "./actual.ts";
import type { EdgeRow, EdgeScore, EdgeTotals } from "./edge-score.ts";

export type StoredEdges = { ok: true; when: string; edges: EdgeScore } | { ok: false; reason: string };

const TOTAL_KEYS: (keyof EdgeTotals)[] = ["cases", "hit", "quietOk", "miss", "falseAlarm", "outcomeWrong", "failed"];
const ROW_TEXT: (keyof EdgeRow)[] = ["id", "kind", "target", "source", "expectedOutcome", "actualOutcome", "verdict", "note"];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isEdgeScore(v: unknown): v is EdgeScore {
  if (!isObject(v) || !Array.isArray(v.rows) || !isObject(v.totals) || !isObject(v.byKind)) return false;
  const totals = v.totals;
  return TOTAL_KEYS.every((k) => typeof totals[k] === "number") && v.rows.every((r) => isObject(r) && ROW_TEXT.every((k) => typeof r[k] === "string"));
}

function tryRead(reader: Pick<Reader, "readJson">, path: string): unknown {
  try {
    return reader.readJson(path);
  } catch {
    return undefined;
  }
}

/** 저장된 결과가 없거나, 모양이 다르거나, 지금 정답 파일과 사례가 다르면(낡음) 이유와 함께 "읽지 못함". "사례 없음"으로 보이지 않게 한다. */
export function readStoredEdges(reader: Pick<Reader, "readJson">): StoredEdges {
  const result = tryRead(reader, "eval/result.json");
  if (result === undefined) return { ok: false, reason: "저장된 채점 결과(eval/result.json)를 읽지 못했어요." };
  if (!isObject(result) || typeof result.when !== "string" || result.when === "" || !isEdgeScore(result.edges)) {
    return { ok: false, reason: "저장된 채점 결과(eval/result.json)에 경계 사례 결과가 없거나 모양이 달라요." };
  }
  const gold = tryRead(reader, "eval/gold.json");
  const cases = isObject(gold) && Array.isArray(gold.edgeCases) ? gold.edgeCases : null;
  if (!cases) return { ok: false, reason: "정답 파일(eval/gold.json)의 경계 사례를 읽지 못해 저장된 결과와 견줄 수 없어요." };
  const goldIds = cases.map((c) => (isObject(c) ? String(c.id) : ""));
  const rowIds = result.edges.rows.map((r) => r.id);
  if (goldIds.length !== rowIds.length || goldIds.some((id, i) => id !== rowIds[i])) {
    return { ok: false, reason: "저장된 결과가 지금 정답 파일의 경계 사례와 달라요(낡은 결과). `npm run eval`을 다시 돌려 저장해 주세요." };
  }
  return { ok: true, when: result.when, edges: result.edges };
}
