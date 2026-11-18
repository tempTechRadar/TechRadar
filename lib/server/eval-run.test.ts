import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fsReader, runScoring } from "./eval-run.ts";

const db = {} as SupabaseClient;

test("저장소의 정답 파일로 채점하고 실행 기록 함수에 결과를 넘긴다(놓침 0·잘못 울림 0)", async () => {
  const recorded: { score: unknown; saved: { path: string; startedBy?: string } }[] = [];
  const r = await runScoring({ db, reader: fsReader(process.cwd()), record: async (_db, score, saved) => (recorded.push({ score, saved }), "run-9") }, { adminId: "admin-1" });
  assert.equal(r.runId, "run-9");
  assert.equal(r.score.totals.cases, 12);
  assert.equal(r.score.totals.miss, 0);
  assert.equal(r.score.totals.falseAlarm, 0);
  assert.equal(r.score.totals.failed, 0);
  assert.equal(recorded[0].saved.startedBy, "admin-1");
  assert.equal(recorded[0].score, r.score);
});

test("정답 파일에 사례가 없으면 실행 기록을 만들지 않고 오류", async () => {
  let called = false;
  const reader = { readJson: () => ({ cases: [] }), readDir: () => [] };
  await assert.rejects(() => runScoring({ db, reader, record: async () => ((called = true), "x") }, { adminId: "a" }), /사례가 없어요/);
  assert.equal(called, false);
});

test("사례 파일 하나를 못 읽어도 멈추지 않고 그 사례만 실행 실패로 센다", async () => {
  const real = fsReader(process.cwd());
  const reader = { ...real, readJson: (p: string) => (p.includes("osv-mcp-remote") ? (() => { throw new Error("없음"); })() : real.readJson(p)) };
  const r = await runScoring({ db, reader, record: async () => "run-1" }, { adminId: "a" });
  assert.equal(r.score.totals.failed, 1);
  assert.equal(r.score.totals.miss, 1); // G1을 못 읽으면 숨기지 않고 놓침으로 센다
});

test("기록 함수가 실패하면 그대로 던진다(화면은 오류를 보여 줌)", async () => {
  await assert.rejects(() => runScoring({ db, reader: fsReader(process.cwd()), record: async () => { throw new Error("기록 실패"); } }, { adminId: "a" }), /기록 실패/);
});
