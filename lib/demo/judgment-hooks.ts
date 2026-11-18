// ⑤ 저장 실패 시연(P-20c). 주인: 차세일(C). 판단 서버 동작이 saveJudgment에 넘길 DB 클라이언트를 고른다.
// 스위치·시연 계정·1회용 쿠키가 모두 맞을 때만 판단 저장 rpc가 오류를 돌려주는 클라이언트로 감싼다.
// 그러면 saveJudgment의 실제 실패 처리(불변 4: 저장 안 함, 알림은 판단 대기 그대로)를 그대로 탄다. 가짜로 칠하지 않는다(불변 6).
// 알림 읽기(from)는 감싸지 않는다: 본인 확인·검사는 평소처럼 DB에서 한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { shouldFailSave } from "./demo-switch.ts";

export const DEMO_SAVE_FAILURE = "시연 스위치: 판단 저장을 일부러 실패시킴";

/** rpc만 오류로 답하는 클라이언트. 나머지는 원래 클라이언트 그대로. */
export function failingRpc(db: SupabaseClient): SupabaseClient {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "rpc") return async () => ({ data: null, error: { message: DEMO_SAVE_FAILURE } });
      return Reflect.get(target, prop, receiver);
    },
  });
}

export type DemoContext = { db: SupabaseClient; env: Record<string, string | undefined>; isDemo: boolean; cookie: string | undefined };

/** 시연이면 { db: 실패하는 클라이언트, consumed: true }(부르는 쪽이 쿠키를 지운다), 아니면 원래 클라이언트. */
export function maybeFailForDemo(ctx: DemoContext): { db: SupabaseClient; consumed: boolean } {
  return shouldFailSave(ctx) ? { db: failingRpc(ctx.db), consumed: true } : { db: ctx.db, consumed: false };
}
