"use server";
// 로그아웃(PRD-F1, IA-1). 주인: 김영식(A). 사용자 토큰 쿠키를 지우고 첫 화면으로.
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";

export async function signOut(): Promise<void> {
  const supabase = await getServerSupabase();
  if (supabase) {
    // 이 브라우저만(기본값 global은 다른 기기·리허설 중인 같은 계정까지 끊는다)
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      // 실패하면 로그인한 채로 남는다: 로그아웃된 척하지 않고 로그인 화면에서 알린다
      console.error("로그아웃 실패", error.message);
      redirect("/login?error=logout");
    }
  }
  redirect("/");
}
