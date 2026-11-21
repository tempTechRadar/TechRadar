"use server";
import { SAMPLE_RECENT } from "@/lib/dev/preview-data";
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import { readRecentAlerts } from "@/lib/server/recent-alerts";
import { getServerSupabase } from "@/lib/supabase/server";

/** 종 알림 펼침이 부른다. 로그인 안 했거나 연결이 없으면 null(못 읽음과 같게 보임). 미리보기(개발용)면 샘플 */
export async function recentAlerts() {
  if (await isLoginPreview()) return SAMPLE_RECENT;
  const user = await getCurrentUser();
  const db = user ? await getServerSupabase() : null;
  return user && db ? readRecentAlerts(db, user.id) : null;
}
