// 정기 실행·지금 실행 묶음(P-17, SPEC-8). 주인: 차세일(C).
// 시작(schedule·manual) → 등록된 수집기들 → 실행 닫기. 출처 하나가 실패해도 나머지는 계속, 실패는 수집 오류로(불변 2).
// 수집기·DB·시계는 주입받는다. 등록된 수집기가 없으면 실행 기록을 만들지 않는다(가짜로 칠하지 않음, 불변 6).
import type { SupabaseClient } from "@supabase/supabase-js";
import { finishRun, recordStep, startRun, type RunResult, type StepRecord } from "../server/run-log.ts";
import { nextRetry, type RetryPlan } from "./retry.ts";
import { logFailure } from "../server/log-failure.ts";

export type CollectorContext = { db: SupabaseClient; runId: string; deadlineMs: number };
/**
 * 수집기 하나 = 흐름의 수집 상자 하나(source는 flow.json 상자 id, 예: fetch_osv).
 * 수집 상자 자체의 줄은 runBatch가 남긴다(성공·실패). 수집기는 그 뒤 단계(normalize 등)만 남긴다.
 */
export type Collector = { source: string; run: (ctx: CollectorContext) => Promise<{ items: number; summary?: string }> };

export type BatchDeps = { db: SupabaseClient; collectors: Collector[]; now?: () => number; budgetMs?: number };
export type BatchInput = { trigger: "schedule" | "manual"; startedBy?: string; attempt?: number };

export type BatchResult =
  | { started: false; reason: string }
  | { started: true; runId: string; status: RunResult; succeeded: string[]; failed: string[]; skipped: string[]; items: number; retry: RetryPlan };

/** Vercel Hobby 함수 한도 300초(2026-11 공식 문서)보다 넉넉히 짧게. 넘으면 남은 출처는 다음 실행으로 */
export const DEFAULT_BUDGET_MS = 240_000;
type ErrorKind = NonNullable<StepRecord["errorKind"]>;
const KINDS: ErrorKind[] = ["timeout", "network", "rate_limited", "http_status", "parse"];

function errorKindOf(e: unknown): ErrorKind | undefined {
  const kind = (e as { kind?: unknown } | null)?.kind;
  if (KINDS.includes(kind as ErrorKind)) return kind as ErrorKind;
  return e instanceof Error && e.name === "TimeoutError" ? "timeout" : undefined;
}

type Tally = { succeeded: string[]; failed: string[]; skipped: string[]; items: number };

async function runOne(deps: BatchDeps, runId: string, c: Collector, deadlineMs: number, tally: Tally): Promise<void> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  try {
    const out = await c.run({ db: deps.db, runId, deadlineMs });
    await recordStep(deps.db, runId, { stepName: c.source, status: "succeeded", countOut: out.items, outputSummary: out.summary, durationMs: now() - t0 });
    tally.succeeded.push(c.source);
    tally.items += out.items;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await recordStep(deps.db, runId, { stepName: c.source, status: "failed", errorKind: errorKindOf(e), errorMessage: message, durationMs: now() - t0 });
    await recordStep(deps.db, runId, { stepName: "collect_error", status: "succeeded", countIn: 1, outputSummary: `${c.source} 수집 오류` });
    tally.failed.push(c.source);
  }
}

function statusOf(t: Tally, total: number): RunResult {
  if (t.succeeded.length === total) return "succeeded";
  return t.succeeded.length === 0 ? "failed" : "partial";
}

/** 실패가 있으면 다음 시도 시각을 실행 줄에 적는다(runs.attempt·next_retry_at). 실제로 다시 돌리는 일은 부르는 쪽 몫 */
async function scheduleRetry(deps: BatchDeps, runId: string, attempt: number, t: Tally): Promise<RetryPlan> {
  if (t.failed.length === 0) return null;
  const plan = nextRetry(attempt, (deps.now ?? Date.now)());
  const { error } = await deps.db.from("runs").update({ attempt, next_retry_at: plan?.at ?? null }).eq("id", runId);
  if (error) throw new Error(`재시도 시각을 적지 못함: ${error.message}`);
  return plan;
}

export async function runBatch(deps: BatchDeps, input: BatchInput): Promise<BatchResult> {
  if (deps.collectors.length === 0) return { started: false, reason: "등록된 수집기가 없어요(P-9 수집 확장이 합쳐지면 생겨요)" };
  const now = deps.now ?? Date.now;
  const start = now();
  const deadlineMs = start + (deps.budgetMs ?? DEFAULT_BUDGET_MS);
  const runId = await startRun(deps.db, { trigger: input.trigger, startedBy: input.startedBy });
  const tally: Tally = { succeeded: [], failed: [], skipped: [], items: 0 };
  try {
    for (const c of deps.collectors) {
      if (now() >= deadlineMs) tally.skipped.push(c.source); // 시작하지 않은 출처는 기록하지 않는다(회색으로 남음)
      else await runOne(deps, runId, c, deadlineMs, tally);
    }
    const status = tally.skipped.length > 0 && tally.succeeded.length > 0 ? "partial" : statusOf(tally, deps.collectors.length);
    const retry = await scheduleRetry(deps, runId, input.attempt ?? 1, tally);
    await finishRun(deps.db, runId, { status, itemCount: tally.items });
    return { started: true, runId, status, ...tally, retry };
  } catch (error) {
    await finishRun(deps.db, runId, { status: "failed", itemCount: tally.items }).catch(logFailure("실행을 실패로 닫지 못함"));
    throw error;
  }
}
