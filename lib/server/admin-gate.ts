// 관리자 화면 관문(P-18). 로그인 전이면 로그인으로, 일반 계정이면 막고, 관리자면 그 사람 권한의 DB 클라이언트를 준다(서비스 키 아님).
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { adminAccess } from "@/lib/admin/admin-access";
import { getCurrentUser, type CurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";

export type AdminGate = { db: SupabaseClient; user: CurrentUser } | { blocked: "forbidden" | "no_db" };

export async function adminGate(): Promise<AdminGate> {
  const user = await getCurrentUser();
  const access = adminAccess(user);
  if (access === "login") redirect("/login");
  if (access === "forbidden" || user === null) return { blocked: "forbidden" };
  const db = await getServerSupabase();
  if (!db) return { blocked: "no_db" };
  return { db, user };
}
