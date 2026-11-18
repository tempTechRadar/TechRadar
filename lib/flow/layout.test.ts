import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BOX, layoutFlow, reachableEdges } from "./layout.ts";
import type { Flow } from "./types.ts";

const flow = JSON.parse(readFileSync("flow/flow.json", "utf8")) as Flow;

test("flow.json의 상자·화살표가 하나도 빠지지 않고 배치된다", () => {
  const layout = layoutFlow(flow);
  assert.equal(layout.nodes.length, flow.nodes.length);
  assert.equal(layout.edges.length, flow.edges.length);
  assert.ok(layout.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
});

test("모든 화살표는 왼쪽에서 오른쪽으로 간다(거꾸로 가는 화살표 0개)", () => {
  const at = new Map(layoutFlow(flow).nodes.map((n) => [n.id, n]));
  for (const e of flow.edges) assert.ok(at.get(e.from)!.col < at.get(e.to)!.col, `${e.from} → ${e.to}`);
});

test("상자끼리 겹치지 않는다", () => {
  const nodes = layoutFlow(flow).nodes;
  for (const a of nodes) {
    for (const b of nodes) {
      if (a.id >= b.id) continue;
      const apart = a.x + BOX.w <= b.x || b.x + BOX.w <= a.x || a.y + BOX.h <= b.y || b.y + BOX.h <= a.y;
      assert.ok(apart, `${a.id}와 ${b.id}가 겹침`);
    }
  }
});

test("그림 크기가 모든 상자를 담는다", () => {
  const { nodes, width, height } = layoutFlow(flow);
  assert.ok(nodes.every((n) => n.x + BOX.w <= width && n.y + BOX.h <= height));
});

test("순환이 있거나 없는 상자를 가리키면 오류로 알린다", () => {
  const n = (id: string) => ({ id, type: "db" as const, name: id });
  assert.throws(() => layoutFlow({ nodes: [n("a"), n("b")], edges: [{ from: "a", to: "b", when: "" }, { from: "b", to: "a", when: "" }] }), /순환/);
  assert.throws(() => layoutFlow({ nodes: [n("a")], edges: [{ from: "a", to: "없음", when: "" }] }), /없는 상자/);
});

test("예약에서 출발한 길은 사람 판단과 조치까지 닿고, 시뮬레이터·내 저장소 길은 아니다", () => {
  const edges = reachableEdges(flow, "start_schedule");
  assert.ok(edges.has("start_schedule>fetch_osv"));
  assert.ok(edges.has("notify>human_judgment"));
  assert.ok(edges.has("human_judgment>action_record"));
  assert.ok(![...edges].some((e) => e.startsWith("start_simulator") || e.startsWith("fetch_repo")));
});
