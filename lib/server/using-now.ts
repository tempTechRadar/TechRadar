// "쓰고 있어요"(PRD-F34, ADR 0009): 그 기술을 쓰는 공개한 사람의 수와 별명. 로그인한 사용자의 클라이언트로 부른다.
// DB 함수 using_now(security definer)가 수와 별명만 돌려주고 남의 줄 원본은 내보내지 않는다(불변 5). 함수가 아직 없으면 실패로 알린다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSecrets } from "../domain/redact.ts";

export type UsingNowResult = { ok: true; count: number; nicknames: string[] } | { ok: false; error: string };

const bad = (what: string): UsingNowResult => ({ ok: false, error: `쓰고 있어요를 읽지 못함: ${what}` });

export async function readUsingNow(db: SupabaseClient, techId: string): Promise<UsingNowResult> {
  const { data, error } = await db.rpc("using_now", { p_tech_id: techId });
  if (error) return bad(maskSecrets(error.message));
  const row = (Array.isArray(data) ? data[0] : data) as { user_count?: unknown; nicknames?: unknown } | null | undefined;
  const count = row?.user_count;
  const names = row?.nicknames;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return bad("수가 올바르지 않음");
  if (!Array.isArray(names) || !names.every((n) => typeof n === "string")) return bad("별명 목록이 올바르지 않음");
  return { ok: true, count, nicknames: names as string[] };
}
