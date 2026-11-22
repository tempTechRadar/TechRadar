// 추천 화면의 "관심" 표시(IA-20, ADR 0028). 로그인한 사용자의 클라이언트로 부른다(불변 5).
// 이미 적용 후보·보류로 정한 판단은 덮어쓰거나 지우지 않는다: 먼저 현재 표시를 읽고, 관심이거나 없을 때만 바꾼다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSecrets } from "../domain/redact.ts";

export type InterestResult = { ok: true } | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAILED = "저장하지 못했어요. 다시 시도해 주세요. 표시는 전 상태 그대로예요.";

export async function setInterest(db: SupabaseClient, userId: string, techId: string, action: "interest" | "clear"): Promise<InterestResult> {
  if (!UUID.test(techId)) return { ok: false, message: "기술을 찾지 못했어요." };
  const { data, error } = await db.from("tech_marks").select("status").eq("user_id", userId).eq("tech_id", techId).maybeSingle();
  if (error) {
    console.error("내 표시 읽기 실패", maskSecrets(error.message));
    return { ok: false, message: FAILED };
  }
  const current = (data?.status as string | undefined) ?? null;
  const decided = current !== null && current !== "interest";
  if (action === "clear") return decided || current === null ? { ok: true } : save(db, techId, null);
  if (decided) return { ok: false, message: "이미 정한 판단이 있어요. 기술 상세에서 바꿀 수 있어요." };
  return current === "interest" ? { ok: true } : save(db, techId, "interest");
}

async function save(db: SupabaseClient, techId: string, status: "interest" | null): Promise<InterestResult> {
  const { error } = await db.rpc("set_tech_mark", { p_tech_id: techId, p_status: status, p_reason: null });
  if (!error) return { ok: true };
  console.error("관심 표시 저장 실패", maskSecrets(error.message));
  return { ok: false, message: FAILED };
}
