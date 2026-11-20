// 프로젝트 이름·메모 고치기, 보관, 되살리기(PRD-F4 3순위, IA-2). 주인: 김영식(A).
// 사용자 본인 로그인(db)으로 바꿔 남의 줄은 RLS(projects_update)가 한 번 더 막는다(불변 5). 조건에도 owner_id와 kind를 같이 건다.
// "프로젝트 밖(local)"은 대상이 아니다: 이름이 코드에서 상수로 쓰인다. 지우지 않는다(ADR 0020: 보관은 지우지 않고 판단 기록을 남기는 것).
// 바꾼 기록(audit_logs)만 서비스 키 연결(audit)로 남기고, 기록이 실패해도 이미 바뀐 것은 되돌리지 않고 auditFailed로 알린다(my-tech.ts와 같다).
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkProjectEdit, type ProjectEditCode } from "../domain/project-edit.ts";
import { isUuid } from "../domain/my-tech-view.ts";
import { maskSecrets } from "../domain/redact.ts";
import { looksSecret } from "../install/validate-item.ts";
import type { Ctx } from "./my-tech.ts";

export type ProjectFailCode = "not_found" | "failed" | "secret" | ProjectEditCode;
export type ProjectResult = { ok: true; changed: boolean; auditFailed: boolean } | { ok: false; code: ProjectFailCode };

// 화면에는 코드만 돌려주고, DB가 한 말은 서버 로그에만 남긴다.
function fail(code: ProjectFailCode, detail?: string): { ok: false; code: ProjectFailCode } {
  if (detail) console.error(`프로젝트 ${code}`, maskSecrets(detail));
  return { ok: false, code };
}

async function writeAudit({ audit, userId }: Ctx, action: string, targetId: string): Promise<boolean> {
  const r = audit
    ? await audit.from("audit_logs").insert({ actor_id: userId, actor_role: "user", action, target_table: "projects", target_id: targetId })
    : { error: { message: "서비스 키 연결이 없어요" } };
  if (r.error) console.error("바꾼 기록을 남기지 못함", maskSecrets(r.error.message));
  return !r.error;
}

type Found = { id: string; kind: string; name: string; memo: string | null; archived_at: string | null };

/** 내 저장소 프로젝트 한 줄. 없거나 남의 것이거나 "프로젝트 밖"이면 null(없음으로 답한다). */
async function findMine(ctx: Ctx, id: string): Promise<Found | null | "failed"> {
  const found = await ctx.db.from("projects").select("id, kind, name, memo, archived_at").eq("id", id).eq("owner_id", ctx.userId).maybeSingle();
  if (found.error) {
    fail("failed", found.error.message);
    return "failed";
  }
  const row = found.data as Found | null;
  return row && row.kind === "repo" ? row : null;
}

/** 칸을 바꾸는 update. 본인·저장소 조건을 다시 걸고, 한 줄도 못 바꿨으면 실패다(동시에 다른 곳이 바꿨거나 권한이 막은 경우). */
async function patch(ctx: Ctx, id: string, values: Record<string, unknown>, state: "active" | "archived"): Promise<boolean> {
  const q = ctx.db.from("projects").update(values).eq("id", id).eq("owner_id", ctx.userId).eq("kind", "repo");
  const upd = await (state === "active" ? q.is("archived_at", null) : q.not("archived_at", "is", null)).select("id");
  if (upd.error || !upd.data?.length) {
    fail("failed", upd.error?.message ?? "바뀐 줄이 없음");
    return false;
  }
  return true;
}

/** 이름·메모 고치기. 보관하지 않은 내 저장소 프로젝트만. 같은 값이면 바꾸지도 기록하지도 않는다. */
export async function editProject(ctx: Ctx, id: string, input: { name: string; memo: string }): Promise<ProjectResult> {
  if (!isUuid(id)) return fail("not_found");
  const checked = checkProjectEdit(input);
  if (!checked.ok) return fail(checked.code);
  if (looksSecret(checked.name) || looksSecret(checked.memo ?? "")) return fail("secret");
  const found = await findMine(ctx, id);
  if (found === "failed") return fail("failed");
  if (!found || found.archived_at) return fail("not_found");
  if (found.name === checked.name && (found.memo ?? null) === checked.memo) return { ok: true, changed: false, auditFailed: false };
  if (!(await patch(ctx, id, { name: checked.name, memo: checked.memo }, "active"))) return fail("failed");
  return { ok: true, changed: true, auditFailed: !(await writeAudit(ctx, "project_edit", id)) };
}

async function setArchived(ctx: Ctx, id: string, archive: boolean): Promise<ProjectResult> {
  if (!isUuid(id)) return fail("not_found");
  const found = await findMine(ctx, id);
  if (found === "failed") return fail("failed");
  if (!found) return fail("not_found");
  if (Boolean(found.archived_at) === archive) return { ok: true, changed: false, auditFailed: false };
  const values = { archived_at: archive ? new Date().toISOString() : null };
  if (!(await patch(ctx, id, values, archive ? "active" : "archived"))) return fail("failed");
  return { ok: true, changed: true, auditFailed: !(await writeAudit(ctx, archive ? "project_archive" : "project_restore", id)) };
}

/** 보관하기: 목록·지도·알림에서 빠진다(알림 판정은 보관을 건너뜀). 이미 보관했으면 바꾸지 않고 성공이다. */
export const archiveProject = (ctx: Ctx, id: string) => setArchived(ctx, id, true);

/** 되살리기. 보관하지 않은 것은 바꾸지 않고 성공이다. */
export const restoreProject = (ctx: Ctx, id: string) => setArchived(ctx, id, false);

/**
 * 내가 보관한 프로젝트의 같은 주소인가. 다시 등록할 때 "보관된 채 조용히 다시 읽기만 도는" 것을 막으려고 등록 전에 본다.
 * 조회가 실패하면 "보관 아님"으로 삼키지 않고 던진다(불변 2).
 */
export async function isArchivedRepo(db: SupabaseClient, userId: string, repoUrl: string): Promise<boolean> {
  const found = await db.from("projects").select("archived_at").eq("owner_id", userId).eq("repo_url", repoUrl).maybeSingle();
  if (found.error) throw new Error(`보관 여부를 읽지 못함: ${found.error.message}`);
  return Boolean((found.data as { archived_at: string | null } | null)?.archived_at);
}

/**
 * 내가 보관한 프로젝트의 id들. 보관한 프로젝트의 기술을 세거나 보여 주지 않으려는 화면(대시보드·설치 프롬프트)이 목록·지도와 같은 기준으로 쓴다.
 * 못 읽으면 "보관한 것 없음"으로 삼키지 않고 던진다(불변 2: 보관분을 빼지 못한 채 숫자를 보이지 않게).
 */
export async function readArchivedProjectIds(db: SupabaseClient, userId: string): Promise<Set<string>> {
  const r = await db.from("projects").select("id").eq("owner_id", userId).not("archived_at", "is", null);
  if (r.error || !r.data) throw new Error(`보관한 프로젝트를 읽지 못함: ${maskSecrets(r.error?.message ?? "빈 응답")}`);
  return new Set((r.data as { id: string }[]).map((p) => p.id));
}
