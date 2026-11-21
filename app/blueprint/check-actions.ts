"use server";
// 청사진 점검의 서버 액션(P-12e I). actions.ts와 따로 둔 새 파일: 같은 파일을 여러 세션이 고치지 않게.
// 읽기는 늘 되고(코드 점검 사실, AI 없음), Claude는 "점검 받기"를 누를 때만 부른다. 청사진은 바꾸지 않는다(불변 1).
import { BLUEPRINT_CHECK_PER_USER_PER_DAY } from "@/lib/ai/decide-ai-call";
import { PREVIEW_NO_SAVE } from "@/lib/dev/login-preview";
import { countChecksToday, generateBlueprintCheck, loadBlueprintFacts, readLatestCheck, toStoredFact, type LatestCheck, type StoredFact } from "@/lib/server/blueprint-check";
import { createAnthropicClient } from "@/lib/server/anthropic-client";
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { getServerSupabase } from "@/lib/supabase/server";

export type CheckPanelData = { facts: StoredFact[]; latest: LatestCheck | null; usedToday: number; limit: number };
export type CheckLoad = { ok: true; data: CheckPanelData } | { ok: false; message: string };
export type CheckRun = { message: string | null; tone: "error" | "info" };

const UNAVAILABLE = "지금은 AI 점검을 받을 수 없어요. 잠시 뒤에 다시 시도해 주세요. (한도 때문이면 내일 0시에 풀려요)";

/** 점검 탭 내용: 코드가 확인한 사실 + 가장 최근 AI 점검 + 오늘 쓴 횟수. 읽지 못하면 이유를 알린다(빈 목록으로 속이지 않음, 불변 2) */
export async function loadCheckAction(blueprintId: string): Promise<CheckLoad> {
  if (await isLoginPreview()) return { ok: false, message: PREVIEW_NO_SAVE };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인하면 확정한 청사진을 점검할 수 있어요." };
  const userDb = await getServerSupabase();
  const serviceDb = getServiceSupabase();
  if (!userDb || !serviceDb) return { ok: false, message: "점검 내용을 읽지 못했어요. 잠시 뒤 다시 열어 주세요." };
  const now = new Date();
  try {
    const loaded = await loadBlueprintFacts({ userDb, serviceDb }, String(blueprintId ?? ""), user.id, now);
    if (!loaded) return { ok: false, message: "이 청사진을 찾지 못했어요." };
    const [latest, usedToday] = await Promise.all([readLatestCheck(userDb, blueprintId), countChecksToday(userDb, user.id, now)]);
    return { ok: true, data: { facts: loaded.facts.map(toStoredFact), latest, usedToday, limit: BLUEPRINT_CHECK_PER_USER_PER_DAY } };
  } catch (error) {
    console.error("청사진 점검 내용 읽기 실패", error instanceof Error ? error.message : error);
    return { ok: false, message: "점검 내용을 읽지 못했어요. 잠시 뒤 다시 열어 주세요." };
  }
}

/** "점검 받기": 같은 재료면 이전 결과를 다시 보여 주고(한도 안 씀), 아니면 Claude를 한 번 부른다 */
export async function runCheckAction(blueprintId: string): Promise<CheckRun> {
  if (await isLoginPreview()) return { message: PREVIEW_NO_SAVE, tone: "info" }; // 미리보기(개발용): Claude도 부르지 않는다
  const user = await getCurrentUser();
  if (!user) return { message: "로그인하면 확정한 청사진을 점검할 수 있어요.", tone: "info" };
  const userDb = await getServerSupabase();
  const serviceDb = getServiceSupabase();
  if (!userDb || !serviceDb) return { message: UNAVAILABLE, tone: "info" };
  const result = await generateBlueprintCheck({ userDb, serviceDb, ai: createAnthropicClient() }, { blueprintId: String(blueprintId ?? ""), userId: user.id });
  if (result.status === "created") return { message: null, tone: "info" };
  if (result.status === "reused") return { message: "같은 내용이라 이전 점검 결과를 다시 보여 드려요. 오늘 횟수는 쓰지 않았어요.", tone: "info" };
  if (result.status === "failed") return { message: "점검을 받지 못했어요. 청사진은 그대로예요. 잠시 뒤에 다시 눌러 주세요.", tone: "error" };
  if (result.reason === "not_found") return { message: "이 청사진을 찾지 못했어요.", tone: "error" };
  if (result.reason === "in_progress") return { message: "이미 점검 중이에요. 잠시 뒤에 결과를 확인해 주세요.", tone: "info" };
  if (result.reason === "user_limit") return { message: `오늘은 점검을 ${BLUEPRINT_CHECK_PER_USER_PER_DAY}번 모두 받았어요. 내일 0시(한국 시간)부터 다시 받을 수 있어요.`, tone: "info" };
  return { message: UNAVAILABLE, tone: "info" };
}
