// 사용기 신고 처리(P-24 24b, PRD-F35, IA-23): 글 숨기기·숨김 풀기·신고 처리함. 읽기도 여기서(쓴 사람·신고한 사람 칸은 읽지 않는다).
// 바꾸기는 관리자 본인 로그인(db)으로만 해서 RLS가 한 번 더 막는다(불변 5). 일반 계정이면 0줄이 바뀌고 실패로 끝난다.
// 바꾼 기록(audit_logs: 담당자·시각·사유)은 서버 연결(audit)로만 쓴다(classify-edit.ts와 같은 방식). 기록이 실패해도 바뀐 것은 되돌리지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkReason } from "../admin/classify-input.ts";
import type { NoteRow, ReportRow, TechRow } from "../admin/report-groups.ts";
import { isUuid } from "../domain/my-tech-view.ts";
import { maskSecrets } from "../domain/redact.ts";
import type { EditCtx, EditFail } from "./classify-edit.ts";

export type ModCtx = EditCtx;
/** reports: 이번 동작으로 처리함이 된 신고 수. -1 = 글은 바꿨지만 신고 처리 표시를 하지 못함 */
export type ModResult = { ok: true; changed: boolean; auditFailed: boolean; reports: number } | { ok: false; code: EditFail };

const ID_CHUNK = 40; // id 목록을 주소에 싣는 읽기는 이만큼씩(uuid 36자, 길면 거절됨)
const READ_LIMIT = 500; // shortcut: 신고가 이보다 많아지면 쪽으로 나눈다

function fail(code: EditFail, detail?: string): ModResult {
  if (detail) console.error(`사용기 신고 ${code}`, maskSecrets(detail));
  return { ok: false, code };
}

async function writeAudit(ctx: ModCtx, action: string, noteId: string, reason: string): Promise<boolean> {
  const r = ctx.audit
    ? await ctx.audit.from("audit_logs").insert({ actor_id: ctx.userId, actor_role: "admin", action, target_table: "usage_notes", target_id: noteId, reason })
    : { error: { message: "서비스 키 연결이 없어요" } };
  if (r.error) console.error("바꾼 기록을 남기지 못함", maskSecrets(r.error.message));
  return !r.error;
}

/** 이 글의 처리 전 신고를 처리함으로. 바뀐 줄 수, 실패하면 -1 */
async function markHandled(ctx: ModCtx, noteId: string, reason: string): Promise<number> {
  const upd = await ctx.db.from("reports")
    .update({ handled_by: ctx.userId, handled_at: new Date().toISOString(), handle_reason: reason })
    .eq("note_id", noteId).is("handled_at", null).select("id");
  if (upd.error) { console.error("신고 처리 표시 실패", maskSecrets(upd.error.message)); return -1; }
  return upd.data?.length ?? 0;
}

async function findNote(ctx: ModCtx, id: string) {
  return ctx.db.from("usage_notes").select("id, hidden_at").eq("id", id).maybeSingle();
}

/** 글을 숨긴다(숨긴 사람 = 나, 시각 = 지금). 그 글의 처리 전 신고도 함께 처리함으로. 이미 숨겼으면 그대로. */
export async function hideNote(ctx: ModCtx, id: string, rawReason: string): Promise<ModResult> {
  const why = checkReason(rawReason);
  if (!why.ok) return fail("reason");
  if (!isUuid(id)) return fail("not_found");
  const found = await findNote(ctx, id);
  if (found.error) return fail("failed", found.error.message);
  if (!found.data) return fail("not_found");
  if (found.data.hidden_at) return { ok: true, changed: false, auditFailed: false, reports: 0 };
  const upd = await ctx.db.from("usage_notes").update({ hidden_at: new Date().toISOString(), hidden_by: ctx.userId }).eq("id", id).is("hidden_at", null).select("id");
  if (upd.error || !upd.data?.length) return fail("failed", upd.error?.message ?? "바뀐 줄이 없음(권한 또는 이미 숨김)");
  const reports = await markHandled(ctx, id, why.reason);
  return { ok: true, changed: true, auditFailed: !(await writeAudit(ctx, "hide_note", id, why.reason)), reports };
}

