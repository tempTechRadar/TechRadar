"use server";
// 사용기 신고 서버 동작(P-24 24b, IA-23, PRD-F35): 글 숨기기·숨김 풀기·신고 처리함.
// 동작마다 관리자 확인을 다시 한다(화면만 믿지 않음, 불변 5). 바꾸기는 관리자 본인 연결(RLS), 서비스 키 연결은 바꾼 기록(audit_logs)에만.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminGate, type AdminGate } from "@/lib/server/admin-gate";
import { handleReports, hideNote, unhideNote, type ModCtx, type ModResult } from "@/lib/server/moderation-edit";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { flashQuery } from "@/lib/server/admin-flash";

const PAGE = "/admin/reports";
const FAIL_TEXT: Record<string, string> = {
  reason: "사유를 5자 이상 300자 이하로 써 주세요(비밀값은 쓰지 마세요).",
  not_found: "그 글을 찾지 못했어요. 새로고침해 주세요.",
  failed: "저장하지 못했어요. 아무것도 바뀌지 않았어요.",
};

const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const go = (key: "error" | "info", msg: string): never => redirect(`${PAGE}?${flashQuery(key, msg)}`);

/** 관리자가 아니면 아무것도 하지 않고 돌려보낸다. 관리자면 본인 연결 + 기록용 서버 연결. */
function ctxOf(gate: AdminGate): ModCtx {
  if ("blocked" in gate) return go("error", "관리자만 할 수 있어요.");
  return { db: gate.db, audit: getServiceSupabase(), userId: gate.user.id };
}

function back(result: ModResult, done: string): never {
  revalidatePath(PAGE);
  if (!result.ok) return go("error", FAIL_TEXT[result.code] ?? FAIL_TEXT.failed);
  if (!result.changed) return go("info", "이미 그 상태라 바꾸지 않았어요.");
  const reports = result.reports > 0 ? ` 신고 ${result.reports}건도 처리함으로 바꿨어요.` : result.reports < 0 ? " 다만 신고를 처리함으로 바꾸지 못했어요." : "";
  const audit = result.auditFailed ? " 다만 바꾼 기록(담당자·시각·사유)을 남기지 못했어요." : "";
  return go("info", `${done}${reports}${audit}`);
}

export async function hideNoteAction(form: FormData): Promise<void> {
  const ctx = ctxOf(await adminGate());
  back(await hideNote(ctx, text(form, "id"), text(form, "reason")), "글을 숨겼어요.");
}

export async function unhideNoteAction(form: FormData): Promise<void> {
  const ctx = ctxOf(await adminGate());
  back(await unhideNote(ctx, text(form, "id"), text(form, "reason")), "숨김을 풀었어요.");
}

export async function handleReportsAction(form: FormData): Promise<void> {
  const ctx = ctxOf(await adminGate());
  back(await handleReports(ctx, text(form, "id"), text(form, "reason")), "신고를 처리함으로 바꿨어요.");
}
