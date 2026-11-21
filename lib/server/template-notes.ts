// 템플릿 사용기 · 도움이 됐어요 · 신고(P-12e M3 202611221200, "이 조합 써봤어요"). usage-notes.ts와 같은 모양: 로그인한 사용자의 클라이언트로만 부르고
// 열 권한과 RLS(열린 템플릿만, 써 본 사람만, 작가 · 자기 글 제외, 숨긴 글 제외)가 한 번 더 막는다(불변 5). 고친 줄이 없으면 저장했다고 하지 않는다(불변 4).
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateReportReason, validateUsageNote, type NoteInput } from "../domain/usage-note.ts";
import { isUuid } from "../domain/my-tech-view.ts";
import { maskSecrets } from "../domain/redact.ts";
import { rowsOrThrow } from "./alert-db.ts";
import type { ActionResult, UsageNoteView } from "./usage-notes.ts";

const UNIQUE_VIOLATION = "23505";
const NO_PRIVILEGE = "42501"; // RLS가 막으면 이 코드로 온다
const LIST_LIMIT = 50; // shortcut: 한 템플릿에 사용기가 이보다 많아지면 쪽으로 나눈다
const failed = (message?: string): ActionResult => ({ ok: false, error: `저장하지 못했어요: ${maskSecrets(message ?? "빈 응답")}` });
const BAD_ID: ActionResult = { ok: false, error: "다시 골라 주세요" };

/** 사용기 쓰기. 쓴 사람은 DB 기본값(auth.uid())이 넣는다 */
export async function saveTemplateNote(db: SupabaseClient, templateId: unknown, input: NoteInput): Promise<ActionResult> {
  if (!isUuid(templateId)) return BAD_ID;
  const checked = validateUsageNote(input);
  if (!checked.ok) return checked;
  const { note } = checked;
  const { data, error } = await db.from("template_notes").insert({ template_id: templateId, used_for: note.usedFor, result: note.result, tip: note.tip }).select("id");
  if (error?.code === UNIQUE_VIOLATION) return { ok: false, error: "이 템플릿에는 이미 사용기를 썼어요" };
  if (error?.code === NO_PRIVILEGE) return { ok: false, error: "이 템플릿으로 청사진을 확정해 본 뒤에 쓸 수 있어요(내 템플릿 · 공개되지 않은 템플릿은 안 돼요)" };
  if (error || !data) return failed(error?.message);
  if (data.length === 0) return failed("만들어진 줄이 없어요");
  return { ok: true };
}

export async function markTemplateNoteHelpful(db: SupabaseClient, userId: string, noteId: unknown): Promise<ActionResult> {
  if (!isUuid(noteId)) return BAD_ID;
  const { data, error } = await db.from("template_helpful_votes").insert({ note_id: noteId, user_id: userId }).select("note_id");
  if (error?.code === UNIQUE_VIOLATION) return { ok: false, error: "이미 눌렀어요" };
  if (error?.code === NO_PRIVILEGE) return { ok: false, error: "이 글에는 도움이 됐어요를 누를 수 없어요(내 글이거나 숨겨진 글)" };
  if (error || !data || data.length === 0) return failed(error?.message);
  return { ok: true };
}

export async function reportTemplateNote(db: SupabaseClient, userId: string, noteId: unknown, reasonInput: string): Promise<ActionResult> {
  if (!isUuid(noteId)) return BAD_ID;
  const checked = validateReportReason(reasonInput);
  if (!checked.ok) return checked;
  const { data, error } = await db.from("template_reports").insert({ note_id: noteId, reporter_id: userId, reason: checked.reason }).select("id");
  if (error?.code === UNIQUE_VIOLATION) return { ok: false, error: "이미 신고했어요" };
  if (error?.code === NO_PRIVILEGE) return { ok: false, error: "이 글은 신고할 수 없어요(내 글이거나 숨겨진 글)" };
  if (error || !data || data.length === 0) return failed(error?.message);
  return { ok: true };
}

/** 그 템플릿의 사용기(새것 순, 숨긴 글 · 닫힌 템플릿은 RLS가 이미 뺀다). 쓴 사람 id는 읽지 않는다. 읽지 못하면 던진다("없음"과 다르게).
 *  viewerId = null: 손님(anon, M6가 안전한 칸만 엶) — 내 글 · 누른 기록 · 신고 기록은 로그인한 사람 것이라 읽지 않고 모두 false */
export async function readTemplateNotes(db: SupabaseClient, templateId: string, viewerId: string | null): Promise<UsageNoteView[]> {
  if (!isUuid(templateId)) return [];
  const notes = rowsOrThrow(await db.from("template_notes").select("id, used_for, result, tip, helpful_count, created_at").eq("template_id", templateId).order("created_at", { ascending: false }).limit(LIST_LIMIT), "템플릿 사용기를 읽지 못함");
  if (notes.length === 0) return [];
  if (!viewerId) return notes.map((n) => ({ id: n.id, usedFor: n.used_for, result: n.result, tip: n.tip, helpfulCount: n.helpful_count, createdAt: n.created_at, mine: false, voted: false, reported: false }));
  const ids = notes.map((n) => n.id as string);
  const [mine, votes, reports] = await Promise.all([
    db.rpc("my_template_note_ids", { p_ids: ids }),
    db.from("template_helpful_votes").select("note_id").eq("user_id", viewerId).in("note_id", ids),
    db.from("template_reports").select("note_id").eq("reporter_id", viewerId).in("note_id", ids),
  ]);
  if (mine.error || !mine.data) throw new Error(`내 글 표시를 읽지 못함: ${maskSecrets(mine.error?.message ?? "빈 응답")}`);
  const mineIds = new Set((mine.data as unknown[]).map((x) => (typeof x === "string" ? x : String(Object.values(x as object)[0])))); // setof uuid는 값 배열(또는 한 칸 객체)로 온다
  const voted = new Set(rowsOrThrow(votes, "누른 기록을 읽지 못함").map((r) => r.note_id as string));
  const reported = new Set(rowsOrThrow(reports, "신고 기록을 읽지 못함").map((r) => r.note_id as string));
  return notes.map((n) => ({
    id: n.id, usedFor: n.used_for, result: n.result, tip: n.tip, helpfulCount: n.helpful_count, createdAt: n.created_at,
    mine: mineIds.has(n.id), voted: voted.has(n.id), reported: reported.has(n.id),
  }));
}
