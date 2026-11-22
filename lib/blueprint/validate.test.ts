import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGraph, type TechFacts } from "./validate.ts";
import type { Graph } from "./graph.ts";

const st = (id: string, techs: { id: string; name: string }[] = [], name = id) => ({ id, name, techs, x: 0, y: 0 });
const T = (id: string) => ({ id, name: `기술${id}` });
const info: TechFacts = new Map([["ok", { grade: "pass" }], ["bad", { grade: "danger" }], ["err", { grade: "unknown", collectError: true }]]);
const kinds = (g: Graph, o?: { guest?: boolean }) => validateGraph(g, info, o).map((i) => `${i.kind}:${i.blocks ? "막음" : "알림"}`);

test("검증: 아무 문제 없는 판은 빈 목록", () => {
  assert.deepEqual(validateGraph({ v: 2, stages: [st("a", [T("ok")])], edges: [] }, info), []);
});

test("검증: 판 전체 문제 — 단계 없음 · 고리는 확정을 막고 고를 곳이 없다", () => {
  assert.deepEqual(kinds({ v: 2, stages: [], edges: [] }), ["no-stages:막음"]);
  const ring = validateGraph({ v: 2, stages: [st("a", [T("ok")]), st("b", [T("ok")])], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }] }, info);
  assert.deepEqual(ring.map((i) => [i.kind, i.blocks, i.target]), [["cycle", true, null]]);
  assert.match(ring[0].message, /고리/);
});

test("검증: 한도 · 이름 없는 단계는 막고, 빈 단계는 알리기만", () => {
  const many = { v: 2 as const, stages: [st("a", Array.from({ length: 9 }, (_, i) => T(`ok${i}`)))], edges: [] };
  assert.ok(kinds(many).includes("limit:막음"));
  assert.deepEqual(kinds({ v: 2, stages: [st("a", [T("ok")], " "), st("b")], edges: [] }), ["unnamed:막음", "empty-stage:알림"]);
});

test("검증: 기술 — 관문 밖은 막고(손님은 안 막음), 위험 · 수집 오류는 알리기만, 누르면 그 기술로", () => {
  const g: Graph = { v: 2, stages: [st("a", [T("bad"), T("err"), T("out")])], edges: [] };
  const r = validateGraph(g, info);
  assert.deepEqual(r.map((i) => `${i.kind}:${i.blocks ? "막음" : "알림"}`), ["danger:알림", "collect-error:알림", "outside:막음"]);
  assert.deepEqual(r[2].target, { stageId: "a", techId: "out" });
  assert.deepEqual(kinds(g, { guest: true }), ["danger:알림", "collect-error:알림"]);
});