/** 숨김을 푼다. 숨기지 않은 글은 그대로. 풀어도 처리함이 된 신고는 되살리지 않는다. */
export async function unhideNote(ctx: ModCtx, id: string, rawReason: string): Promise<ModResult> {
  const why = checkReason(rawReason);
  if (!why.ok) return fail("reason");
  if (!isUuid(id)) return fail("not_found");
  const found = await findNote(ctx, id);
  if (found.error) return fail("failed", found.error.message);
  if (!found.data) return fail("not_found");
  if (!found.data.hidden_at) return { ok: true, changed: false, auditFailed: false, reports: 0 };
  const upd = await ctx.db.from("usage_notes").update({ hidden_at: null, hidden_by: null }).eq("id", id).select("id");
  if (upd.error || !upd.data?.length) return fail("failed", upd.error?.message ?? "바뀐 줄이 없음(권한)");
  return { ok: true, changed: true, auditFailed: !(await writeAudit(ctx, "unhide_note", id, why.reason)), reports: 0 };
}

/** 글은 그대로 두고 이 글의 처리 전 신고만 처리함으로. */
export async function handleReports(ctx: ModCtx, noteId: string, rawReason: string): Promise<ModResult> {
  const why = checkReason(rawReason);
  if (!why.ok) return fail("reason");
  if (!isUuid(noteId)) return fail("not_found");
  const count = await markHandled(ctx, noteId, why.reason);
  if (count < 0) return fail("failed");
  if (count === 0) return { ok: true, changed: false, auditFailed: false, reports: 0 };
  return { ok: true, changed: true, auditFailed: !(await writeAudit(ctx, "handle_report", noteId, why.reason)), reports: count };
}

type Err = { code?: string; message?: string } | null | undefined;
/** 표 자체가 DB에 아직 없다는 오류인가(마이그레이션 적용 전). 권한 오류·조회 실패와는 다르다 */
export function isMissingTable(error: Err): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /relation .* does not exist|could not find the table/i.test(error.message ?? ""));
}

const chunks = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / ID_CHUNK) }, (_, i) => ids.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK));
const unique = (xs: string[]) => [...new Set(xs)];

/** 신고 목록과 그 글·기술 이름. 표가 아직 없으면 null, 읽지 못하면 던진다("없음"과 다르게 보이도록). 쓴 사람·신고한 사람 칸은 읽지 않는다 */
export async function readReports(db: SupabaseClient): Promise<{ reports: ReportRow[]; notes: NoteRow[]; techs: TechRow[] } | null> {
  const rep = await db.from("reports").select("id, note_id, reason, created_at, handled_at, handle_reason").order("created_at", { ascending: false }).limit(READ_LIMIT);
  if (isMissingTable(rep.error)) return null;
  if (rep.error || !rep.data) throw new Error(`신고를 읽지 못함: ${maskSecrets(rep.error?.message ?? "빈 응답")}`);
  const reports = rep.data.map((r): ReportRow => ({ id: r.id, noteId: r.note_id, reason: r.reason, createdAt: r.created_at, handledAt: r.handled_at ?? null, handleReason: r.handle_reason ?? null }));
  if (reports.length === 0) return { reports, notes: [], techs: [] };

  const noteRes = await Promise.all(chunks(unique(reports.map((r) => r.noteId))).map((c) =>
    db.from("usage_notes").select("id, tech_id, used_for, result, tip, helpful_count, hidden_at, created_at").in("id", c)));
  const noteRows = noteRes.flatMap((res) => {
    if (res.error || !res.data) throw new Error(`신고된 글을 읽지 못함: ${maskSecrets(res.error?.message ?? "빈 응답")}`);
    return res.data;
  });
  const notes = noteRows.map((n): NoteRow => ({ id: n.id, techId: n.tech_id, usedFor: n.used_for, result: n.result, tip: n.tip, helpfulCount: n.helpful_count ?? 0, hiddenAt: n.hidden_at ?? null, createdAt: n.created_at }));

  const techRes = await Promise.all(chunks(unique(notes.map((n) => n.techId))).map((c) => db.from("technologies").select("id, display_name").in("id", c)));
  const techs = techRes.flatMap((res) => {
    if (res.error || !res.data) throw new Error(`기술 이름을 읽지 못함: ${maskSecrets(res.error?.message ?? "빈 응답")}`);
    return res.data.map((t): TechRow => ({ id: t.id, name: t.display_name }));
  });
  return { reports, notes, techs };
}
