// 내 설정 저장(IA-19, PRD-F34): 별명과 "쓰고 있어요" 공개 여부. 로그인한 사용자의 클라이언트로 부른다:
// P-2의 `grant update (nickname, is_public)`와 `profiles_update_own` RLS가 본인 줄·두 칸만 열어 준다(불변 5).
// 고친 줄이 없으면 저장했다고 하지 않는다(불변 4).
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeNext } from "../auth/safe-next.ts";
import { validateNickname } from "../domain/nickname.ts";
import { maskSecrets } from "../domain/redact.ts";

export type SaveSettingsResult = { ok: true; nickname: string; isPublic: boolean } | { ok: false; error: string };

const UNIQUE_VIOLATION = "23505";

export async function saveProfileSettings(db: SupabaseClient, userId: string, input: { nickname: string; isPublic: boolean }): Promise<SaveSettingsResult> {
  const checked = validateNickname(input.nickname);
  if (!checked.ok) return checked;
  const { data, error } = await db.from("profiles").update({ nickname: checked.nickname, is_public: input.isPublic }).eq("id", userId).select("id, nickname, is_public");
  if (error?.code === UNIQUE_VIOLATION) return { ok: false, error: "이미 쓰는 별명이에요. 다른 별명을 골라 주세요" };
  if (error || !data) return { ok: false, error: `저장하지 못했어요: ${maskSecrets(error?.message ?? "빈 응답")}` };
  if (data.length === 0) return { ok: false, error: "저장하지 못했어요: 내 프로필을 찾지 못했어요" };
  return { ok: true, nickname: checked.nickname, isPublic: input.isPublic };
}

/** 설정 폼 읽기. 체크박스는 해제되면 폼에 아예 없으므로(null) 공개 끔이다. next는 이 사이트 안의 경로만 */
export function readSettingsForm(form: FormData): { nickname: string; isPublic: boolean; welcome: boolean; next: string } {
  return {
    nickname: String(form.get("nickname") ?? ""),
    isPublic: form.get("isPublic") === "on",
    welcome: form.get("welcome") === "1",
    next: safeNext(String(form.get("next") ?? "")),
  };
}
