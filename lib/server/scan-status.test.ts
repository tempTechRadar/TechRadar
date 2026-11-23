// 메뉴 상태 줄(P-12m B): 실제 마지막 정기 수집 실행만 읽고(불변 6), 못 읽음 · 아직 없음을 정상과 가르고(불변 2), 사람 칸은 읽지 않는다(손님 화면, 불변 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { countErrors, kstTime, readScanStatus } from "./scan-status.ts";

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
const RUN = { id: "r1", status: "partial", created_at: "2026-11-22T21:00:00Z", finished_at: "2026-11-22T21:04:00Z" };

const step = (step_name: string, status = "succeeded", error_kind: string | null = null, output_summary: string | null = null) => ({ step_name, status, error_kind, output_summary });

test("값: 마지막 정기 실행의 끝난 시각 · 단계 수 · 수집 오류 수(실패한 단계도 오류)", async () => {
  const { db } = fakeDb({ data: [RUN], error: null }, { data: [step("fetch_osv"), step("grade"), step("notify", "failed", "network"), step("save_change", "running")], error: null });
  assert.deepEqual(await readScanStatus(db), { state: "ok", runId: "r1", at: RUN.finished_at, sources: 1, errors: 1, runFailed: false, running: false });
  assert.equal(kstTime(RUN.finished_at, new Date("2026-11-23T03:00:00Z")), "06:04", "오늘(서울)이면 시각만");
  assert.equal(kstTime(RUN.finished_at, new Date("2026-11-25T03:00:00Z")), "11-23 06:04", "지난 날이면 날짜도(멈춘 정기 수집이 오늘 것처럼 보이지 않게)");
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

test("수집 오류: collect_error 단계는 status가 succeeded여도 오류로 센다(11-23 운영 06:07: 25단계 모두 succeeded · collect_error 2), 실행 실패도 따로", async () => {
  const FETCH = ["osv", "github", "stars", "registry", "downloads", "popularity", "news"].map((n) => step(`fetch_${n}`)); // 06:07 실행처럼 가져오기 7 + 처리 단계가 섞임
  const steps = [...FETCH, ...Array.from({ length: 16 }, (_, i) => step(i % 2 ? "grade" : "normalize")), step("collect_error", "succeeded", "timeout"), step("collect_error", "succeeded", "parse")];
  assert.deepEqual(await readScanStatus(fakeDb({ data: [RUN], error: null }, { data: steps, error: null }).db), { state: "ok", runId: "r1", at: RUN.finished_at, sources: 7, errors: 2, runFailed: false, running: false });
  const failed = await readScanStatus(fakeDb({ data: [{ ...RUN, status: "failed" }], error: null }, { data: [step("fetch_osv")], error: null }).db);
  assert.equal(failed.state === "ok" && failed.runFailed, true);
});

test("수집 오류는 출처마다 한 번: 출처가 통째로 실패하면 failed 단계와 짝 collect_error를 함께 남기므로 하나로 센다, 짝 없는 실패는 따로 센다, 진행 중은 따로 알린다", async () => {
  assert.equal(countErrors([step("fetch_osv", "failed", "timeout"), step("collect_error", "succeeded", null, "fetch_osv 수집 오류"), step("notify", "failed", "network")]), 2);
  const r = await readScanStatus(fakeDb({ data: [{ ...RUN, status: "running", finished_at: null }], error: null }, { data: [step("fetch_osv")], error: null }).db);
  assert.equal(r.state === "ok" && r.running, true);
});
