"use server";
// 사용기 쓰기·도움이 됐어요·신고(PRD-F35). 로그인한 사람의 클라이언트로만 쓴다(열 권한과 RLS가 한 번 더 막는다, 불변 5).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/domain/my-tech-view";
import { getCurrentUser } from "@/lib/server/current-user";
import { markHelpful, reportNote, saveUsageNote, type ActionResult } from "@/lib/server/usage-notes";
import { getServerSupabase } from "@/lib/supabase/server";

export type NoteState = { error?: string; done?: true; usedFor?: string; result?: string; tip?: string } | null;

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "");

// 어느 화면에서 눌렀는지(id)는 폼이 보낸 값이라 UUID 모양만 믿고 다시 그린다
async function run(fd: FormData, act: (db: NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>, userId: string) => Promise<ActionResult>, keep?: NoteState): Promise<NoteState> {
  const pathId = text(fd, "pathId");
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${isUuid(pathId) ? `/projects/tech/${pathId}` : "/projects"}`);
  const db = await getServerSupabase();
  if (!db) return { ...keep, error: "서버의 Supabase 설정이 비어 있어요. 관리자에게 알려 주세요." };
  const result = await act(db, user.id);
  if (!result.ok) return { ...keep, error: result.error };
  if (isUuid(pathId)) revalidatePath(`/projects/tech/${pathId}`);
  return { done: true };
}

export async function submitUsageNote(_prev: NoteState, fd: FormData): Promise<NoteState> {
  const techId = text(fd, "techId");
  const typed = { usedFor: text(fd, "usedFor"), result: text(fd, "result"), tip: text(fd, "tip") };
  if (!isUuid(techId)) return { ...typed, error: "기술을 찾지 못했어요" };
  return run(fd, (db, userId) => saveUsageNote(db, userId, techId, typed), typed);
}

export async function pressHelpful(_prev: NoteState, fd: FormData): Promise<NoteState> {
  const noteId = text(fd, "noteId");
  if (!isUuid(noteId)) return { error: "글을 찾지 못했어요" };
  return run(fd, (db, userId) => markHelpful(db, userId, noteId));
}

export async function sendReport(_prev: NoteState, fd: FormData): Promise<NoteState> {
  const noteId = text(fd, "noteId");
  if (!isUuid(noteId)) return { error: "글을 찾지 못했어요" };
  return run(fd, (db, userId) => reportNote(db, userId, noteId, text(fd, "reason")));
}
