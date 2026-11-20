// 알림 만들기. 주인: 황재웅(B). P-3(OSV)과 P-5(시뮬레이터)가 saveChange 다음에 이 함수를 부른다.
// 서비스 키 클라이언트로 부른다(알림 쓰기는 서버만, erd 4절). 규칙은 순수 함수 decideAlerts가 정한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "../ai/ai-client.ts";
import { decideAlerts, type NewAlert } from "../alerts/decide-alerts.ts";
import { readChange, readExistingAlertKeys, readUsages, writeAlerts, type Row } from "./alert-db.ts";
import { createAnthropicClient } from "./anthropic-client.ts";
import { generateDraft } from "./draft.ts";
import { createOpportunityAlerts } from "./opportunity-alerts.ts";
import { recordStep } from "./run-log.ts";
import { logFailure } from "./log-failure.ts";

export type CreateAlertsInput = {
  changeId: string;
  techId: string;
  kind: "security" | "opportunity" | "model_eol";
  onlyDemo?: boolean;
  /**
   * 이 알림 만들기를 부른 읽기 실행. 실행한 사람(ownerId)의 알림 줄에만 run_id로 적는다(남의 줄은 비움: 변경은 공유라 남의 실행에 연결하면 안 됨, 불변 5).
   * 가짜(시뮬레이터)·시연 전용 알림은 이 칸 대신 runId를 모든 알림 줄에 적는다(보안·적용 기회 둘 다).
   * 판단 뒤 "조치" 기록이 이 실행을 찾는 길이다(action-record.ts)
   */
  originRun?: { ownerId: string; runId: string };
  /** 있으면 흐름 화면용 `notify` 단계를 이 실행에 남긴다(P-4 recordStep, 불변 6). 가짜·시연 전용 알림이면 알림 줄의 run_id에도 적는다 */
  runId?: string;
};

// 알림 종류마다 받는 변경 종류. 모델 지원 종료는 보안 경고와 같은 길(그 기술을 쓰는 사람마다 하나)을 쓴다(SPEC-3.3)
const CHANGE_KINDS: Record<"security" | "model_eol", string[]> = { security: ["grade_to_danger", "first_seen_danger"], model_eol: ["model_eol"] };

/** 바깥에 기대는 두 가지(Claude 클라이언트 만들기·초안 만들기). 시험에서 바꿔 끼운다 */
export type AlertDeps = { aiClient: () => AiClient | null; generateDraft: typeof generateDraft };
const realDeps: AlertDeps = { aiClient: () => createAnthropicClient(), generateDraft };

function toAlertRow(changeId: string, alert: NewAlert, runId: string | undefined): Row {
  const row: Row = { user_id: alert.userId, change_id: changeId, my_technology_id: alert.myTechnologyId, kind: alert.kind, dedupe_key: alert.dedupeKey };
  // 칸은 값이 있을 때만 보낸다: 마이그레이션이 DB에 들어가기 전에도 적용 기회 경로가 깨지지 않게
  if (runId) row.run_id = runId;
  return row;
}

/**
 * 변경 하나 → 그 기술을 쓰는 사람마다 알림 하나(alerts(user_id, dedupe_key) UK로 불변 3).
 * 변경이 이미 있던 것이어도 아직 알림이 없는 사람에게는 만든다(SPEC-3.1, flow `save_change → notify`).
 * 시뮬레이터 변경이거나 onlyDemo면 시연 계정에만(SPEC-3.5). 만든 알림 수를 돌려준다.
 * 보안 알림은 만들기 전에 대응안 초안을 부른다(흐름 save_change → summarize → notify, PRD-F15). 같은 입력은 하루 한 번만 보낸다(draft.ts):
 * 초안은 실패해도 던지지 않고 알림은 그대로 만든다. summarize 단계는 실행 id를 넘기는 경로(시뮬레이터)에서만 남는다 —
 * 정기 OSV·첫 읽기는 실행 id가 없어 키가 없을 때 로그(console.warn)에만 남는다.
 * 느리거나 멈춘 Claude는 최대 30초(anthropic-client.ts) 알림 만들기를 늦춘다(열린 질문: 초안을 알림 뒤로 미루기).
 */
