"use client";
// 스튜디오 그래프 상태: 되돌리기 · 다시(50단계, 단추) + 이 브라우저 · 이 계정의 초안(blueprint-draft-v2). 초안은 편의 기억이라 못 쓰면 새로 고칠 때 사라질 뿐.
// 처음엔 null(서버 그림과 맞춤) → 브라우저에서 v2 초안, 없으면 옛 격자 초안을 한 번 바꿔 읽고(fromV1), 그것도 없으면 첫 템플릿.
import { useCallback, useEffect, useState } from "react";
import { fromNames } from "@/lib/blueprint/board";
import { fromV1, parseDraft, type Graph } from "@/lib/blueprint/graph";
import { TEMPLATES } from "@/lib/blueprint/knowledge";
import { parseBoard, toBoard, type StoredBoard } from "@/lib/blueprint/stored";

export const UNDO_MAX = 50;
type Hist = { past: Graph[]; now: Graph; future: Graph[] };

/** 읽지 못한 v2 초안은 덮어쓰기 전에 이 키로 옮겨 둔다(초안이 말없이 사라지지 않게, 불변 4 취지) */
const unreadKey = (who: string) => `blueprint-draft-v2-unread:${who}`;

type Saved = { name: string; graph: Graph };
const parseJson = (raw: string | null): unknown => { try { return JSON.parse(raw ?? "null"); } catch { return null; } };

/** unread = v2 초안이 있었지만 읽지 못해 따로 옮겨 둠 */
function readSaved(who: string): { saved: Saved | null; unread: boolean } {
  try {
    const raw = localStorage.getItem(`blueprint-draft-v2:${who}`);
    const v2 = parseJson(raw) as { name?: unknown; graph?: unknown } | null;
    const g = v2 ? parseDraft(v2.graph) : null; // 초안은 깊이 · 같은 깊이 한도를 안 본다(편집 중엔 넘을 수 있음, 확정 때 limitProblems가 막음)
    if (g?.ok) return { saved: { name: typeof v2!.name === "string" ? v2!.name : "내 청사진", graph: g.graph }, unread: false };
    if (raw) { localStorage.setItem(unreadKey(who), raw); return { saved: null, unread: true }; }
    const v1 = parseJson(localStorage.getItem(`techradar-blueprint:${who}`)) as { name?: unknown; board?: unknown } | null; // 옛 격자 초안(P-12d)
    if (v1 && parseBoard(v1.board).ok) return { saved: { name: typeof v1.name === "string" ? v1.name : "내 청사진", graph: fromV1(toBoard(v1.board as StoredBoard)) }, unread: false };
  } catch { /* 저장소를 못 쓰는 브라우저: 새로 시작(저장도 안 되니 덮어쓸 것도 없음) */ }
  return { saved: null, unread: false };
}

export function useStudioGraph(who: string) {
  const [h, setH] = useState<Hist | null>(null);
  const [name, setName] = useState("내 청사진");
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    const r = readSaved(who);
    setH({ past: [], now: r.saved?.graph ?? fromV1(fromNames(TEMPLATES[0].cols)), future: [] });
    if (r.saved) setName(r.saved.name);
    setUnread(r.unread);
  }, [who]);
  useEffect(() => {
    if (!h) return;
    try { localStorage.setItem(`blueprint-draft-v2:${who}`, JSON.stringify({ name, graph: h.now })); } catch { /* 저장을 막은 브라우저: 이번 화면에서만 */ }
  }, [who, h, name]);

  /** 바꾸기 하나 = 되돌리기 한 칸. 같은 그래프(못 바꿈)는 쌓지 않는다 */
  const push = useCallback((next: Graph) => setH((x) => (!x || next === x.now ? x : { past: [...x.past, x.now].slice(-UNDO_MAX), now: next, future: [] })), []);
  const undo = useCallback(() => setH((x) => (x?.past.length ? { past: x.past.slice(0, -1), now: x.past[x.past.length - 1], future: [x.now, ...x.future] } : x)), []);
  const redo = useCallback(() => setH((x) => (x?.future.length ? { past: [...x.past, x.now], now: x.future[0], future: x.future.slice(1) } : x)), []);
  return { graph: h?.now ?? null, push, undo, redo, canUndo: !!h?.past.length, canRedo: !!h?.future.length, name, setName, unread };
}
