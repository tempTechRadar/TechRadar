import { test } from "node:test";
import assert from "node:assert/strict";
import { consecutiveFailures, nextRetry, sourcesToHighlight, type SourceResult } from "./retry.ts";

const T0 = Date.parse("2026-11-18T21:00:00Z");

test("재시도: 1번째 실패 → 2분 뒤 2번째, 2번째 실패 → 4분 뒤 3번째, 3번째 실패면 그만", () => {
  assert.deepEqual(nextRetry(1, T0), { attempt: 2, at: "2026-11-18T21:02:00.000Z" });
  assert.deepEqual(nextRetry(2, T0), { attempt: 3, at: "2026-11-18T21:04:00.000Z" });
  assert.equal(nextRetry(3, T0), null);
});

test("재시도: 이상한 시도 번호는 다시 하지 않는다", () => {
  for (const bad of [0, -1, 1.5, 4, Number.NaN]) assert.equal(nextRetry(bad, T0), null, String(bad));
});

const r = (source: string, day: number, failed: boolean): SourceResult => ({ source, at: `2026-11-${String(day).padStart(2, "0")}T21:00:00Z`, failed });

test("연속 실패: 가장 최근부터 끊기지 않은 실패만 센다(순서가 섞여 들어와도)", () => {
  const streaks = consecutiveFailures([r("fetch_osv", 15, false), r("fetch_osv", 18, true), r("fetch_osv", 16, true), r("fetch_osv", 17, true), r("fetch_registry", 18, false), r("fetch_registry", 17, true)]);
  assert.equal(streaks.get("fetch_osv"), 3);
  assert.equal(streaks.get("fetch_registry"), 0);
});

test("강조: 같은 출처가 3번 연속 수집 오류일 때만", () => {
  const rows = [r("a", 16, true), r("a", 17, true), r("a", 18, true), r("b", 17, true), r("b", 18, true), r("c", 16, true), r("c", 17, false), r("c", 18, true)];
  assert.deepEqual(sourcesToHighlight(rows), ["a"]);
  assert.deepEqual(sourcesToHighlight([]), []);
});
