import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTechMap, type MapInput } from "./build-map.ts";
import { tech, mine } from "./test-fixtures.ts";
import { connected, layoutMap, NEUTRAL, PALETTE } from "./layout.ts";
import { DEFAULT_VIEW, parseView, type ViewConfig } from "./view-config.ts";

const NOW = new Date("2026-11-19T00:00:00Z");
const categories = [
  { id: "data", name: "백엔드·데이터", parentId: null }, { id: "db", name: "DB", parentId: "data" },
  { id: "design", name: "디자인", parentId: null }, { id: "ui", name: "컴포넌트", parentId: "design" },
];
const catalog: MapInput = {
  mine: [], relations: [], categories,
  techs: [tech("a", { categoryId: "db" }), tech("b", { categoryId: "db", type: "skill" }), tech("c", { categoryId: "ui" }), tech("d", { categoryId: null, grade: "danger" })],
};
const view = (q: string): ViewConfig => parseView(q);

test("묶기 1차·2차: 고리 1 = 1차 묶음, 고리 2 = 2차 묶음, 맨 바깥 = 기술. 분류 전은 맨 뒤", () => {
  const l = layoutMap(buildTechMap(catalog, NOW), DEFAULT_VIEW); // 하는 일 › 종류
  assert.deepEqual(l.groups.filter((g) => g.level === 1).map((g) => [g.value, g.count]), [["디자인", 1], ["백엔드·데이터", 2], ["분류 전", 1]]);
  assert.deepEqual(l.groups.filter((g) => g.level === 2 && g.parent?.endsWith("백엔드·데이터")).map((g) => g.value), ["스킬", "MCP"], "한국어 이름 먼저(ko 정렬)");
  const r = (x: number, y: number) => Math.hypot(x, y);
  const ring1 = Math.max(...l.groups.filter((g) => g.level === 1).map((g) => r(g.x, g.y)));
  const ring2 = Math.min(...l.groups.filter((g) => g.level === 2).map((g) => r(g.x, g.y)));
  assert.ok(ring1 < ring2 && ring2 < Math.min(...l.leaves.map((x) => r(x.x, x.y))), "안쪽부터 1차 → 2차 → 기술");
  assert.equal(l.groups.find((g) => g.value === "분류 전")!.danger, 1, "묶음마다 위험 수");
});

test("묶기 기준을 바꾸면 같은 기술이 다른 묶음으로(종류 1차만), 묶지 않으면 기술만", () => {
  const l = layoutMap(buildTechMap(catalog, NOW), view("g=kind"));
  assert.deepEqual(l.groups.map((g) => [g.level, g.value, g.count]), [[1, "스킬", 1], [1, "MCP", 3]]);
  const flat = layoutMap(buildTechMap(catalog, NOW), view("g="));
  assert.deepEqual([flat.groups.length, flat.leaves.length], [0, 4]);
});

test("색: 색 기준 값마다 정한 순서의 색, 분류 전은 회색. 색 기준과 같은 단계의 묶음만 색을 가진다", () => {
  const l = layoutMap(buildTechMap(catalog, NOW), DEFAULT_VIEW);
  assert.deepEqual(l.legend.map((x) => [x.value, x.count, x.color]), [["백엔드·데이터", 2, PALETTE[0]], ["디자인", 1, PALETTE[1]], ["분류 전", 1, NEUTRAL]]);
  assert.equal(l.leaves.find((x) => x.node.name === "d")!.color, NEUTRAL);
  assert.ok(l.groups.filter((g) => g.level === 2).every((g) => g.color === null));
});

test("거르기: 위험·주의만, 종류, 프로젝트가 있으면 남은 내 기술에 이어진 비교군만", () => {
  assert.deepEqual(layoutMap(buildTechMap(catalog, NOW), view("risky=1")).leaves.map((x) => x.node.name), ["d"]);
  assert.deepEqual(layoutMap(buildTechMap(catalog, NOW), view("fk=스킬")).leaves.map((x) => x.node.name), ["b"]);
  const withMine = buildTechMap({ ...catalog, mine: [mine("m1", "a"), mine("m2", "c", { projectId: "p2" })], relations: [{ a: "a", b: "b" }, { a: "c", b: "d" }] }, NOW);
  const onlyP1 = layoutMap(withMine, view("p=p1"));
  assert.deepEqual(onlyP1.leaves.map((x) => x.node.name).sort(), ["a", "b"]);
  assert.deepEqual(onlyP1.compareEdges, [["tech:a", "tech:b"]]);
});

test("올리면 이어진 것: 묶음 → 위로 가는 길 + 아래 전부, 기술 → 위로 가는 길 + 비교군", () => {
  const model = buildTechMap({ ...catalog, mine: [mine("m1", "a")], relations: [{ a: "a", b: "c" }] }, NOW);
  const l = layoutMap(model, DEFAULT_VIEW);
  const top = l.groups.find((g) => g.level === 1 && g.value === "백엔드·데이터")!;
  const lit = connected(l, top.id);
  assert.ok(lit.has("tech:a") && !lit.has("tech:c"));
  const leaf = connected(l, "tech:a");
  assert.ok(leaf.has(top.id) && leaf.has("tech:c"));
});

test("같은 입력이면 같은 그림", () => {
  const m = buildTechMap(catalog, NOW);
  assert.deepEqual(layoutMap(m, DEFAULT_VIEW), layoutMap(m, DEFAULT_VIEW));
});

test("위험·주의만: 내 기술이 위험하지 않아도 위험한 비교군은 보인다(비교군은 이어진 내 기술이 있으면 남음)", () => {
  const m = buildTechMap({ ...catalog, mine: [mine("m1", "a")], relations: [{ a: "a", b: "d" }] }, NOW); // a 통과, d 위험(비교군)
  assert.deepEqual(layoutMap(m, view("risky=1")).leaves.map((x) => x.node.name), ["d"]);
  assert.deepEqual(layoutMap(m, view("mine=1&risky=1")).leaves.map((x) => x.node.name), [], "내 기술만이면 비교군은 빠진다");
});

test("색 기준이 보안 등급이면 위험 = 빨강, 주의 = 호박(범주 색을 쓰지 않음)", () => {
  const l = layoutMap(buildTechMap(catalog, NOW), view("c=grade"));
  assert.deepEqual(l.legend.map((x) => [x.value, x.color]), [["위험", "#C0262D"], ["통과", "#6f8f76"]]);
});
