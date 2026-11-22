import { test } from "node:test";
import assert from "node:assert/strict";
import { connect, emptyGraph, LAYOUT, type Graph, type Stage } from "./graph.ts";
import { stageFields } from "./knowledge.ts";
import { addStageProblem, filterPool, listRows, nameProblem, neighbors, newStageSpot, poolTags, putProblem, templateSaveId, uuid, addStageAfter, addStageBeside, addStageLinked, parallelProblem, linkSaid, putSaid, removeSaid, removedStageSaid, sideSpot, insertBetween } from "./panel-view.ts";

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
  assert.equal(r.linked, true);
  const free = addStageAfter(g, "끝", undefined);
  assert.ok("graph" in free);
  assert.equal(free.graph.edges.length, 1); // 잇지 않음
  assert.equal(free.linked, false);
  assert.ok("problem" in addStageAfter(g, "  ", g.stages[0]));
});

test("선 끌어 새 블록(S3): 놓은 자리에 두고 앞 단계 → 새 단계 또는 새 단계 → 다음 단계로 한 번에, 못 이으면 linked=false", () => {
  const g: Graph = { ...emptyGraph(), stages: [st("a", 0, 0), st("b", 320, 0)], edges: [{ from: "a", to: "b" }] };
  const out = addStageLinked(g, "다음", { x: 640, y: 40 }, { before: ["b"], after: [] });
  assert.ok("graph" in out);
  assert.deepEqual([out.stage.x, out.stage.y, out.linked], [640, 40, true]);
  assert.ok(out.graph.edges.some((e) => e.from === "b" && e.to === out.stage.id));
  const back = addStageLinked(g, "앞", { x: -320, y: 0 }, { before: [], after: ["a"] });
  assert.ok("graph" in back && back.graph.edges.some((e) => e.from === back.stage.id && e.to === "a"));
  const ghost = addStageLinked(g, "없는 곳", { x: 0, y: 300 }, { before: ["없음"], after: [] });
  assert.ok("graph" in ghost && ghost.linked === false && ghost.graph.stages.length === 3);
});

test("같은 순서에 더하기(S3): 앞 단계 선을 복사해 같은 깊이, 위 · 아래 한 칸(차면 더), 이미 4개면 미리 막음", () => {
  const X = LAYOUT.x, Y = LAYOUT.y;
  const g: Graph = { ...emptyGraph(), stages: [st("a", 0, 0), st("b", X, 0), st("c", X, Y)], edges: [{ from: "a", to: "b" }, { from: "a", to: "c" }] };
  const down = addStageBeside(g, "옆", g.stages[1], 1);
  assert.ok("graph" in down);
  assert.deepEqual([down.stage.x, down.stage.y], [X, 2 * Y]); // b 아래는 c가 차지 → 한 칸 더
  assert.ok(down.graph.edges.some((e) => e.from === "a" && e.to === down.stage.id) && down.linked);
  const up = addStageBeside(g, "위", g.stages[1], -1);
  assert.ok("graph" in up && up.stage.y === -Y);
  const first = addStageBeside(g, "처음 옆", g.stages[0], 1); // 앞 단계가 없으면 잇지 않아도 같은 처음
  assert.ok("graph" in first && first.graph.edges.length === 2);
  const full: Graph = { ...g, stages: [...g.stages, st("d", X, 2 * Y), st("e", X, 3 * Y)], edges: [...g.edges, { from: "a", to: "d" }, { from: "a", to: "e" }] };
  assert.match(parallelProblem(full, "b") ?? "", /2번째 순서에 이미 4개/);
  assert.ok("problem" in addStageBeside(full, "넘침", full.stages[1], 1));
  assert.match((addStageLinked(full, "끌어 넘침", { x: 2 * X, y: 0 }, { before: ["a"], after: [] }) as { problem: string }).problem, /2번째 순서/); // 선 끌기 · ＋ 단계도 같은 한도
  assert.equal(parallelProblem(full, "a"), null);
});

test("같은 일은 같은 말(S4): 넣기 · 빼기 · 잇기 · 끊기 토스트", () => {
  const g: Graph = { ...emptyGraph(), stages: [st("기획"), st("개발")], edges: [] };
  assert.equal(putSaid("개발", "Vite"), "개발에 Vite을(를) 넣었어요.");
  assert.equal(removeSaid("개발", "Vite"), "개발에서 Vite을(를) 뺐어요.");
  assert.equal(linkSaid(g, "기획", "개발", false), "기획 → 개발 연결을 이었어요.");
  assert.equal(linkSaid(g, "기획", "없음", true), "기획 → 없는 단계 연결을 끊었어요.");
});

test("카드 왼쪽 · 오른쪽 +(T1): 앞 · 다음 자리는 한 칸 옆(차면 아래로), 지우기 토스트는 되돌리기를 알림", () => {
  const g: Graph = { ...emptyGraph(), stages: [st("a", 0, 0), st("b", LAYOUT.x, 0)], edges: [] };
  assert.deepEqual(sideSpot(g, g.stages[1], 1), { x: 2 * LAYOUT.x, y: 0 });
  assert.deepEqual(sideSpot(g, g.stages[1], -1), { x: 0, y: LAYOUT.y }); // 왼쪽은 a가 차지
  assert.equal(removedStageSaid("기획"), '"기획" 단계를 지웠어요. 6초 안에 되돌리기로 살릴 수 있어요.');
});

test("선 사이에 끼우기(U2): A → B 선을 A → 새 → B로 한 번에, 가운데 자리, 없는 선 · 같은 순서 한도는 그대로 막음", () => {
  const g: Graph = { ...emptyGraph(), stages: [st("a", 0, 0), st("b", 2 * LAYOUT.x, 0)], edges: [{ from: "a", to: "b" }] };
  const r = insertBetween(g, "검토", "a", "b");
  assert.ok("graph" in r);
  assert.deepEqual([r.stage.x, r.stage.y], [LAYOUT.x, LAYOUT.y]); // 가운데 x, 한 줄 아래(양옆 카드와 안 겹치게)
  assert.deepEqual(r.graph.edges.map((e) => `${e.from}>${e.to}`).sort(), [`${r.stage.id}>b`, `a>${r.stage.id}`].sort());
  assert.ok("problem" in insertBetween(g, "검토", "b", "a"));
  assert.ok("problem" in insertBetween(g, "  ", "a", "b"));
});
