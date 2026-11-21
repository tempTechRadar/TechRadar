// 메뉴 종 알림 펼침: 본인 알림 최근 5개 + 판단 대기 수(펼칠 때 새로 읽어 메뉴 배지보다 최신). 사용자 토큰 + user_id 조건 + RLS(불변 5).
// 하나라도 못 읽으면 null: 빈 목록 · 0으로 보이지 않게(불변 2)
import type { SupabaseClient } from "@supabase/supabase-js";

export type RecentAlert = { id: string; kind: string; pending: boolean; name: string; at: string };
type Row = { id: string; kind: string; status: string; created_at: string; changes: { technologies: { display_name: string } | null } | null };

export async function readRecentAlerts(db: SupabaseClient, userId: string): Promise<{ items: RecentAlert[]; pending: number } | null> {
  const [list, count] = await Promise.all([
    db.from("alerts").select("id, kind, status, created_at, changes(technologies(display_name))").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
    db.from("alerts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending"),
  ]);
  if (list.error || count.error || count.count === null) { console.error("최근 알림을 읽지 못함", list.error?.message ?? count.error?.message); return null; }
  const items = (list.data as unknown as Row[]).map((a) => ({ id: a.id, kind: a.kind, pending: a.status === "pending", name: a.changes?.technologies?.display_name ?? "(이름 없음)", at: a.created_at }));
  return { items, pending: count.count };
}
