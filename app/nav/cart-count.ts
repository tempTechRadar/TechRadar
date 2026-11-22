"use server";
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import { countCandidates } from "@/lib/server/marks";
import { getServerSupabase } from "@/lib/supabase/server";

/** 지도에서 담기 · 빼기 뒤 메뉴 배지가 다시 센다(레이아웃은 화면 안 이동에선 다시 안 그려짐). null = 못 읽음 · 로그인 안 함 · 미리보기 */
export async function cartCount(): Promise<number | null> {
  if (await isLoginPreview()) return null;
  const user = await getCurrentUser();
  const db = user ? await getServerSupabase() : null;
  return user && db ? countCandidates(db, user.id).catch(() => null) : null;
}
