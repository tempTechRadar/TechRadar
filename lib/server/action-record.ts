// 판단 뒤 "조치" 상자(action_record) 기록(P-20c, docs/flow.md 3·4절). 주인: 차세일(C).
// 그 알림이 생긴 실행(alert → change → observation.run_id)에 성공·실패를 한 줄 남긴다. 흐름 화면은 이 줄로만 칠한다(불변 6).
// 기록은 서버에서 서비스 키 클라이언트로 한다(run_steps 쓰기는 서버, erd). 판단 저장 자체는 사용자 권한 그대로이고 여기서 하지 않는다.
// 기록이 실패해도 판단 결과는 바뀌지 않는다: 던지지 않고 결과만 돌려준다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSecrets } from "../domain/redact.ts";
import { recordStep } from "./run-log.ts";

export type ActionOutcome = { ok: true } | { ok: false; message: string };
export type ActionRecordResult = { recorded: true; runId: string } | { recorded: false; reason: string };

type Row = Record<string, any>;
const one = (raw: Row | Row[] | null | undefined): Row | null => (Array.isArray(raw) ? raw[0] ?? null : raw ?? null);

/**
 * 알림이 생긴 실행 id. 알림 줄의 run_id(읽은 본인의 실행)를 먼저 본다. 없으면(옛 알림·남의 읽기에서 생긴 알림) 변경 → 수집 자료 경로로, 그것도 없으면 null.
 * 변경 경로는 공유 변경이면 다른 사람의 실행을 가리킬 수 있어서 run_id가 우선이다(불변 5).
 */
async function runOfAlert(db: SupabaseClient, alertId: string): Promise<string | null> {
  const { data, error } = await db.from("alerts").select("id, run_id, changes(observation_id, observations(run_id))").eq("id", alertId).maybeSingle();
  if (error) throw new Error(`알림의 실행을 찾지 못함: ${error.message}`);
  const alert = one(data);
  const runId = alert?.run_id ?? one(one(alert?.changes)?.observations)?.run_id;
  return typeof runId === "string" ? runId : null;
}

// saveJudgment가 저장을 시도했다가 실패할 때의 안내 첫머리(judgments.ts SAVE_FAILED). 이 경우만 조치 실패로 칠한다.
const SAVE_ATTEMPT_FAILED = "저장하지 못했어요";

/**
 * 판단 결과 → 조치 기록. 저장했으면 성공, 저장을 시도했다가 실패했으면 실패.
 * 입력 검사로 거절한 경우(이유 부족, 이미 판단함, 관리자 등)는 조치를 시도한 게 아니라 null(기록 안 함).
 */
export function actionOutcomeOf(result: { ok: true } | { ok: false; message: string }): ActionOutcome | null {
  if (result.ok) return { ok: true };
  return result.message.startsWith(SAVE_ATTEMPT_FAILED) ? { ok: false, message: result.message } : null;
}

export async function recordActionOutcome(db: SupabaseClient, alertId: string, outcome: ActionOutcome): Promise<ActionRecordResult> {
  try {
    const runId = await runOfAlert(db, alertId);
    if (!runId) return { recorded: false, reason: "이 알림은 연결된 실행 기록이 없어요" };
    await recordStep(db, runId, outcome.ok
      ? { stepName: "action_record", status: "succeeded", countIn: 1, countOut: 1, outputSummary: "판단 저장, 조치 기록" }
      : { stepName: "action_record", status: "failed", countIn: 1, countOut: 0, errorMessage: outcome.message, outputSummary: "판단 저장 실패: 알림은 판단 대기 그대로" });
    return { recorded: true, runId };
  } catch (error) {
    const message = maskSecrets(error instanceof Error ? error.message : String(error));
    console.error("조치 기록 실패(판단 결과는 그대로)", message);
    return { recorded: false, reason: message };
  }
}
