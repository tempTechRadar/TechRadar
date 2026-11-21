"use server";
// 블루프린트 화면의 서버 액션: 확정(DB 함수가 본인 이름으로 한 줄, 같은 id는 한 번) · 카탈로그 찾기. 사용자 토큰으로 부른다(불변 5).
import { revalidatePath } from "next/cache";
import { confirmBlueprintGraph, findPoolTechs, type ConfirmGraphInput, type ConfirmResult, type PoolTech } from "@/lib/server/blueprints";
import { PREVIEW_NO_SAVE } from "@/lib/dev/login-preview";
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { hideTemplate, saveTemplate, setTemplatePublic, type TemplateInput, type TemplateResult } from "@/lib/server/blueprint-templates";
import { markTemplateNoteHelpful, reportTemplateNote, saveTemplateNote } from "@/lib/server/template-notes";
import type { ActionResult } from "@/lib/server/usage-notes";
import type { NoteInput } from "@/lib/domain/usage-note";

/** v2 확정(P-12e 스튜디오): 캔버스 그래프. 검사 · 관문 · 이름 다시 읽기는 DB 함수 confirm_blueprint_v2가 한다(사용자 토큰, 불변 1·4·5) */
export async function confirmGraphAction(input: ConfirmGraphInput): Promise<ConfirmResult> {
  if (await isLoginPreview()) return { ok: false, message: PREVIEW_NO_SAVE }; // 미리보기(개발용)는 저장하지 않는다(불변 1·4)
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인하면 확정할 수 있어요. 판은 이 브라우저에 그대로 있어요." };
  const db = await getServerSupabase();
  if (!db) return { ok: false, message: "확정하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  const r = await confirmBlueprintGraph(db, input);
  if (r.ok) revalidatePath("/blueprint");
  return r;
}

/** null = 찾지 못함(조회 실패). 빈 배열 = 찾았지만 없음 */
export async function searchAction(query: string): Promise<PoolTech[] | null> {
  const user = await getCurrentUser();
  // 손님(P-12f): 카탈로그 공개 줄 · 칸만 서버 키로 찾는다(findPoolTechs = publicTechs, 개인 칸 없음 — 불변 5)
  const db = user ? await getServerSupabase() : getServiceSupabase();
  return db ? findPoolTechs(db, String(query ?? "")) : null;
}

/** 템플릿 액션 공통: 미리보기 막기는 각 액션이 먼저 한다(글자 검사가 그 순서를 본다). 로그인 → 연결. 못 하면 문구 */
async function templateDb(): Promise<{ db: NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>; userId: string } | { message: string }> {
  const user = await getCurrentUser();
  if (!user) return { message: "로그인하면 템플릿을 쓸 수 있어요." };
  const db = await getServerSupabase();
  return db ? { db, userId: user.id } : { message: "처리하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
}

/** 템플릿 저장(틀 · 조합, P-12e). 검사 · 관문은 DB 함수 save_blueprint_template가 한다(사용자 토큰, 불변 1·4·5) */
export async function saveTemplateAction(input: TemplateInput): Promise<TemplateResult> {
  if (await isLoginPreview()) return { ok: false, message: PREVIEW_NO_SAVE };
  const c = await templateDb();
  if ("message" in c) return { ok: false, message: c.message };
  const r = await saveTemplate(c.db, input);
  if (r.ok) revalidatePath("/blueprint");
  return r;
}

/** 내 템플릿 공개 · 비공개(ADR 0036 1). 공개하면 갤러리에 별명과 함께 보인다 */
export async function setTemplatePublicAction(id: string, isPublic: boolean): Promise<TemplateResult> {
  if (await isLoginPreview()) return { ok: false, message: PREVIEW_NO_SAVE };
  if (typeof isPublic !== "boolean") return { ok: false, message: "공개 · 비공개 중에서 골라 주세요." }; // 경계: 화면 값을 믿지 않음
  const c = await templateDb();
  if ("message" in c) return { ok: false, message: c.message };
  const r = await setTemplatePublic(c.db, id, isPublic);
  if (r.ok) { revalidatePath("/blueprint"); revalidatePath("/blueprint/gallery"); }
  return r;
}

/** 관리자 숨김 · 되돌리기(ADR 0036 4). 관리자 확인은 DB 함수가 한다(화면 단추만 믿지 않음, 불변 5). 갤러리는 단추가 결과를 보이도록 바로 다시 그리지 않는다 */
export async function hideTemplateAction(id: string, hidden: boolean): Promise<TemplateResult> {
  if (await isLoginPreview()) return { ok: false, message: PREVIEW_NO_SAVE };
  if (typeof hidden !== "boolean") return { ok: false, message: "숨기기 · 되돌리기 중에서 골라 주세요." };
  const c = await templateDb();
  if ("message" in c) return { ok: false, message: c.message };
  return hideTemplate(c.db, id, hidden);
}

/** 템플릿 사용기(P-12e M3, "이 조합 써봤어요"). 열린 템플릿 · 써 본 사람만은 DB(RLS)가 본다(불변 5) */
export async function saveTemplateNoteAction(templateId: string, input: NoteInput): Promise<ActionResult> {
  if (await isLoginPreview()) return { ok: false, error: PREVIEW_NO_SAVE };
  const c = await templateDb();
  if ("message" in c) return { ok: false, error: c.message };
  const text = (k: keyof NoteInput) => String((input as Partial<NoteInput> | null)?.[k] ?? ""); // 경계: 화면 값의 모양을 믿지 않음
  return saveTemplateNote(c.db, templateId, { usedFor: text("usedFor"), result: text("result"), tip: text("tip") });
}

export async function markTemplateNoteHelpfulAction(noteId: string): Promise<ActionResult> {
  if (await isLoginPreview()) return { ok: false, error: PREVIEW_NO_SAVE };
  const c = await templateDb();
  if ("message" in c) return { ok: false, error: c.message };
  return markTemplateNoteHelpful(c.db, c.userId, noteId);
}

export async function reportTemplateNoteAction(noteId: string, reason: string): Promise<ActionResult> {
  if (await isLoginPreview()) return { ok: false, error: PREVIEW_NO_SAVE };
  if (typeof reason !== "string") return { ok: false, error: "신고 사유를 적어 주세요" }; // 경계: 화면 값을 믿지 않음
  const c = await templateDb();
  if ("message" in c) return { ok: false, error: c.message };
  return reportTemplateNote(c.db, c.userId, noteId, reason);
}
