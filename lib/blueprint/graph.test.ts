import { test } from "node:test";
import assert from "node:assert/strict";
import { exportText } from "./export-text.ts";
import { fromNames } from "./board.ts";
import { parseBoard, toStored } from "./stored.ts";
import {
  addStage, applyTemplate, asFrame, autoLayout, connect, connectProblem, createStage, disconnect, emptyGraph, fromV1, layers, limitProblems, moveStages,
  nearestLink, parseDraft, parseGraph, putTech, removeStage, removeTech, renameStage, snap, toBoardView, wouldCycle, LAYOUT, LIMITS, BOX, NODE_SIZE, slotAt, stageHeight, techSlot, type Graph, type Stage,
} from "./graph.ts";

const T = (n: number) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, name: `기술${n}` });
/** 이름 = id인 그래프. at은 [x, y], 안 주면 (0, 0) */
const mk = (names: string[], edges: [string, string][] = [], at: Record<string, [number, number]> = {}): Graph => ({
  v: 2,
  stages: names.map((n) => ({ id: n, name: n, x: at[n]?.[0] ?? 0, y: at[n]?.[1] ?? 0, techs: [] })),
  edges: edges.map(([from, to]) => ({ from, to })),
});
const cols = (g: Graph) => toBoardView(g)!.map((c) => c.map((s) => s.name));

