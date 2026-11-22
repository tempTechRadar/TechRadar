"use server";
// 추천 화면의 관심 표시(IA-20, ADR 0028). 로그인한 사람의 클라이언트로만 쓴다(불변 5). 관심만 남기고 지운다.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PREVIEW_NO_SAVE } from "@/lib/dev/login-preview";
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import { setInterest } from "@/lib/server/recommend-mark";
import { getServerSupabase } from "@/lib/supabase/server";

export type InterestState = { error?: string } | null;

export async function toggleInterest(_prev: InterestState, formData: FormData): Promise<InterestState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/recommend");
  if (await isLoginPreview()) return { error: PREVIEW_NO_SAVE };
  const supabase = await getServerSupabase();
  if (!supabase) return { error: "서버의 Supabase 설정이 비어 있어요. 관리자에게 알려 주세요." };
  const action = formData.get("action") === "clear" ? "clear" : "interest";
  const result = await setInterest(supabase, user.id, String(formData.get("techId") ?? ""), action);
  if (!result.ok) return { error: result.message };
  revalidatePath("/recommend");
  return null;
}
