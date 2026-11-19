// 첫 점검 띠가 쓰는 읽기(PRD-F14). 로그인한 사용자의 클라이언트로 부른다: 본인이 시작한 first_read 실행만 RLS가 열어 준다(불변 5).
// 읽기에 실패하면 던진다: 호출한 화면이 "띠 없음"과 "조회 실패"를 구분해 로그를 남긴다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FirstCheckRun } from "../alerts/first-check-band.ts";
import { maskSecrets } from "../domain/redact.ts";

type Row = Record<string, any>;
type DbResult = { data: unknown; error: { message: string } | null };

/** 프로젝트를 여러 개 등록해도 앞 것이 가려지지 않게 최근 몇 개를 본다 */
export const RECENT_FIRST_READS = 5;

function rowsOrThrow({ data, error }: DbResult, what: string): Row[] {
  if (error || !data) throw new Error(`${what}: ${maskSecrets(error?.message ?? "빈 응답")}`);
  return data as Row[];
}

/** 최근 첫 읽기 실행들(새것부터)과 각 실행의 `grade`·`is_event` 단계 건수. 첫 읽기가 없으면 빈 목록 */
export async function readRecentFirstReads(db: SupabaseClient, userId: string): Promise<FirstCheckRun[]> {
  const runs = rowsOrThrow(
    await db.from("runs").select("id, status").eq("trigger", "first_read").eq("started_by", userId).order("started_at", { ascending: false }).limit(RECENT_FIRST_READS),
    "첫 읽기 실행을 읽지 못함",
  );
  if (runs.length === 0) return [];
  const steps = rowsOrThrow(
    await db.from("run_steps").select("run_id, step_name, branch_counts").in("run_id", runs.map((r) => r.id)).in("step_name", ["grade", "is_event"]),
    "첫 읽기 단계를 읽지 못함",
  );
  return runs.map((run) => ({
    id: run.id as string,
    status: run.status as string,
    steps: steps.filter((s) => s.run_id === run.id).map((s) => ({ stepName: s.step_name as string, branchCounts: s.branch_counts as Record<string, number> | null })),
  }));
}
