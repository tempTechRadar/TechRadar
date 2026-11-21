"use server";
// 블루프린트 화면의 서버 액션: 확정(DB 함수가 본인 이름으로 한 줄, 같은 id는 한 번) · 카탈로그 찾기. 사용자 토큰으로 부른다(불변 5).
import { revalidatePath } from "next/cache";
import { confirmBlueprint, findPoolTechs, type ConfirmInput, type ConfirmResult, type PoolTech } from "@/lib/server/blueprints";
import { PREVIEW_NO_SAVE } from "@/lib/dev/login-preview";
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";

export async function confirmAction(input: ConfirmInput): Promise<ConfirmResult> {
  if (await isLoginPreview()) return { ok: false, message: PREVIEW_NO_SAVE }; // 미리보기(개발용)는 저장하지 않는다(불변 1·4)
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인하면 확정할 수 있어요. 판은 이 브라우저에 그대로 있어요." };
  const db = await getServerSupabase();
  if (!db) return { ok: false, message: "확정하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  const r = await confirmBlueprint(db, input);
  if (r.ok) revalidatePath("/blueprint");
  return r;
}

/** null = 찾지 못함(조회 실패). 빈 배열 = 찾았지만 없음 */
export async function searchAction(query: string): Promise<PoolTech[] | null> {
  const user = await getCurrentUser();
  const db = user ? await getServerSupabase() : null;
  return db ? findPoolTechs(db, String(query ?? "")) : null;
}
