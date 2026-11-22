import { test } from "node:test";
import assert from "node:assert/strict";
import { contentKey, readDraft } from "./draft.ts";
import { fromNames } from "./board.ts";
import { fromV1, layers, type Graph } from "./graph.ts";
import { buildFromAnswers } from "./knowledge.ts";

const chain = (n: number): Graph => ({ v: 2, stages: Array.from({ length: n }, (_, i) => ({ id: `q${i}`, name: `단계${i}`, x: i * 320, y: 0, techs: [] })), edges: Array.from({ length: n - 1 }, (_, i) => ({ from: `q${i}`, to: `q${i + 1}` })) });

test("초안 읽기: 깊이 13 사슬도 초안으로는 읽힘(한도는 확정 때), 깨진 v2는 unread, 없으면 옛 격자 초안을 바꿔 읽음", () => {
  const ok = readDraft(JSON.stringify({ name: "긴 사슬", graph: chain(13) }), null);
  assert.equal(ok.saved?.graph.stages.length, 13);
  assert.equal(ok.saved?.name, "긴 사슬");
  assert.deepEqual(readDraft(JSON.stringify({ name: "x", graph: { v: 2, stages: [{ id: "한글", name: "a", x: 0, y: 0, techs: [] }], edges: [] } }), null), { saved: null, unread: true });
  assert.deepEqual(readDraft("{깨진 json", null), { saved: null, unread: true }); // 덮어쓰기 전에 보관하라고 알린다
  const v1 = readDraft(null, JSON.stringify({ name: "옛 판", board: [[{ name: "기획", techs: [] }], [{ name: "개발", techs: [] }]] }));
  assert.equal(v1.saved?.name, "옛 판");
  assert.deepEqual([v1.saved?.graph.stages.length, v1.saved?.graph.edges.length], [2, 1]);
  assert.deepEqual(readDraft(null, null), { saved: null, unread: false });
});

test("같은 확정: 위치만 옮기면 같은 키, 나란히 순서 · 기술 · 연결이 바뀌면 다른 키(불변 3)", () => {
  const g: Graph = { v: 2, stages: [{ id: "a", name: "기획", x: 0, y: 0, techs: [] }, { id: "b", name: "디자인", x: 320, y: 0, techs: [] }, { id: "c", name: "백엔드", x: 320, y: 160, techs: [] }], edges: [{ from: "a", to: "b" }, { from: "a", to: "c" }] };
  const k = contentKey(["이름", null], g);
  assert.equal(contentKey(["이름", null], { ...g, stages: g.stages.map((s) => ({ ...s, x: s.x + 40 })) }), k); // 같은 순서로 옮김
  const swapped = { ...g, stages: g.stages.map((s) => (s.id === "c" ? { ...s, y: -160 } : s)) }; // 백엔드를 디자인 위로: 나란히 순서가 바뀜
  assert.notEqual(contentKey(["이름", null], swapped), k);
  assert.notEqual(contentKey(["이름", null], { ...g, stages: g.stages.map((s) => (s.id === "b" ? { ...s, techs: [{ id: "t", name: "x" }] } : s)) }), k);
  assert.notEqual(contentKey(["다른 이름", null], g), k);
  assert.equal(contentKey(["이름", null], { ...g, edges: [...g.edges].reverse() }), k); // 끊었다 다시 이어 선 순서만 바뀜
});

test("질문으로 틀 만들기: 답 → 열 · 행 판 → 그래프에서 단계 깊이가 열 번호와 같다(나란히는 같은 깊이)", () => {
  const cols = buildFromAnswers({ what: "web", team: "team", design: "yes", data: "yes", test: "full", ship: "yes" });
  const g = fromV1(fromNames(cols)), lay = layers(g);
  assert.ok(lay.ok);
  const depthOf = (name: string) => lay.depth.get(g.stages.find((s) => s.name === name)!.id);
  cols.forEach((col, i) => col.forEach((name) => assert.equal(depthOf(name), i, name)));
});

test("손님 초안: 처음 판에서 고친 것만 가져오자고 묻는다(못 읽거나 그대로면 묻지 않음)", async () => {
  const { guestOffer } = await import("./draft.ts");
  const blank = fromV1(fromNames([["리서치"], ["개발"]]));
  const edited = fromV1(fromNames([["리서치"], ["개발", "검증"]]));
  assert.equal(guestOffer(null, blank), null);
  assert.equal(guestOffer("{깨짐", blank), null);
  // 손님이 아무것도 안 고친 처음 판: 다시 만든 처음 판과 단계 id가 달라도 묻지 않는다(코드 리뷰 지적)
  assert.equal(guestOffer(JSON.stringify({ name: "내 청사진", graph: fromV1(fromNames([["리서치"], ["개발"]])) }), blank), null);
  assert.equal(guestOffer(JSON.stringify({ name: "손님 판", graph: edited }), blank)?.name, "손님 판");
});

test("초안 contentKey(T2): 메모만 바뀌어도 다른 내용", () => {
  const g: Graph = { v: 2, stages: [{ id: "a", name: "기획", x: 0, y: 0, techs: [] }], edges: [] };
  assert.notEqual(contentKey(["이름"], g), contentKey(["이름"], { ...g, stages: [{ ...g.stages[0], note: "먼저 인터뷰" }] }));
});
