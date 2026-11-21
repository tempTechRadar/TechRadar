import { test } from "node:test";
import assert from "node:assert/strict";
import { fromNames, putTech, MAX_TECHS } from "./board.ts";
import { buildFromAnswers, fitsStage, recommendAt, recommendBeside } from "./knowledge.ts";

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
