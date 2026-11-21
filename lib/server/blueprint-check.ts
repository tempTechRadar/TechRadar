// 확정한 청사진 점검(P-12e I). "점검 받기"를 누를 때만 부른다. 흐름은 적용 시나리오(scenario.ts)를 따른다:
// userDb(로그인한 사용자: 내 청사진 읽기 · 요청 줄 쓰기, RLS가 남의 것을 막음)와 serviceDb(서버: 결과 · ai_calls 쓰기, 카탈로그 읽기).
// 코드가 판단하는 사실(check-facts)은 AI 없이도 늘 만들고, Claude는 그 사실을 재료로 "제안 · 주의할 점"만 쓴다. 청사진은 바꾸지 않는다(불변 1).
// 같은 확정본을 같은 재료로 다시 누르면 새로 부르지 않고 이전 결과를 다시 쓴다(input_hash, 불변 3). 거절 말고는 던지지 않는다.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "../ai/ai-client.ts";
import { buildCheckPrompt } from "../ai/build-check-prompt.ts";
import { BLUEPRINT_CHECK_PER_USER_PER_DAY, decideAiCall, startOfKoreanDay } from "../ai/decide-ai-call.ts";
import { parseScenarioResponse } from "../ai/parse-scenario-response.ts";
import type { Board } from "../blueprint/board.ts";
import { checkFacts, type CheckTech, type Fact, type SameRolePair } from "../blueprint/check-facts.ts";
import { fromV1 } from "../blueprint/graph.ts";
import { readStored, toBoard } from "../blueprint/stored.ts";
import { isUuid } from "../domain/my-tech-view.ts";
import { cleanForLog, maskSecrets } from "../domain/redact.ts";
import { failure, rowsOrThrow, type Row } from "./alert-db.ts";

/** 저장하는 점검 결과(blueprint_checks.body). 단계 id는 옛 판(board)에 없어 사실에는 싣지 않는다 */
export type StoredFact = Pick<Fact, "kind" | "severity" | "text" | "source" | "techIds">;
export type BlueprintCheckBody = { facts: StoredFact[]; suggestions: string[]; notes: string[] };
export type CheckResult =
  | { status: "created"; checkId: string }
  | { status: "reused"; checkId: string }
  | { status: "failed"; reason: string; checkId?: string }
  | { status: "refused"; reason: "not_found" | "user_limit" | "service_limit" | "not_configured" | "in_progress" };
export type LatestCheck = { id: string; body: BlueprintCheckBody; sources: string[]; finishedAt: string | null };

type Clients = { userDb: SupabaseClient; serviceDb: SupabaseClient };
type Deps = Clients & { ai: AiClient | null };
type Input = { blueprintId: string; userId: string; now?: Date };
type Loaded = { name: string; board: Board; facts: Fact[] };
type Called = Awaited<ReturnType<AiClient["complete"]>>;

const TECH_COLUMNS = "id, tech_key, display_name, type, grade, grade_reason, last_activity_at, last_activity_kind, collect_error_kind, repo_url";
const CHUNK = 100; // .in() 목록이 길면 주소가 너무 길어 실패한다
const STALE_GENERATING_MS = 10 * 60 * 1000; // 이보다 오래 "만드는 중"인 줄은 끊긴 것으로 보고 실패로 닫는다(새 점검이 막히지 않게)
const GRADES = ["pass", "caution", "danger", "unknown"] as const;

async function readChunks(ids: string[], what: string, read: (chunk: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) rows.push(...rowsOrThrow(await read(ids.slice(i, i + CHUNK)), what));
  return rows;
}

const toCheckTech = (r: Row): CheckTech => ({
  id: r.id, name: r.display_name, techKey: r.tech_key ?? null, type: r.type ?? null,
  grade: GRADES.find((g) => g === r.grade) ?? "unknown", gradeReason: r.grade_reason ?? null,
  lastActivityAt: r.last_activity_at ?? null, lastActivityKind: r.last_activity_kind ?? null, collectErrorKind: r.collect_error_kind ?? null,
  link: typeof r.repo_url === "string" && /^https?:\/\//i.test(r.repo_url) ? r.repo_url : null,
});

