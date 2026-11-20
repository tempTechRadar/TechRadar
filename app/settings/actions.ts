"use server";
// 설정 저장(IA-19, PRD-F34): 별명과 "쓰고 있어요" 공개 여부. 로그인한 사람의 클라이언트로만 고친다(본인 줄은 RLS가 한 번 더 막는다, 불변 5).
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/current-user";
import { readSettingsForm, saveProfileSettings } from "@/lib/server/profile-settings";
import { getServerSupabase } from "@/lib/supabase/server";

// 폼은 동작이 끝나면 입력칸을 처음 값으로 되돌린다(React 19). 그래서 방금 보낸 값을 상태로 돌려줘 화면이 저장값·입력값과 어긋나지 않게 한다.
export type SettingsState = { nickname: string; isPublic: boolean; error?: string; saved?: true } | null;

export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");
  const input = readSettingsForm(formData);
  const sent = { nickname: input.nickname, isPublic: input.isPublic };
  const supabase = await getServerSupabase();
  if (!supabase) return { ...sent, error: "서버의 Supabase 설정이 비어 있어요. 관리자에게 알려 주세요." };
  const result = await saveProfileSettings(supabase, user.id, input);
  if (!result.ok) return { ...sent, error: result.error };
  if (input.welcome) redirect(`/taste?onboarding=1&next=${encodeURIComponent(input.next)}`); // 가입 직후면 취향 질문(IA-1b, P-23)을 거쳐 가려던 곳으로
  return { nickname: result.nickname, isPublic: result.isPublic, saved: true };
}
