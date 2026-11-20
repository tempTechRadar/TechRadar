"use server";
import { getCurrentUser } from "@/lib/server/current-user";
import { readRecentAlerts } from "@/lib/server/recent-alerts";
import { getServerSupabase } from "@/lib/supabase/server";

/** 종 알림 펼침이 부른다. 로그인 안 했거나 연결이 없으면 null(못 읽음과 같게 보임) */
export async function recentAlerts() {
  const user = await getCurrentUser();
  const db = user ? await getServerSupabase() : null;
  return user && db ? readRecentAlerts(db, user.id) : null;
}
