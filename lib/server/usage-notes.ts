// 사용기·도움이 됐어요·신고(PRD-F35). 로그인한 사용자의 클라이언트로만 부른다: 열 권한과 RLS(본인 줄, 자기 글 제외, 숨긴 글 제외)가 한 번 더 막는다(불변 5).
// 고친 줄이 없으면 저장했다고 하지 않는다(불변 4). 사용기는 Claude에 넣지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateReportReason, validateUsageNote, type NoteInput } from "../domain/usage-note.ts";
import { maskSecrets } from "../domain/redact.ts";
import { rowsOrThrow } from "./alert-db.ts";

export type ActionResult = { ok: true } | { ok: false; error: string };
export type UsageNoteView = { id: string; usedFor: string; result: string; tip: string; helpfulCount: number; createdAt: string; mine: boolean; voted: boolean; reported: boolean };

const UNIQUE_VIOLATION = "23505";
const NO_PRIVILEGE = "42501"; // RLS가 막으면 이 코드로 온다(자기 글, 숨긴 글, 남의 이름)
const LIST_LIMIT = 50; // shortcut: 한 기술에 사용기가 이보다 많아지면 쪽으로 나눈다
const failed = (message?: string): ActionResult => ({ ok: false, error: `저장하지 못했어요: ${maskSecrets(message ?? "빈 응답")}` });

export async function saveUsageNote(db: SupabaseClient, userId: string, techId: string, input: NoteInput): Promise<ActionResult> {
  const checked = validateUsageNote(input);
  if (!checked.ok) return checked;
  const { note } = checked;
  const { data, error } = await db.from("usage_notes").insert({ author_id: userId, tech_id: techId, used_for: note.usedFor, result: note.result, tip: note.tip }).select("id");
  if (error || !data) return failed(error?.message);
  if (data.length === 0) return failed("만들어진 줄이 없어요");
  return { ok: true };
}

export async function markHelpful(db: SupabaseClient, userId: string, noteId: string): Promise<ActionResult> {
  const { data, error } = await db.from("helpful_votes").insert({ note_id: noteId, user_id: userId }).select("note_id");
  if (error?.code === UNIQUE_VIOLATION) return { ok: false, error: "이미 눌렀어요" };
  if (error?.code === NO_PRIVILEGE) return { ok: false, error: "이 글에는 도움이 됐어요를 누를 수 없어요(내 글이거나 숨겨진 글)" };
  if (error || !data || data.length === 0) return failed(error?.message);
  return { ok: true };
}

export async function reportNote(db: SupabaseClient, userId: string, noteId: string, reasonInput: string): Promise<ActionResult> {
  const checked = validateReportReason(reasonInput);
  if (!checked.ok) return checked;
  const { data, error } = await db.from("reports").insert({ note_id: noteId, reporter_id: userId, reason: checked.reason }).select("id");
  if (error?.code === UNIQUE_VIOLATION) return { ok: false, error: "이미 신고했어요" };
  if (error?.code === NO_PRIVILEGE) return { ok: false, error: "이 글은 신고할 수 없어요(내 글이거나 숨겨진 글)" };
  if (error || !data || data.length === 0) return failed(error?.message);
  return { ok: true };
}

/** 그 기술의 사용기(숨긴 글은 RLS가 이미 뺀다). 쓴 사람의 id·별명은 화면에 넘기지 않는다. 읽지 못하면 던진다("없음"과 다르게 보이도록) */
export async function readUsageNotes(db: SupabaseClient, techId: string, viewerId: string): Promise<UsageNoteView[]> {
  // 쓴 사람 칸(author_id)과 숨긴 사람 칸(hidden_by)은 읽기 권한이 없다(익명 표시). "내 글"은 DB 함수가 이 글들 중 내 것만 돌려준다
  const notes = rowsOrThrow(await db.from("usage_notes").select("id, used_for, result, tip, helpful_count, created_at").eq("tech_id", techId).order("created_at", { ascending: false }).limit(LIST_LIMIT), "사용기를 읽지 못함");
  if (notes.length === 0) return [];
  const ids = notes.map((n) => n.id as string);
  const [mine, votes, reports] = await Promise.all([
    db.rpc("my_usage_note_ids", { p_ids: ids }),
    db.from("helpful_votes").select("note_id").eq("user_id", viewerId).in("note_id", ids),
    db.from("reports").select("note_id").eq("reporter_id", viewerId).in("note_id", ids),
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

export type NoteSummary = { total: number; top: Pick<UsageNoteView, "id" | "usedFor" | "result" | "tip" | "helpfulCount">[] };
/** 지도 사이드 패널의 사용기 요약(11-21 사용자 결정 G): "도움이 됐어요" 많은 순 몇 개 + 전체 수. 전체 글은 기술 상세에서. 읽지 못하면 던진다 */
export async function readTopUsageNotes(db: SupabaseClient, techId: string, limit = 3): Promise<NoteSummary> {
  const r = await db.from("usage_notes").select("id, used_for, result, tip, helpful_count", { count: "exact" }).eq("tech_id", techId)
    .order("helpful_count", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  const rows = rowsOrThrow(r, "사용기를 읽지 못함");
  return { total: r.count ?? rows.length, top: rows.map((n) => ({ id: n.id, usedFor: n.used_for, result: n.result, tip: n.tip, helpfulCount: n.helpful_count })) };
}
