"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/server/current-user";
import { saveJudgment } from "@/lib/server/judgments";
import { getServerSupabase } from "@/lib/supabase/server";

export type JudgeState = { message: string | null };

/** 적용 후보·보류 저장(IA-7, PRD-F17·F19). 실패하면 알림은 그대로 판단 대기고 메시지만 돌려준다. */
export async function judge(_previous: JudgeState, formData: FormData): Promise<JudgeState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const alertId = String(formData.get("alertId") ?? "");
  const supabase = (await getServerSupabase())!;
  const result = await saveJudgment(supabase, { id: user.id, role: user.role }, {
    alertId,
    decision: String(formData.get("decision") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!result.ok) return { message: result.message };
  revalidatePath("/alerts");
  redirect(`/alerts/${alertId}`);
}
