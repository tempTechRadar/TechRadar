// 실패 시연용 수집기(P-20c, docs/flow.md 4절 ①·②). 주인: 차세일(C). 지금 실행 묶음(runBatch)에 넣어 실제 경로로 돈다.
// 정기 수집기(P-9)가 아직 없어서 SCHEDULE_COLLECTORS가 비어 있다. 그래서 시연은 이 수집기로 같은 묶음을 탄다(가짜로 칠하지 않음, 불변 6).
// ① 수집 오류: OSV에 일부러 틀린 경로로 실제 요청 → 실패는 runBatch가 fetch_osv 실패 + collect_error로 남긴다(불변 2).
// ② 사건 아님: OSV에서 고친 버전(mcp-remote 0.1.16)을 실제로 조회해 직전 값과 비교한다. 같으면 "변화 없음" 갈래. 처음엔 비교할 값이 없다고 남긴다.
// 남기는 줄은 모두 가짜 표시(is_simulated) — 시뮬레이터 지우기로 지워진다. 진짜 사용자 알림은 만들지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { forPackage, gradeFromOsv, type OsvVuln } from "../domain/grade.ts";
import type { Collector } from "../schedule/run-batch.ts";
import { recordStep, type StepRecord } from "../server/run-log.ts";
import { ensureTechnology, upsertSource } from "../server/simulator.ts";

type ErrorKind = NonNullable<StepRecord["errorKind"]>;
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** runBatch는 오류의 kind를 읽어 수집 오류 종류로 남긴다(SPEC-8). */
export class DemoCollectError extends Error {
  readonly kind: ErrorKind; // 생성자 매개변수 속성은 node --test(타입 지우기만)가 못 읽어서 따로 적는다
  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export const OSV_QUERY_URL = "https://api.osv.dev/v1/query";
export const OSV_WRONG_URL = "https://api.osv.dev/v1/query-wrong-path-for-demo"; // 일부러 없는 경로
const MIN_GAP_MS = 1000; // 같은 출처 요청 간격 1초 이상(SPEC-8)
let lastCallAt = 0;

async function politeGap(now: () => number, sleep: (ms: number) => Promise<void>): Promise<void> {
  const wait = lastCallAt + MIN_GAP_MS - now();
  if (wait > 0) await sleep(wait);
  lastCallAt = now();
}

export type DemoDeps = { fetchImpl?: FetchLike; now?: () => number; sleep?: (ms: number) => Promise<void> };

/** OSV 한 번 묻기. 실패는 오류 종류로 나눠 던진다(404도 여기선 실패: 경로가 틀린 것이므로). */
export async function askOsv(url: string, pkg: { name: string; version: string }, deps: DemoDeps = {}): Promise<OsvVuln[]> {
  await politeGap(deps.now ?? Date.now, deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))));
  const body = JSON.stringify({ package: { name: pkg.name, ecosystem: "npm" }, version: pkg.version });
  let res: Response;
  try {
    res = await (deps.fetchImpl ?? fetch)(url, { method: "POST", body, headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch (e) {
    const kind: ErrorKind = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network";
    throw new DemoCollectError(kind, `${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (res.status === 429) throw new DemoCollectError("rate_limited", `${url}: 429`);
  if (!res.ok) throw new DemoCollectError("http_status", `${url}: ${res.status}`);
  try {
    return forPackage(((await res.json()) as { vulns?: OsvVuln[] }).vulns ?? [], pkg.name);
  } catch {
    throw new DemoCollectError("parse", "OSV 응답을 해석하지 못함");
  }
}

const SAME_PKG = { name: "mcp-remote", version: "0.1.16" }; // G1의 고친 버전: 보통 취약점 0건이라 두 번 물어도 같은 값
export const SAME_METRIC = "demo_same_value";

/** ① 일부러 틀린 주소로 묻는 수집기. 성공하면(경로가 생겼다면) 그대로 성공으로 남는다. */
export function brokenOsvCollector(deps: DemoDeps = {}): Collector {
  return {
    source: "fetch_osv",
    async run() {
      const vulns = await askOsv(OSV_WRONG_URL, SAME_PKG, deps);
      return { items: 1, summary: `시연: 틀린 주소가 응답함(취약점 ${vulns.length}건)` };
    },
  };
}

type Obs = { curr_value: { grade?: string } | null };

/** ② 같은 값을 두 번 보는 수집기. normalize → compare → grade → is_event(→ no_change)를 실제 비교 결과로 남긴다. */
export function sameValueCollector(db: SupabaseClient, deps: DemoDeps = {}): Collector {
  return {
    source: "fetch_osv",
    async run({ runId }) {
      const grade = gradeFromOsv(SAME_PKG.version, await askOsv(OSV_QUERY_URL, SAME_PKG, deps)).grade;
      const sourceId = await upsertSource(db);
      const techId = await ensureTechnology(db, `npm:${SAME_PKG.name}`);
      await recordStep(db, runId, { stepName: "normalize", status: "succeeded", countIn: 1, countOut: 1, outputSummary: `npm:${SAME_PKG.name}@${SAME_PKG.version}` });
      const prev = await db.from("observations").select("curr_value").eq("tech_id", techId).eq("metric", SAME_METRIC).eq("is_simulated", true).order("observed_at", { ascending: false }).limit(1).maybeSingle();
      if (prev.error) throw new Error(`이전 값을 읽지 못함: ${prev.error.message}`);
      const before = (prev.data as Obs | null)?.curr_value?.grade ?? null;
      const same = before !== null && before === grade;
      const saved = await db.from("observations").insert({
        source_id: sourceId, tech_id: techId, metric: SAME_METRIC, prev_value: before === null ? null : { grade: before }, curr_value: { grade },
        change_size: before === null ? null : same ? "none" : "large", run_id: runId, observed_at: new Date().toISOString(), is_simulated: true,
      });
      if (saved.error) throw new Error(`수집 자료를 저장하지 못함: ${saved.error.message}`);
      await recordStep(db, runId, { stepName: "compare", status: "succeeded", countIn: 1, countOut: 1, outputSummary: before === null ? `처음 값 ${grade}: 비교할 이전 값이 없음` : `${before} → ${grade}` });
      await recordStep(db, runId, { stepName: "grade", status: "succeeded", countIn: 1, countOut: 1, outputSummary: grade });
      await recordStep(db, runId, { stepName: "is_event", status: "succeeded", countIn: 1, countOut: same ? 0 : before === null ? 0 : 1,
        branchCounts: { event: before !== null && !same ? 1 : 0, no_change: same ? 1 : 0, collect_error: 0 },
        outputSummary: before === null ? "처음 값이라 사건 여부를 정하지 않음(한 번 더 누르면 비교)" : same ? "같은 값: 사건 아님" : "값이 바뀜: 시연은 변경 저장까지 가지 않음" });
      if (same) await recordStep(db, runId, { stepName: "no_change", status: "succeeded", countIn: 1, countOut: 1, outputSummary: "변화 없음: 알림 없음" });
      return { items: 1, summary: `${SAME_PKG.name}@${SAME_PKG.version} 등급 ${grade}` };
    },
  };
}

/** 시험용: 요청 간격 기록을 처음으로 돌린다. */
export function resetGapForTest(): void {
  lastCallAt = 0;
}
