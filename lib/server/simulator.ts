// 시뮬레이터(P-5): 버튼 한 번에 가짜 변경 1건(정답 사례 G1)을 만들고, 실행 기록을 단계마다 남긴다. 주인: 차세일(C).
// 저장·알림 함수는 주입받는다(changes.ts가 "@/" 별칭을 써서 node --test에서 못 불러오므로). 서비스 키 클라이언트로 부른다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSecrets } from "../domain/redact.ts";
import { npmKey, type TechRef } from "../domain/tech-key.ts";
import type { CreateAlertsInput } from "./alerts.ts";
import type { NewChange } from "./changes.ts";
import { finishRun, recordStep, startRun, type StepRecord } from "./run-log.ts";

export type SimulatorDeps = {
  db: SupabaseClient;
  saveChange: (db: SupabaseClient, change: NewChange) => Promise<{ id: string; created: boolean }>;
  createAlertsForChange: (db: SupabaseClient, input: CreateAlertsInput) => Promise<number>;
};

export type SimulatorResult = { runId: string; changeId: string; changeCreated: boolean; alertsCreated: number; note: string };

// G1(docs/spec.md 10절): npm mcp-remote 0.1.16 미만은 위험. 고친 버전은 0.1.16.
const G1 = { name: "mcp-remote", version: "0.1.15", causeId: "GHSA-6xpm-ggf7-wc3p", cve: "CVE-2025-6514", fixedVersion: "0.1.16" };
// 알림 상세가 읽는 칸(쉬운 이유·근거)을 진짜 첫 읽기(first-read.ts)와 같은 모양으로 채운다. 값은 등급 규칙(gradeFromOsv)이 저장된 OSV 응답
// (lib/domain/fixtures/osv-mcp-remote-0.1.15.json)에 내는 것과 같고, 시험이 둘이 같은지 본다. 빠지면 화면에 "찾지 못함"이 나온다(M0 사람 확인 11-19).
const G1_REASON = "이 버전(0.1.15)에 심각도 CRITICAL인 알려진 문제가 있어요(GHSA-6xpm-ggf7-wc3p / CVE-2025-6514). 0.1.16 이상으로 올리면 고쳐져요.";
const G1_EVIDENCE = [{ id: G1.causeId, aliases: [G1.cve], severity: "CRITICAL", fixed: G1.fixedVersion, url: `https://osv.dev/vulnerability/${G1.causeId}` }];
// 변경 저장용 원인 id. 진짜 첫 등록 읽기(first-read.ts)가 만드는 중복 막기 키와 겹치지 않게 접두어를 붙인다(SPEC-3.5).
const SIM_CAUSE_ID = `sim:${G1.causeId}`;
const SOURCE_NAME = "시뮬레이터(가짜 출처)";
const METRIC = "osv_advisory";

export const fail = (what: string, message?: string) => new Error(`${what}: ${message ?? "빈 응답"}`);

export async function upsertSource(db: SupabaseClient): Promise<string> {
  const row = { name: SOURCE_NAME, method: "api", priority: 99, enabled: false }; // 꺼 둔 출처: 진짜 수집이 쓰지 않는다
  const { data, error } = await db.from("sources").upsert(row, { onConflict: "name" }).select("id").single();
  if (error || !data) throw fail("가짜 출처를 저장하지 못함", error?.message);
  return data.id as string;
}

/**
 * 기술이 이미 있으면 건드리지 않고, 없을 때만 가짜 표시로 만든다.
 * 등급 칸은 채우지 않는다: 이 줄은 진짜 사용자 등록에도 쓰일 수 있어 가짜 등급이 보이면 안 된다.
 * 두 번 동시에 눌러도 깨지지 않게 upsert(겹치면 무시) 뒤 다시 읽는다.
 */
export async function ensureTechnology(db: SupabaseClient, techKey: string): Promise<string> {
  const found = await db.from("technologies").select("id").eq("tech_key", techKey).maybeSingle();
  if (found.error) throw fail("기술을 찾지 못함", found.error.message);
  if (found.data) return found.data.id as string;
  const row = { tech_key: techKey, display_name: G1.name, type: "mcp", is_simulated: true };
  const created = await db.from("technologies").upsert(row, { onConflict: "tech_key", ignoreDuplicates: true }).select("id");
  if (created.error) throw fail("가짜 기술을 만들지 못함", created.error.message);
  const rows = (created.data ?? []) as { id: string }[];
  if (rows.length > 0) return rows[0].id;
  const again = await db.from("technologies").select("id").eq("tech_key", techKey).single(); // 동시에 누른 쪽이 먼저 만듦
  if (again.error || !again.data) throw fail("기술을 다시 찾지 못함", again.error?.message);
  return again.data.id as string;
}

