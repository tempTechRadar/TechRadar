// 공식 MCP 레지스트리 수집기(P-9c, SPEC-8, 흐름 상자 fetch_registry). 주인: 김영식 A.
// 처음에는 전체(6만 개가 넘어 한 달쯤 걸린다), 그다음부터는 지난번 전체 읽기를 시작한 시각 이후 바뀐 것만 읽는다. 최신 버전 서버를 얇은 기술 줄로 저장하고(ADR 0019),
// 목록이 이름순이라 한 실행에 다 못 읽으면 다음 실행이 같은 시작 시각·커서에서 이어 읽는다. 끝까지 읽은 뒤에만 "지난번 시각"을 올린다.
// 쪽 읽기가 실패하면 수집 오류로 던지되 읽은 쪽은 저장돼 있고 읽은 자리도 남는다(불변 2·4). 같은 걸 다시 읽어도 아무것도 쓰지 않는다(불변 3).
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { draftOf, onlyLatest, type RegistryPage } from "../domain/registry.ts";
import type { Collector, CollectorContext } from "../schedule/run-batch.ts";
import { CollectError } from "./collect-fetch.ts";
import { fetchRegistryPage, type RegistryQuery } from "./registry-fetch.ts";
import { applyDrafts, finishPass, readOfficialOrgs, readRegistrySource, saveProgress, type Applied } from "./registry-store.ts";
import { recordStep } from "./run-log.ts";

const REQUEST_GAP_MS = 1_000; // SPEC-8: 요청 사이 1초 이상
// 묶음 시간 예산(240초) 중 레지스트리의 몫: 처음 전체 읽기가 예산을 다 써서 뒤의 수집기가 굶지 않게(남은 것은 다음 실행이 이어 읽는다)
const REGISTRY_BUDGET_MS = 60_000;
const SINCE_SKEW_MS = 5 * 60_000; // 읽는 동안 바뀐 것을 놓치지 않게 지난번 시각보다 조금 앞에서 시작
const MAX_PAGES = 500; // 끝나지 않는 커서를 막는 안전장치(500쪽 = 5만 건)

type Deps = { fetchPage: (q: RegistryQuery) => Promise<RegistryPage>; sleep: (ms: number) => Promise<void>; now: () => number };
type Tally = Applied & { pages: number; latest: number; invalid: number };
type Pass = { sourceId: string; startedAt: string; since: string | null; cursor: string | null };
type Run = { db: SupabaseClient; runId: string; orgs: string[]; d: Deps; tally: Tally; pass: Pass };

export function registryCollector(deps: Partial<Deps> = {}): Collector {
  const d: Deps = { fetchPage: fetchRegistryPage, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now, ...deps };
  return { source: "fetch_registry", run: (ctx) => collectRegistry(ctx, d) };
}

async function collectRegistry(ctx: CollectorContext, d: Deps): Promise<{ items: number; summary: string }> {
  const source = await readRegistrySource(ctx.db);
  if (!source.enabled) return { items: 0, summary: "공식 MCP 레지스트리 출처가 꺼져 있어요(관리자 설정)" };
  const resume = source.syncStartedAt && source.syncCursor ? { startedAt: source.syncStartedAt, cursor: source.syncCursor } : null;
  const pass: Pass = {
    sourceId: source.id,
    startedAt: resume?.startedAt ?? new Date(d.now()).toISOString(),
    since: source.lastSyncedAt ? new Date(Date.parse(source.lastSyncedAt) - SINCE_SKEW_MS).toISOString() : null,
    cursor: resume?.cursor ?? null,
  };
  const tally: Tally = { pages: 0, latest: 0, invalid: 0, created: 0, updated: 0, statusChanged: 0, unchanged: 0, skipped: 0 };
  const run: Run = { db: ctx.db, runId: ctx.runId, orgs: await readOfficialOrgs(ctx.db), d, tally, pass };
  let done = false;
  let failure: unknown = null;
  try {
    done = await readPages(run, Math.min(ctx.deadlineMs, d.now() + REGISTRY_BUDGET_MS));
  } catch (e) {
    failure = e; // 수집 오류·저장 실패·코드 버그 모두: 거기까지 한 일은 기록하고 그대로 던진다(삼키지 않음)
  }
  if (done) await finishPass(ctx.db, pass.sourceId, pass.startedAt);
  // 던질 오류가 있으면 단계 줄 기록이 실패해도 그 오류를 가리지 않는다. 던질 때는 runBatch가 collect_error를 남긴다
  await recordSteps(run, failure === null).catch((e) => {
    if (failure === null) throw e;
  });
  if (failure !== null) throw failure;
  return { items: tally.latest, summary: summarize(tally, done) };
}

