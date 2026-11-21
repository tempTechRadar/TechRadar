// 경계 사례 하나의 실제 결과를 앱의 진짜 순수 함수로 낸다(PRD-F30). 네트워크·DB 없음.
// OSV 응답은 저장된 파일이나 사례에 적은 응답을 fetch 자리에 잠깐 넣어(끝나면 되돌림) 진짜 queryOsv가 읽게 한다.
// 손으로 따라 쓴 부분(수집기가 DB에 묶여 내보내지 않음, lib/server/collect-osv.ts·changes.ts·osv-store.ts·alerts.ts):
//   ① checkOne: CollectError → 수집 오류 ② gradeOf: 등급으로 읽다 터지면 parse 수집 오류 ③ applyResult: 위험 아니면 isChanged로 비교
//   ④ ensureDanger + readLatestChange: 같은 (기술, 버전)의 변경 중 원인(별칭 포함, causeIdsOf)이 같은 것의 가장 큰 회차 → planDanger
//   ⑤ saveGrade: 등급·근거를 저장하고 위험 아님이면 그 시각이 "마지막 위험 아님" ⑥ createSecurityAlerts: 변경의 종류·dedupe_key와 이미 있는 알림 키로 decideAlerts
// 이 순서가 수집기와 어긋나면 채점이 못 잡는다. DB에만 있는 것(save_judgment 한 거래, 유일 제약)은 흉내 내지 않는다.
// ⑦ 판단 저장 실패: 진짜 saveJudgment에 시연 스위치의 실패 클라이언트(failingRpc, P-20c)를 끼우고, 메모리 속 알림 한 줄로 전후를 비교한다.
import { changeKey } from "../domain/dedupe-key.ts";
import { gradeFromOsv, type Grade, type GradeResult, type OsvVuln } from "../domain/grade.ts";
import { causeIdsOf, evidenceIds, isChanged, planDanger, type LatestChange, type OsvEcosystem, type OsvTarget } from "../domain/osv-daily.ts";
import { decideAlerts, type ChangeToAlert, type TechUsage } from "../alerts/decide-alerts.ts";
import { decideOpportunityAlerts, type OpportunityRelation, type OpportunityUsage } from "../alerts/decide-opportunity-alerts.ts";
import type { AlertKind } from "../alerts/filter-alerts.ts";
import { validateJudgment } from "../alerts/validate-judgment.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { failingRpc } from "../demo/judgment-hooks.ts";
import { actionOutcomeOf } from "../server/action-record.ts";
import { getMyAlert } from "../server/alert-queries.ts";
import { saveJudgment } from "../server/judgments.ts";
import { CollectError, queryOsv } from "../server/collect-fetch.ts";
import type { Reader } from "./actual.ts";
import type { EdgeActual } from "./edge-score.ts";

type DangerKind = ChangeToAlert["kind"];
/** 이 (기술, 버전)에 이미 저장된 변경 하나. alertedUsers = 이 변경으로 이미 알림을 받은 사람 */
type ExistingChange = { id: string; kind: DangerKind; causeId: string; round: number; createdAt: string; alertedUsers?: string[] };
/** 이 (기술, 버전)의 이전 상태: 등급·근거 id·마지막으로 위험 아님을 매긴 시각·저장된 변경들 */
type Prev = { grade: Grade; evidenceIds: string[]; lastNonDangerAt: string | null; changes: ExistingChange[] };
/** OSV가 돌려줄 것: 저장된 응답 파일(200), 적은 응답, 또는 연결 실패 */
type OsvReply = { fixture: string } | { status: number; body: string } | { throws: "network" | "timeout" };
type OsvRead = { package: string; ecosystem: OsvEcosystem; techKey: string; version: string | null; reply: OsvReply; prev: Prev };
type Twice = OsvRead & { usages: TechUsage[]; firstReadAt: string; gradeSaveFails: boolean; secondReply?: OsvReply };
type Opportunity = Parameters<typeof decideOpportunityAlerts>[0];
/** 정답 사례는 별 정보가 없으면 적지 않는다: 모름(null)·의심 없음(false)으로 읽는다 */
type OpportunityNewTech = Omit<Opportunity["newTech"], "stars" | "flagged"> & Partial<Pick<Opportunity["newTech"], "stars" | "flagged">>;

export type EdgeInput =
  | ({ type: "osv-read" } & OsvRead)
  | ({ type: "osv-read-twice" } & Twice)
  | ({ type: "opportunity"; times: 1 | 2; relations: OpportunityRelation[]; usages: OpportunityUsage[] } & Pick<Opportunity, "change"> & { newTech: OpportunityNewTech })
  | { type: "judgment"; decision: string; reason: string; alertKind: AlertKind; fixedVersion: string | null }
  | { type: "judgment-save-fail"; decision: string; reason: string; alertKind: AlertKind; fixedVersion: string | null };

