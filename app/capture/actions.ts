"use server";

import { MAX_LINES, parseCaptureLines } from "@/lib/capture/parse-capture";
import { lookupCapture, type CaptureResult } from "@/lib/server/capture";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";

export type CaptureState = { results: CaptureResult[] } | { error: string } | null;

/** "+ 기술 넣기" 찾기(design.md 13절 5). 찾기만 하고 아무것도 저장하지 않는다(관심은 줄마다 따로 누름) */
export async function findCapture(text: unknown): Promise<CaptureState> {
  if (typeof text !== "string") return { error: `한 줄에 하나씩, 최대 ${MAX_LINES}줄 적어 주세요.` }; // 서버 액션은 누구나 부를 수 있는 입구
  const user = await getCurrentUser();
  if (!user) return { error: "로그인하면 기술을 넣을 수 있어요." };
  const lines = parseCaptureLines(text.slice(0, 5000)); // 너무 긴 붙여 넣기는 앞부분만
  if (!lines.length) return { error: `한 줄에 하나씩, 최대 ${MAX_LINES}줄 적어 주세요.` };
  const db = await getServerSupabase();
  if (!db) return { error: "찾지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  try {
    return { results: await lookupCapture(db, user.id, lines) };
  } catch (e) {
    console.error("기술 넣기 찾기 실패", e instanceof Error ? e.message : e);
    return { error: "찾지 못했어요. 기술이 없다는 뜻이 아니에요. 잠시 뒤 다시 시도해 주세요." };
  }
}
