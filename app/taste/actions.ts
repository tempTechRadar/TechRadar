"use server";
// 취향 저장(IA-1b·IA-19, PRD-F32). 로그인한 사람의 클라이언트로만 쓴다(본인 줄은 RLS가 한 번 더 막는다, 불변 5).
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/safe-next";
import { getCurrentUser } from "@/lib/server/current-user";
import { readTasteForm, saveTaste } from "@/lib/server/taste-store";
import { getServerSupabase } from "@/lib/supabase/server";

export type TasteState = { build: string | null; tools: string[]; interests: string[]; error?: string; saved?: true } | null;

export async function saveTasteAction(_prev: TasteState, formData: FormData): Promise<TasteState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/taste");
  const input = readTasteForm(formData);
  const supabase = await getServerSupabase();
  if (!supabase) return { ...input, error: "서버의 Supabase 설정이 비어 있어요. 관리자에게 알려 주세요." };
  const result = await saveTaste(supabase, user.id, input);
  if (!result.ok) return { ...input, error: result.error };
  if (formData.get("onboarding") === "1") redirect(safeNext(String(formData.get("next") ?? "")));
  return { ...input, saved: true };
}
