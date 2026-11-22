import { test } from "node:test";
import assert from "node:assert/strict";
import { connect, emptyGraph, type Graph, type Stage } from "./graph.ts";
import { stageFields } from "./knowledge.ts";
import { addStageProblem, filterPool, listRows, nameProblem, neighbors, newStageSpot, poolTags, putProblem, templateSaveId, uuid, addStageAfter } from "./panel-view.ts";

const st = (id: string, x = 0, y = 0, techs: { id: string; name: string }[] = []): Stage => ({ id, name: id, x, y, techs });
const tech = (id: string, o: Partial<{ field: string | null; sub: string | null; projects: number; grade: string }> = {}) =>
  ({ id, name: id, field: null, sub: null, projects: 0, grade: "pass", ...o });
const names = (xs: { name: string }[]) => xs.map((x) => x.name);

test("기술 탭 거르기: 고른 단계 · 이름 · 내 태그, 넣으러 온 기술은 거르기와 상관없이 맨 앞, 그다음 자주 쓴 순", () => {
  const pool = [tech("vitest", { field: "검사·보안" }), tech("figma", { field: "디자인" }), tech("zod", { field: "프론트엔드", projects: 2 }), tech("playwright", { field: "검사·보안" })];
  const usage = new Map([["playwright", { n: 3, projects: 1, stages: ["테스트"] }]]);
  const base = { stage: null, term: "", tag: null, tags: {}, add: null, usage };
  assert.deepEqual(names(filterPool(pool, base)), ["playwright", "zod", "figma", "vitest"]);
  assert.deepEqual(names(filterPool(pool, { ...base, term: "PLAY" })), ["playwright"]);
  assert.deepEqual(names(filterPool(pool, { ...base, tag: "시연", tags: { figma: ["시연"], zod: ["매일"] } })), ["figma"]);
  assert.deepEqual(names(filterPool(pool, { ...base, term: "zod", add: "figma" })), ["figma", "zod"]);
  // 목록에 있는 단계(디자인)는 그 분류만, 직접 지은 단계는 모두
  assert.deepEqual(names(filterPool(pool, { ...base, stage: "디자인" })), ["figma"]);
  assert.equal(filterPool(pool, { ...base, stage: "내가 지은 단계" }).length, 4);
});

test("내 태그 고르기 목록: 후보에 붙은 태그만 한 번씩 이름순, 못 읽으면 빈 목록", () => {
  assert.deepEqual(poolTags([{ id: "a" }, { id: "b" }], { a: ["시연", "가벼움"], b: ["시연"], c: ["안 보임"] }), ["가벼움", "시연"]);
  assert.deepEqual(poolTags([{ id: "a" }], null), []);
});

test("목록 순서: 연결선 깊이마다 한 줄(같은 줄 = 동시), 앞 · 다음 단계", () => {
  let g: Graph = { ...emptyGraph(), stages: [st("기획"), st("디자인", 0, 0), st("개발", 0, 100), st("배포")] };
  g = connect(connect(connect(connect(g, "기획", "디자인"), "기획", "개발"), "디자인", "배포"), "개발", "배포");
  const { rows, cycle } = listRows(g);
  assert.equal(cycle, null);
  assert.deepEqual(rows.map(names), [["기획"], ["디자인", "개발"], ["배포"]]);
  assert.deepEqual(names(neighbors(g, "배포").before), ["디자인", "개발"]);
  assert.deepEqual(names(neighbors(g, "기획").after), ["디자인", "개발"]);
});

test("고리가 있는 판(옛 값 · 잘못 온 값)도 목록이 깨지지 않고 저장 순서대로, 고리를 알린다", () => {
  const g: Graph = { ...emptyGraph(), stages: [st("a"), st("b")], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }] };
  const { rows, cycle } = listRows(g);
  assert.deepEqual(rows.map(names), [["a"], ["b"]]);
  assert.ok(cycle && cycle.length === 2);
});

