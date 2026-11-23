// 메뉴 상태 줄(P-12m B): 실제 마지막 정기 수집 실행만 읽고(불변 6), 못 읽음 · 아직 없음을 정상과 가르고(불변 2), 사람 칸은 읽지 않는다(손님 화면, 불변 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kstTime, readScanStatus } from "./scan-status.ts";

type Ans = { data: unknown[] | null; error: { message: string } | null };
/** 가짜 DB: 표마다 정한 답, 고른 칸 · 거른 조건을 적어 둔다 */
function fakeDb(runs: Ans, steps: Ans) {
  const log: { table: string; cols: string; eq: [string, unknown][] }[] = [];
  const db = {
    from(table: string) {
      const entry = { table, cols: "", eq: [] as [string, unknown][] }; log.push(entry);
      const q: Record<string, unknown> = {};
      q.select = (c: string) => ((entry.cols = c), q);
      q.eq = (k: string, v: unknown) => (entry.eq.push([k, v]), q);
      q.order = () => q; q.limit = () => q;
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(table === "runs" ? runs : steps).then(res);
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, log };
}
const RUN = { id: "r1", created_at: "2026-11-22T21:00:00Z", finished_at: "2026-11-22T21:04:00Z" };

test("값: 마지막 정기 실행의 끝난 시각과 단계 수(정상 n / 전체 m · 오류 k)", async () => {
  const { db } = fakeDb({ data: [RUN], error: null }, { data: [{ status: "succeeded" }, { status: "succeeded" }, { status: "failed" }, { status: "running" }], error: null });
  assert.deepEqual(await readScanStatus(db), { state: "ok", runId: "r1", at: RUN.finished_at, ok: 2, total: 4, errors: 1 });
  assert.equal(kstTime(RUN.finished_at), "06:04");
});

test("못 읽음: 실행 · 단계 조회 오류나 DB 없음은 fail(정상 · 없음으로 쓰지 않음), 실행이 아직 없으면 none", async () => {
  assert.deepEqual(await readScanStatus(fakeDb({ data: null, error: { message: "x" } }, { data: [], error: null }).db), { state: "fail" });
  assert.deepEqual(await readScanStatus(fakeDb({ data: [RUN], error: null }, { data: null, error: { message: "x" } }).db), { state: "fail" });
  assert.deepEqual(await readScanStatus(null), { state: "fail" });
  assert.deepEqual(await readScanStatus(fakeDb({ data: [], error: null }, { data: [], error: null }).db), { state: "none" });
});

test("손님: 정기 수집(schedule)만, 사람 · 프로젝트 칸은 고르지 않는다", async () => {
  const { db, log } = fakeDb({ data: [RUN], error: null }, { data: [], error: null });
  await readScanStatus(db);
  assert.deepEqual(log[0].eq, [["trigger", "schedule"]]);
  for (const { cols } of log) assert.ok(!/started_by|project_id|user/.test(cols), cols);
});
