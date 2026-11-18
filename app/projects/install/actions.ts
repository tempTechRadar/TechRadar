"use server";
// 설치 프롬프트·가져오기 서버 동작(IA-22). 사용자 본인 로그인으로만(서비스 키 없음, RLS).
import { maskSecrets } from "@/lib/domain/redact";
import { getCurrentUser } from "@/lib/server/current-user";
import { saveLocalImport, type ImportOutcome } from "@/lib/server/local-import";
import { getServerSupabase } from "@/lib/supabase/server";

export type ImportState = ImportOutcome | null;

export async function saveImportAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const user = await getCurrentUser();
  const none = { skipped: [], secretLines: [] };
  if (!user) return { ok: false, message: "로그인이 필요해요.", ...none };
  const db = await getServerSupabase();
  if (!db) return { ok: false, message: "Supabase 연결 전이에요.", ...none };
  const text = String(form.get("text") ?? "").slice(0, 20_000);
  const out = await saveLocalImport(db, user.id, text);
  return out.ok ? out : { ...out, message: maskSecrets(out.message) };
}

/** 설치 프롬프트를 복사했다는 기록(exports). 실패해도 복사는 이미 됐으니 화면에는 영향 없음 */
export async function recordPromptCopy(count: { tech: number; excludedDanger: number }): Promise<void> {
  const user = await getCurrentUser();
  const db = await getServerSupabase();
  if (!user || !db) return;
  const tech = Math.max(0, Math.min(1000, Math.floor(Number(count.tech) || 0)));
  const excluded = Math.max(0, Math.min(1000, Math.floor(Number(count.excludedDanger) || 0)));
  await db.from("exports").insert({ user_id: user.id, kind: "install_prompt", tech_count: tech, excluded_danger_count: excluded });
}
