"use server";
// 하단 패널 "후보" 탭 읽기(P-12f ⑤ 보드 녹이기): 관심 · 적용 후보 · 보류. 쓰기(옮기기)는 지도 판단 칩 · 알림 상세가 한다(여기는 읽기만)
import { isLoginPreview, getCurrentUser } from "@/lib/server/current-user";
import { SAMPLE_KANBAN } from "@/lib/dev/preview-data";
import { readCandidateBoard, type CandidateBoard } from "@/lib/server/candidate-queries";
import { buildKanban } from "@/lib/views/kanban";
import { getServerSupabase } from "@/lib/supabase/server";

export async function candidatesAction(): Promise<CandidateBoard | { message: string }> {
  if (await isLoginPreview()) { const k = buildKanban({ ...SAMPLE_KANBAN, mine: [] }); return { interest: k.interest, candidate: k.candidate, hold: k.hold }; } // 미리보기는 샘플(DB 안 부름)
  const user = await getCurrentUser();
  if (!user) return { message: "로그인하면 내 관심 · 적용 후보 · 보류가 여기에 모여요." };
  const db = await getServerSupabase();
  if (!db) return { message: "후보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  return readCandidateBoard(db, user.id).catch((e: unknown) => { console.error("후보 탭 조회 실패", e instanceof Error ? e.message : e); return { message: "후보를 불러오지 못했어요. 없다는 뜻이 아니에요. 잠시 뒤 다시 시도해 주세요." }; });
}
