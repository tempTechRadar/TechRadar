// 취향 저장·읽기(PRD-F32). 로그인한 사용자의 클라이언트로만 부른다: user_tastes의 RLS가 본인 줄만 열어 준다(관리자도 못 봄, 불변 5).
// 고친 줄이 없으면 저장했다고 하지 않는다(불변 4).
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSecrets } from "../domain/redact.ts";
import { validateTaste, type Taste } from "../domain/taste.ts";

export type SaveTasteResult = { ok: true } | { ok: false; error: string };

export async function saveTaste(db: SupabaseClient, userId: string, input: Taste): Promise<SaveTasteResult> {
  const checked = validateTaste(input);
  if (!checked.ok) return checked;
  // upsert는 쓰지 않는다: 충돌 때 user_id 칸까지 고치려 해 운영의 열 권한(세 칸만 고치기)에 막힌다(I-P-23-taste-save-permission)
  const updated = await db.from("user_tastes").update(checked.taste).eq("user_id", userId).select("user_id");
  if (updated.error || !updated.data) return failed(updated.error?.message);
  if (updated.data.length > 0) return { ok: true };
  const inserted = await db.from("user_tastes").insert({ user_id: userId, ...checked.taste }).select("user_id");
  if (inserted.error || !inserted.data) return failed(inserted.error?.message);
  if (inserted.data.length === 0) return { ok: false, error: "저장하지 못했어요: 내 취향 줄을 만들지 못했어요" };
  return { ok: true };
}

const failed = (message?: string): SaveTasteResult => ({ ok: false, error: `저장하지 못했어요: ${maskSecrets(message ?? "빈 응답")}` });

/** 저장된 취향. 줄이 없으면(질문을 아직 안 봄) null, 읽지 못하면 던진다(화면이 "없음"과 "읽지 못함"을 다르게 보이도록) */
export async function readTaste(db: SupabaseClient, userId: string): Promise<Taste | null> {
  const { data, error } = await db.from("user_tastes").select("build, tools, interests").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`취향을 읽지 못함: ${maskSecrets(error.message)}`);
  return data ? { build: data.build ?? null, tools: data.tools ?? [], interests: data.interests ?? [] } : null;
}

/** 취향 폼 읽기. 체크하지 않은 칸은 폼에 없다. 모르는 칸(user_id 등)은 읽지 않는다 */
export function readTasteForm(form: FormData): Taste {
  const build = String(form.get("build") ?? "");
  return { build: build === "" ? null : build, tools: form.getAll("tools").map(String), interests: form.getAll("interests").map(String) };
}