/** 내 확정 청사진 + 코드 점검 사실. 내 것이 아니거나 없으면 null. 읽기에 실패하면 던진다(못 읽은 것을 "문제 없음"으로 만들지 않음, 불변 2) */
export async function loadBlueprintFacts({ userDb, serviceDb }: Clients, blueprintId: string, userId: string, now: Date): Promise<Loaded | null> {
  if (!isUuid(blueprintId)) return null;
  const { data, error } = await userDb.from("blueprints").select("id, user_id, name, board").eq("id", blueprintId).maybeSingle();
  if (error) throw failure("청사진을 읽지 못함", error.message);
  const row = data as Row | null;
  if (!row || row.user_id !== userId) return null;
  const stored = readStored(row.board);
  if (!stored) throw failure("청사진을 읽지 못함", "저장된 판 모양이 맞지 않아요");
  const board = toBoard(stored);
  const ids = [...new Set(stored.flat().flatMap((s) => s.techs.map((t) => t.id)))];
  const techs = (await readChunks(ids, "기술을 읽지 못함", (c) => serviceDb.from("technologies").select(TECH_COLUMNS).in("id", c))).map(toCheckTech);
  // 확정한 같은 역할(시뮬레이터 것 제외). tech_a < tech_b라서 둘 다 청사진에 있으면 tech_a도 목록 안에 있다
  const inSet = new Set(ids);
  const rels = await readChunks(ids, "같은 역할을 읽지 못함", (c) =>
    serviceDb.from("tech_relations").select("tech_a, tech_b, quote, confirmed_at").eq("kind", "same_role").eq("status", "confirmed").eq("is_simulated", false).in("tech_a", c));
  const sameRole: SameRolePair[] = rels.filter((r) => inSet.has(r.tech_b)).map((r) => ({ a: r.tech_a, b: r.tech_b, quote: r.quote ?? null, confirmedAt: r.confirmed_at ?? null }));
  return { name: row.name, board, facts: checkFacts({ graph: fromV1(board), techs, sameRole, now }) };
}

/** 이 확정본의 가장 최근 끝난 점검(없으면 null). 읽기에 실패하면 던진다 */
export async function readLatestCheck(userDb: SupabaseClient, blueprintId: string): Promise<LatestCheck | null> {
  const rows = rowsOrThrow(await userDb.from("blueprint_checks").select("id, body, sources, finished_at").eq("blueprint_id", blueprintId).eq("status", "done").order("created_at", { ascending: false }).limit(1), "점검 결과를 읽지 못함");
  const r = rows[0];
  return r ? { id: r.id, body: r.body, sources: Array.isArray(r.sources) ? r.sources : [], finishedAt: r.finished_at ?? null } : null;
}

/** 오늘(한국 시간) 내가 요청한 점검 수 */
export async function countChecksToday(userDb: SupabaseClient, userId: string, now: Date): Promise<number> {
  return rowsOrThrow(await userDb.from("blueprint_checks").select("id").eq("requested_by", userId).gte("created_at", startOfKoreanDay(now)), "오늘 점검 수를 읽지 못함").length;
}

async function logCall(db: SupabaseClient, row: Row): Promise<void> {
  const { error } = await db.from("ai_calls").insert({ purpose: "blueprint_check", ...row });
  if (error) console.error("ai_calls를 기록하지 못함", maskSecrets(error.message));
}

async function markFailed(db: SupabaseClient, checkId: string, now: Date): Promise<void> {
  await db.from("blueprint_checks").update({ status: "failed", finished_at: now.toISOString() }).eq("id", checkId);
}

export const toStoredFact = ({ kind, severity, text, source, techIds }: Fact): StoredFact => ({ kind, severity, text, source, techIds });

async function callAndSave(deps: Deps, loaded: Loaded, prompt: ReturnType<typeof buildCheckPrompt>, hash: string, checkId: string, userId: string, now: Date): Promise<CheckResult> {
  const base = { user_id: userId, input_hash: hash };
  let answer: Called;
  try {
    answer = await deps.ai!.complete({ system: prompt.system, user: prompt.user });
  } catch (error) {
    const reason = cleanForLog(error instanceof Error ? error.message : String(error)) ?? "";
    await logCall(deps.serviceDb, { ...base, status: "failed", error: reason });
    return { status: "failed", reason, checkId };
  }
  const tokens = { tokens_in: answer.tokensIn ?? null, tokens_out: answer.tokensOut ?? null };
  const parsed = parseScenarioResponse(answer.text, prompt.allowedSources);
  if (!parsed.ok) {
    await logCall(deps.serviceDb, { ...base, ...tokens, status: "failed", error: parsed.error });
    return { status: "failed", reason: parsed.error, checkId };
  }
  const body: BlueprintCheckBody = { facts: loaded.facts.map(toStoredFact), suggestions: parsed.steps, notes: parsed.risks };
  const saved = await deps.serviceDb.from("blueprint_checks").update({ status: "done", body, sources: parsed.sources, input_hash: hash, finished_at: now.toISOString() }).eq("id", checkId);
  // 호출은 이미 끝나 토큰이 들었다: 저장이 실패해도 기록해야 하루 한도에 센다
  if (saved.error) {
    const reason = cleanForLog(saved.error.message) ?? "";
    await logCall(deps.serviceDb, { ...base, ...tokens, status: "failed", error: reason });
    return { status: "failed", reason, checkId };
  }
  await logCall(deps.serviceDb, { ...base, ...tokens, status: "succeeded" });
  return { status: "created", checkId };
}

