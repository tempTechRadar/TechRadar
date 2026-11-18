// notify 단계(flow: save_change → notify): 변경마다 알림 만들기를 부르고, 이 실행에는 실행을 시작한 사람 기준 건수만 남긴다.
// 주인: 김영식(A). 알림 만들기 자체는 황재웅(B)의 createAlertsForChange.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAlertsForChange } from "./alerts.ts";
import { recordStep } from "./run-log.ts";

export type NotifyContext = { runId: string; ownerId: string };

/**
 * createAlerts(시험에서는 가짜)에 runId를 일부러 넘기지 않는다. 넘기면 그 함수가 notify에 "그 기술을 쓰는 모든 사람 수"와
 * "남에게 만든 알림 수"를 적는데, 실행을 시작한 사용자가 run_steps를 읽을 수 있어(RLS, 내 실행 기록 탭) 남의 사용 규모가 샌다(불변 5).
 * 변경이 없으면 남기지 않는다. 실패 글은 사용자가 읽으므로 고정 문구만 쓰고 자세한 오류는 서버 기록에만 남긴다.
 * shortcut: 건수는 호출 전후 내 알림 수의 차이라, 같은 사람의 실행이 겹치거나(더블 클릭) 다른 사람의 실행이 같은 변경의 내 알림을
 * 먼저 만들면 어긋날 수 있다(보고용이라 음수만 0으로). 알림 만들기가 사람별 건수를 돌려주게 되면(I-P-3-notify-step 열린 질문 ②) 세지 않고 받는다
 */
export const makeNotifyOwner =
  (createAlerts: typeof createAlertsForChange) =>
  async (db: SupabaseClient, ctx: NotifyContext, saved: { id: string; techId: string }[]): Promise<void> => {
    if (saved.length === 0) return;
    const startedAt = Date.now();
    const ids = saved.map((c) => c.id);
    // 건수는 보고용이다: 못 읽어도 알림이 만들어졌다면 실행을 실패로 만들지 않는다(null).
    const mineCount = async () => {
      const r = await db.from("alerts").select("id", { count: "exact", head: true }).eq("user_id", ctx.ownerId).in("change_id", ids);
      return r.error || r.count === null ? null : r.count;
    };
    let created: number | null;
    try {
      const before = await mineCount();
      for (const c of saved) await createAlerts(db, { changeId: c.id, techId: c.techId, kind: "security", originRun: { ownerId: ctx.ownerId, runId: ctx.runId } });
      const after = await mineCount();
      created = before === null || after === null ? null : Math.max(0, after - before);
    } catch (e) {
      console.error("notify 실패", e);
      // 기록이 또 실패해도 원래 오류가 더 중요하다: 원래 오류를 그대로 다시 던진다
      await recordStep(db, ctx.runId, { stepName: "notify", status: "failed", errorMessage: "알림 만들기에 실패함", durationMs: Date.now() - startedAt })
        .catch((recordErr) => console.error("notify 실패 기록도 실패", recordErr));
      throw e;
    }
    // 알림은 이미 만들어졌다: 성공 기록이 실패해도 "알림 만들기 실패"로 또 적지 않고 기록 실패 오류만 던진다
    await recordStep(db, ctx.runId, {
      stepName: "notify",
      status: "succeeded",
      countIn: saved.length,
      countOut: created ?? undefined,
      outputSummary: created === null ? "알림 만들기 끝(건수는 읽지 못함)" : `내 알림 ${created}건 만듦`,
      durationMs: Date.now() - startedAt,
    });
  };

export const notifyOwner = makeNotifyOwner(createAlertsForChange);
