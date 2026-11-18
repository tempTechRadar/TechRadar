import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cronAuthorized } from "./cron-auth.ts";

const SECRET = "test-" + "only-value-1234";

test("Bearer + 같은 값일 때만 통과", () => {
  assert.equal(cronAuthorized(`Bearer ${SECRET}`, SECRET), true);
  assert.equal(cronAuthorized(`Bearer ${SECRET}x`, SECRET), false);
  assert.equal(cronAuthorized(SECRET, SECRET), false);
  assert.equal(cronAuthorized(`bearer ${SECRET}`, SECRET), false);
});

test("비밀값 환경변수가 없거나 헤더가 없으면 누구도 못 부른다", () => {
  assert.equal(cronAuthorized(`Bearer ${SECRET}`, undefined), false);
  assert.equal(cronAuthorized(`Bearer ${SECRET}`, ""), false);
  assert.equal(cronAuthorized("Bearer ", ""), false);
  assert.equal(cronAuthorized(null, SECRET), false);
});

test("예약 설정: 매일 UTC 21:00(한국 06:00) 한 번, flow.json의 예약 상자와 같은 값", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
  const flow = JSON.parse(readFileSync("flow/flow.json", "utf8")) as { nodes: { id: string; config?: { cron_utc?: string } }[] };
  assert.deepEqual(vercel.crons, [{ path: "/api/cron/daily", schedule: "0 21 * * *" }]);
  assert.equal(flow.nodes.find((n) => n.id === "start_schedule")?.config?.cron_utc, vercel.crons[0].schedule);
});
