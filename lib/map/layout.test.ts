import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTechMap, type MapInput } from "./build-map.ts";
import { tech, mine } from "./test-fixtures.ts";
import { connected, defaultCollapsed, hiddenOf, layoutMap, type GroupItem, type MapLayout, type TechItem } from "./layout.ts";
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
const groups = (l: MapLayout) => l.items.filter((x): x is GroupItem => x.type === "g");
const leaves = (l: MapLayout) => l.items.filter((x): x is TechItem => x.type === "t");
const names = (l: MapLayout) => leaves(l).map((x) => x.node.name);

test("묶기 1단계·2단계: 고리 1 = 1단계 묶음, 고리 2 = 2단계 묶음, 맨 바깥 = 기술. 분류 전은 맨 뒤", () => {
  const l = layoutMap(buildTechMap(catalog, NOW), DEFAULT_VIEW); // 하는 일 › 종류
  assert.deepEqual(groups(l).filter((g) => g.level === 1).map((g) => [g.value, g.count]), [["디자인", 1], ["백엔드·데이터", 2], ["분류 전", 1]]);
  assert.deepEqual(groups(l).filter((g) => g.level === 2 && g.parent?.endsWith("백엔드·데이터")).map((g) => g.value), ["스킬", "MCP"], "한국어 이름 먼저(ko 정렬)");
  const r = (x: number, y: number) => Math.hypot(x, y);
  const ring1 = Math.max(...groups(l).filter((g) => g.level === 1).map((g) => r(g.x, g.y)));
  const ring2 = Math.min(...groups(l).filter((g) => g.level === 2).map((g) => r(g.x, g.y)));
  assert.ok(ring1 < ring2 && ring2 < Math.min(...leaves(l).map((x) => r(x.x, x.y))), "안쪽부터 1단계 → 2단계 → 기술");
  assert.equal(groups(l).find((g) => g.value === "분류 전")!.danger, 1, "묶음마다 위험 수");
});

test("묶기 기준을 바꾸면 같은 기술이 다른 묶음으로(종류만), 묶지 않으면 기술만", () => {
  const l = layoutMap(buildTechMap(catalog, NOW), view("g=kind"));
  assert.deepEqual(groups(l).map((g) => [g.level, g.value, g.count]), [[1, "스킬", 1], [1, "MCP", 3]]);
  const flat = layoutMap(buildTechMap(catalog, NOW), view("g="));
  assert.deepEqual([groups(flat).length, leaves(flat).length], [0, 4]);
});

test("색: 많은 값부터 범주 토큰, 분류 전은 회색 빈 점. 색 기준과 같은 단계의 묶음만 색을 가진다", () => {
  const l = layoutMap(buildTechMap(catalog, NOW), DEFAULT_VIEW);
  assert.deepEqual(l.legend.map((x) => [x.value, x.count, x.token]), [["백엔드·데이터", 2, "--cat-1"], ["디자인", 1, "--cat-2"], ["분류 전", 1, "--unknown"]]);
  const d = leaves(l).find((x) => x.node.name === "d")!;
  assert.deepEqual([d.token, d.hollow], ["--unknown", true]);
  assert.ok(groups(l).filter((g) => g.level === 2).every((g) => g.token === null));
});

test("필터: 위험·주의만, 종류, 수집 오류만", () => {
  const m = buildTechMap({ ...catalog, techs: [...catalog.techs, tech("e", { collectErrorKind: "timeout" })] }, NOW);
  assert.deepEqual(names(layoutMap(m, view("risky=1"))), ["d"]);
  assert.deepEqual(names(layoutMap(m, view("fk=스킬"))), ["b"]);
  assert.deepEqual(names(layoutMap(m, view("err=1"))), ["e"]);
});

