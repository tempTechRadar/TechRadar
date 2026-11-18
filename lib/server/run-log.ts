// 실행 기록(runs·run_steps) 쓰기 — 자리만. 주인: 차세일(C), P-4에서 채운다.
// A·B는 이 두 함수만 부른다. 흐름 화면(P-6)은 여기서 남긴 기록으로만 칠한다(불변 6).
import type { SupabaseClient } from "@supabase/supabase-js";

export type RunTrigger = "schedule" | "manual" | "simulator" | "user_reread" | "first_read" | "scoring";
export type StepStatus = "waiting" | "running" | "succeeded" | "failed" | "awaiting_judgment";

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

/** 실행 하나를 시작하고 id를 돌려준다. */
export async function startRun(
  _db: SupabaseClient,
  _run: { trigger: RunTrigger; startedBy?: string; projectId?: string },
): Promise<string> {
  throw new Error("startRun은 P-4(차세일)에서 채운다");
}

/** 단계 하나를 남긴다. 요약·오류는 저장 전에 비밀값을 가린다(SPEC-8). */
export async function recordStep(_db: SupabaseClient, _runId: string, _step: StepRecord): Promise<void> {
  throw new Error("recordStep은 P-4(차세일)에서 채운다");
}
