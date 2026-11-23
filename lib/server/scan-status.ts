// 메뉴 오른쪽 상태 줄(P-12m B, 11-23 사용자 결정): 가장 최근 정기 수집 실행(runs.trigger = schedule) 하나와 그 단계(run_steps)만 읽는다(불변 6).
// 정기 수집은 사람 · 프로젝트가 붙지 않는 공개 실행이라 손님에게 보여도 된다. 사람 칸(started_by · project_id)은 고르지 않는다(불변 5).
// 못 읽으면 "fail", 실행이 아직 없으면 "none": 둘 다 "정상"으로 쓰지 않는다(불변 2).
// 수집 오류는 status가 아니라 단계로 센다: collect_error 단계도 status는 succeeded로 저장된다(11-23 운영 06:07 실행, Maestro 확인).
// 출처 하나가 통째로 실패하면 run-batch가 그 출처의 failed 단계와 "{출처} 수집 오류" collect_error 단계를 함께 남기므로 짝은 한 번만 센다(자체 리뷰)
import type { SupabaseClient } from "@supabase/supabase-js";

export type ScanStatus =
  | { state: "ok"; runId: string; at: string; sources: number; errors: number; runFailed: boolean; running: boolean }
  | { state: "none" }
  | { state: "fail" };

type Step = { step_name: string; status: string; error_kind: string | null; output_summary: string | null };

/** 수집 오류 수: collect_error 단계 + 짝(같은 출처의 collect_error)이 없는 실패 단계 */
export function countErrors(steps: Step[]): number {
  const ce = steps.filter((s) => s.step_name === "collect_error");
  const paired = new Set(ce.map((s) => s.output_summary?.replace(/ 수집 오류$/, "")));
  return ce.length + steps.filter((s) => s.step_name !== "collect_error" && (s.status === "failed" || !!s.error_kind) && !paired.has(s.step_name)).length;
}

export async function readScanStatus(db: SupabaseClient | null): Promise<ScanStatus> {
  if (!db) return { state: "fail" };
  const run = await db.from("runs").select("id, status, created_at, finished_at").eq("trigger", "schedule").order("created_at", { ascending: false }).limit(1);
  if (run.error || !run.data) return { state: "fail" };
  const r = run.data[0] as { id: string; status: string; created_at: string; finished_at: string | null } | undefined;
  if (!r) return { state: "none" };
  const steps = await db.from("run_steps").select("step_name, status, error_kind, output_summary").eq("run_id", r.id);
  if (steps.error || !steps.data) return { state: "fail" };
  const st = steps.data as Step[];
  return { state: "ok", runId: r.id, at: r.finished_at ?? r.created_at, sources: st.filter((s) => s.step_name.startsWith("fetch_")).length, // 출처 = 가져오기(fetch_*) 단계만(normalize · grade 같은 처리 단계는 빼고, Maestro 운영 확인)
     errors: countErrors(st), runFailed: r.status === "failed", running: r.status === "queued" || r.status === "running" };
}

const KST = { timeZone: "Asia/Seoul" } as const;
/** 한국 시각: 오늘이면 hh:mm, 아니면 MM-DD hh:mm(멈춘 정기 수집이 오늘 것처럼 보이지 않게, 자체 리뷰) */
export function kstTime(iso: string, now = new Date()): string {
  const d = new Date(iso), day = (x: Date) => x.toLocaleDateString("en-CA", KST);
  const hm = new Intl.DateTimeFormat("ko-KR", { ...KST, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return day(d) === day(now) ? hm : `${day(d).slice(5)} ${hm}`;
}