type Graded = { grade: Grade; ids: string[] };
type ReadResult =
  | { kind: "collect_error"; errorKind: string }
  | ({ kind: "no_change" | "changed" } & Graded)
  | ({ kind: "continue"; change: ExistingChange } & Graded)
  | ({ kind: "new"; change: ExistingChange; key: string } & Graded);

const failedFetch = (kind: "network" | "timeout"): Error =>
  kind === "timeout" ? Object.assign(new Error("시간 초과"), { name: "TimeoutError" }) : new TypeError("fetch failed");

// 전역 fetch를 잠깐 바꿔 끼우므로 한 번에 하나만 돈다: queryOsv가 쪽을 여러 번 부르는 동안 다른 사례가 fetch를 바꾸거나 되돌리면 응답이 섞인다.
let replayQueue: Promise<unknown> = Promise.resolve();

/** 진짜 queryOsv를 부르되 fetch 자리에 정해 둔 응답을 넣는다. 끝나면(실패해도) 원래 fetch로 되돌린다. */
export function replayQueryOsv(i: Pick<OsvRead, "package" | "ecosystem" | "version">, reply: OsvReply, read: Reader): Promise<OsvVuln[]> {
  const run = replayQueue.then(() => replayOnce(i, reply, read));
  replayQueue = run.catch(() => undefined);
  return run;
}

