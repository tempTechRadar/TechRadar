"use server";
// 기술 트리(P-12h S2)의 관심 · 보류 폴더 읽기: 판단은 보드와 같은 계산(readCandidateBoard), 카드 정보(하는 일 · 갈래 · 종류)는 기술 줄에서.
// 읽기만 한다(판단 바꾸기는 카드의 "적용 후보로 고르기" = markTech). 사용자 토큰으로 본인 것만(불변 5). 못 읽으면 "읽지 못함"(빈 폴더와 다르게, 불변 2)
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import { SAMPLE_KANBAN } from "@/lib/dev/preview-data";
import { readTechDetails, type PoolTech } from "@/lib/server/blueprints";
import { readCandidateBoard } from "@/lib/server/candidate-queries";
import { buildKanban, type Card } from "@/lib/views/kanban";
import { getServerSupabase } from "@/lib/supabase/server";

/** 관심 · 보류 카드 = 기술 정보 + 판단 이유(note) */
export type JudgedTech = PoolTech & { note: string | null };
export type TreeExtras = { kind: "ok"; interest: JudgedTech[]; hold: JudgedTech[] } | { kind: "login" } | { kind: "error" };

/** 카드(보드 계산) → 트리 카드. 기술 정보를 못 찾은 것(지워진 기술 등)은 이름 · 등급만 */
const merge = (cards: Card[], details: Map<string, PoolTech>): JudgedTech[] => cards.flatMap((c) => {
  if (!c.techId) return [];
  const d = details.get(c.techId);
  return [{ ...(d ?? { id: c.techId, name: c.name, type: "", grade: c.grade, field: null, sub: null, oneLiner: null, projects: 0, mark: null }), note: c.note }];
});

export async function treeExtrasAction(): Promise<TreeExtras> {
  if (await isLoginPreview()) { const k = buildKanban({ ...SAMPLE_KANBAN, mine: [] }); return { kind: "ok", interest: merge(k.interest, new Map()), hold: merge(k.hold, new Map()) }; } // 미리보기는 샘플(DB 안 부름)
  const user = await getCurrentUser();
  if (!user) return { kind: "login" };
  const db = await getServerSupabase();
  if (!db) return { kind: "error" };
  try {
    const board = await readCandidateBoard(db, user.id);
    const ids = [...board.interest, ...board.hold].flatMap((c) => (c.techId ? [c.techId] : []));
    const details = new Map((await readTechDetails(db, ids)).map((t) => [t.id, t]));
    return { kind: "ok", interest: merge(board.interest, details), hold: merge(board.hold, details) };
  } catch (e) {
    console.error("기술 트리 관심 · 보류 조회 실패", e instanceof Error ? e.message : e);
    return { kind: "error" };
  }
}
