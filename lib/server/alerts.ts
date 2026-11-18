// 알림 만들기 — 자리만. 주인: 황재웅(B), P-7에서 채운다.
// P-3(OSV)과 P-5(시뮬레이터)가 saveChange 다음에 이 함수를 부른다.
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 변경 하나 → 그 기술을 쓰는 사람마다 알림 하나(alerts(user_id, dedupe_key) UK로 불변 3).
 * 변경이 이미 있던 것이어도(created=false) 아직 알림이 없는 사람에게는 만든다(SPEC-3.1, flow `save_change → notify`).
 * onlyDemo면 시연 계정에만(시뮬레이터, SPEC-3.5). 만든 알림 수를 돌려준다.
 */
export async function createAlertsForChange(
  _db: SupabaseClient,
  _input: { changeId: string; techId: string; kind: "security" | "opportunity"; onlyDemo?: boolean },
): Promise<number> {
  throw new Error("createAlertsForChange는 P-7(황재웅)에서 채운다");
}