test("내 기술과 비교군(한 단계): 내 기술과 확정 비교군만 남고 나머지 모은 기술은 빠진다(ADR 0027)", () => {
  const m = buildTechMap({ ...catalog, mine: [mine("m1", "a")], relations: [{ a: "a", b: "d", quote: "같은 일" }] }, NOW);
  assert.equal(leaves(layoutMap(m, DEFAULT_VIEW)).length, 4, "기본은 전체 지도");
  assert.deepEqual(names(layoutMap(m, view("mine=1"))).sort(), ["a", "d"]);
  assert.deepEqual(names(layoutMap(m, view("mine=1&risky=1"))), ["d"], "위험한 비교군은 위험만에서도 보인다");
});

test("프로젝트 필터: 그 프로젝트의 내 기술과, 거기에 이어진 비교군만(다른 프로젝트의 비교군은 빠짐)", () => {
  const m = buildTechMap({ ...catalog, mine: [mine("m1", "a"), mine("m2", "c", { projectId: "p2" })], relations: [{ a: "a", b: "b", quote: null }, { a: "c", b: "d", quote: null }] }, NOW);
  const l = layoutMap(m, view("p=p1"));
  assert.deepEqual(names(l).sort(), ["a", "b"]);
  assert.deepEqual(l.edges, [["tech:a", "tech:b"]]);
});

test("이 분류만 보기: 그 안만 원반 전체로, 들어간 기준은 묶기에서 빠지고 색은 다음 기준으로", () => {
  const l = layoutMap(buildTechMap(catalog, NOW), view("in=field:백엔드·데이터"));
  assert.deepEqual(names(l).sort(), ["a", "b"]);
  assert.deepEqual(groups(l).map((g) => [g.level, g.dim, g.value]), [[1, "kind", "스킬"], [1, "kind", "MCP"]]);
  assert.equal(l.color, "kind");
});

test("올리면 이어진 것: 묶음 → 위로 가는 길 + 아래 전부, 기술 → 위로 가는 길 + 비교군", () => {
  const model = buildTechMap({ ...catalog, mine: [mine("m1", "a")], relations: [{ a: "a", b: "c", quote: null }] }, NOW);
  const l = layoutMap(model, DEFAULT_VIEW);
  const top = groups(l).find((g) => g.level === 1 && g.value === "백엔드·데이터")!;
  const lit = connected(l, top.id);
  assert.ok(lit.has("tech:a") && !lit.has("tech:c"));
  const leaf = connected(l, "tech:a");
  assert.ok(leaf.has(top.id) && leaf.has("tech:c"));
});

test("기술이 많으면 바깥을 여러 줄로 쌓고, 700개를 넘으면 맨 안쪽 묶음을 접어 둔다(접힌 묶음 아래는 숨김)", () => {
  const many = buildTechMap({ ...catalog, techs: Array.from({ length: 750 }, (_, i) => tech(`t${String(i).padStart(3, "0")}`, { categoryId: "db" })) }, NOW);
  const l = layoutMap(many, DEFAULT_VIEW);
  assert.ok(new Set(leaves(l).map((x) => Math.round(Math.hypot(x.x, x.y)))).size > 2, "여러 줄");
  const shut = defaultCollapsed(l);
  assert.deepEqual([...shut].map((id) => l.byId.get(id)!.level), [2]);
  assert.equal(hiddenOf(l, shut).size, 750);
  const fewer = layoutMap(buildTechMap({ ...catalog, techs: Array.from({ length: 500 }, (_, i) => tech(`t${String(i).padStart(3, "0")}`, { categoryId: "db" })) }, NOW), DEFAULT_VIEW);
  assert.equal(defaultCollapsed(fewer).size, 0, "지도 기본 500개는 다 펼친 채로");
});

test("같은 입력이면 같은 그림", () => {
  const m = buildTechMap(catalog, NOW);
  assert.deepEqual(layoutMap(m, DEFAULT_VIEW), layoutMap(m, DEFAULT_VIEW));
});

test("색 기준이 보안 등급이면 위험 = 위험 토큰, 통과 = 통과 토큰(범주 색을 쓰지 않음)", () => {
  const l = layoutMap(buildTechMap(catalog, NOW), view("c=grade"));
  assert.deepEqual(l.legend.map((x) => [x.value, x.token]), [["위험", "--danger"], ["통과", "--pass"]]);
});
