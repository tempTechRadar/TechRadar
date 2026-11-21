"use server";
// 하단 패널 "후보" 탭 읽기(P-12f ⑤ 보드 녹이기): 관심 · 적용 후보 · 보류. 쓰기(옮기기)는 지도 판단 칩 · 알림 상세가 한다(여기는 읽기만)
import { isLoginPreview, getCurrentUser } from "@/lib/server/current-user";
import { SAMPLE_KANBAN } from "@/lib/dev/preview-data";
import { readCandidateBoard, type CandidateBoard } from "@/lib/server/candidate-queries";
import { buildKanban } from "@/lib/views/kanban";
import { getServerSupabase } from "@/lib/supabase/server";

/** login = 로그인 전(오류가 아니라 안내), error = 읽지 못함(빈 칸과 다르게, 불변 2) */
export type CandidateRead = { kind: "ok"; board: CandidateBoard } | { kind: "login" } | { kind: "error"; message: string };
const FAILED = { kind: "error" as const, message: "후보를 불러오지 못했어요. 없다는 뜻이 아니에요. 잠시 뒤 다시 시도해 주세요." };

export async function candidatesAction(): Promise<CandidateRead> {
  if (await isLoginPreview()) { const k = buildKanban({ ...SAMPLE_KANBAN, mine: [] }); return { kind: "ok", board: { interest: k.interest, candidate: k.candidate, hold: k.hold } }; } // 미리보기는 샘플(DB 안 부름)
  const user = await getCurrentUser();
  if (!user) return { kind: "login" };
  const db = await getServerSupabase();
  if (!db) return FAILED;
  return readCandidateBoard(db, user.id).then((board) => ({ kind: "ok" as const, board }), (e: unknown) => { console.error("후보 탭 조회 실패", e instanceof Error ? e.message : e); return FAILED; });
}
