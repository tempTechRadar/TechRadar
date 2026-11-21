import { test } from "node:test";
import assert from "node:assert/strict";
import { addColumn, addParallel, canSplitOut, find, fromNames, join, lift, moveStage, putTech, removeStage, renameStage, shift, split, MAX_TECHS, type Board } from "./board.ts";
import { buildFromAnswers, fitsStage, recommendAt, recommendBeside } from "./knowledge.ts";

const names = (b: Board) => b.map((c) => c.map((s) => s.name));
const id = (b: Board, name: string) => b.flat().find((s) => s.name === name)!.id;

test("판: 틈에 넣기 · 나란히 넣기 · 빼면 빈 열은 치움 · 이름 바꾸기", () => {
  let b = fromNames([["기획"], ["개발"]]);
  b = addColumn(b, 1, "디자인");
  assert.deepEqual(names(b), [["기획"], ["디자인"], ["개발"]]);
  b = addParallel(b, 1, "백엔드");
  assert.deepEqual(names(b), [["기획"], ["디자인", "백엔드"], ["개발"]]);
  b = removeStage(b, id(b, "기획"));
  assert.deepEqual(names(b), [["디자인", "백엔드"], ["개발"]]);
  assert.deepEqual(names(renameStage(b, id(b, "개발"), "  ")), names(b)); // 빈 이름은 무시
  assert.equal(addColumn(b, 0, "   "), b);
});

test("판: 끌어 놓기 · ← → · ↑ ↓ · 떼기", () => {
  let b = fromNames([["기획"], ["디자인", "백엔드"], ["배포"]]);
  assert.deepEqual(names(moveStage(b, id(b, "배포"), { col: 1, newColumn: false })), [["기획"], ["디자인", "백엔드", "배포"]]); // 나란히 붙이고 빈 열 치움
  assert.deepEqual(names(moveStage(b, id(b, "배포"), { col: 0, newColumn: true })), [["배포"], ["기획"], ["디자인", "백엔드"]]); // 틈에 놓으면 새 열
  assert.deepEqual(names(shift(b, id(b, "기획"), 1)), [["디자인", "백엔드"], ["기획"], ["배포"]]); // 혼자면 이웃과 바꿈
  assert.deepEqual(names(shift(b, id(b, "백엔드"), -1)), [["기획"], ["백엔드"], ["디자인"], ["배포"]]); // 나란히면 떼어 앞으로
  assert.equal(shift(b, id(b, "기획"), -1), b); // 맨 앞에서 더 앞은 없음
  assert.deepEqual(names(lift(b, id(b, "백엔드"), -1)), [["기획"], ["백엔드", "디자인"], ["배포"]]);
  assert.deepEqual(names(join(b, id(b, "배포"), -1)), [["기획"], ["디자인", "백엔드", "배포"]]); // 키보드로 앞 열에 나란히
  assert.equal(join(b, id(b, "배포"), 1), b); // 뒤 열이 없으면 그대로
  const full = fromNames(Array.from({ length: 11 }, (_, i) => [`s${i}`]).concat([["a", "b"]]));
  assert.equal(canSplitOut(full, 11), false); // 열 12개면 나란히에서 떼어 새 열을 못 만듦
  assert.equal(shift(full, id(full, "a"), 1), full);
  b = split(b, id(b, "디자인"));
  assert.deepEqual(names(b), [["기획"], ["백엔드"], ["디자인"], ["배포"]]);
  assert.equal(find(b, "없는 id"), null);
});

test("판: 기술은 단계마다 한 번, 8개까지", () => {
  let b = fromNames([["개발"]]);
  const s = b[0][0].id;
  b = putTech(b, s, { id: "t1", name: "zod" });
  b = putTech(b, s, { id: "t1", name: "zod" });
  assert.equal(b[0][0].techs.length, 1);
  for (let i = 2; i <= MAX_TECHS + 2; i++) b = putTech(b, s, { id: `t${i}`, name: `x${i}` });
  assert.equal(b[0][0].techs.length, MAX_TECHS);
});

test("단계 지식: 단계에 맞는 분류 · 틈 추천 · 나란히 추천 · 인터뷰 답으로 만들기", () => {
  assert.equal(fitsStage("배포", { field: "배포·운영", sub: "배포·클라우드" }), true);
  assert.equal(fitsStage("배포", { field: "디자인", sub: null }), false);
  assert.equal(fitsStage("QA", { field: "프론트엔드", sub: "브라우저 자동화" }), true); // 세부 갈래로도 맞음
  assert.equal(fitsStage("내가 지은 단계", { field: null, sub: null }), true); // 목록에 없는 단계는 거르지 않음
  const b = fromNames([["기획"], ["배포"]]);
  assert.deepEqual(recommendAt(b, 1), ["디자인", "개발", "백엔드", "테스트"]);
  assert.ok(!recommendAt(b, 0).includes("기획")); // 이미 있는 단계는 추천하지 않음
  assert.deepEqual(recommendBeside(fromNames([["디자인"]]), 0), ["백엔드"]);
  assert.deepEqual(buildFromAnswers({ what: "web", team: "team", design: "yes", data: "yes", test: "full", ship: "yes" }),
    [["문제정의"], ["기획"], ["디자인", "백엔드"], ["프론트엔드"], ["테스트", "코드 리뷰"], ["QA"], ["배포"]]);
  assert.deepEqual(buildFromAnswers({ what: "data", team: "solo", design: "yes", data: "no", test: "basic", ship: "local" }),
    [["문제정의"], ["리서치"], ["기획"], ["개발"], ["테스트"]]);
});
