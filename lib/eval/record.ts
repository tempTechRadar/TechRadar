// 채점 실행 기록(흐름 화면의 start_scoring → score → score_save). DB는 주입받는다(시험은 가짜 DB, 불변 6).
import type { SupabaseClient } from "@supabase/supabase-js";
import { finishRun, recordStep, startRun } from "../server/run-log.ts";
import type { Score } from "./score.ts";

/** 채점 결과를 실행 기록으로 남긴다. 중간에 실패하면 그 단계를 failed로, 실행도 failed로 닫고 원래 오류를 던진다. */
export async function recordScoring(db: SupabaseClient, score: Score, saved: { path: string; startedBy?: string }): Promise<string> {
  const runId = await startRun(db, { trigger: "scoring", startedBy: saved.startedBy });
  let current = "score";
  try {
    const t = score.totals;
    await recordStep(db, runId, {
      stepName: "score",
      status: "succeeded",
      countIn: t.cases,
      countOut: t.gradeOk,
      branchCounts: { hit: t.hit, quiet_ok: t.quietOk, miss: t.miss, false_alarm: t.falseAlarm },
      outputSummary: `놓침 ${t.miss} · 잘못 울림 ${t.falseAlarm} · 등급 맞음 ${t.gradeOk}/${t.cases}`,
    });
    current = "score_save";
    await recordStep(db, runId, { stepName: "score_save", status: "succeeded", countIn: t.cases, countOut: t.cases, outputSummary: `결과 파일 ${saved.path}` });
    await finishRun(db, runId, { status: "succeeded", itemCount: t.cases });
    return runId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordStep(db, runId, { stepName: current, status: "failed", errorMessage: message }).catch(() => {});
    await finishRun(db, runId, { status: "failed" }).catch(() => {});
    throw error;
  }
}