test("그래프: 깊이는 가장 긴 경로, 같은 깊이는 동시, 이어지지 않은 단계는 0", () => {
  const g = mk(["a", "b", "c", "d", "e"], [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"], ["a", "d"]]);
  const l = layers(g);
  assert.ok(l.ok);
  if (l.ok) {
    assert.deepEqual([...l.depth], [["a", 0], ["e", 0], ["b", 1], ["c", 1], ["d", 2]]);
    assert.deepEqual(l.levels, [["a", "e"], ["b", "c"], ["d"]]); // a → d 지름길이 있어도 d는 가장 긴 경로(2)
  }
});

test("그래프: 고리는 고리를 이루는 단계만 연결 순서대로 돌려준다(꼬리는 뺌)", () => {
  const g = mk(["x", "a", "b", "c"], [["x", "a"], ["a", "b"], ["b", "c"], ["c", "a"]]);
  const l = layers(g);
  assert.equal(l.ok, false);
  if (!l.ok) {
    assert.deepEqual([...l.cycle].sort(), ["a", "b", "c"]);
    l.cycle.forEach((id, i) => assert.ok(g.edges.some((e) => e.from === id && e.to === l.cycle[(i + 1) % l.cycle.length]), "고리의 이웃은 연결선이다"));
  }
  assert.equal(toBoardView(g), null);
  assert.match(limitProblems(g).join(" "), /고리를 이뤄요: [abc] → [abc] → [abc] → [abc]/);
});

test("그래프: 판으로 보기는 깊이마다 열 하나, 같은 깊이는 y → x → id 순, 이름 · 기술만(x · y 없음)", () => {
  const g = putTech(mk(["c", "a", "b", "d"], [["a", "d"], ["b", "d"], ["c", "d"]], { c: [10, 0], a: [10, 0], b: [0, 0], d: [0, 0] }), "a", T(1));
  const g2 = moveStages(g, new Map([["b", { x: 0, y: -40 }]])); // b가 가장 위 → 맨 먼저
  assert.deepEqual(cols(g2), [["b", "a", "c"], ["d"]]); // y -40 < 0, 같은 y(0)는 x 오름차순 a(10) = c(10) → id 순 a < c
  const board = toBoardView(g2)!;
  assert.deepEqual(Object.keys(board[0][1]).sort(), ["id", "name", "techs"]);
  assert.deepEqual(board[0][1].techs, [T(1)]);
});

test("그래프: 판으로 본 것이 기존 내보내기 · 판 검사(parseBoard)를 그대로 통과한다", () => {
  let g = mk(["기획", "디자인", "백엔드", "배포"], [["기획", "디자인"], ["기획", "백엔드"], ["디자인", "배포"], ["백엔드", "배포"]], { 디자인: [0, 0], 백엔드: [0, 100] });
  g = putTech(g, "디자인", T(1));
  const board = toBoardView(g)!;
  const text = exportText("prompt", "시험", board);
  assert.match(text, /1\. 기획\n2\. 디자인\(기술1\) \+ 백엔드 — 동시에 진행\n3\. 배포/);
  assert.ok(parseBoard(toStored(board)).ok);
  assert.equal(parseBoard(toStored(board)).ok && (parseBoard(toStored(board)) as { cols: unknown[][] }).cols.length, 3);
});

test("그래프: 옛 판 → 그래프 → 판이 그대로 돌아온다(이웃한 열의 모든 짝을 이음)", () => {
  const v1 = fromNames([["기획"], ["디자인", "백엔드"], ["배포"]]);
  const g = fromV1(v1);
  assert.equal(g.edges.length, 1 * 2 + 2 * 1);
  assert.deepEqual(cols(g), [["기획"], ["디자인", "백엔드"], ["배포"]]);
  assert.deepEqual(toBoardView(g)!.flat().map((s) => s.id), v1.flat().map((s) => s.id)); // 단계 id를 그대로 둔다
  const full = fromV1(fromNames(Array.from({ length: LIMITS.depth }, () => Array.from({ length: LIMITS.parallel }, (_, i) => `s${i}`))));
  assert.equal(limitProblems(full).length, 0, "판의 한도(열 12 × 나란히 4)는 그래프 한도 안");
  assert.ok(full.edges.length <= LIMITS.edges);
  assert.deepEqual(fromV1([]).stages, []);
});

test("그래프: 고리 · 못 잇는 이유", () => {
  const g = mk(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
  assert.equal(wouldCycle(g, "c", "a"), true);
  assert.equal(wouldCycle(g, "a", "c"), false);
  assert.equal(wouldCycle(g, "a", "a"), true);
  assert.equal(connectProblem(g, "a", "a"), "self");
  assert.equal(connectProblem(g, "a", "zzz"), "missing");
  assert.equal(connectProblem(g, "a", "b"), "exists");
  assert.equal(connectProblem(g, "b", "a"), "cycle"); // 반대 방향도 고리
  assert.equal(connectProblem(g, "c", "a"), "cycle");
  assert.equal(connectProblem(g, "a", "c"), null);
  assert.equal(connect(g, "c", "a"), g); // 못 잇으면 같은 그래프
  assert.deepEqual(connect(g, "a", "c").edges.at(-1), { from: "a", to: "c" });
  const full: Graph = { ...mk(["a", "b"]), edges: Array.from({ length: LIMITS.edges }, () => ({ from: "x", to: "y" })) };
  assert.equal(connectProblem(full, "a", "b"), "limit");
});

test("그래프: 연결 끊기 · 단계를 지우면 그 단계의 연결선도 지운다 · 없는 것은 같은 그래프", () => {
  const g = mk(["a", "b", "c"], [["a", "b"], ["b", "c"], ["a", "c"]]);
  assert.deepEqual(disconnect(g, "a", "b").edges, [{ from: "b", to: "c" }, { from: "a", to: "c" }]);
  assert.equal(disconnect(g, "c", "a"), g);
  const r = removeStage(g, "b");
  assert.deepEqual(r.stages.map((s) => s.id), ["a", "c"]);
  assert.deepEqual(r.edges, [{ from: "a", to: "c" }]);
  assert.equal(removeStage(g, "nope"), g);
});

test("그래프: 단계 더하기 · 이름 바꾸기 · 옮기기(정수 · 좌표 한도) · 한도", () => {
  let g = emptyGraph();
  const s = createStage("  기획  ", 10.4, 20.6);
  assert.deepEqual([s.name, s.x, s.y], ["기획", 10, 21]);
  g = addStage(g, s);
  assert.equal(addStage(g, s), g, "같은 id는 안 더함");
  assert.equal(addStage(g, { ...createStage("x", 0, 0), name: "   " }), g, "빈 이름은 안 더함");
  assert.equal(renameStage(g, s.id, "  "), g);
  assert.equal(renameStage(g, "nope", "이름"), g);
  assert.equal(renameStage(g, s.id, "개발").stages[0].name, "개발");
  const moved = moveStages(g, new Map([[s.id, { x: 5.5, y: 1e9 }]]));
  assert.deepEqual([moved.stages[0].x, moved.stages[0].y], [6, 100000]);
  assert.equal(moveStages(g, new Map([[s.id, { x: 10, y: 21 }]])), g, "그 자리면 같은 그래프");
  let many = emptyGraph();
  for (let i = 0; i < LIMITS.stages + 5; i++) many = addStage(many, createStage(`s${i}`, i, 0));
  assert.equal(many.stages.length, LIMITS.stages);
});

test("그래프: 기술은 같은 것 한 번 · 단계마다 8개까지 · 빼기", () => {
  let g = mk(["a"]);
  g = putTech(g, "a", T(1));
  assert.equal(putTech(g, "a", T(1)), g);
  for (let i = 2; i <= LIMITS.techs + 3; i++) g = putTech(g, "a", T(i));
  assert.equal(g.stages[0].techs.length, LIMITS.techs);
  assert.equal(removeTech(g, "a", T(99).id), g);
  assert.equal(removeTech(g, "a", T(1).id).stages[0].techs.length, LIMITS.techs - 1);
  assert.equal(putTech(g, "nope", T(1)), g);
});

test("그래프: 확정 조건(깊이 12 · 같은 깊이 4 · 단계 · 기술 · 연결선)", () => {
  assert.deepEqual(limitProblems(mk(["a", "b"], [["a", "b"]])), []);
  const chain = (n: number) => mk(Array.from({ length: n }, (_, i) => `s${i}`), Array.from({ length: n - 1 }, (_, i) => [`s${i}`, `s${i + 1}`] as [string, string]));
  assert.deepEqual(limitProblems(chain(LIMITS.depth)), []);
  assert.match(limitProblems(chain(LIMITS.depth + 1))[0], /순서가 13단계예요\(12단계까지\)/);
  assert.deepEqual(limitProblems(mk(["a", "b", "c", "d"])), []);
  assert.match(limitProblems(mk(["a", "b", "c", "d", "e"]))[0], /1번째 순서에 단계가 5개예요\(동시에 4개까지\)/);
  const techs = Array.from({ length: LIMITS.techs + 1 }, (_, i) => T(i + 1));
  assert.match(limitProblems({ ...mk(["a"]), stages: [{ id: "a", name: "a", x: 0, y: 0, techs }] })[0], /"a" 단계의 기술이 9개예요\(8개까지\)/);
  assert.match(limitProblems(mk(Array.from({ length: LIMITS.stages + 1 }, (_, i) => `s${i}`)))[0], /단계는 48개까지예요\(지금 49개\)/);
  assert.match(limitProblems({ ...mk(["a", "b"]), edges: Array.from({ length: LIMITS.edges + 1 }, () => ({ from: "a", to: "b" })) })[0], /연결선은 200개까지예요/);
});

test("컨테이너(P-12j H2): 단계 높이 = 머리 + 기술 줄(없어도 한 줄) + 아래 + 메모, 자리 · 놓은 자리 번호", () => {
  assert.equal(stageHeight({ techs: [], note: undefined }), BOX.head + BOX.row + BOX.pad);
  assert.equal(stageHeight({ techs: [T(1), T(2), T(3)], note: "메모" }), BOX.head + 3 * BOX.row + BOX.pad + BOX.note);
  assert.deepEqual(techSlot(2), { x: BOX.tech.x, y: BOX.head + 2 * BOX.row });
  assert.deepEqual([slotAt(techSlot(0).y, 3), slotAt(techSlot(2).y + 10, 3), slotAt(-500, 3), slotAt(9999, 3)], [0, 2, 0, 3]);
});

test("자동 정렬은 컨테이너 높이를 본다: 기술이 많은 단계 아래 같은 순서 단계가 겹치지 않는다", () => {
  const g = mk(["a", "b", "c"], [["a", "b"], ["a", "c"]], { a: [0, 0], b: [0, 0], c: [0, 10] });
  const full: Graph = { ...g, stages: g.stages.map((s) => (s.id === "b" ? { ...s, techs: Array.from({ length: 8 }, (_, i) => T(i + 1)) } : s)) };
  const l = autoLayout(full), at = (id: string) => l.stages.find((s) => s.id === id)!;
  assert.ok(at("c").y >= at("b").y + stageHeight(at("b")), `${at("b").y} + ${stageHeight(at("b"))} <= ${at("c").y}`);
  assert.ok(l.stages.every((s) => s.y % 8 === 0));
});

test("자동 정렬 간격(11-22 사용자): 열 사이는 겹치지 않고(32 이상), 단계 6개 사슬이 1440 화면에 0.9배 이상으로 들어간다", () => {
  assert.ok(LAYOUT.x - NODE_SIZE.w >= 32, `열 사이 ${LAYOUT.x - NODE_SIZE.w}`);
  const ids = ["a", "b", "c", "d", "e", "f"];
  const l = autoLayout(mk(ids, ids.slice(1).map((id, i) => [ids[i], id] as [string, string])));
  const right = Math.max(...l.stages.map((s) => s.x)) + NODE_SIZE.w;
  assert.ok(right * 0.9 <= 1440 * 0.94, `판 폭 ${right} × 0.9 = ${right * 0.9}`); // 화면 맞춤 여백 3%씩(studio FIT.padding)
  assert.ok(LAYOUT.y >= stageHeight({ techs: [], note: undefined }) + 32, "빈 단계 사이도 32 이상");
});

test("그래프: 자동 정렬은 깊이마다 열, 같은 깊이는 y 순서 유지 · 가운데 맞춤 · 8의 배수 · 고리면 그대로", () => {
  const g = mk(["a", "b", "c", "d"], [["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"]], { a: [333, 77], b: [5, 400], c: [9, 100], d: [0, 0] });
  const l = autoLayout(g);
  const pos = (id: string) => l.stages.find((s) => s.id === id)!;
  assert.deepEqual([pos("a").x, pos("b").x, pos("c").x, pos("d").x], [0, LAYOUT.x, LAYOUT.x, LAYOUT.x * 2]);
  assert.ok(pos("c").y < pos("b").y, "원래 c가 위(y 100)였으니 위에 둔다");
  assert.equal(pos("a").y, LAYOUT.y / 2, "혼자인 열은 두 칸짜리 열의 가운데");
  assert.ok(l.stages.every((s) => s.x % 8 === 0 && s.y % 8 === 0));
  assert.deepEqual(cols(l), cols(g), "순서(판으로 본 모양)는 그대로");
  assert.equal(autoLayout(l), l, "이미 정렬돼 있으면 같은 그래프");
  const ring = mk(["a", "b"], [["a", "b"], ["b", "a"]]);
  assert.equal(autoLayout(ring), ring);
});

test("그래프: 놓을 때 8px 격자 · 다른 단계와 정렬 보조선(가장 가까운 선) · 멀면 격자만", () => {
  const others = [{ x: 100, y: 200, w: 240, h: 96 }];
  assert.deepEqual(snap({ x: 13, y: 21, w: 240, h: 96 }, []), { x: 16, y: 24, guides: [] });
  assert.deepEqual(snap({ x: 103, y: 499, w: 240, h: 96 }, others), { x: 100, y: 496, guides: [{ axis: "x", at: 100 }] }); // 왼쪽 가장자리 맞춤, y는 멀어서 격자
  assert.deepEqual(snap({ x: 699, y: 205, w: 100, h: 50 }, others), { x: 696, y: 200, guides: [{ axis: "y", at: 200 }] });
  const mid = snap({ x: 130, y: 0, w: 100, h: 50 }, others); // 가운데(130+50=180)가 상대 가운데(100+120=220)와 40 차이 → 안 붙음
  assert.deepEqual(mid.guides, []);
  const center = snap({ x: 173, y: 0, w: 100, h: 50 }, others); // 가운데 173+50=223 → 220
  assert.deepEqual([center.x, center.guides[0]], [170, { axis: "x", at: 220 }]);
});

test("그래프: 가까이 끌면 붙을 자리(앞뒤 · 이미 이어진 짝 건너뜀 · 고리면 blocked · 멀면 없음)", () => {
  const g = mk(["a", "b", "c"], [["a", "b"]], { a: [0, 0], b: [600, 0], c: [300, 0] });
  const near = nearestLink(g, "c", 100);
  assert.deepEqual(near, { from: "a", to: "c", blocked: null }, "a(왼쪽)와 b(오른쪽)가 같은 거리면 먼저 나온 a, 왼쪽이 앞단계");
  assert.deepEqual(nearestLink({ ...g, edges: [] }, "a", 100), { from: "a", to: "c", blocked: null }, "가까운 쪽에서 내가 앞단계");
  assert.equal(nearestLink(g, "c", 10), null);
  assert.equal(nearestLink(g, "nope"), null);
  const chain = mk(["a", "b", "c"], [["a", "b"], ["b", "c"]], { a: [300, 0], b: [1500, 0], c: [0, 0] }); // a → b → c인데 c가 a의 왼쪽
  assert.deepEqual(nearestLink(chain, "a", 300, () => ({ w: 100, h: 50 })), { from: "c", to: "a", blocked: "cycle" }, "왼쪽 c가 앞단계 → c → a는 고리라 blocked");
  assert.deepEqual(nearestLink(g, "c", 100, () => ({ w: 240, h: 96 }))!.from, "a");
});

test("그래프: parseGraph — 정상(좌표 반올림 · 기술 중복 한 번 · name 없어도 됨)", () => {
  const raw = { v: 2, stages: [{ id: "s1", name: " 기획 ", x: 1.4, y: -2.6, techs: [T(1), { id: T(1).id, name: "또" }, { id: T(2).id }] }, { id: "s2", name: "개발", x: 0, y: 0, techs: [] }], edges: [{ from: "s1", to: "s2" }] };
  const p = parseGraph(raw);
  assert.ok(p.ok);
  if (p.ok) {
    assert.deepEqual(p.graph.stages[0], { id: "s1", name: "기획", x: 1, y: -3, techs: [T(1), { id: T(2).id, name: "" }] });
    assert.deepEqual(p.graph.edges, [{ from: "s1", to: "s2" }]);
  }
  assert.ok(parseGraph(JSON.parse(JSON.stringify(p.ok ? p.graph : null))).ok, "저장 → 읽기가 같다");
});

test("그래프: parseGraph — 믿지 않는 값은 이유와 함께 거절", () => {
  const ok = (): { v: number; stages: Record<string, unknown>[]; edges: Record<string, unknown>[] } => ({ v: 2, stages: [{ id: "a", name: "a", x: 0, y: 0, techs: [] }, { id: "b", name: "b", x: 0, y: 0, techs: [] }], edges: [] });
  const reason = (mut: (r: ReturnType<typeof ok>) => void) => { const r = ok(); mut(r); const p = parseGraph(r); return p.ok ? "OK" : p.message; };
  assert.equal(parseGraph(null).ok, false);
  assert.equal(parseGraph("x").ok, false);
  assert.match(reason((r) => { r.v = 1; }), /모양이 맞지 않아요/);
  assert.match(reason((r) => { r.stages = []; }), /단계는 1~48개/);
  assert.match(reason((r) => { r.stages[1].id = "a"; }), /id가 겹쳐요/);
  assert.match(reason((r) => { r.stages[0].id = ""; }), /id는 1~64자/);
  assert.match(reason((r) => { r.stages[0].id = "x".repeat(65); }), /id는 1~64자/);
  assert.match(reason((r) => { r.stages[0].id = "기획"; }), /id는 1~64자의 영문/);
  assert.match(reason((r) => { r.stages[0].id = "a b"; }), /id는 1~64자의 영문/);
  assert.equal(reason((r) => { r.stages[0].id = "Aa0_-".repeat(12) + "abcd"; }), "OK", "64자 · 영문 숫자 _ - 는 통과");
  assert.match(createStage("x", 0, 0).id, /^[A-Za-z0-9_-]{1,64}$/, "만드는 id는 늘 이 모양");
  assert.match(reason((r) => { r.stages[0].name = "   "; }), /이름은 1~20자/);
  assert.match(reason((r) => { r.stages[0].name = "가".repeat(21); }), /이름은 1~20자/);
  assert.match(reason((r) => { r.stages[0].x = Number.NaN; }), /위치가 맞지 않아요/);
  assert.match(reason((r) => { r.stages[0].y = 100001; }), /위치가 맞지 않아요/);
  assert.match(reason((r) => { r.stages[0].x = "1"; }), /위치가 맞지 않아요/);
  assert.match(reason((r) => { r.stages[0].techs = [{ id: "not-uuid" }]; }), /기술이 맞지 않아요/);
  assert.match(reason((r) => { r.stages[0].techs = Array.from({ length: 9 }, (_, i) => T(i + 1)); }), /기술이 맞지 않아요/);
  assert.match(reason((r) => { r.stages[0].techs = "x"; }), /기술이 맞지 않아요/);
  assert.match(reason((r) => { r.edges = [{ from: "a", to: "zzz" }]; }), /없는 단계/);
  assert.match(reason((r) => { r.edges = [{ from: "a", to: "a" }]; }), /자기 자신/);
  assert.match(reason((r) => { r.edges = [{ from: "a", to: "b" }, { from: "a", to: "b" }]; }), /겹쳐요/);
  assert.match(reason((r) => { r.edges = [{ from: "a", to: "b" }, { from: "b", to: "a" }]; }), /고리를 이뤄요/);
  assert.match(reason((r) => { r.edges = Array.from({ length: 201 }, () => ({ from: "a", to: "b" })); }), /연결선은 200개까지/);
  assert.match(reason((r) => { r.stages = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, name: `s${i}`, x: 0, y: 0, techs: [] })); }), /5개예요\(동시에 4개까지\)/);
});

