// 실행 기록(runs·run_steps) 쓰기. 주인: 차세일(C).
// A·B는 startRun·recordStep(·끝낼 때 finishRun)만 부른다. 흐름 화면(P-6)은 여기서 남긴 기록으로만 칠한다(불변 6).
// 서비스 키 클라이언트로 부른다(사용자 화면은 RLS로 읽기만).
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanForLog, maskSecrets } from "../domain/redact.ts";

export type RunTrigger = "schedule" | "manual" | "simulator" | "user_reread" | "first_read" | "scoring";
export type StepStatus = "waiting" | "running" | "succeeded" | "failed" | "awaiting_judgment";
export type RunResult = "succeeded" | "failed" | "partial";

export type StepRecord = {
  /** `flow/flow.json`의 상자 id(예: fetch_osv, grade, save_change, notify, action_record) */
  stepName: string;
  status: StepStatus;
  inputSummary?: string;
  outputSummary?: string;
  apiUrl?: string;
  httpStatus?: number;
  durationMs?: number;
  countIn?: number;
  countOut?: number;
  branchCounts?: Record<string, number>;
  errorKind?: "timeout" | "network" | "rate_limited" | "http_status" | "parse";
  errorMessage?: string;
};

const FINISHED: StepStatus[] = ["succeeded", "failed"];
const fail = (what: string, message?: string) => new Error(`${what}: ${maskSecrets(message ?? "빈 응답")}`);

/** 실행 하나를 시작하고 id를 돌려준다. */
export async function startRun(
  db: SupabaseClient,
  run: { trigger: RunTrigger; startedBy?: string; projectId?: string },
): Promise<string> {
  const { data, error } = await db
    .from("runs")
    .insert({
      trigger: run.trigger,
      started_by: run.startedBy ?? null,
      project_id: run.projectId ?? null,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw fail("실행 기록을 시작하지 못했습니다", error?.message);
  return data.id as string;
}

/** 단계 하나를 남긴다. 요약·오류·호출 주소는 저장 전에 비밀값을 가린다(SPEC-8). */
export async function recordStep(db: SupabaseClient, runId: string, step: StepRecord): Promise<void> {
  const now = Date.now();
  const { error } = await db.from("run_steps").insert({
    run_id: runId,
    step_name: step.stepName,
    status: step.status,
    input_summary: cleanForLog(step.inputSummary),
    output_summary: cleanForLog(step.outputSummary),
    api_url: cleanForLog(step.apiUrl),
    http_status: step.httpStatus ?? null,
    duration_ms: step.durationMs ?? null,
    count_in: step.countIn ?? null,
    count_out: step.countOut ?? null,
    branch_counts: step.branchCounts ?? null,
    error_kind: step.errorKind ?? null,
    error_message: cleanForLog(step.errorMessage),
    started_at: new Date(now - (step.durationMs ?? 0)).toISOString(),
    finished_at: FINISHED.includes(step.status) ? new Date(now).toISOString() : null,
  });
  if (error) throw fail(`단계 "${step.stepName}"를 기록하지 못했습니다`, error.message);
}

/** 실행을 닫는다: 상태·끝난 시각·처리 건수. */
export async function finishRun(db: SupabaseClient, runId: string, result: { status: RunResult; itemCount?: number }): Promise<void> {
  const { error } = await db
    .from("runs")
    .update({ status: result.status, finished_at: new Date().toISOString(), item_count: result.itemCount ?? 0 })
    .eq("id", runId);
  if (error) throw fail("실행을 닫지 못했습니다", error.message);
}