async function insertObservation(db: SupabaseClient, ids: { sourceId: string; techId: string; runId: string }): Promise<string> {
  const row = {
    source_id: ids.sourceId,
    tech_id: ids.techId,
    metric: METRIC,
    prev_value: { grade: "pass" },
    curr_value: { grade: "danger", causeId: G1.causeId, fixed_version: G1.fixedVersion }, // 키 이름은 first-read.ts·판단·화면과 같게(fixed_version)
    change_size: "large",
    run_id: ids.runId,
    observed_at: new Date().toISOString(),
    is_simulated: true,
  };
  const { data, error } = await db.from("observations").insert(row).select("id").single();
  if (error || !data) throw fail("가짜 수집 자료를 저장하지 못함", error?.message);
  return data.id as string;
}

export type Flow = { runId: string; current: string };

export async function done(deps: Pick<SimulatorDeps, "db">, flow: Flow, step: Omit<StepRecord, "status">): Promise<void> {
  await recordStep(deps.db, flow.runId, { ...step, status: "succeeded" });
}

/** 출처·기술·수집 자료를 만들고 normalize→is_event까지 기록한다. */
async function collectSteps(deps: SimulatorDeps, flow: Flow, tech: TechRef): Promise<{ techId: string; observationId: string }> {
  const { db } = deps;
  const sourceId = await upsertSource(db);
  const techId = await ensureTechnology(db, tech.key);
  await done(deps, flow, { stepName: "normalize", countIn: 1, countOut: 1, outputSummary: `${tech.key}@${G1.version} (가짜 출처 ${SOURCE_NAME})` });

  flow.current = "compare";
  const observationId = await insertObservation(db, { sourceId, techId, runId: flow.runId });
  await done(deps, flow, { stepName: "compare", countIn: 1, countOut: 1, outputSummary: "pass → danger (가짜 자료 1줄)" });

  flow.current = "grade";
  await done(deps, flow, { stepName: "grade", countIn: 1, countOut: 1, outputSummary: `위험: ${G1.causeId}, 고친 버전 ${G1.fixedVersion}` });

  flow.current = "is_event";
  await done(deps, flow, { stepName: "is_event", countIn: 1, countOut: 1, branchCounts: { event: 1, no_change: 0, collect_error: 0 } }); // first-read.ts와 같은 영문 키(팀 표준)
  return { techId, observationId };
}

/** 변경 저장 → 알림 → 판단 대기 → 실행 닫기. */
async function saveAndNotify(deps: SimulatorDeps, flow: Flow, tech: TechRef, ids: { techId: string; observationId: string }): Promise<SimulatorResult> {
  const { db } = deps;
  flow.current = "save_change";
  const change = await deps.saveChange(db, {
    kind: "grade_to_danger",
    techId: ids.techId,
    tech,
    causeId: SIM_CAUSE_ID,
    prevValue: { grade: "pass" },
    currValue: { grade: "danger", reason: G1_REASON, fixed_version: G1.fixedVersion, evidence: G1_EVIDENCE }, // first-read.ts와 같은 모양. judgments.ts·to-alert-view.ts가 이 키로 읽는다
    observationId: ids.observationId,
    isSimulated: true,
  });
  if (!change.created) await assertSimulatedChange(db, change.id);
  await done(deps, flow, { stepName: "save_change", countIn: 1, countOut: 1, outputSummary: change.created ? "새 변경 1건 저장" : "이미 있는 변경(새로 만들지 않음)" });

  flow.current = "notify"; // 이 단계는 createAlertsForChange가 직접 기록한다(실패도)
  const alertsCreated = await deps.createAlertsForChange(db, { changeId: change.id, techId: ids.techId, kind: "security", runId: flow.runId });
  if (alertsCreated > 0) {
    flow.current = "human_judgment"; // 이 기록이 실패해도 실패 단계가 남게 먼저 바꾼다
    await recordStep(db, flow.runId, { stepName: "human_judgment", status: "awaiting_judgment", countIn: alertsCreated, outputSummary: `시연 계정 ${alertsCreated}명이 판단 대기` });
  }
  await finishRun(db, flow.runId, { status: "succeeded", itemCount: 1 });
  return { runId: flow.runId, changeId: change.id, changeCreated: change.created, alertsCreated, note: describe(change.created, alertsCreated) };
}

