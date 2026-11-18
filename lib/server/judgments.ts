// 판단 저장(적용 후보·보류). 주인: 황재웅(B). 로그인한 사용자의 클라이언트로 부른다: 서비스 키로 judgments에 쓰지 않는다(spec 10-1).
// 저장과 알림 완료 처리는 DB 함수 save_judgment가 한 거래로 한다(불변 4). 여기서는 부르기 전 검사와 실패 문구를 맡는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateJudgment } from "../alerts/validate-judgment.ts";
import { maskSecrets } from "../domain/redact.ts";
import { getMyAlert } from "./alert-queries.ts";

export type JudgmentActor = { id: string; role: "user" | "admin" };
export type JudgmentRequest = { alertId: string; decision: string; reason: string };
export type JudgmentResult = { ok: true } | { ok: false; message: string };

const SAVE_FAILED = "저장하지 못했어요. 다시 시도해 주세요. 알림은 아직 판단 대기예요.";

/** 고친 버전은 사용자가 넣는 값이 아니라 그 알림의 변경에서 가져온다(ADR 0012). */
function fixedVersionOf(currValue: unknown): string | null {
  const value = (currValue as { fixed_version?: unknown } | null)?.fixed_version;
  return typeof value === "string" && value !== "" ? value : null;
}

export async function saveJudgment(db: SupabaseClient, actor: JudgmentActor, request: JudgmentRequest): Promise<JudgmentResult> {
  if (actor.role === "admin") return { ok: false, message: "관리자는 판단을 저장할 수 없어요." };
  const alert = await getMyAlert(db, actor.id, request.alertId).catch((e) => {
    console.error("판단할 알림을 읽지 못함", maskSecrets(String(e?.message ?? e)));
    return "read-failed" as const;
  });
  if (alert === "read-failed") return { ok: false, message: SAVE_FAILED };
  if (alert === null) return { ok: false, message: "알림을 찾지 못했어요." };
  if (alert.status === "done") return { ok: false, message: "이미 판단한 알림이에요." };
  const checked = validateJudgment({
    decision: request.decision,
    reason: request.reason,
    alertKind: alert.kind,
    fixedVersion: fixedVersionOf(alert.change.currValue),
  });
  if (!checked.ok) return checked;
  const { decision, reason, fixedVersion } = checked.value;
  const { error } = await db.rpc("save_judgment", { p_alert_id: request.alertId, p_decision: decision, p_reason: reason, p_fixed_version: fixedVersion });
  if (error) {
    console.error("판단 저장 실패", maskSecrets(error.message));
    return { ok: false, message: SAVE_FAILED };
  }
  return { ok: true };
}