test("그래프: 틀은 기술을 뺀다 · 템플릿 적용은 단계 id를 새로 매기고 연결을 다시 잇는다", () => {
  const g = putTech(mk(["a", "b"], [["a", "b"]], { a: [0, 0], b: [320, 0] }), "a", T(1));
  assert.deepEqual(asFrame(g).stages.map((s) => s.techs), [[], []]);
  assert.equal(g.stages[0].techs.length, 1, "원본은 그대로");
  const combo = applyTemplate(g, "combo");
  const frame = applyTemplate(g, "frame");
  assert.deepEqual(combo.stages[0].techs, [T(1)]);
  assert.deepEqual(frame.stages[0].techs, []);
  assert.ok(combo.stages.every((s) => !["a", "b"].includes(s.id)), "id 새로");
  assert.notEqual(combo.stages[0].id, frame.stages[0].id, "두 번 적용해도 안 겹침");
  assert.deepEqual(combo.edges, [{ from: combo.stages[0].id, to: combo.stages[1].id }]);
  assert.deepEqual(cols(combo), [["a"], ["b"]]);
  assert.deepEqual(combo.stages.map((s) => [s.x, s.y]), [[0, 0], [320, 0]], "위치는 그대로");
  assert.equal(applyTemplate({ ...g, edges: [{ from: "a", to: "없음" }] }, "frame").edges.length, 0, "없는 단계를 잇는 선은 버림");
});

