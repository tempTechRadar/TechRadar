"use server";
// 관리자로 지정(작업 I-P-admin-grant)과 일반 계정으로 되돌리기(I-P-admin-revoke). IA-12, 불변 5. 동작마다 관리자 확인을 다시 하고(화면만 믿지 않음),
// 바꾸기는 관리자 본인 연결로 DB 함수 admin_grant_admin · admin_revoke_admin만 부른다(DB가 한 번 더 확인 + 바꾼 기록을 함께 씀).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminGate } from "@/lib/server/admin-gate";
import { GRANT_TEXT, REVOKE_TEXT, grantAdmin, revokeAdmin } from "@/lib/server/admin-grant";
import { flashQuery } from "@/lib/server/admin-flash";

const PAGE = "/admin/members";
const go = (key: "error" | "info", msg: string): never => redirect(`${PAGE}?${flashQuery(key, msg)}`);

export async function grantAdminAction(form: FormData): Promise<void> {
  const gate = await adminGate();
  if ("blocked" in gate) return go("error", gate.blocked === "no_db" ? GRANT_TEXT.no_db : GRANT_TEXT.forbidden);
  if (form.get("confirm") !== "yes") return go("error", "\"관리자 권한을 준다는 것을 확인했어요\"에 체크해 주세요. 아무것도 바뀌지 않았어요.");
  const result = await grantAdmin(gate.db, String(form.get("id") ?? ""), String(form.get("reason") ?? ""));
  revalidatePath(PAGE);
  return go(result.ok ? "info" : "error", GRANT_TEXT[result.code]);
}

export async function revokeAdminAction(form: FormData): Promise<void> {
  const gate = await adminGate();
  if ("blocked" in gate) return go("error", gate.blocked === "no_db" ? REVOKE_TEXT.no_db : REVOKE_TEXT.forbidden);
  if (form.get("confirm") !== "yes") return go("error", "\"관리자 권한을 거둔다는 것을 확인했어요\"에 체크해 주세요. 아무것도 바뀌지 않았어요.");
  const result = await revokeAdmin(gate.db, String(form.get("id") ?? ""), String(form.get("reason") ?? ""));
  revalidatePath(PAGE);
  return go(result.ok ? "info" : "error", REVOKE_TEXT[result.code]);
}
