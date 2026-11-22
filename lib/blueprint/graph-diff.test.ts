import { test } from "node:test";
import assert from "node:assert/strict";
import { fromNames } from "./board.ts";
import { fromV1, toBoardView, type Graph } from "./graph.ts";
import { diffLines, graphDiff } from "./graph-diff.ts";

const T1 = { id: "11111111-1111-4111-8111-111111111111", name: "Vite" }, T2 = { id: "22222222-2222-4222-8222-222222222222", name: "React" };
const base: Graph = {
  v: 2, edges: [{ from: "a", to: "b" }],
  stages: [{ id: "a", name: "기획", x: 0, y: 0, techs: [] }, { id: "b", name: "개발", x: 384, y: 0, techs: [T1] }],
};
const lines = (next: Graph, prev = base) => diffLines(graphDiff(prev, next));

test("같은 판(위치만 옮김)은 달라진 것 없음", () => {
  assert.deepEqual(lines({ ...base, stages: base.stages.map((s) => ({ ...s, x: s.x + 40 })) }), []);
});

test("이름만 · 기술만 · 선만 · 메모만 바뀐 것을 따로 보인다", () => {
  assert.deepEqual(lines({ ...base, stages: [{ ...base.stages[0], name: "기획 다듬기" }, base.stages[1]] }), ["이름 바꿈: 기획 → 기획 다듬기"]);
  assert.deepEqual(lines({ ...base, stages: [base.stages[0], { ...base.stages[1], techs: [T2] }] }), ["기술 넣음 · 개발: React", "기술 뺌 · 개발: Vite"]);
  assert.deepEqual(lines({ ...base, edges: [] }), ["끊음: 기획 → 개발"]);
  assert.deepEqual(lines({ ...base, stages: [{ ...base.stages[0], note: "인터뷰 먼저" }, base.stages[1]] }), ["메모 바뀜: 기획"]);
});

test("단계 더함 · 뺌과 그 선, 옛 확정본(board → 새 id)은 이름으로 맞춘다", () => {
  const next: Graph = { ...base, stages: [...base.stages, { id: "c", name: "배포", x: 768, y: 0, techs: [] }], edges: [...base.edges, { from: "b", to: "c" }] };
  assert.deepEqual(lines(next), ["단계 더함: 배포", "이음: 개발 → 배포"]);
  assert.deepEqual(lines(base, next), ["단계 뺌: 배포", "끊음: 개발 → 배포"]);
  const old = fromV1(toBoardView(base)!.map((c) => c.map((s) => ({ ...s, id: `old-${s.id}` }))));
  assert.deepEqual(lines(base, old), []);
  assert.deepEqual(lines(fromV1(fromNames([["기획"], ["테스트"]])), fromV1(fromNames([["기획"], ["개발"]]))), ["단계 더함: 테스트", "단계 뺌: 개발", "이음: 기획 → 테스트", "끊음: 기획 → 개발"]);
});