test("그래프: 편집 함수는 새 그래프를 돌려주고 원본을 건드리지 않는다", () => {
  const g = mk(["a", "b"], [["a", "b"]]);
  const snapshot = JSON.stringify(g);
  const stage: Stage = createStage("c", 0, 0);
  addStage(g, stage); removeStage(g, "a"); renameStage(g, "a", "z"); moveStages(g, new Map([["a", { x: 9, y: 9 }]]));
  putTech(g, "a", T(1)); connect(g, "b", "a"); disconnect(g, "a", "b"); autoLayout(g); applyTemplate(g, "combo"); asFrame(g);
  assert.equal(JSON.stringify(g), snapshot);
});

const rawStages = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `s${i}`, x: i * 320, y: 0, techs: [] }));

test("초안 읽기: 깊이 13 사슬 · 같은 깊이 5는 초안으로는 읽히고, 확정 검사(parseGraph · limitProblems)에서는 걸린다", () => {
  const chain = { v: 2, stages: rawStages(13), edges: Array.from({ length: 12 }, (_, i) => ({ from: `s${i}`, to: `s${i + 1}` })) };
  const draft = parseDraft(chain);
  assert.ok(draft.ok);
  if (draft.ok) assert.match(limitProblems(draft.graph)[0], /순서가 13단계예요/);
  const g13 = parseGraph(chain);
  assert.equal(g13.ok, false);
  if (!g13.ok) assert.match(g13.message, /순서가 13단계예요/);

  const wide = { v: 2, stages: rawStages(5), edges: [] };
  const draftWide = parseDraft(wide);
  assert.ok(draftWide.ok);
  if (draftWide.ok) assert.match(limitProblems(draftWide.graph)[0], /5개예요\(동시에 4개까지\)/);
  assert.equal(parseGraph(wide).ok, false);
});

