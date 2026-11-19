// 경계 사례 하나의 실제 결과를 앱의 진짜 순수 함수로 낸다(PRD-F30). 네트워크·DB 없음.
// OSV 응답은 저장된 파일이나 사례에 적은 응답을 fetch 자리에 잠깐 넣어(끝나면 되돌림) 진짜 queryOsv가 읽게 한다.
// 수집기(collect-osv.ts checkOne)의 분기는 DB에 묶여 내보내지 않아 readOnce에 같은 순서로 따라 썼다: CollectError → 수집 오류, 아니면 등급 → 비교 → 위험이면 planDanger.
// DB가 있어야만 보이는 것(save_judgment 한 거래, changes.dedupe_key 유일 제약)은 여기서 흉내 내지 않는다.
import { changeKey } from "../domain/dedupe-key.ts";
import { gradeFromOsv, type Grade, type OsvVuln } from "../domain/grade.ts";
import { evidenceIds, isChanged, planDanger, type LatestChange, type OsvEcosystem, type OsvTarget } from "../domain/osv-daily.ts";
import { decideAlerts, type TechUsage } from "../alerts/decide-alerts.ts";
import { decideOpportunityAlerts, type OpportunityRelation, type OpportunityUsage } from "../alerts/decide-opportunity-alerts.ts";
import type { AlertKind } from "../alerts/filter-alerts.ts";
import { validateJudgment } from "../alerts/validate-judgment.ts";
import { actionOutcomeOf } from "../server/action-record.ts";
import { CollectError, queryOsv } from "../server/collect-fetch.ts";
import type { Reader } from "./actual.ts";
import type { EdgeActual } from "./edge-score.ts";

/** 이 (기술, 버전)의 이전 상태: 등급·근거 id·마지막으로 위험 아님을 매긴 시각·같은 원인의 가장 큰 회차 변경 */
type Prev = { grade: Grade; evidenceIds: string[]; lastNonDangerAt: string | null; latestChange: LatestChange | null };
/** OSV가 돌려줄 것: 저장된 응답 파일(200), 적은 응답, 또는 연결 실패 */
type OsvReply = { fixture: string } | { status: number; body: string } | { throws: "network" | "timeout" };
type OsvRead = { package: string; ecosystem: OsvEcosystem; techKey: string; version: string | null; reply: OsvReply; prev: Prev };
type Opportunity = Parameters<typeof decideOpportunityAlerts>[0];

export type EdgeInput =
  | ({ type: "osv-read" } & OsvRead)
  | ({ type: "osv-read-twice"; usages: TechUsage[]; changeSavedAt: string; gradeSaveFails: boolean } & OsvRead)
  | ({ type: "opportunity"; times: 1 | 2; relations: OpportunityRelation[]; usages: OpportunityUsage[] } & Pick<Opportunity, "change" | "newTech">)
  | { type: "judgment"; decision: string; reason: string; alertKind: AlertKind; fixedVersion: string | null };

type ReadResult =
  | { kind: "collect_error"; errorKind: string }
  | { kind: "no_change" | "changed"; grade: Grade; ids: string[] }
  | { kind: "continue"; grade: Grade; ids: string[]; changeId: string }
  | { kind: "new"; grade: Grade; ids: string[]; changeKind: string; round: number; key: string };

const failedFetch = (kind: "network" | "timeout"): Error =>
  kind === "timeout" ? Object.assign(new Error("시간 초과"), { name: "TimeoutError" }) : new TypeError("fetch failed");

/** 진짜 queryOsv를 부르되 fetch 자리에 정해 둔 응답을 넣는다. 끝나면(실패해도) 원래 fetch로 되돌린다. */
export async function replayQueryOsv(i: OsvRead, read: Reader): Promise<OsvVuln[]> {
  const reply = i.reply;
  // 응답 파일은 fetch 밖에서 미리 읽는다: 안에서 읽다 실패하면 queryOsv가 연결 실패(수집 오류)로 바꿔 깨진 정답 파일을 가린다
  const answer = "fixture" in reply ? { status: 200, body: JSON.stringify(read.readJson(reply.fixture)) } : reply;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    if ("throws" in answer) throw failedFetch(answer.throws);
    return new Response(answer.body, { status: answer.status });
  }) as typeof fetch;
  try {
    return await queryOsv(i.package, i.ecosystem, i.version);
  } finally {
    globalThis.fetch = realFetch;
  }
}

const targetOf = (i: OsvRead, prev: Prev): OsvTarget => ({
  techId: i.techKey, techKey: i.techKey, version: i.version, ecosystem: i.ecosystem, name: i.package,
  prevGrade: prev.grade, prevEvidence: null, prevEvidenceIds: prev.evidenceIds, lastNonDangerAt: prev.lastNonDangerAt, checkedAt: "",
});

