// 알림 없이 기술에 남기는 판단(관심 · 적용 후보 · 보류, ADR 0028). 로그인한 사용자의 클라이언트로 부른다(서비스 키 안 씀, 불변 5).
// 그 기술의 판단 대기 알림 판단 · 표시 · 바뀐 기록은 DB 함수 set_tech_mark가 한 거래로 남긴다(불변 4): 여기는 부르기 전 검사와 실패 문구만.
// 되돌리기는 화면이 전 상태로 이 함수를 한 번 더 부른다(알림 판단은 덧붙이기만이라 되돌리지 않는다).
import type { SupabaseClient } from "@supabase/supabase-js";
import { holdReasonProblem, NO_FIXED_VERSION_MESSAGE } from "../alerts/validate-judgment.ts";
import { maskSecrets } from "../domain/redact.ts";

export type MarkStatus = "interest" | "candidate" | "hold";
/** status null = 표시 지우기 */
export type MarkRequest = { techId: string; status: MarkStatus | null; reason: string };
/** judgedAlerts: 이 저장으로 함께 판단된 알림 id(흐름 화면의 조치 기록용) */
export type MarkResult = { ok: true; judgedAlerts: string[] } | { ok: false; message: string };

const STATUSES: readonly string[] = ["interest", "candidate", "hold"];
const SAVE_FAILED = "저장하지 못했어요. 다시 시도해 주세요. 표시와 알림은 전 상태 그대로예요.";
export const DANGER_CANDIDATE_MESSAGE = "위험 등급이라 바로 적용 후보로 둘 수 없어요. 보안 경고 알림에서 고친 버전과 함께 판단해 주세요.";

// DB 함수가 거절한 이유 중 사용자가 고칠 수 있는 것만 쉬운 말로 바꾼다(문구는 마이그레이션 202611201200·m0 save_judgment)
function messageFor(dbMessage: string): string {
  if (dbMessage.includes("적용 후보가 될 수 없다")) return DANGER_CANDIDATE_MESSAGE;
  if (dbMessage.includes("고친 버전이 필요하다")) return NO_FIXED_VERSION_MESSAGE;
  if (dbMessage.includes("기술을 찾지 못했다")) return "기술을 찾지 못했어요.";
  return SAVE_FAILED;
}

export async function saveMark(db: SupabaseClient, request: MarkRequest): Promise<MarkResult> {
  const { techId, status } = request;
  if (status !== null && !STATUSES.includes(status)) return { ok: false, message: "관심 · 적용 후보 · 보류 중에서 골라 주세요." };
  const problem = status === "hold" ? holdReasonProblem(request.reason) : null;
  if (problem) return { ok: false, message: problem };

  const { data, error } = await db.rpc("set_tech_mark", { p_tech_id: techId, p_status: status, p_reason: status === "hold" ? request.reason.trim() : null });
  if (error) {
    console.error("판단 표시 저장 실패", maskSecrets(error.message));
    return { ok: false, message: messageFor(error.message) };
  }
  return { ok: true, judgedAlerts: (data as string[] | null) ?? [] };
}

/** 기술 상세의 판단 줄: 내 표시(본인 것만)와, DB 규칙(set_tech_mark)이 보는 카탈로그 등급. 못 읽으면 던진다(빈 단추로 보이지 않게, 불변 2) */
export async function readMarkForTech(db: SupabaseClient, userId: string, techId: string): Promise<{ mark: { techId: string; status: MarkStatus; reason: string | null } | null; grade: "pass" | "caution" | "danger" | "unknown" }> {
  const [m, t] = await Promise.all([
    db.from("tech_marks").select("status, reason").eq("user_id", userId).eq("tech_id", techId).maybeSingle(),
    db.from("technologies").select("grade").eq("id", techId).maybeSingle(),
  ]);
  if (m.error) throw new Error(`내 판단 표시를 읽지 못함: ${maskSecrets(m.error.message)}`);
  if (t.error || !t.data) throw new Error(`기술 등급을 읽지 못함: ${maskSecrets(t.error?.message ?? "없음")}`);
  return { mark: m.data ? { techId, status: m.data.status as MarkStatus, reason: (m.data.reason as string | null) ?? null } : null, grade: t.data.grade };
}
