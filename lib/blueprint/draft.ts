// 스튜디오 초안 · 확정 id의 순수 규칙(P-12e). 화면(use-studio-graph · use-studio-save)이 브라우저 저장소 · 서버 액션과 잇는다.
// - 초안 읽기: v2 초안은 parseDraft(깊이 · 같은 깊이 한도는 확정 때만), 없으면 옛 격자 초안을 한 번 바꿔 읽는다. 읽지 못한 v2는 "따로 보관"으로 알린다(불변 4 취지).
// - 같은 확정: 이름 · 프로젝트 · 템플릿 · 단계(id · 이름 · 기술) · 연결선 · 나란히 순서가 같으면 같은 내용(위치만 옮긴 것은 같음, 불변 3).
import { parseBoard, toBoard, type StoredBoard } from "./stored.ts";
import { fromV1, parseDraft, toBoardView, type Graph } from "./graph.ts";

export type Saved = { name: string; graph: Graph };
const parseJson = (raw: string | null): unknown => { try { return JSON.parse(raw ?? "null"); } catch { return null; } };
const nameOf = (v: unknown) => (typeof v === "string" ? v : "내 청사진");

/** v2 = blueprint-draft-v2 값, v1 = 옛 격자 초안 값(둘 다 저장소 글자 그대로). unread = v2가 있었지만 읽지 못함(부르는 쪽이 따로 보관) */
export function readDraft(v2: string | null, v1: string | null): { saved: Saved | null; unread: boolean } {
  const d2 = parseJson(v2) as { name?: unknown; graph?: unknown } | null;
  const g = d2 ? parseDraft(d2.graph) : null;
  if (g?.ok) return { saved: { name: nameOf(d2!.name), graph: g.graph }, unread: false };
  if (v2) return { saved: null, unread: true };
  const d1 = parseJson(v1) as { name?: unknown; board?: unknown } | null;
  if (d1 && parseBoard(d1.board).ok) return { saved: { name: nameOf(d1.name), graph: fromV1(toBoard(d1.board as StoredBoard)) }, unread: false };
  return { saved: null, unread: false };
}

/** 같은 내용이면 같은 글자. 위치는 빼되, 나란히 순서(이력 · 내보내기에 나오는 y → x 순서)는 넣는다 */
export const contentKey = (head: unknown[], g: Graph): string =>
  JSON.stringify([...head, g.stages.map((s) => [s.id, s.name, s.techs.map((t) => t.id)]).sort(), g.edges, toBoardView(g)?.map((c) => c.map((s) => s.id)) ?? null]);
