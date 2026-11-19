// 흐름 그림의 글 대체(PRD-NF5): 그림을 못 보는 사람도 켜진 상자의 상태와 화살표 건수를 글로 읽는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { flowTextAlt } from "./text-alt.ts";
import type { Flow } from "./types.ts";
import type { Colored } from "./status.ts";

const flow: Flow = {
  nodes: [
    { id: "start_manual", type: "start", name: "지금 실행" },
    { id: "fetch_osv", type: "api", name: "OSV 수집" },
    { id: "notify", type: "transform", name: "알림" },
  ],
  edges: [
    { from: "start_manual", to: "fetch_osv", when: "항상" },
    { from: "fetch_osv", to: "notify", when: "바뀜" },
  ],
};
const colored: Colored = { states: { start_manual: "ok", fetch_osv: "bad", notify: "off" }, activeStart: "start_manual", boldEdges: new Set(["start_manual>fetch_osv"]) };

test("켜진 상자는 이름과 상태 글자로, 안 켜진 상자는 수만 센다", () => {
  const alt = flowTextAlt(flow, colored, new Map());
  assert.deepEqual(alt.boxes, ["지금 실행: 성공", "OSV 수집: 실패"]);
  assert.equal(alt.offCount, 1);
});

test("지나간 화살표(굵은 선)와 건수가 있는 화살표를 '앞 → 뒤 (조건) · 건수'로 적는다", () => {
  const alt = flowTextAlt(flow, colored, new Map([["fetch_osv>notify", "0건"]]));
  assert.deepEqual(alt.arrows, ["지금 실행 → OSV 수집 (항상)", "OSV 수집 → 알림 (바뀜) · 0건"]);
});

test("고른 실행이 없으면(모두 안 켜짐) 빈 목록", () => {
  const alt = flowTextAlt(flow, { states: {}, activeStart: null, boldEdges: new Set() }, new Map());
  assert.deepEqual([alt.boxes, alt.arrows, alt.offCount], [[], [], 3]);
});
