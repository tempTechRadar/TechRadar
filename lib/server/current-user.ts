import { cache } from "react";
import { getServerSupabase } from "@/lib/supabase/server";

export type CurrentUser = { id: string; nickname: string; role: "user" | "admin"; isDemo: boolean };

/**
 * 로그인한 사람과 역할. 주인: 김영식(A). 화면·서버 둘 다 이걸로 권한을 본다(DB는 RLS가 따로 막는다, 불변 5).
 * 로그인 전이거나 Supabase 연결 전이면 null.
 * 한 요청 안에서는 한 번만 읽는다(메뉴와 화면이 둘 다 부른다).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nickname, role, is_demo")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) throw new Error(`profiles를 읽지 못함: ${error.message}`);
  if (!data) return null; // 가입 트리거 전에 만든 계정 등: 로그인 안 한 것으로 본다
  return { id: data.id, nickname: data.nickname, role: data.role, isDemo: data.is_demo };
});
