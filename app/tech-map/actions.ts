"use server";

import { revalidatePath } from "next/cache";
import { recordActionOutcome } from "@/lib/server/action-record";
import { getCurrentUser } from "@/lib/server/current-user";
import { saveMark, type MarkResult, type MarkStatus } from "@/lib/server/marks";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * 지도 사이드바에서 바로 남기는 판단(관심 · 적용 후보 · 보류, ADR 0028). status null = 표시 지우기(되돌리기도 이것으로).
 * 저장은 사용자 토큰으로 DB 함수 하나(불변 1·4·5). 함께 판단된 알림이 있으면 흐름 화면의 "조치와 기록" 단계를 남긴다(alerts/[id]/actions.ts와 같은 방식).
 */
export async function markTech(techId: string, status: MarkStatus | null, reason: string): Promise<MarkResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인하면 판단을 남길 수 있어요." };
  const db = await getServerSupabase();
  if (!db) return { ok: false, message: "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  const result = await saveMark(db, { techId, status, reason });
  if (result.ok) { revalidatePath("/"); revalidatePath("/views"); }
  if (result.ok && result.judgedAlerts.length) {
    const serviceDb = getServiceSupabase();
    if (serviceDb) for (const alertId of result.judgedAlerts) await recordActionOutcome(serviceDb, alertId, { ok: true });
    revalidatePath("/alerts");
  }
  return result;
}
