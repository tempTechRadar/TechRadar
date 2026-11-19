"use server";
// 분류 확인 서버 동작(P-18b·18c, IA-17, ADR 0015): 같은 역할 확정, 규칙 켜기·끄기, 규칙 추가, 갈래 정하기·고치기.
// 동작마다 관리자 확인을 다시 한다(화면만 믿지 않음, 불변 5). 바꾸기는 관리자 본인 연결(RLS), 서비스 키 연결은 바꾼 기록(audit_logs)에만.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminGate, type AdminGate } from "@/lib/server/admin-gate";
import { createAlertsForChange } from "@/lib/server/alerts";
import { saveChange } from "@/lib/server/changes";
import { addRule, confirmRelation, setCategory, setRuleEnabled, type EditCtx, type EditResult } from "@/lib/server/classify-edit";
import { notifyRelationConfirmed } from "@/lib/server/relation-opportunity";
import { getServiceSupabase } from "@/lib/server/service-supabase";

const PAGE = "/admin/classify";
const FAIL_TEXT: Record<string, string> = {
  reason: "사유를 5자 이상 300자 이하로 써 주세요(비밀값은 쓰지 마세요).",
  input: "값을 확인해 주세요: 규칙은 공백 없이 100자 이하(허용 패키지는 npm·PyPI를 골라야 해요), 갈래는 작은 갈래만 고를 수 있어요.",
  duplicate: "같은 규칙이 이미 있어요. 꺼져 있다면 켜기를 쓰세요.",
  not_found: "그 줄을 찾지 못했어요. 새로고침해 주세요.",
  failed: "저장하지 못했어요. 아무것도 바뀌지 않았어요.",
};

const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const go = (key: "error" | "info", msg: string): never => redirect(`${PAGE}?${key}=${encodeURIComponent(msg)}`);

/** 관리자가 아니면 아무것도 하지 않고 돌려보낸다. 관리자면 본인 연결 + 기록용 서버 연결. */
function ctxOf(gate: AdminGate): EditCtx {
  if ("blocked" in gate) return go("error", "관리자만 할 수 있어요.");
  return { db: gate.db, audit: getServiceSupabase(), userId: gate.user.id };
}

function back(result: EditResult, done: string): never {
  revalidatePath(PAGE);
  if (!result.ok) return go("error", FAIL_TEXT[result.code] ?? FAIL_TEXT.failed);
  if (!result.changed) return go("info", "이미 그 상태라 바꾸지 않았어요.");
  return go("info", result.auditFailed ? `${done} 다만 바꾼 기록(담당자·시각·사유)을 남기지 못했어요.` : done);
}

/** 확정이 저장된 뒤에만 부른다(P-14, SPEC-3.2). 알림 실패가 확정을 되돌리지 않게 안내 문장만 덧붙인다.
 *  shortcut: 알림만 실패했을 때 다시 만드는 버튼은 없다(확정된 줄은 "이미 그 상태"), 필요하면 확정 줄을 다시 읽는 재시도를 붙인다 */
async function notifyConfirmed(relationId: string): Promise<string> {
  const db = getServiceSupabase();
  if (!db) return " 다만 서버 연결이 없어 적용 기회 알림은 만들지 못했어요.";
  const result = await notifyRelationConfirmed({ db, saveChange, createAlertsForChange }, relationId);
  if (result.failed.length === 0) return ` 적용 기회 알림 ${result.created}건을 만들었어요.`;
  console.error("적용 기회 알림 만들기 실패", result.failed);
  return ` 다만 적용 기회 알림을 만들지 못한 곳이 ${result.failed.length}곳 있어요. 확정은 그대로예요.`;
}

export async function confirmRelationAction(form: FormData): Promise<void> {
  const ctx = ctxOf(await adminGate());
  const id = text(form, "id");
  const result = await confirmRelation(ctx, id, text(form, "reason"));
  const note = result.ok && result.changed ? await notifyConfirmed(id) : "";
  back(result, `같은 역할로 확정했어요.${note}`);
}

export async function toggleRuleAction(form: FormData): Promise<void> {
  const ctx = ctxOf(await adminGate());
  const enable = text(form, "enable") === "1";
  back(await setRuleEnabled(ctx, text(form, "id"), enable, text(form, "reason")), enable ? "규칙을 켰어요." : "규칙을 껐어요.");
}

export async function addRuleAction(form: FormData): Promise<void> {
  const ctx = ctxOf(await adminGate());
  const input = { kind: text(form, "kind"), ecosystem: text(form, "ecosystem"), value: text(form, "value") };
  back(await addRule(ctx, input, text(form, "reason")), "규칙을 더했어요.");
}

export async function setCategoryAction(form: FormData): Promise<void> {
  const ctx = ctxOf(await adminGate());
  back(await setCategory(ctx, text(form, "techId"), text(form, "categoryId"), text(form, "reason")), "갈래를 정했어요.");
}
