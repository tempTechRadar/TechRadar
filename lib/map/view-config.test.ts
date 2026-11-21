import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VIEW, filterCount, groupOf, parseView, passes, viewQuery, type ViewConfig } from "./view-config.ts";

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

test("이 분류만 보기(in=): 기준마다 한 번, 모르는 기준은 버리고, 주소로 왕복한다. 들어간 기준은 묶기에서 빠진다", () => {
  const v = parseView("in=field:리서치|evil:x|field:두번|kind:MCP&err=1&fs=DB&mine=1");
  assert.deepEqual(v.scope, [{ dim: "field", value: "리서치" }, { dim: "kind", value: "MCP" }]);
  assert.deepEqual([v.filter.err, v.filter.subs, v.filter.mineOnly], [true, ["DB"], true]);
  assert.deepEqual(parseView(viewQuery(v)), v);
  assert.deepEqual(groupOf(v), []);
  assert.equal(filterCount(v), 3);
});

test("기본 보기는 종류가 둘 이상일 때만 종류 먼저, 하나뿐이면 하는 일 먼저(주소로 고른 묶기는 그대로)", async () => {
  const { defaultFor, withDefault } = await import("./view-config.ts");
  assert.deepEqual([defaultFor(3).group, defaultFor(3).color], [["kind", "field"], "kind"]);
  assert.deepEqual([defaultFor(1).group, defaultFor(1).color], [["field", "kind"], "field"]);
  assert.deepEqual(withDefault(parseView(""), "", 1).group, ["field", "kind"]);
  assert.deepEqual(withDefault(parseView("g=host"), "g=host", 1).group, ["host"]);
  assert.equal(withDefault(parseView("c=grade"), "c=grade", 1).color, "grade");
  assert.equal(withDefault(parseView("c=nope"), "c=nope", 1).color, "field", "잘못된 c는 없는 것으로");
  // 종류 하나인 지도에서 일부러 종류 먼저를 고르면 주소에 남고, 되살리면 그대로
  const picked = { ...defaultFor(1), group: ["kind", "field"] as ViewConfig["group"], color: "kind" as ViewConfig["color"] };
  const saved = viewQuery(picked, defaultFor(1));
  assert.deepEqual(withDefault(parseView(saved), saved, 1).group, ["kind", "field"]);
  assert.equal(viewQuery(defaultFor(1), defaultFor(1)), "", "기본 그대로면 싣지 않음");
});

test("기간 칩: 들어온 지 하루 · 7일 · 30일 안만, 처음 채운 날 것(addedDays 없음)은 어느 기간에도 안 듦. 옛 주소 new=1은 이번 주", async () => {
  const { buildTechMap } = await import("./build-map.ts");
  const { NOW, ago, tech } = await import("./test-fixtures.ts");
  const m = buildTechMap({ mine: [], relations: [], categories: [], newSince: ago(60), techs: [
    tech("d", { createdAt: ago(0.5) }), tech("w", { createdAt: ago(3) }), tech("m", { createdAt: ago(20) }), tech("old", { createdAt: ago(90) }), tech("bulk", { createdAt: null }),
  ] }, NOW);
  const shown = (t: string) => m.nodes.filter((n) => passes(n, parseView(`t=${t}`))).map((n) => n.name).sort();
  assert.deepEqual([shown("day"), shown("week"), shown("month")], [["d"], ["d", "w"], ["d", "m", "w"]]);
  assert.equal(parseView("new=1").filter.period, "week");
  assert.equal(parseView("t=year").filter.period, "");
  assert.equal(viewQuery(parseView("t=month&mk=1")), "t=month&mk=1");
  assert.equal(filterCount(parseView("t=day&mk=1")), 2);
});

test("11-21에 바꾼 이름: 저장된 보기 · 주소의 옛 값(패키지 · 모름 · 분류 전)은 새 값으로 읽는다", () => {
  const v = parseView(`fk=${encodeURIComponent("패키지,모름,개발 도구")}&ff=${encodeURIComponent("분류 전")}&fs=${encodeURIComponent("분류 전")}`);
  assert.deepEqual([v.filter.kinds, v.filter.fields, v.filter.subs], [["개발 도구", "직접 넣은 것"], ["아직 분류 안 됨"], ["아직 분류 안 됨"]]);
});
