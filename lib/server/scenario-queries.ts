// 알림 상세의 "적용 시나리오" 카드가 읽는 값(IA-8, SPEC-4.2). 주인: 황재웅(B). 로그인한 사용자의 클라이언트로 부른다(남의 줄은 RLS가 한 번 더 막는다, 불변 5).
// 읽기에 실패하면 던진다: 화면이 "시나리오 없음"과 "불러오지 못함"을 다르게 보여 줘야 한다(design.md).
import type { SupabaseClient } from "@supabase/supabase-js";
import { startOfKoreanDay } from "../ai/decide-ai-call.ts";
import type { ScenarioRecord } from "../alerts/to-scenario-view.ts";
import { rowsOrThrow } from "./alert-db.ts";

/** 이 알림의 내 가장 최근 시나리오와, 오늘(한국 시간 0시부터) 내가 요청한 횟수(어느 알림이든) */
export async function readScenarioState(db: SupabaseClient, alertId: string, userId: string, now: Date): Promise<{ latest: ScenarioRecord | null; usedToday: number }> {
  const [latestRows, todayRows] = await Promise.all([
    db.from("scenarios").select("id, status, created_at, body, sources").eq("alert_id", alertId).eq("requested_by", userId).order("created_at", { ascending: false }).limit(1),
    db.from("scenarios").select("id").eq("requested_by", userId).gte("created_at", startOfKoreanDay(now)),
  ]);
  const [row] = rowsOrThrow(latestRows, "시나리오를 읽지 못함");
  const latest = row ? { id: row.id, status: row.status, createdAt: row.created_at, body: row.body, sources: row.sources } : null;
  return { latest, usedToday: rowsOrThrow(todayRows, "오늘 요청 수를 읽지 못함").length };
}