export async function createAlertsForChange(db: SupabaseClient, input: CreateAlertsInput, deps: AlertDeps = realDeps): Promise<number> {
  if (input.kind === "security") await deps.generateDraft(db, deps.aiClient(), { changeId: input.changeId, runId: input.runId });
  const startedAt = Date.now();
  let result: { created: number; people: number };
  try {
    result = await createAlerts(db, input);
  } catch (error) {
    if (input.runId) await recordFailure(db, input.runId, error, startedAt);
    throw error;
  }
  const { created, people } = result;
  // 알림은 이미 만들어졌다: 기록이 실패해도 알림 만들기를 실패로 만들지 않는다(여러 변경을 도는 호출자가 중간에 멈추지 않게). 흐름 화면의 칸만 비게 된다.
  if (input.runId) {
    await recordStep(db, input.runId, {
      stepName: "notify",
      status: "succeeded",
      countIn: people,
      countOut: created,
      outputSummary: `알림 ${created}건 만듦`,
      durationMs: Date.now() - startedAt,
    }).catch((error) => console.error("notify 성공 기록 실패", error));
  }
  return created;
}

async function recordFailure(db: SupabaseClient, runId: string, error: unknown, startedAt: number): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  // 기록이 또 실패해도 원래 오류가 더 중요하다: 호출한 쪽에는 원래 오류를 그대로 던진다.
  await recordStep(db, runId, { stepName: "notify", status: "failed", errorMessage: message, durationMs: Date.now() - startedAt }).catch(logFailure("알림 단계 실패를 기록하지 못함"));
}

async function createAlerts(db: SupabaseClient, input: CreateAlertsInput): Promise<{ created: number; people: number }> {
  return input.kind === "opportunity" ? createOpportunityAlerts(db, input) : createSecurityAlerts(db, input);
}

async function createSecurityAlerts(db: SupabaseClient, input: CreateAlertsInput): Promise<{ created: number; people: number }> {
  const change = await readChange(db, input.changeId);
  const kind = input.kind === "model_eol" ? "model_eol" : "security";
  if (!CHANGE_KINDS[kind].includes(change.kind)) {
    throw new Error(`${kind === "security" ? "보안" : "모델 종료"} 알림은 ${CHANGE_KINDS[kind].join("·")} 변경에만 만든다 (받은 변경 종류: ${change.kind})`);
  }
  const isSimulated = change.is_simulated || input.onlyDemo === true;
  // 알림 키에 버전이 들어간다(SPEC-3.1): 다른 버전을 쓰는 사람은 이 위험의 대상이 아니다. 시연 변경은 시연 계정의 버전이 무엇이든 보여 줘야 해서 보지 않는다.
  const usages = (await readUsages(db, [input.techId])).filter((usage) => isSimulated || usage.version === (change.version ?? null));
  const alerts = decideAlerts({
    change: { id: input.changeId, kind: change.kind, techId: input.techId, dedupeKey: change.dedupe_key, isSimulated },
    usages,
    existingAlertKeys: await readExistingAlertKeys(db, input.changeId),
  });
  const people = new Set(usages.map((usage) => usage.userId)).size;
  if (alerts.length === 0) return { created: 0, people };
  // 가짜·시연 전용 알림은 모두 지금 이 실행이 만든다: 그 실행에 잇는다. 안 이으면 다시 누른 실행의 판단(조치)이
  // 변경을 처음 만든 실행(알림 0건일 수 있음)에 붙는다(QA 11-19). 진짜 변경은 읽기를 실행한 본인 줄에만(불변 5)
  const runIdFor = (userId: string) => (isSimulated ? input.runId : input.originRun?.ownerId === userId ? input.originRun.runId : undefined);
  return { created: await writeAlerts(db, alerts.map((alert) => toAlertRow(input.changeId, alert, runIdFor(alert.userId)))), people };
}