/** 끝까지 읽었으면 true. 시간 한도로 멈췄으면 false(읽은 자리는 쪽마다 저장돼 있다). */
async function readPages(run: Run, deadlineMs: number): Promise<boolean> {
  const { d, pass, db } = run;
  for (let i = 0; i < MAX_PAGES; i++) {
    if (i > 0) {
      if (d.now() >= deadlineMs) return false; // 첫 쪽은 늘 읽는다: 한 번도 못 읽고 끝나지 않게
      await d.sleep(REQUEST_GAP_MS);
    }
    const page = await d.fetchPage({ since: pass.since, cursor: pass.cursor });
    if (page.nextCursor !== null && page.nextCursor === pass.cursor) throw new CollectError("parse", "다음 쪽 커서가 그대로라 끝나지 않음");
    await applyPage(run, page);
    pass.cursor = page.nextCursor;
    if (pass.cursor === null) return true;
    await saveProgress(db, pass.sourceId, { startedAt: pass.startedAt, cursor: pass.cursor });
  }
  throw new CollectError("parse", `${MAX_PAGES}쪽을 읽어도 끝나지 않음`);
}

async function applyPage(run: Run, page: RegistryPage): Promise<void> {
  const { db, runId, orgs, d, tally, pass } = run;
  const latest = onlyLatest(page.entries);
  const applied = await applyDrafts(db, { runId, sourceId: pass.sourceId, at: new Date(d.now()).toISOString() }, latest.map((e) => draftOf(e, orgs)));
  tally.pages++;
  tally.latest += latest.length;
  tally.invalid += page.invalid;
  tally.created += applied.created;
  tally.updated += applied.updated;
  tally.statusChanged += applied.statusChanged;
  tally.unchanged += applied.unchanged;
  tally.skipped += applied.skipped;
}

/**
 * 수집 상자 줄은 runBatch가 남긴다. 여기서는 그 뒤 단계만 남긴다.
 * compare의 나가는 건수는 0: 레지스트리의 바뀐 값은 등급 계산으로 넘어가지 않아, 흐름 화면의 compare→grade 화살표 숫자에 안 섞이게(flow.md).
 */
async function recordSteps({ db, runId, tally: t }: Run, withDetail: boolean): Promise<void> {
  if (t.pages === 0) return;
  await recordStep(db, runId, { stepName: "normalize", status: "succeeded", countIn: t.latest, countOut: t.latest, outputSummary: "최신 버전 서버를 (이름, 설명, 상태, 링크) 모양으로 맞춤" });
  await recordStep(db, runId, {
    stepName: "compare", status: "succeeded", countIn: t.latest, countOut: 0,
    outputSummary: `새 ${t.created}개, 고침 ${t.updated}개(상태 바뀜 ${t.statusChanged}개), 그대로 ${t.unchanged}개, 들이지 않음 ${t.skipped}개(중단·삭제된 새 서버). 등급 계산으로 넘어가지 않음`,
  });
  if (!withDetail || t.invalid === 0) return;
  await recordStep(db, runId, { stepName: "collect_error", status: "succeeded", countIn: t.invalid, outputSummary: `fetch_registry 모양이 이상해 읽지 못한 항목 ${t.invalid}개`, errorKind: "parse" });
}

function summarize(t: Tally, done: boolean): string {
  const parts = [`레지스트리 ${t.pages}쪽 읽음(최신 서버 ${t.latest}개: 새 ${t.created}, 고침 ${t.updated}(상태 바뀜 ${t.statusChanged}), 그대로 ${t.unchanged})`];
  if (t.skipped) parts.push(`중단·삭제된 새 서버 ${t.skipped}개는 들이지 않음`);
  if (t.invalid) parts.push(`읽지 못한 항목 ${t.invalid}개`);
  if (!done) parts.push("시간이 모자라 다음 실행에서 이어 읽음");
  return parts.join(", ");
}
