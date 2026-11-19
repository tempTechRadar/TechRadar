import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VIEW, parseView, viewQuery } from "./view-config.ts";

test("주소 → 보기 설정 → 주소가 같다(기본값은 주소에 싣지 않음)", () => {
  assert.deepEqual(parseView(""), DEFAULT_VIEW);
  assert.equal(viewQuery(DEFAULT_VIEW), "");
  const q = "g=kind%2Chost&c=field&fk=MCP&risky=1&p=p1";
  const v = parseView(q);
  assert.deepEqual([v.group, v.color, v.filter.kinds, v.filter.risky, v.filter.project], [["kind", "host"], "field", ["MCP"], true, "p1"]);
  assert.deepEqual(parseView(viewQuery(v)), v);
});

test("모르는 기준은 버리고, 같은 기준 두 번·3단계를 넘는 것은 자른다. 색 기준이 없으면 1차 기준", () => {
  const v = parseView("g=kind,evil,kind,host,grade,field&c=nope");
  assert.deepEqual(v.group, ["kind", "host", "grade"]);
  assert.equal(v.color, "kind");
});

test("g=(빈 값)은 묶지 않음, 거르기 값은 길이·개수를 자른다", () => {
  assert.deepEqual(parseView("g=").group, []);
  const long = parseView(`ff=${"가".repeat(200)}&fk=${Array.from({ length: 40 }, (_, i) => `k${i}`).join(",")}`);
  assert.equal(long.filter.fields[0].length, 60);
  assert.equal(long.filter.kinds.length, 20);
});
