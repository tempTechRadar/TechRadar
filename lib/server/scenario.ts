// 적용 시나리오 만들기(PRD-F18, SPEC-4.2·9, ADR 0010). 주인: 황재웅(B). "만들기"를 누를 때만 부른다(누르기 전에는 만들지도 Claude를 부르지도 않음).
// 두 클라이언트를 받는다: userDb(로그인한 사용자: 내 알림 읽기·요청 줄 쓰기, RLS가 남의 것을 막음)와 serviceDb(서버: 결과·ai_calls 쓰기, 카탈로그 읽기).
// 규칙은 decideAiCall·buildScenarioPrompt·parseScenarioResponse(순수 함수)가 정하고, 여기서는 읽기·쓰기·기록만 한다. 거절 말고는 던지지 않는다.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "../ai/ai-client.ts";
import { buildScenarioPrompt, type ScenarioInput } from "../ai/build-scenario-prompt.ts";
import { decideAiCall, startOfKoreanDay } from "../ai/decide-ai-call.ts";
import { parseScenarioResponse } from "../ai/parse-scenario-response.ts";
import { buildComparison } from "../alerts/build-comparison.ts";
import { cleanForLog, maskSecrets } from "../domain/redact.ts";
import { failure, rowsOrThrow, type Row } from "./alert-db.ts";
import { readTechsForCompare } from "./compare-queries.ts";
import { readSameRoleTechIds } from "./similar-judgments.ts";

export type ScenarioResult =
  | { status: "created"; scenarioId: string }
  | { status: "failed"; reason: string; scenarioId?: string }
  | { status: "refused"; reason: "not_found" | "user_limit" | "service_limit" | "not_configured" };

type Deps = { userDb: SupabaseClient; serviceDb: SupabaseClient; ai: AiClient | null };
type Input = { alertId: string; userId: string; now?: Date };
type Alternative = NonNullable<ScenarioInput["alternative"]>;
type Called = Awaited<ReturnType<AiClient["complete"]>>;

const ALERT_COLUMNS = "id, user_id, kind, comparison, changes(kind, tech_id, curr_value, technologies(display_name))";

const oneRow = (raw: Row | Row[] | null | undefined): Row | null => (Array.isArray(raw) ? raw[0] ?? null : raw ?? null);

/** 적용 기회 알림이 만들 때 저장해 둔 비교표(alerts.comparison). 모양이 맞지 않으면 null */
function storedComparison(raw: unknown): { techName: string; alternative: Alternative } | null {
  const value = raw as Row | null;
  const valid = value && typeof value === "object" && typeof value.myTechName === "string" && typeof value.newTechName === "string" && Array.isArray(value.rows);
  return valid ? { techName: value.myTechName, alternative: { name: value.newTechName, rows: value.rows } } : null;
}

// 보안 경고: 확정된 같은 역할 기술 중 첫 번째와의 비교(값은 코드가 채움). 없으면 null. 읽기에 실패하면 던진다(없다고 속이지 않음).
async function sameRoleAlternative(db: SupabaseClient, techId: string, techName: string): Promise<Alternative | null> {
  const [otherId] = await readSameRoleTechIds(db, techId);
  if (!otherId) return null;
  const [mine, other] = await readTechsForCompare(db, [techId, otherId]);
  return mine && other ? { name: other.name, rows: buildComparison(mine.tech, other.tech) } : null;
}

async function logCall(db: SupabaseClient, row: Row): Promise<void> {
  const { error } = await db.from("ai_calls").insert({ purpose: "scenario", ...row });
  if (error) console.error("ai_calls를 기록하지 못함", maskSecrets(error.message));
}

async function markFailed(db: SupabaseClient, scenarioId: string, now: Date): Promise<void> {
  await db.from("scenarios").update({ status: "failed", finished_at: now.toISOString() }).eq("id", scenarioId);
}

async function readInput(deps: Deps, alert: Row): Promise<{ input: ScenarioInput; alternative: Alternative | null }> {
  const change = oneRow(alert.changes) ?? {};
  const curr = (change.curr_value ?? {}) as Row;
  const stored = alert.kind === "opportunity" ? storedComparison(alert.comparison) : null;
  const techName: string = stored?.techName ?? oneRow(change.technologies)?.display_name ?? "찾지 못함";
  const alternative = stored ? stored.alternative : await sameRoleAlternative(deps.serviceDb, change.tech_id, techName);
  const evidence = (Array.isArray(curr.evidence) ? curr.evidence : []).filter((e: Row) => typeof e?.id === "string" && typeof e?.url === "string");
  const input: ScenarioInput = {
    alertKind: alert.kind === "opportunity" ? "opportunity" : "security",
    techName,
    fixedVersion: curr.fixed_version ?? null,
    reason: curr.reason ?? null,
    alternative,
    evidence: evidence.map((e: Row) => ({ id: e.id, severity: String(e.severity ?? "찾지 못함"), url: e.url })),
    outsideTexts: [],
  };
  return { input, alternative };
}