/** 이미 있던 변경이 진짜 변경이면 알림을 붙이지 않고 멈춘다(진짜 사용자에게 가짜 알림이 가는 일을 막는다). */
export async function assertSimulatedChange(db: SupabaseClient, changeId: string): Promise<void> {
  const { data, error } = await db.from("changes").select("is_simulated").eq("id", changeId).single();
  if (error) throw fail("이미 있는 변경을 다시 확인하지 못함", error.message);
  if ((data as { is_simulated?: boolean } | null)?.is_simulated !== true) {
    throw new Error(`중복 막기 키가 진짜 변경(${changeId})과 겹침: 알림을 만들지 않고 멈춤`);
  }
}

function describe(changeCreated: boolean, alertsCreated: number): string {
  if (alertsCreated > 0) return `가짜 변경 ${changeCreated ? "1건 새로 만듦" : "은 이미 있음"}, 시연 계정 알림 ${alertsCreated}건`;
  const base = `가짜 변경 ${changeCreated ? "1건 새로 만듦" : "은 이미 있음"}`;
  return `${base}. 알림 0건: 시연 계정이 ${G1.name}을(를) 내 기술로 쓰지 않거나, 이 변경의 알림이 이미 만들어져 있어요.`;
}

export async function runSimulator(deps: SimulatorDeps, input: { adminId: string }): Promise<SimulatorResult> {
  const runId = await startRun(deps.db, { trigger: "simulator", startedBy: input.adminId });
  const flow: Flow = { runId, current: "normalize" };
  try {
    const tech = npmKey(G1.name, G1.version);
    return await saveAndNotify(deps, flow, tech, await collectSteps(deps, flow, tech));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 기록이 또 실패해도 원래 오류가 더 중요하다. notify 단계는 알림 함수가 이미 failed로 남겼다.
    if (flow.current !== "notify") await recordStep(deps.db, runId, { stepName: flow.current, status: "failed", errorMessage: message }).catch(() => {});
    await finishRun(deps.db, runId, { status: "failed" }).catch(() => {});
    throw error;
  }
}

export type ClearResult = Record<"scenarios" | "judgments" | "alerts" | "changes" | "observations" | "relations" | "technologies", number> & { keptTechnologies: number };

type Answer = PromiseLike<{ data: unknown; error: { message: string } | null }>;
const idsOf = (rows: unknown): string[] => ((rows ?? []) as { id: string }[]).map((r) => r.id);

async function readIds(query: Answer, what: string): Promise<string[]> {
  const { data, error } = await query;
  if (error) throw fail(`${what}을(를) 읽지 못함`, error.message);
  return idsOf(data);
}

async function removeRows(query: Answer, what: string): Promise<number> {
  const { data, error } = await query;
  if (error) throw fail(`${what}을(를) 지우지 못함`, error.message);
  return idsOf(data).length;
}

/** 목록이 비어 있으면 DB를 부르지 않는다(빈 `in` 조건으로 엉뚱한 줄이 걸리는 일을 막는다). */
async function removeByIds(db: SupabaseClient, table: string, column: string, ids: string[], what: string): Promise<number> {
  if (ids.length === 0) return 0;
  return removeRows(db.from(table).delete().in(column, ids).select("id"), what);
}

// 기술 줄을 가리키는 표와 칸. 하나라도 가리키면 그 가짜 기술은 지우지 않는다(진짜 자료가 붙어 있을 수 있다).
const TECH_REFS: [table: string, column: string][] = [
  ["my_technologies", "tech_id"],
  ["observations", "tech_id"],
  ["changes", "tech_id"],
  ["tech_relations", "tech_a"],
  ["tech_relations", "tech_b"],
  ["grade_views", "tech_id"],
];