async function replayOnce(i: Pick<OsvRead, "package" | "ecosystem" | "version">, reply: OsvReply, read: Reader): Promise<OsvVuln[]> {
  // 응답 파일은 fetch 밖에서 미리 읽는다: 안에서 읽다 실패하면 queryOsv가 연결 실패(수집 오류)로 바꿔 깨진 정답 파일을 가린다
  const answer = "fixture" in reply ? { status: 200, body: JSON.stringify(read.readJson(reply.fixture)) } : reply;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    if ("throws" in answer) throw failedFetch(answer.throws);
    return new Response(answer.body, { status: answer.status });
  }) as typeof fetch;
  try {
    return await queryOsv(i.package, i.ecosystem, i.version, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// 경계 사례는 변경 감지만 본다. 저장소 확인은 비워 둬 취약점 0건은 늘 "찾지 못함"이다(통과 채점은 G5)
const targetOf = (i: OsvRead, prev: Prev): OsvTarget => ({
  techId: i.techKey, techKey: i.techKey, version: i.version, ecosystem: i.ecosystem, name: i.package,
  prevGrade: prev.grade, prevEvidence: null, prevEvidenceIds: prev.evidenceIds, lastNonDangerAt: prev.lastNonDangerAt, checkedAt: "",
  repo: { status: "active", activityAt: null, checkedAt: null, missedCount: 0, repoName: null, license: null },
});

/** ② 수집기 gradeOf와 같다(단, 저장소 확인 없이 변경 감지만 본다): 등급으로 읽다 터지면 그 기술의 해석 실패 */
function gradeOf(version: string | null, vulns: OsvVuln[]): GradeResult {
  try {
    return gradeFromOsv(version, vulns);
  } catch (e) {
    throw new CollectError("parse", `OSV 응답을 등급으로 읽지 못함: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** ④ readLatestChange와 같다: 원인(별칭 포함)이 같은 변경 중 회차가 가장 큰 것 */
function latestFor(changes: ExistingChange[], causeIds: string[]): ExistingChange | null {
  return changes.filter((c) => causeIds.includes(c.causeId)).sort((a, b) => b.round - a.round)[0] ?? null;
}

function dangerResult(i: OsvRead, prev: Prev, result: GradeResult, graded: Graded): ReadResult {
  if (!result.causeId) throw new Error("위험인데 원인 취약점을 정하지 못함");
  const latest = latestFor(prev.changes, causeIdsOf(result));
  const plan = planDanger(targetOf(i, prev), latest as LatestChange | null);
  if (plan.reuse) return { kind: "continue", change: latest!, ...graded };
  const { kind, round } = plan.create!;
  const key = changeKey({ key: i.techKey, version: i.version }, result.causeId, round);
  return { kind: "new", key, change: { id: key, kind, causeId: result.causeId, round, createdAt: "" }, ...graded };
}

/** 한 번 읽기: ①~④ 순서(DB 쓰기만 뺌) */
async function readOnce(i: OsvRead, prev: Prev, reply: OsvReply, read: Reader): Promise<ReadResult> {
  let result: GradeResult;
  try {
    result = gradeOf(i.version, await replayQueryOsv(i, reply, read));
  } catch (e) {
    if (!(e instanceof CollectError)) throw e;
    return { kind: "collect_error", errorKind: e.kind };
  }
  const graded = { grade: result.grade, ids: evidenceIds(result.evidence) };
  if (result.grade === "danger") return dangerResult(i, prev, result, graded);
  return { kind: isChanged(targetOf(i, prev), result.grade, graded.ids) ? "changed" : "no_change", ...graded };
}

const READ_OUTCOME: Record<Exclude<ReadResult["kind"], "new">, string> = {
  collect_error: "수집 오류", no_change: "변화 없음", changed: "바뀜(사건 아님)", continue: "위험 이어짐(새 변경 없음)",
};

async function osvRead(i: OsvRead, read: Reader): Promise<Omit<EdgeActual, "id">> {
  const r = await readOnce(i, i.prev, i.reply, read);
  if (r.kind === "new") return { outcome: `새 변경 ${r.change.kind} r${r.change.round} · ${r.key}`, event: true };
  return { outcome: READ_OUTCOME[r.kind], event: false, ...(r.kind === "collect_error" ? { note: r.errorKind } : {}) };
}

type Store = { changes: ExistingChange[]; newChanges: number; alertKeys: Set<string>; newAlerts: number };

/** 변경의 알림 키(alerts.dedupe_key = 사람|변경의 dedupe_key)와 같은 모양 */
const changeDedupe = (i: OsvRead, c: ExistingChange) => changeKey({ key: i.techKey, version: i.version }, c.causeId, c.round);

/** 이미 저장된 변경으로 이미 받은 알림 키(createSecurityAlerts가 읽는 이미 있는 줄) */
function seededAlertKeys(i: OsvRead): Set<string> {
  return new Set(i.prev.changes.flatMap((c) => (c.alertedUsers ?? []).map((u) => `${u}|${changeDedupe(i, c)}`)));
}

/** 읽은 결과를 저장한 것처럼 기억한다. 알림은 진짜 decideAlerts가 변경의 진짜 종류·dedupe_key로 정한다(⑥). */
function remember(r: ReadResult, i: Twice, store: Store): void {
  if (r.kind !== "new" && r.kind !== "continue") return;
  const c = r.kind === "new" ? { ...r.change, createdAt: i.firstReadAt } : r.change;
  if (r.kind === "new") {
    store.changes.push(c);
    store.newChanges++;
  }
  const change: ChangeToAlert = { id: c.id, kind: c.kind, techId: i.techKey, dedupeKey: changeDedupe(i, c), isSimulated: false };
  for (const a of decideAlerts({ change, usages: i.usages, existingAlertKeys: store.alertKeys })) {
    store.alertKeys.add(a.dedupeKey);
    store.newAlerts++;
  }
}

/** ⑤ saveGrade 뒤의 이전 상태. 등급 저장이 실패했으면 등급·시각은 그대로이고 변경만 남는다. */
function afterFirst(i: Twice, first: ReadResult, store: Store): Prev {
  if (first.kind === "collect_error" || i.gradeSaveFails) return { ...i.prev, changes: store.changes };
  const lastNonDangerAt = first.grade === "danger" ? i.prev.lastNonDangerAt : i.firstReadAt;
  return { grade: first.grade, evidenceIds: first.ids, lastNonDangerAt, changes: store.changes };
}

/** 두 번 읽는다(두 번째 응답이 없으면 같은 응답). 결과는 새로 생긴 변경·알림 수(SPEC-3.1, 불변 3). */
async function osvReadTwice(i: Twice, read: Reader): Promise<Omit<EdgeActual, "id">> {
  const store: Store = { changes: [...i.prev.changes], newChanges: 0, alertKeys: seededAlertKeys(i), newAlerts: 0 };
  const first = await readOnce(i, i.prev, i.reply, read);
  remember(first, i, store);
  remember(await readOnce(i, afterFirst(i, first, store), i.secondReply ?? i.reply, read), i, store);
  return { outcome: `변경 ${store.newChanges} · 알림 ${store.newAlerts}`, event: store.newChanges + store.newAlerts > 0 };
}

function opportunity(i: Extract<EdgeInput, { type: "opportunity" }>): Omit<EdgeActual, "id"> {
  const keys = new Set<string>();
  const users: string[] = [];
  for (let n = 0; n < i.times; n++) {
    for (const a of decideOpportunityAlerts({ ...i, newTech: { stars: null, flagged: false, ...i.newTech }, existingAlertKeys: keys })) {
      keys.add(a.dedupeKey);
      users.push(a.userId);
    }
  }
  return { outcome: `알림 ${users.length}${users.length ? `(${users.join(", ")})` : ""}`, event: users.length > 0 };
}

/** 판단 입력 검사만 본다(validateJudgment). 저장(save_judgment)과 저장 실패 때 되돌림은 DB 몫이라 채점 밖. */
function judgment(i: Extract<EdgeInput, { type: "judgment" }>): Omit<EdgeActual, "id"> {
  const r = validateJudgment(i);
  if (r.ok) return { outcome: `저장으로 넘김 · ${r.value.decision} · 고친 버전 ${r.value.fixedVersion ?? "없음"}`, event: true };
  return { outcome: "입력 검사 거절(저장 안 함)", event: false, note: r.message };
}

type SaveFail = Extract<EdgeInput, { type: "judgment-save-fail" }>;

/** u1의 판단 대기 알림 한 줄만 있는 DB(eq 조건은 지킨다). save_judgment가 불리면(성공) DB 함수처럼 판단을 남기고 알림을 완료로 바꾼다 */
function oneAlertDb(i: SaveFail): SupabaseClient {
  const row: Record<string, unknown> = {
    id: "a1", user_id: "u1", kind: i.alertKind, status: "pending", created_at: "2026-11-21T00:00:00Z", judgments: null, comparison: null, my_technologies: null,
    changes: { kind: "grade_to_danger", detected_at: "2026-11-21T00:00:00Z", prev_value: null, curr_value: i.fixedVersion ? { fixed_version: i.fixedVersion } : {}, technologies: { display_name: "mcp-remote" } },
  };
  // shortcut: select의 칸 목록은 무시하고 줄 전체를 준다. 칸이 빠지는 회귀는 alert-queries 시험 몫
  const query = (eqs: [string, unknown][] = []) => ({
    select: () => query(eqs),
    eq: (col: string, v: unknown) => query([...eqs, [col, v]]),
    maybeSingle: async () => ({ data: eqs.every(([c, v]) => row[c] === v) ? structuredClone(row) : null, error: null }),
  });
  const rpc = async (_name: string, args: { p_decision: string; p_reason: string; p_fixed_version: string | null }) => {
    Object.assign(row, { status: "done", judgments: { decision: args.p_decision, reason: args.p_reason, fixed_version: args.p_fixed_version, judged_at: "2026-11-21T00:00:01Z" } });
    return { data: null, error: null };
  };
  return { from: () => query(), rpc } as unknown as SupabaseClient;
}

/**
 * 판단 저장이 실패하면 "처리 완료"로 보이지 않고(흐름의 조치 상자 = actionOutcomeOf) 알림·판단이 저장 전 그대로여야 한다(불변 4).
 * wrap은 시험에서 실패 클라이언트를 빼고 대조할 때만 바꾼다.
 */
export async function judgmentSaveFail(i: SaveFail, wrap: (db: SupabaseClient) => SupabaseClient = failingRpc): Promise<Omit<EdgeActual, "id">> {
  const db = oneAlertDb(i);
  const before = await getMyAlert(db, "u1", "a1");
  const r = await saveJudgment(wrap(db), { id: "u1", role: "user" }, { alertId: "a1", decision: i.decision, reason: i.reason });
  const after = await getMyAlert(db, "u1", "a1");
  const action = actionOutcomeOf(r);
  const box = action === null ? "조치 기록 안 함" : action.ok ? "조치 상자 성공" : "조치 상자 실패";
  const status = after?.status === "pending" ? "판단 대기" : String(after?.status);
  const kept = JSON.stringify(after) === JSON.stringify(before) ? "보존" : "바뀜";
  const head = r.ok ? "처리 완료" : `${r.saveAttempted ? "저장 실패" : "저장 전 거절"} · 처리 완료 아님`;
  return { outcome: `${head} · ${box} · 알림 ${status} · 기존 값 ${kept}`, event: r.ok, ...(r.ok ? {} : { note: r.message }) };
}

async function actualOf(i: EdgeInput, read: Reader): Promise<Omit<EdgeActual, "id">> {
  switch (i.type) {
    case "osv-read": return osvRead(i, read);
    case "osv-read-twice": return osvReadTwice(i, read);
    case "opportunity": return opportunity(i);
    case "judgment": return judgment(i);
    case "judgment-save-fail": return judgmentSaveFail(i);
    default: throw new Error(`모르는 입력 종류: ${(i as { type?: unknown }).type}`);
  }
}

/** 한 사례가 실패해도 다른 사례는 계속 채점한다. 실패는 error로 남겨 결과 표에 보인다. */
export async function computeEdgeActual(c: { id: string; input: EdgeInput }, read: Reader): Promise<EdgeActual> {
  try {
    return { id: c.id, ...(await actualOf(c.input, read)) };
  } catch (e) {
    return { id: c.id, outcome: "없음", event: false, error: e instanceof Error ? e.message : String(e) };
  }
}