async function callAndSave(deps: Deps, alert: Row, scenarioId: string, userId: string, now: Date): Promise<ScenarioResult> {
  const { input, alternative } = await readInput(deps, alert);
  const prompt = buildScenarioPrompt(input);
  const inputHash = createHash("sha256").update(`${prompt.system}\n${prompt.user}`).digest("hex");
  const base = { user_id: userId, input_hash: inputHash };
  let answer: Called;
  try {
    answer = await deps.ai!.complete({ system: prompt.system, user: prompt.user });
  } catch (error) {
    const reason = cleanForLog(error instanceof Error ? error.message : String(error)) ?? "";
    await logCall(deps.serviceDb, { ...base, status: "failed", error: reason });
    return { status: "failed", reason, scenarioId };
  }
  const tokens = { tokens_in: answer.tokensIn ?? null, tokens_out: answer.tokensOut ?? null };
  const parsed = parseScenarioResponse(answer.text, prompt.allowedSources);
  if (!parsed.ok) {
    await logCall(deps.serviceDb, { ...base, ...tokens, status: "failed", error: parsed.error });
    return { status: "failed", reason: parsed.error, scenarioId };
  }
  const comparison = alternative ? { techName: input.techName, altName: alternative.name, rows: alternative.rows } : null;
  const saved = await deps.serviceDb.from("scenarios")
    .update({ status: "done", body: { comparison, steps: parsed.steps, risks: parsed.risks }, sources: parsed.sources, finished_at: now.toISOString() })
    .eq("id", scenarioId);
  if (saved.error) {
    // 호출은 이미 끝나 토큰이 들었다: 저장이 실패해도 기록해야 하루 한도에 센다
    const reason = cleanForLog(saved.error.message) ?? "";
    await logCall(deps.serviceDb, { ...base, ...tokens, status: "failed", error: reason });
    return { status: "failed", reason, scenarioId };
  }
  await logCall(deps.serviceDb, { ...base, ...tokens, status: "succeeded" });
  return { status: "created", scenarioId };
}

async function createScenario(deps: Deps, input: Input, now: Date): Promise<ScenarioResult> {
  const { data, error } = await deps.userDb.from("alerts").select(ALERT_COLUMNS).eq("id", input.alertId).maybeSingle();
  if (error) throw failure("알림을 읽지 못함", error.message);
  const alert = data as Row | null;
  if (!alert || alert.user_id !== input.userId) return { status: "refused", reason: "not_found" };

  const since = startOfKoreanDay(now);
  const mine = rowsOrThrow(await deps.userDb.from("scenarios").select("id").eq("requested_by", input.userId).gte("created_at", since), "오늘 요청 수를 읽지 못함");
  const service = rowsOrThrow(await deps.serviceDb.from("ai_calls").select("id").gte("created_at", since), "오늘 호출 수를 읽지 못함");
  const decision = decideAiCall("scenario", { changeHasDraft: false, userCallsToday: mine.length, serviceCallsToday: service.length });
  if (!decision.allow) return { status: "refused", reason: decision.reason === "user_limit" ? "user_limit" : "service_limit" };
  if (!deps.ai) {
    console.warn("적용 시나리오: ANTHROPIC_API_KEY가 없어 만들지 않았어요");
    return { status: "refused", reason: "not_configured" };
  }

  // 사용자는 alert_id·requested_by 두 칸만 쓸 수 있다(P-30 열 grant). 상태는 DB 기본값 'generating'
  const inserted = await deps.userDb.from("scenarios").insert({ alert_id: input.alertId, requested_by: input.userId }).select("id").single();
  if (inserted.error || !inserted.data) throw failure("시나리오 요청을 저장하지 못함", inserted.error?.message);
  const scenarioId = (inserted.data as Row).id as string;
  try {
    const result = await callAndSave(deps, alert, scenarioId, input.userId, now);
    if (result.status === "failed") await markFailed(deps.serviceDb, scenarioId, now);
    return result;
  } catch (error) {
    await markFailed(deps.serviceDb, scenarioId, now).catch(() => {});
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { scenarioId });
  }
}

export async function generateScenario(deps: Deps, input: Input): Promise<ScenarioResult> {
  try {
    return await createScenario(deps, input, input.now ?? new Date());
  } catch (error) {
    const reason = maskSecrets(error instanceof Error ? error.message : String(error));
    console.error("적용 시나리오 만들기 실패", reason);
    return { status: "failed", reason, scenarioId: (error as { scenarioId?: string }).scenarioId };
  }
}
