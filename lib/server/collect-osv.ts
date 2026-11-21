// 정기 OSV 재확인 수집기(P-9d, SPEC-1·3.1·8, 흐름 상자 fetch_osv). 주인: 김영식 A.
// 등록된 (기술, 버전)을 매일 OSV로 다시 묻고, 위험이 아니던 것이 위험이 되면 변경(grade_to_danger)과 알림을 만든다.
// 순서: 변경·알림 → 등급(상태) → 수집 자료. 변경·알림은 중복 막기 키와 "위험이 이어지는 중인지"(planDanger) 판정이 있어 몇 번을 다시 해도
// 같은 결과라서 먼저 한다. 그 뒤 단계가 실패해도 다음 실행이 같은 위험을 같은 변경에 이어 간다(불변 3). 읽지 못한 기술은 등급을 그대로 두고 그 기술만 수집 오류(불변 2·4).
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { gradeFromOsv, type GradeResult, type OsvVuln } from "../domain/grade.ts";
import { causeIdsOf, evidenceIds, isChanged, planDanger, type OsvEcosystem, type OsvTarget } from "../domain/osv-daily.ts";
import type { Collector, CollectorContext } from "../schedule/run-batch.ts";
import { createAlertsForChange, type CreateAlertsInput } from "./alerts.ts";
import { readLatestChange, saveChange, type NewChange } from "./changes.ts";
import { CollectError, queryOsv, type ErrorKind } from "./collect-fetch.ts";
import { countKinds } from "./collect-util.ts";
import { insertObservation, markError, readOsvSource, readOsvTargets, saveGrade } from "./osv-store.ts";
import { recordStep } from "./run-log.ts";

const REQUEST_GAP_MS = 1_000; // SPEC-8: 요청 사이 1초 이상
// 묶음 시간 예산(240초) 중 OSV의 몫: 앞에 두는 보안 확인이 예산을 다 써서 뒤의 수집기(다운로드 등)가 날마다 굶지 않게
const OSV_BUDGET_MS = 150_000;

type Deps = {
  queryOsv: (name: string, ecosystem: OsvEcosystem, version: string | null) => Promise<OsvVuln[]>;
  saveChange: (db: SupabaseClient, c: NewChange) => Promise<{ id: string; created: boolean }>;
  createAlerts: (db: SupabaseClient, input: CreateAlertsInput) => Promise<number>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};
type Failure = { key: string; kind: ErrorKind; message: string };
type Tally = {
  read: number; changed: number; events: number; dangers: number; alerts: number;
  grades: Record<string, number>; failed: Failure[]; skipped: number; requests: number; blocked: boolean;
};
type Run = { db: SupabaseClient; runId: string; sourceId: string; d: Deps; tally: Tally };

export function osvCollector(deps: Partial<Deps> = {}): Collector {
  const d: Deps = { queryOsv, saveChange, createAlerts: createAlertsForChange, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now, ...deps };
  return { source: "fetch_osv", run: (ctx) => collectOsv(ctx, d) };
}

async function collectOsv(ctx: CollectorContext, d: Deps): Promise<{ items: number; summary: string }> {
  const source = await readOsvSource(ctx.db);
  if (!source.enabled) return { items: 0, summary: "OSV 출처가 꺼져 있어요(관리자 설정)" };
  const targets = await readOsvTargets(ctx.db);
  const tally: Tally = { read: 0, changed: 0, events: 0, dangers: 0, alerts: 0, grades: {}, failed: [], skipped: 0, requests: 0, blocked: false };
  const run: Run = { db: ctx.db, runId: ctx.runId, sourceId: source.id, d, tally };
  try {
    await checkEach(run, targets, Math.min(ctx.deadlineMs, d.now() + OSV_BUDGET_MS));
  } catch (e) {
    await recordSteps(run, false).catch(() => {}); // 저장 실패로 멈춰도 거기까지 한 일은 실행 기록에 남긴다(원래 오류는 가리지 않음)
    throw e;
  }
  // 한도 초과로 멈췄거나 읽은 것보다 실패가 많으면 이 출처는 실패다: runBatch가 수집 오류(재시도·3번 연속 강조)로 기록하게 던진다
  const failed = tally.blocked || tally.failed.length > tally.read;
  await recordSteps(run, !failed); // 던질 때는 runBatch가 collect_error를 남기고, 자세한 내용은 던진 오류에 담긴다
  if (failed) throw sourceFailure(tally);
  return { items: tally.read, summary: summarize(tally) };
}