/** 한 번 읽기: 수집기의 checkOne·applyResult·ensureDanger와 같은 순서(DB 쓰기만 뺌) */
async function readOnce(i: OsvRead, prev: Prev, read: Reader): Promise<ReadResult> {
  let vulns: OsvVuln[];
  try {
    vulns = await replayQueryOsv(i, read);
  } catch (e) {
    if (!(e instanceof CollectError)) throw e;
    return { kind: "collect_error", errorKind: e.kind };
  }
  const result = gradeFromOsv(i.version, vulns);
  const ids = evidenceIds(result.evidence);
  const t = targetOf(i, prev);
  if (result.grade !== "danger") return { kind: isChanged(t, result.grade, ids) ? "changed" : "no_change", grade: result.grade, ids };
  if (!result.causeId) throw new Error("위험인데 원인 취약점을 정하지 못함");
  const plan = planDanger(t, prev.latestChange);
  if (plan.reuse) return { kind: "continue", grade: result.grade, ids, changeId: plan.reuse.id };
  const { kind, round } = plan.create!;
  return { kind: "new", grade: result.grade, ids, changeKind: kind, round, key: changeKey({ key: i.techKey, version: i.version }, result.causeId, round) };
}

const READ_OUTCOME: Record<Exclude<ReadResult["kind"], "new">, string> = {
  collect_error: "수집 오류", no_change: "변화 없음", changed: "바뀜(사건 아님)", continue: "위험 이어짐(새 변경 없음)",
};

async function osvRead(i: OsvRead, read: Reader): Promise<Omit<EdgeActual, "id">> {
  const r = await readOnce(i, i.prev, read);
  if (r.kind === "new") return { outcome: `새 변경 ${r.changeKind} r${r.round} · ${r.key}`, event: true };
  return { outcome: READ_OUTCOME[r.kind], event: false, ...(r.kind === "collect_error" ? { note: r.errorKind } : {}) };
}

type Store = { latest: LatestChange | null; changes: number; alertKeys: Set<string> };

/** 읽은 결과를 저장한 것처럼 기억한다(변경은 회차 변경으로, 알림은 키로). 알림은 진짜 decideAlerts가 정한다. */
function remember(r: ReadResult, i: Extract<EdgeInput, { type: "osv-read-twice" }>, store: Store): void {
  let changeId: string | null = null;
  if (r.kind === "new") {
    store.changes++;
    store.latest = { id: r.key, round: r.round, createdAt: i.changeSavedAt };
    changeId = r.key;
  } else if (r.kind === "continue") changeId = r.changeId;
  if (!changeId) return;
  const change = { id: changeId, kind: "grade_to_danger" as const, techId: i.techKey, dedupeKey: changeId, isSimulated: false };
  for (const a of decideAlerts({ change, usages: i.usages, existingAlertKeys: store.alertKeys })) store.alertKeys.add(a.dedupeKey);
}

/** 같은 응답을 두 번 읽는다. 첫 번째 뒤 등급 저장이 실패했으면 이전 상태가 그대로인 채로 다시 읽는다(SPEC-3.1). */
async function osvReadTwice(i: Extract<EdgeInput, { type: "osv-read-twice" }>, read: Reader): Promise<Omit<EdgeActual, "id">> {
  const store: Store = { latest: i.prev.latestChange, changes: 0, alertKeys: new Set() };
  const first = await readOnce(i, i.prev, read);
  remember(first, i, store);
  const graded = first.kind !== "collect_error" && !i.gradeSaveFails;
  const prev2: Prev = graded ? { ...i.prev, grade: first.grade, evidenceIds: first.ids, latestChange: store.latest } : { ...i.prev, latestChange: store.latest };
  remember(await readOnce(i, prev2, read), i, store);
  return { outcome: `변경 ${store.changes} · 알림 ${store.alertKeys.size}`, event: store.changes + store.alertKeys.size > 0 };
}

function opportunity(i: Extract<EdgeInput, { type: "opportunity" }>): Omit<EdgeActual, "id"> {
  const keys = new Set<string>();
  const users: string[] = [];
  for (let n = 0; n < i.times; n++) {
    for (const a of decideOpportunityAlerts({ ...i, existingAlertKeys: keys })) {
      keys.add(a.dedupeKey);
      users.push(a.userId);
    }
  }
  return { outcome: `알림 ${users.length}${users.length ? `(${users.join(", ")})` : ""}`, event: users.length > 0 };
}

/** 판단 입력 검사 → (저장은 DB 몫) → 조치 상자에 무엇을 남기나. 거절이면 완료로 보이지 않아야 한다(불변 4). */
function judgment(i: Extract<EdgeInput, { type: "judgment" }>): Omit<EdgeActual, "id"> {
  const r = validateJudgment(i);
  if (r.ok) return { outcome: `저장으로 넘김 · ${r.value.decision} · 고친 버전 ${r.value.fixedVersion ?? "없음"}`, event: true };
  const action = actionOutcomeOf({ ok: false, message: r.message });
  return { outcome: `거절 · 조치 기록 ${action === null ? "안 함" : "실패"}`, event: false, note: r.message };
}

/** 한 사례가 실패해도 다른 사례는 계속 채점한다. 실패는 error로 남겨 결과 표에 보인다. */
export async function computeEdgeActual(c: { id: string; input: EdgeInput }, read: Reader): Promise<EdgeActual> {
  try {
    const i = c.input;
    if (i.type === "osv-read") return { id: c.id, ...(await osvRead(i, read)) };
    if (i.type === "osv-read-twice") return { id: c.id, ...(await osvReadTwice(i, read)) };
    if (i.type === "opportunity") return { id: c.id, ...opportunity(i) };
    return { id: c.id, ...judgment(i) };
  } catch (e) {
    return { id: c.id, outcome: "없음", event: false, error: e instanceof Error ? e.message : String(e) };
  }
}