test("초안 읽기: 단계 0개도 읽고, 모양 · id · 연결선 · 개수 · 고리는 확정 때와 똑같이 거절한다", () => {
  assert.deepEqual(parseDraft({ v: 2, stages: [], edges: [] }), { ok: true, graph: { v: 2, stages: [], edges: [] } });
  assert.equal(parseGraph({ v: 2, stages: [], edges: [] }).ok, false, "확정은 단계 1개 이상");
  const reason = (r: unknown) => { const p = parseDraft(r); return p.ok ? "OK" : p.message; };
  const base = () => ({ v: 2, stages: rawStages(2) as Record<string, unknown>[], edges: [] as Record<string, unknown>[] });
  assert.equal(parseDraft(null).ok, false);
  assert.match(reason({ ...base(), v: 1 }), /모양이 맞지 않아요/);
  assert.match(reason({ ...base(), stages: rawStages(49) }), /단계는 0~48개/);
  assert.match(reason({ ...base(), stages: [{ ...rawStages(1)[0], id: "기획" }] }), /id는 1~64자의 영문/);
  assert.match(reason({ ...base(), stages: [{ ...rawStages(1)[0], name: "  " }] }), /이름은 1~20자/);
  assert.match(reason({ ...base(), stages: [{ ...rawStages(1)[0], techs: Array.from({ length: 9 }, (_, i) => T(i + 1)) }] }), /기술이 맞지 않아요/);
  assert.match(reason({ ...base(), edges: [{ from: "s0", to: "nope" }] }), /없는 단계/);
  assert.match(reason({ ...base(), edges: [{ from: "s0", to: "s0" }] }), /자기 자신/);
  assert.match(reason({ ...base(), edges: [{ from: "s0", to: "s1" }, { from: "s0", to: "s1" }] }), /겹쳐요/);
  assert.match(reason({ ...base(), edges: Array.from({ length: 201 }, () => ({ from: "s0", to: "s1" })) }), /연결선은 200개까지/);
  assert.match(reason({ ...base(), edges: [{ from: "s0", to: "s1" }, { from: "s1", to: "s0" }] }), /고리를 이뤄요: s[01] → s[01] → s[01]/);
  assert.equal(reason({ ...base(), edges: [{ from: "s0", to: "s1" }] }), "OK");
});

