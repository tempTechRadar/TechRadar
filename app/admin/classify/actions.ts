"use server";
// 분류 확인 서버 동작(P-18b, IA-17, ADR 0015): 같은 역할 확정, 규칙 켜기·끄기, 규칙 추가.
// 동작마다 관리자 확인을 다시 한다(화면만 믿지 않음, 불변 5). 바꾸기는 관리자 본인 연결(RLS), 서비스 키 연결은 바꾼 기록(audit_logs)에만.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminGate, type AdminGate } from "@/lib/server/admin-gate";
import { addRule, confirmRelation, setRuleEnabled, type EditCtx, type EditResult } from "@/lib/server/classify-edit";
import { getServiceSupabase } from "@/lib/server/service-supabase";

const PAGE = "/admin/classify";
const FAIL_TEXT: Record<string, string> = {
  reason: "사유를 5자 이상 300자 이하로 써 주세요(비밀값은 쓰지 마세요).",
  input: "규칙 값을 확인해 주세요: 공백 없이 100자 이하, 허용 패키지는 npm·PyPI를 골라야 해요.",
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

export async function confirmRelationAction(form: FormData): Promise<void> {
  const ctx = ctxOf(await adminGate());
  back(await confirmRelation(ctx, text(form, "id"), text(form, "reason")), "같은 역할로 확정했어요.");
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
