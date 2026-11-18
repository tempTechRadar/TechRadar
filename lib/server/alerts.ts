// 알림 만들기. 주인: 황재웅(B). P-3(OSV)과 P-5(시뮬레이터)가 saveChange 다음에 이 함수를 부른다.
// 서비스 키 클라이언트로 부른다(알림 쓰기는 서버만, erd 4절). 규칙은 순수 함수 decideAlerts가 정한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { decideAlerts, type NewAlert, type TechUsage } from "../alerts/decide-alerts.ts";
import { maskSecrets } from "../domain/redact.ts";
import { recordStep } from "./run-log.ts";

export type CreateAlertsInput = {
  changeId: string;
  techId: string;
  kind: "security" | "opportunity";
  onlyDemo?: boolean;
  /** 있으면 흐름 화면용 `notify` 단계를 이 실행에 남긴다(P-4 recordStep, 불변 6) */
  runId?: string;
};

type Row = Record<string, any>;

const SECURITY_CHANGE_KINDS = ["grade_to_danger", "first_seen_danger"];

type DbResult = { data: unknown; error: { message: string } | null };

const failure = (what: string, message?: string) => new Error(`${what}: ${maskSecrets(message ?? "빈 응답")}`);

function rowsOrThrow({ data, error }: DbResult, what: string): Row[] {
  if (error || !data) throw failure(what, error?.message);
  return data as Row[];
}

async function readChange(db: SupabaseClient, changeId: string): Promise<Row> {
  const { data, error } = await db.from("changes").select("kind, dedupe_key, is_simulated").eq("id", changeId).single();
  if (error || !data) throw failure("변경을 읽지 못함", error?.message);
  return data as Row;
}

async function readTechUsages(db: SupabaseClient, techId: string): Promise<TechUsage[]> {
  const mine = rowsOrThrow(await db.from("my_technologies").select("id, owner_id, tech_id, project_id, hidden_at").eq("tech_id", techId), "내 기술을 읽지 못함");
  const projects = rowsOrThrow(await db.from("projects").select("id, archived_at").in("id", mine.map((m) => m.project_id)), "프로젝트를 읽지 못함");
  const owners = rowsOrThrow(await db.from("profiles").select("id, is_demo").in("id", mine.map((m) => m.owner_id)), "사용자를 읽지 못함");
  return mine.map((m) => ({
    userId: m.owner_id,
    myTechnologyId: m.id,
    techId: m.tech_id,
    isDemo: owners.find((o) => o.id === m.owner_id)?.is_demo === true,
    hidden: m.hidden_at !== null,
    archived: projects.find((p) => p.id === m.project_id)?.archived_at !== null,
  }));
}

async function readExistingAlertKeys(db: SupabaseClient, changeId: string): Promise<Set<string>> {
  const rows = rowsOrThrow(await db.from("alerts").select("dedupe_key").eq("change_id", changeId), "알림을 읽지 못함");
  return new Set(rows.map((row) => row.dedupe_key));
}

function toAlertRow(changeId: string, alert: NewAlert): Row {
  return { user_id: alert.userId, change_id: changeId, my_technology_id: alert.myTechnologyId, kind: alert.kind, dedupe_key: alert.dedupeKey };
}

/**
 * 변경 하나 → 그 기술을 쓰는 사람마다 알림 하나(alerts(user_id, dedupe_key) UK로 불변 3).
 * 변경이 이미 있던 것이어도 아직 알림이 없는 사람에게는 만든다(SPEC-3.1, flow `save_change → notify`).
 * 시뮬레이터 변경이거나 onlyDemo면 시연 계정에만(SPEC-3.5). 만든 알림 수를 돌려준다.
 */
export async function createAlertsForChange(db: SupabaseClient, input: CreateAlertsInput): Promise<number> {
  const startedAt = Date.now();
  let result: { created: number; people: number };
  try {
    result = await createAlerts(db, input);
  } catch (error) {
    if (input.runId) await recordFailure(db, input.runId, error, startedAt);
    throw error;
  }
  const { created, people } = result;
  if (input.runId) {
    await recordStep(db, input.runId, {
      stepName: "notify",
      status: "succeeded",
      countIn: people,
      countOut: created,
      outputSummary: `알림 ${created}건 만듦`,
      durationMs: Date.now() - startedAt,
    });
  }
  return created;
}

async function recordFailure(db: SupabaseClient, runId: string, error: unknown, startedAt: number): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  // 기록이 또 실패해도 원래 오류가 더 중요하다: 호출한 쪽에는 원래 오류를 그대로 던진다.
  await recordStep(db, runId, { stepName: "notify", status: "failed", errorMessage: message, durationMs: Date.now() - startedAt }).catch(() => {});
}

async function createAlerts(db: SupabaseClient, input: CreateAlertsInput): Promise<{ created: number; people: number }> {
  if (input.kind !== "security") throw new Error("적용 기회(opportunity) 알림은 P-14에서 만든다");
  const change = await readChange(db, input.changeId);
  if (!SECURITY_CHANGE_KINDS.includes(change.kind)) {
    throw new Error(`보안 알림은 ${SECURITY_CHANGE_KINDS.join("·")} 변경에만 만든다 (받은 변경 종류: ${change.kind})`);
  }
  const usages = await readTechUsages(db, input.techId);
  const alerts = decideAlerts({
    change: { id: input.changeId, kind: change.kind, techId: input.techId, dedupeKey: change.dedupe_key, isSimulated: change.is_simulated || input.onlyDemo === true },
    usages,
    existingAlertKeys: await readExistingAlertKeys(db, input.changeId),
  });
  const people = new Set(usages.map((usage) => usage.userId)).size;
  if (alerts.length === 0) return { created: 0, people };
  const rows = alerts.map((alert) => toAlertRow(input.changeId, alert));
  const written = await db.from("alerts").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true }).select("id");
  return { created: rowsOrThrow(written, "알림을 저장하지 못함").length, people };
}
