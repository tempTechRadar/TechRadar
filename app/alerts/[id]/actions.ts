"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DEMO_FAIL_SAVE_COOKIE } from "@/lib/demo/demo-switch";
import { maybeFailForDemo } from "@/lib/demo/judgment-hooks";
import { recordActionOutcome } from "@/lib/server/action-record";
import { PREVIEW_NO_SAVE } from "@/lib/dev/login-preview";
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import { saveJudgment, type JudgmentResult } from "@/lib/server/judgments";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { getServerSupabase } from "@/lib/supabase/server";

/** n = 실패를 돌려준 횟수: 같은 문구가 다시 와도 오류 상자를 새로 붙여 화면 읽기가 다시 읽고 등장도 한 번 돈다(P-12g C1) */
export type JudgeState = { message: string | null; n: number };

/**
 * 판단 뒤 흐름 화면의 "조치와 기록"(action_record) 단계를 남긴다(P-8·P-20c). 저장했으면 성공, 저장을 시도했다가 실패했으면 실패.
 * 입력 검사·권한·읽기 실패처럼 저장까지 가지 못한 경우는 조치를 시도한 게 아니라서 남기지 않는다.
 * 서비스 키는 이 기록에만 쓴다. 판단 저장은 위에서 사용자 클라이언트로 끝났고, 기록이 실패해도 판단 결과는 바뀌지 않는다.
 */
async function recordAction(alertId: string, result: JudgmentResult): Promise<void> {
  const outcome = result.ok ? { ok: true as const } : result.saveAttempted ? { ok: false as const, message: result.message } : null;
  const serviceDb = getServiceSupabase();
  if (outcome && serviceDb) await recordActionOutcome(serviceDb, alertId, outcome);
}

/** 적용 후보·보류 저장(IA-7, PRD-F17·F19). 실패하면 알림은 그대로 판단 대기고 메시지만 돌려준다. */
export async function judge(previous: JudgeState, formData: FormData): Promise<JudgeState> {
  if (await isLoginPreview()) return { message: PREVIEW_NO_SAVE, n: previous.n + 1 }; // 미리보기(개발용)는 아무것도 저장하지 않는다(불변 1·4)
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const alertId = String(formData.get("alertId") ?? "");
  const supabase = (await getServerSupabase())!;
  // 저장 실패 시연(P-20c): 스위치·시연 계정·1회용 쿠키가 모두 맞을 때만 저장이 일부러 실패한다. 평소에는 supabase 그대로.
  const jar = await cookies();
  const picked = maybeFailForDemo({ db: supabase, env: process.env, isDemo: user.isDemo, cookie: jar.get(DEMO_FAIL_SAVE_COOKIE)?.value });
  if (picked.consumed) jar.delete(DEMO_FAIL_SAVE_COOKIE);
  const result = await saveJudgment(picked.db, { id: user.id, role: user.role }, {
    alertId,
    decision: String(formData.get("decision") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  await recordAction(alertId, result);
  // 이미 판단된 알림(다른 탭 · 지도에서)은 실패가 아니라 완료: 상세를 다시 그려 실제 완료 카드를 보인다(불변 4 · 6, P-12g C1)
  if (!result.ok && result.code !== "done") return { message: result.message, n: previous.n + 1 };
  revalidatePath("/alerts");
  // saved=1: 방금 저장한 첫 화면에서만 판단 카드가 한 번 움직인다(P-12g C2, saved-focus가 주소에서 지움)
  redirect(result.ok ? `/alerts/${alertId}?saved=1` : `/alerts/${alertId}`);
}
