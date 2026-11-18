// 출처별 최근 결과 읽기(연속 실패 강조용). 정기 실행·지금 실행의 수집 상자 줄만 본다. DB는 주입.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SourceResult } from "./retry.ts";

type RunRow = { id: string; created_at: string };
type StepRow = { run_id: string; step_name: string; status: string };

/** 실행·단계 줄 → 출처 결과. 같은 실행에 같은 출처가 여러 줄이면 하나라도 실패면 실패로 본다 */
export function toSourceResults(runs: RunRow[], steps: StepRow[], sources: string[]): SourceResult[] {
  const at = new Map(runs.map((r) => [r.id, r.created_at]));
  const seen = new Map<string, SourceResult>();
  for (const s of steps) {
    if (!sources.includes(s.step_name) || !at.has(s.run_id)) continue;
    const key = `${s.run_id}|${s.step_name}`;
    const failed = s.status === "failed" || seen.get(key)?.failed === true;
    seen.set(key, { source: s.step_name, at: at.get(s.run_id)!, failed });
  }
  return [...seen.values()];
}

export async function readSourceHistory(db: SupabaseClient, sources: string[], limit = 10): Promise<SourceResult[]> {
  if (sources.length === 0) return [];
  const runs = await db.from("runs").select("id, created_at").in("trigger", ["schedule", "manual"]).order("created_at", { ascending: false }).limit(limit);
  if (runs.error) throw new Error(`실행 기록을 읽지 못함: ${runs.error.message}`);
  const ids = (runs.data ?? []).map((r: RunRow) => r.id);
  if (ids.length === 0) return [];
  const steps = await db.from("run_steps").select("run_id, step_name, status").in("run_id", ids).in("step_name", sources);
  if (steps.error) throw new Error(`단계 기록을 읽지 못함: ${steps.error.message}`);
  return toSourceResults(runs.data as RunRow[], (steps.data ?? []) as StepRow[], sources);
}
