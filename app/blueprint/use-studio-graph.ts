"use client";
// 스튜디오 그래프 상태: 되돌리기 · 다시(50단계, 단추) + 이 브라우저 · 이 계정의 초안(blueprint-draft-v2). 초안은 편의 기억이라 못 쓰면 새로 고칠 때 사라질 뿐.
// 처음엔 null(서버 그림과 맞춤) → 브라우저에서 v2 초안, 없으면 옛 격자 초안을 한 번 바꿔 읽고(lib/blueprint/draft.ts), 그것도 없으면 빈 단계 하나(blankGraph).
// 이름도 되돌리기 칸에 함께 둔다: 판과 이름을 같이 바꾼 일(이력 불러오기 · 템플릿)은 되돌리면 이름도 돌아가고, 이름 칸에 친 글은 판만 되돌려도 남는다.
// shortcut: 같은 계정으로 탭 두 개를 열면 나중에 고친 탭의 초안이 저장된다(storage 이벤트로 맞추지 않음). 여러 탭 편집이 흔해지면 storage 이벤트로 알린다
import { useCallback, useEffect, useState } from "react";
import { fromNames } from "@/lib/blueprint/board";
import { blankGraph, guestOffer, readDraft, type Saved } from "@/lib/blueprint/draft";
import { fromV1, type Graph } from "@/lib/blueprint/graph";
import { TEMPLATES } from "@/lib/blueprint/knowledge";

export const UNDO_MAX = 50;
/** renamed = 이 칸이 이름까지 바꾼 일 */
type Snap = { graph: Graph; name: string; renamed: boolean };
type Hist = { past: Snap[]; now: Snap; future: Snap[] };
/** unread: 지난 v2 초안을 읽지 못함. kept = 따로 보관함(false면 보관도 못 해 원본을 덮지 않고 둔다) */
export type Unread = { kept: boolean } | null;

/** 로그인 전(P-12f 손님 모드)의 who. 그 초안은 blueprint-draft-v2:guest에 두고, 로그인하면 한 번 가져올지 묻는다 */
export const GUEST = "guest";
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

/** 되돌리기 · 다시: 그 칸이 이름을 바꾼 일이면 이름도 그 칸 것으로, 아니면 지금 이름을 둔다 */
const step = (to: Snap, from: Snap, renamed: boolean): Snap => (renamed ? to : { ...to, name: from.name });

export function useStudioGraph(who: string) {
  const [h, setH] = useState<Hist | null>(null);
  const [unread, setUnread] = useState<Unread>(null);
  const [guest, setGuest] = useState<Saved | null>(null); // 로그인한 사람에게 가져올지 물을 손님 초안
  useEffect(() => {
    const r = load(who);
    setH({ past: [], now: { graph: r.saved?.graph ?? blankGraph(), name: r.saved?.name ?? "내 청사진", renamed: false }, future: [] });
    setUnread(r.unread);
    if (who !== GUEST) try {
      // P-12l 전 처음 판(첫 템플릿)을 손대지 않은 손님 초안도 묻지 않는다(그때 들른 손님 브라우저엔 모두 남아 있다)
      const raw = localStorage.getItem(key(GUEST));
      setGuest(guestOffer(raw, blankGraph()) && guestOffer(raw, fromV1(fromNames(TEMPLATES[0].cols))));
    } catch { /* 저장소를 못 쓰면 물을 것도 없다 */ }
  }, [who]);
  useEffect(() => {
    // 보관하지 못한 초안은 사람이 고치기 전까지 덮지 않는다(처음 연 새 판으로 말없이 지우지 않게)
    if (!h || (unread && !unread.kept && !h.past.length)) return;
    try { localStorage.setItem(key(who), JSON.stringify({ name: h.now.name, graph: h.now.graph })); } catch { /* 저장을 막은 브라우저: 이번 화면에서만 */ }
  }, [who, h, unread]);

  /** 바꾸기 하나 = 되돌리기 한 칸. 같은 그래프(못 바꿈)는 쌓지 않는다. name을 주면 이름도 함께 바꾼 일.
   *  merge = 지금 칸을 바꿔 끼움(메모를 쓰는 동안 글자마다 칸이 생기지 않게, 입력칸에 들어와 처음 바꾼 것만 새 칸, P-12h-2 T2) */
  const push = useCallback((next: Graph, name?: string, merge?: boolean) => setH((x) => {
    if (!x || (next === x.now.graph && (name === undefined || name === x.now.name))) return x;
    if (merge && x.past.length) return { ...x, now: { ...x.now, graph: next }, future: [] };
    return { past: [...x.past, x.now].slice(-UNDO_MAX), now: { graph: next, name: name ?? x.now.name, renamed: name !== undefined && name !== x.now.name }, future: [] };
  }), []);
  const undo = useCallback(() => setH((x) => {
    if (!x?.past.length) return x;
    const to = x.past[x.past.length - 1];
    return { past: x.past.slice(0, -1), now: step(to, x.now, x.now.renamed), future: [x.now, ...x.future] };
  }), []);
  const redo = useCallback(() => setH((x) => {
    if (!x?.future.length) return x;
    const to = x.future[0];
    return { past: [...x.past, x.now], now: step(to, x.now, to.renamed), future: x.future.slice(1) };
  }), []);
  /** 이름 칸에 친 글: 되돌리기 칸을 만들지 않는다 */
  const setName = useCallback((name: string) => setH((x) => (x ? { ...x, now: { ...x.now, name } } : x)), []);
  /** 손님 초안: take = 되돌리기 한 칸으로 가져오기(전 판은 되돌리기로), 어느 쪽이든 손님 칸은 비워 다시 묻지 않는다 */
  const answerGuest = useCallback((take: boolean) => {
    if (take && guest) push(guest.graph, guest.name);
    try { localStorage.removeItem(key(GUEST)); } catch { /* 못 지우면 다음에 또 묻는다 */ }
    setGuest(null);
  }, [guest, push]);
  return { graph: h?.now.graph ?? null, push, undo, redo, canUndo: !!h?.past.length, canRedo: !!h?.future.length, name: h?.now.name ?? "내 청사진", setName, unread, guestDraft: guest, answerGuest };
}