test("단계 메모(T2): 읽을 때 200자 · 앞뒤 공백, 비거나 글이 아니면 키 없음 · 판은 그대로, setStageNote · toBoardView가 나름", async () => {
  const { setStageNote, STAGE_NOTE_MAX } = await import("./graph.ts");
  const st = (note: unknown) => ({ v: 2, stages: [{ id: "s1", name: "기획", x: 0, y: 0, techs: [], note }], edges: [] });
  const read = (note: unknown) => { const r = parseGraph(st(note)); assert.ok(r.ok); return r.graph.stages[0]; };
  assert.equal(read("  사용자 인터뷰 먼저  ").note, "사용자 인터뷰 먼저");
  assert.equal(read("가".repeat(250)).note?.length, STAGE_NOTE_MAX);
  assert.equal("note" in read("   "), false);
  assert.equal("note" in read(42), false);
  const g = { v: 2 as const, stages: [read(undefined)], edges: [] };
  const withNote = setStageNote(g, "s1", " 메모 ");
  assert.equal(withNote.stages[0].note, "메모");
  assert.equal(setStageNote(withNote, "s1", "메모"), withNote, "같으면 같은 판(되돌리기 칸이 안 생김)");
  assert.equal("note" in setStageNote(withNote, "s1", "").stages[0], false);
  assert.equal(toBoardView(withNote)?.[0][0].note, "메모");
});
