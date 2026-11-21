"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PREVIEW_NO_SAVE } from "@/lib/dev/login-preview";
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import { createAnthropicClient } from "@/lib/server/anthropic-client";
import { generateScenario } from "@/lib/server/scenario";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { getServerSupabase } from "@/lib/supabase/server";

export type ScenarioState = { message: string | null; tone: "error" | "info" };

const UNAVAILABLE = "지금은 적용 시나리오를 만들 수 없어요. 잠시 뒤에 다시 시도해 주세요. (한도 때문이면 내일 0시에 풀려요)";

/**
 * "적용 시나리오 만들기"(IA-8, PRD-F18). 누를 때만 Claude를 부른다. 시나리오는 참고 자료라 판단 전후 언제든 요청할 수 있고(ADR 0010),
 * 판단·알림 상태는 건드리지 않는다. 서비스 키는 결과·호출 기록 쓰기와 카탈로그 읽기에만 쓴다(내 알림 읽기·요청 줄은 사용자 클라이언트).
 */
export async function requestScenario(_previous: ScenarioState, formData: FormData): Promise<ScenarioState> {
  if (await isLoginPreview()) return { message: PREVIEW_NO_SAVE, tone: "info" }; // 미리보기(개발용): Claude도 부르지 않는다
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const alertId = String(formData.get("alertId") ?? "");
  const serviceDb = getServiceSupabase();
  if (!serviceDb) return { message: UNAVAILABLE, tone: "info" };
  const userDb = (await getServerSupabase())!;
  const result = await generateScenario({ userDb, serviceDb, ai: createAnthropicClient() }, { alertId, userId: user.id });
  revalidatePath(`/alerts/${alertId}`);
  if (result.status === "created") return { message: null, tone: "info" };
  if (result.status === "failed") return { message: "적용 시나리오를 만들지 못했어요. 알림과 판단은 그대로예요. 잠시 뒤에 다시 요청해 주세요.", tone: "error" };
  if (result.reason === "not_found") return { message: "이 알림을 찾지 못했어요.", tone: "error" };
  if (result.reason === "user_limit") return { message: "오늘은 적용 시나리오를 5번 모두 만들었어요. 내일 0시(한국 시간)부터 다시 만들 수 있어요.", tone: "info" };
  return { message: UNAVAILABLE, tone: "info" };
}