async function checkEach(run: Run, targets: OsvTarget[], deadlineMs: number): Promise<void> {
  const { tally, d } = run;
  for (const [i, t] of targets.entries()) {
    // 한도 초과(429)는 OSV 전체의 일이라 이번 실행에서는 더 묻지 않는다. 오래 안 본 것부터 읽으므로 못 본 쪽이 다음 실행에서 먼저 간다
    if (tally.blocked || d.now() >= deadlineMs) {
      tally.skipped += targets.length - i;
      return;
    }
    await checkOne(run, t);
  }
}

/** 외부 응답을 등급으로 읽다 나는 오류는 그 기술의 해석 실패(parse)다. 한 기술의 이상한 응답이 매일 모든 확인을 멈추게 두지 않는다. */
function gradeOf(t: OsvTarget, vulns: OsvVuln[], nowMs: number): GradeResult {
  try {
    return gradeFromOsv(t.version, vulns, { ...t.repo, nowMs });
  } catch (e) {
    throw new CollectError("parse", `${t.techKey}: OSV 응답을 등급으로 읽지 못함: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 한 (기술, 버전): 묻고(수집 오류는 세어 두고 넘어감) 저장한다(저장 실패·코드 버그는 던진다: 숨기지 않음). */
async function checkOne(run: Run, t: OsvTarget): Promise<void> {
  const { d, tally } = run;
  if (tally.requests++ > 0) await d.sleep(REQUEST_GAP_MS);
  let result: GradeResult;
  try {
    result = gradeOf(t, await d.queryOsv(t.name, t.ecosystem, t.version), d.now());
  } catch (e) {
    if (!(e instanceof CollectError)) throw e;
    tally.failed.push({ key: `${t.techKey}@${t.version ?? "?"}`, kind: e.kind, message: e.message });
    if (e.kind === "rate_limited") tally.blocked = true;
    return markError(run.db, t, e.kind);
  }
  await applyResult(run, t, result);
}

async function applyResult(run: Run, t: OsvTarget, result: GradeResult): Promise<void> {
  const { db, runId, sourceId, d, tally } = run;
  const at = new Date(d.now()).toISOString();
  const changed = isChanged(t, result.grade, evidenceIds(result.evidence));
  if (result.grade === "danger") await ensureDanger(run, t, result);
  await saveGrade(db, t, { result, at });
  tally.read++;
  tally.grades[result.grade] = (tally.grades[result.grade] ?? 0) + 1;
  if (!changed) return;
  // shortcut: 수집 자료는 맨 마지막이라, 여기서 실패하면 그 한 줄만 비고(등급은 이미 저장돼 다음엔 안 바뀐 것으로 보임) 오류로 알린다. 변경에는 잇지 않는다
  await insertObservation(db, { runId, sourceId, at }, { target: t, result });
  tally.changed++;
}

/** 위험인 기술: 변경(새 위험이면 저장, 이어지는 중이면 있는 것)과 알림(아직 없는 사람만)이 있게 한다. 둘 다 중복 막기 키가 있다. */
async function ensureDanger(run: Run, t: OsvTarget, result: GradeResult): Promise<void> {
  const { db, d, tally } = run;
  if (!result.causeId) throw new Error(`${t.techKey}: 위험인데 원인 취약점을 정하지 못함`);
  const plan = planDanger(t, await readLatestChange(db, { techId: t.techId, version: t.version }, causeIdsOf(result)));
  let changeId = plan.reuse?.id;
  if (plan.create) {
    const saved = await d.saveChange(db, {
      kind: plan.create.kind, techId: t.techId, tech: { key: t.techKey, version: t.version }, causeId: result.causeId, dangerRound: plan.create.round,
      prevValue: { grade: t.prevGrade }, currValue: { grade: "danger", reason: result.reason, fixed_version: result.fixedVersion, evidence: result.evidence },
    });
    changeId = saved.id;
    if (saved.created) tally.events++;
  }
  if (!changeId) throw new Error(`${t.techKey}: 위험인데 변경을 찾지도 만들지도 못함`);
  tally.alerts += await d.createAlerts(db, { changeId, techId: t.techId, kind: "security" });
  tally.dangers++; // 알림 만들기까지 끝난 위험 기술만 센다(실패했는데 notify를 성공으로 남기지 않게)
}

const sourceFailure = (t: Tally) =>
  new CollectError(t.failed[0].kind, `OSV를 다 읽지 못했어요(읽음 ${t.read}개, 실패 ${t.failed.length}개: ${countKinds(t.failed)}${t.blocked ? ", 한도 초과로 중단" : ""}). 첫 오류: ${t.failed[0].message}`);

/** 수집 상자 줄은 runBatch가 남긴다. 여기서는 그 뒤 단계와, 일부만 실패했을 때의 collect_error만 남긴다. */
async function recordSteps({ db, runId, tally: t }: Run, withDetail: boolean): Promise<void> {
  if (t.read > 0) {
    await recordStep(db, runId, { stepName: "normalize", status: "succeeded", countIn: t.read, countOut: t.read, outputSummary: "OSV 응답을 (출처, 대상, 이전 값, 현재 값, 시각) 모양으로 맞춤" });
    await recordStep(db, runId, { stepName: "compare", status: "succeeded", countIn: t.read, countOut: t.changed, outputSummary: `바뀐 값 ${t.changed}개, 그대로 ${t.read - t.changed}개` });
    await recordStep(db, runId, { stepName: "grade", status: "succeeded", countIn: t.read, countOut: t.read, branchCounts: t.grades });
    await recordEventSteps(db, runId, t);
  }
  if (!withDetail || t.failed.length === 0) return;
  await recordStep(db, runId, {
    stepName: "collect_error", status: "succeeded", countIn: t.failed.length,
    outputSummary: `fetch_osv ${t.failed.length}개 수집 오류(${countKinds(t.failed)}): ${t.failed.slice(0, 5).map((f) => f.key).join(", ")}`,
    errorKind: t.failed[0].kind, errorMessage: t.failed[0].message,
  });
}

/** 사건 = 이번에 새로 만든 변경. 이어지는 위험에 알림만 새로 만든 경우는 사건이 아니라 알림 건수로만 센다. */
async function recordEventSteps(db: SupabaseClient, runId: string, t: Tally): Promise<void> {
  await recordStep(db, runId, { stepName: "is_event", status: "succeeded", countIn: t.read, branchCounts: { event: t.events, no_change: t.read - t.events, collect_error: t.failed.length } });
  await recordStep(db, runId, { stepName: "save_change", status: "succeeded", countIn: t.events, countOut: t.events });
  // 알림 단계는 알림이 실제로 만들어졌을 때만 켠다. 건수는 전체 사람 기준(정기 실행, flow.md): 들어온 것 = 알림을 확인한 위험 기술 수
  if (t.alerts > 0) await recordStep(db, runId, { stepName: "notify", status: "succeeded", countIn: t.dangers, countOut: t.alerts, outputSummary: `알림 ${t.alerts}건 만듦` });
}

function summarize(t: Tally): string {
  const parts = [`OSV ${t.read}개 확인(등급·근거가 바뀐 것 ${t.changed}개, 새 위험 ${t.events}개, 알림 ${t.alerts}건)`];
  if (t.failed.length) parts.push(`수집 오류 ${t.failed.length}개`);
  if (t.skipped) parts.push(`시간 한도·한도 초과로 ${t.skipped}개는 다음 실행으로`);
  return parts.join(", ");
}