/** 끊긴 "만드는 중" 줄을 닫고 내 요청 줄을 만든다. 이미 만드는 중이면(부분 유일 색인) null */
async function openRequest(deps: Deps, blueprintId: string, userId: string, now: Date): Promise<string | null> {
  const cutoff = new Date(now.getTime() - STALE_GENERATING_MS).toISOString();
  await deps.serviceDb.from("blueprint_checks").update({ status: "failed", finished_at: now.toISOString() }).eq("blueprint_id", blueprintId).eq("status", "generating").lt("created_at", cutoff);
  // 사용자는 blueprint_id · requested_by 두 칸만 쓸 수 있다(M4 열 grant). 상태는 DB 기본값 'generating'
  const inserted = await deps.userDb.from("blueprint_checks").insert({ blueprint_id: blueprintId, requested_by: userId }).select("id").single();
  if (inserted.error?.code === "23505") return null;
  if (inserted.error || !inserted.data) throw failure("점검 요청을 저장하지 못함", inserted.error?.message);
  return (inserted.data as Row).id as string;
}

async function runCheck(deps: Deps, input: Input, now: Date): Promise<CheckResult> {
  const loaded = await loadBlueprintFacts(deps, input.blueprintId, input.userId, now);
  if (!loaded) return { status: "refused", reason: "not_found" };
  const prompt = buildCheckPrompt(loaded);
  const hash = createHash("sha256").update(`${prompt.system}\n${prompt.user}`).digest("hex");
  const same = rowsOrThrow(await deps.userDb.from("blueprint_checks").select("id").eq("blueprint_id", input.blueprintId).eq("status", "done").eq("input_hash", hash).limit(1), "이전 점검을 읽지 못함");
  if (same[0]) return { status: "reused", checkId: same[0].id };

  const mine = await countChecksToday(deps.userDb, input.userId, now);
  const service = rowsOrThrow(await deps.serviceDb.from("ai_calls").select("id").gte("created_at", startOfKoreanDay(now)), "오늘 호출 수를 읽지 못함");
  const decision = decideAiCall("blueprint_check", { changeHasDraft: false, userCallsToday: mine, serviceCallsToday: service.length });
  if (!decision.allow) return { status: "refused", reason: decision.reason === "user_limit" ? "user_limit" : "service_limit" };
  if (!deps.ai) {
    console.warn("청사진 점검: ANTHROPIC_API_KEY가 없어 만들지 않았어요");
    return { status: "refused", reason: "not_configured" };
  }
  const checkId = await openRequest(deps, input.blueprintId, input.userId, now);
  if (!checkId) return { status: "refused", reason: "in_progress" };
  // 위의 "세기"와 이 "넣기" 사이에 다른 청사진으로 동시에 누른 요청이 한도를 함께 통과했을 수 있다(같은 청사진은 부분 유일 색인이 막음).
  // 내 줄을 넣은 뒤 다시 세서 넘으면 이 줄을 닫고 거절한다: 동시에 넣어도 둘 다 서로를 보고 물러나므로 한도를 넘어 부르지는 않는다(안전한 쪽으로만 어긋남).
  if ((await countChecksToday(deps.userDb, input.userId, now)) > BLUEPRINT_CHECK_PER_USER_PER_DAY) {
    await markFailed(deps.serviceDb, checkId, now);
    return { status: "refused", reason: "user_limit" };
  }
  try {
    const result = await callAndSave(deps, loaded, prompt, hash, checkId, input.userId, now);
    if (result.status === "failed") await markFailed(deps.serviceDb, checkId, now);
    return result;
  } catch (error) {
    await markFailed(deps.serviceDb, checkId, now).catch(() => {});
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { checkId });
  }
}

export async function generateBlueprintCheck(deps: Deps, input: Input): Promise<CheckResult> {
  try {
    return await runCheck(deps, input, input.now ?? new Date());
  } catch (error) {
    const reason = maskSecrets(error instanceof Error ? error.message : String(error));
    console.error("청사진 점검 만들기 실패", reason);
    return { status: "failed", reason, checkId: (error as { checkId?: string }).checkId };
  }
}
