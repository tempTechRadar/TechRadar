"use client";
// 스튜디오 그래프 상태: 되돌리기 · 다시(50단계, 단추) + 이 브라우저 · 이 계정의 초안(blueprint-draft-v2). 초안은 편의 기억이라 못 쓰면 새로 고칠 때 사라질 뿐.
// 처음엔 null(서버 그림과 맞춤) → 브라우저에서 v2 초안, 없으면 옛 격자 초안을 한 번 바꿔 읽고(lib/blueprint/draft.ts), 그것도 없으면 첫 템플릿.
// shortcut: 같은 계정으로 탭 두 개를 열면 나중에 고친 탭의 초안이 저장된다(storage 이벤트로 맞추지 않음). 여러 탭 편집이 흔해지면 storage 이벤트로 알린다
import { useCallback, useEffect, useState } from "react";
import { fromNames } from "@/lib/blueprint/board";
import { readDraft } from "@/lib/blueprint/draft";
import { fromV1, type Graph } from "@/lib/blueprint/graph";
import { TEMPLATES } from "@/lib/blueprint/knowledge";

export const UNDO_MAX = 50;
type Hist = { past: Graph[]; now: Graph; future: Graph[] };
/** unread: 지난 v2 초안을 읽지 못함. kept = 따로 보관함(false면 보관도 못 해 원본을 덮지 않고 둔다) */
export type Unread = { kept: boolean } | null;

const key = (who: string) => `blueprint-draft-v2:${who}`;
/** 읽지 못한 v2 초안은 덮어쓰기 전에 이 키로 옮겨 둔다(초안이 말없이 사라지지 않게, 불변 4 취지) */
const unreadKey = (who: string) => `blueprint-draft-v2-unread:${who}`;

function load(who: string): { saved: ReturnType<typeof readDraft>["saved"]; unread: Unread } {
  let v2: string | null = null, v1: string | null = null;
  try { v2 = localStorage.getItem(key(who)); v1 = localStorage.getItem(`techradar-blueprint:${who}`); } catch { return { saved: null, unread: null }; } // 저장소를 못 쓰면 덮을 것도 없다
  const r = readDraft(v2, v1);
  if (!r.unread) return { saved: r.saved, unread: null };
  try { localStorage.setItem(unreadKey(who), v2!); return { saved: null, unread: { kept: true } }; } catch { return { saved: null, unread: { kept: false } }; }
}

export function useStudioGraph(who: string) {
  const [h, setH] = useState<Hist | null>(null);
  const [name, setName] = useState("내 청사진");
  const [unread, setUnread] = useState<Unread>(null);
  useEffect(() => {
    const r = load(who);
    setH({ past: [], now: r.saved?.graph ?? fromV1(fromNames(TEMPLATES[0].cols)), future: [] });
    if (r.saved) setName(r.saved.name);
    setUnread(r.unread);
  }, [who]);
  useEffect(() => {
    // 보관하지 못한 초안은 사람이 고치기 전까지 덮지 않는다(처음 연 새 판으로 말없이 지우지 않게)
    if (!h || (unread && !unread.kept && !h.past.length)) return;
    try { localStorage.setItem(key(who), JSON.stringify({ name, graph: h.now })); } catch { /* 저장을 막은 브라우저: 이번 화면에서만 */ }
  }, [who, h, name, unread]);

  /** 바꾸기 하나 = 되돌리기 한 칸. 같은 그래프(못 바꿈)는 쌓지 않는다 */
  const push = useCallback((next: Graph) => setH((x) => (!x || next === x.now ? x : { past: [...x.past, x.now].slice(-UNDO_MAX), now: next, future: [] })), []);
  const undo = useCallback(() => setH((x) => (x?.past.length ? { past: x.past.slice(0, -1), now: x.past[x.past.length - 1], future: [x.now, ...x.future] } : x)), []);
  const redo = useCallback(() => setH((x) => (x?.future.length ? { past: [...x.past, x.now], now: x.future[0], future: x.future.slice(1) } : x)), []);
  return { graph: h?.now ?? null, push, undo, redo, canUndo: !!h?.past.length, canRedo: !!h?.future.length, name, setName, unread };
}