test("못 바꾸는 이유: 위험 등급 · 이미 있음 · 8개, 빈 이름 · 48단계, 새 단계는 맨 오른쪽 옆", () => {
  const full = st("개발", 0, 0, Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, name: `t${i}` })));
  assert.match(putProblem(st("개발"), { id: "x", grade: "danger" })!, /위험/);
  assert.match(putProblem(full, { id: "t1", grade: "pass" })!, /이미/);
  assert.match(putProblem(full, { id: "new", grade: "pass" })!, /8개/);
  assert.equal(putProblem(st("개발"), { id: "x", grade: "caution" }), null);
  assert.ok(nameProblem("   "));
  assert.equal(nameProblem("테스트"), null);
  const many: Graph = { ...emptyGraph(), stages: Array.from({ length: 48 }, (_, i) => st(`s${i}`)) };
  assert.match(addStageProblem(many, "하나 더")!, /48/);
  assert.deepEqual(newStageSpot(emptyGraph()), { x: 0, y: 0 });
  assert.deepEqual(newStageSpot({ ...emptyGraph(), stages: [st("a", 40, 10), st("b", 300, 60)] }), { x: 580, y: 60 });
});

test("사용자가 지은 단계 이름이 객체 기본 속성(constructor 등)과 겹쳐도 거르기가 깨지지 않는다", () => {
  const pool = [tech("a", { field: "디자인" })];
  for (const stage of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
    assert.equal(stageFields(stage), undefined);
    assert.deepEqual(names(filterPool(pool, { stage, term: "", tag: null, tags: {}, add: null, usage: new Map() })), ["a"]);
  }
});

test("템플릿 저장 id: 같은 내용이면 같은 id(다른 내용을 거쳐 돌아와도), 위치만 옮긴 것은 같은 내용, 이름 · 종류가 다르면 새 id(불변 3)", () => {
  let n = 0;
  const make = () => `id${++n}`;
  const a: Graph = { ...emptyGraph(), stages: [st("기획", 0, 0, [{ id: "t1", name: "t1" }]), st("개발", 300, 0)], edges: [{ from: "기획", to: "개발" }] };
  const moved: Graph = { ...a, stages: a.stages.map((s) => ({ ...s, x: s.x + 50 })) };
  const b: Graph = { ...a, edges: [] };
  const first = templateSaveId("combo", "웹앱 ", a, make);
  assert.equal(templateSaveId("combo", "웹앱", moved, make), first);
  const other = templateSaveId("combo", "웹앱", b, make);
  assert.notEqual(other, first);
  assert.equal(templateSaveId("combo", "웹앱", a, make), first);
  assert.notEqual(templateSaveId("frame", "웹앱", a, make), first);
  assert.notEqual(templateSaveId("combo", "모바일", a, make), first);
});

test("저장 id 만들기: randomUUID가 없는 http 주소에서도 UUID v4 모양", () => {
  const real = crypto.randomUUID;
  try {
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    const id = uuid();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(uuid(), id);
  } finally { Object.defineProperty(crypto, "randomUUID", { value: real, configurable: true }); }
});

test("단계 더하기(＋ 단계 · 목록 모드 같은 규칙): 고른 단계가 있으면 그 오른쪽에 두고 이어 붙임, 자리가 차면 아래로, 없으면 맨 오른쪽 옆 · 안 이음", async () => {
  const { LAYOUT } = await import("./graph.ts");
  const g: Graph = { ...emptyGraph(), stages: [st("a", 0, 0), st("b", LAYOUT.x, 0)], edges: [{ from: "a", to: "b" }] };
  const r = addStageAfter(g, "새 단계", g.stages[0]);
  assert.ok("graph" in r);
  assert.deepEqual([r.stage.x, r.stage.y], [LAYOUT.x, LAYOUT.y]); // a 오른쪽은 b가 차지 → 아래로
  assert.ok(r.graph.edges.some((e) => e.from === "a" && e.to === r.stage.id));
  const free = addStageAfter(g, "끝", undefined);
  assert.ok("graph" in free);
  assert.equal(free.graph.edges.length, 1); // 잇지 않음
  assert.ok("problem" in addStageAfter(g, "  ", g.stages[0]));
});