async function referencedTechIds(db: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const used = new Set<string>();
  for (const [table, column] of TECH_REFS) {
    const { data, error } = await db.from(table).select(column).in(column, ids);
    if (error) throw fail(`${table}의 기술 참조를 읽지 못함`, error.message);
    for (const row of (data ?? []) as unknown as Record<string, string>[]) used.add(row[column]);
  }
  return used;
}

/** 가짜 기술 중 어떤 표도 가리키지 않는 것만 지운다. */
async function removeUnusedTechnologies(db: SupabaseClient): Promise<{ removed: number; kept: number }> {
  const fake = await readIds(db.from("technologies").select("id").eq("is_simulated", true), "가짜 기술");
  if (fake.length === 0) return { removed: 0, kept: 0 };
  const used = await referencedTechIds(db, fake);
  const free = fake.filter((id) => !used.has(id));
  const removed = free.length === 0 ? 0 : await removeRows(db.from("technologies").delete().in("id", free).eq("is_simulated", true).select("id"), "가짜 기술");
  return { removed, kept: fake.length - free.length };
}

const emptyClear = (): ClearResult => ({ scenarios: 0, judgments: 0, alerts: 0, changes: 0, observations: 0, relations: 0, technologies: 0, keptTechnologies: 0 });

function clearReason(r: ClearResult, errorMessage: string | null): string {
  const counts = `변경 ${r.changes}, 알림 ${r.alerts}, 판단 ${r.judgments}, 시나리오 ${r.scenarios}, 수집 자료 ${r.observations}, 같은 역할 관계 ${r.relations}, 기술 ${r.technologies}(남김 ${r.keptTechnologies})`;
  return errorMessage === null ? `시뮬레이터 지우기: ${counts}` : `시뮬레이터 지우기 중간 실패: 지운 것 ${counts}. 오류: ${maskSecrets(errorMessage)}`;
}

/** 지우는 순서(외래키 순서): 시나리오 → 판단 → 알림 → 변경 → 수집 자료 → 같은 역할 관계 → 기술. 지운 수는 r에 바로 쌓는다. */
async function removeAll(db: SupabaseClient, r: ClearResult): Promise<void> {
  const changeIds = await readIds(db.from("changes").select("id").eq("is_simulated", true), "가짜 변경");
  const alertIds = changeIds.length === 0 ? [] : await readIds(db.from("alerts").select("id").in("change_id", changeIds), "가짜 변경의 알림");
  r.scenarios = await removeByIds(db, "scenarios", "alert_id", alertIds, "시나리오");
  r.judgments = await removeByIds(db, "judgments", "alert_id", alertIds, "판단");
  r.alerts = await removeByIds(db, "alerts", "id", alertIds, "알림");
  r.changes = await removeRows(db.from("changes").delete().eq("is_simulated", true).select("id"), "가짜 변경");
  r.observations = await removeRows(db.from("observations").delete().eq("is_simulated", true).select("id"), "가짜 수집 자료");
  r.relations = await removeRows(db.from("tech_relations").delete().eq("is_simulated", true).select("id"), "가짜 같은 역할 관계");
  const techs = await removeUnusedTechnologies(db);
  r.technologies = techs.removed;
  r.keptTechnologies = techs.kept;
}

/**
 * 가짜 표시(is_simulated)가 붙은 줄만 지운다(SPEC-3.5). runs·run_steps는 증거라 남긴다.
 * 성공이든 중간 실패든 바꾼 기록(audit_logs) 한 줄을 남긴다(실패면 지운 수와 가린 오류). 판단 삭제는 DB 트리거가 가짜 변경의 것만 허용한다.
 */
export async function clearSimulated(deps: { db: SupabaseClient }, input: { adminId: string }): Promise<ClearResult> {
  const { db } = deps;
  const result = emptyClear();
  let errorMessage: string | null = null;
  let auditError: string | null = null;
  try {
    await removeAll(db, result);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    const audit = await db.from("audit_logs").insert({ actor_id: input.adminId, actor_role: "admin", action: "simulator_clear", target_table: "changes", target_id: "is_simulated", reason: clearReason(result, errorMessage) });
    if (audit.error) auditError = audit.error.message; // finally 안에서 던지면 원래 오류를 덮으므로 여기서는 적어만 둔다
  }
  if (auditError) throw fail("바꾼 기록을 남기지 못함", auditError);
  return result;
}
