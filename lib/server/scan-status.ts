// 메뉴 오른쪽 상태 줄(P-12m B, 11-23 사용자 결정): 가장 최근 정기 수집 실행(runs.trigger = schedule) 하나와 그 단계(run_steps)만 읽는다(불변 6).
// 정기 수집은 사람 · 프로젝트가 붙지 않는 공개 실행이라 손님에게 보여도 된다. 사람 칸(started_by · project_id)은 고르지 않는다(불변 5).
// 못 읽으면 "fail", 실행이 아직 없으면 "none": 둘 다 "정상"으로 쓰지 않는다(불변 2).
import type { SupabaseClient } from "@supabase/supabase-js";

export type ScanStatus =
  | { state: "ok"; runId: string; at: string; ok: number; total: number; errors: number }
  | { state: "none" }
  | { state: "fail" };

export async function readScanStatus(db: SupabaseClient | null): Promise<ScanStatus> {
  if (!db) return { state: "fail" };
  const run = await db.from("runs").select("id, created_at, finished_at").eq("trigger", "schedule").order("created_at", { ascending: false }).limit(1);
  if (run.error || !run.data) return { state: "fail" };
  const r = run.data[0] as { id: string; created_at: string; finished_at: string | null } | undefined;
  if (!r) return { state: "none" };
  const steps = await db.from("run_steps").select("status").eq("run_id", r.id);
  if (steps.error || !steps.data) return { state: "fail" };
  const st = (steps.data as { status: string }[]).map((s) => s.status);
  return { state: "ok", runId: r.id, at: r.finished_at ?? r.created_at, ok: st.filter((s) => s === "succeeded").length, total: st.length, errors: st.filter((s) => s === "failed").length };
}

/** 한국 시각 hh:mm(메뉴 줄은 짧게, 날짜는 title에) */
export const kstTime = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
