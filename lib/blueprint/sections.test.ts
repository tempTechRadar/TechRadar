import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSections, groupSection, putSectionTech, removeSectionTech, sectionLines, ungroupSection, type Section } from "./sections.ts";
import { parseGraph, removeStage, type Graph } from "./graph.ts";
import { exportText } from "./export-text.ts";

const st = (id: string, name = id, x = 0) => ({ id, name, x, y: 0, techs: [] });
const G = (sections?: Section[]): Graph => ({ v: 2, stages: [st("a", "기획"), st("b", "개발", 400), st("c", "배포", 800)], edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }], ...(sections ? { sections } : {}) });

test("섹션 묶기: 2개 이상 · 이름 필요 · 이미 든 단계는 못 묶음(겹침 없음)", () => {
  const r = groupSection(G(), ["a", "b"], " 준비 ", "s1");
  assert.ok(r.ok && r.graph.sections?.[0].name === "준비" && r.graph.sections[0].stageIds.join() === "a,b");
  assert.equal(groupSection(G(), ["a"], "하나", "s1").ok, false);
  assert.equal(groupSection(G(), ["a", "b"], "  ", "s1").ok, false);
  const again = r.ok ? groupSection(r.graph, ["b", "c"], "뒤", "s2") : null;
  assert.equal(again?.ok, false, "b는 이미 준비 섹션");
  assert.equal(r.ok ? ungroupSection(r.graph, "s1").sections : "x", undefined, "풀면 키가 없음");
});

test("섹션 공통 기술: 위험 · 겹침 · 8개 막기, 빼기", () => {
  const r = groupSection(G(), ["a", "b"], "준비", "s1");
  assert.ok(r.ok);
  const p = putSectionTech(r.graph, "s1", { id: "t1", name: "A", grade: "pass" });
  assert.ok(p.ok && p.graph.sections?.[0].techs.length === 1);
  assert.equal(putSectionTech(r.graph, "s1", { id: "t9", name: "X", grade: "danger" }).ok, false);
  assert.equal(p.ok && putSectionTech(p.graph, "s1", { id: "t1", name: "A", grade: "pass" }).ok, false);
  assert.equal(p.ok ? removeSectionTech(p.graph, "s1", "t1").sections?.[0].techs.length : -1, 0);
});

test("정리: 단계를 지워 2개 미만이 되면 섹션을 풀고, 맞지 않는 섹션만 뺀다(판은 그대로), 확정 파서가 섹션을 남긴다", () => {
  const sec: Section = { id: "s1", name: "준비", stageIds: ["a", "b"], techs: [] };
  assert.equal(removeStage(G([sec]), "a").sections, undefined, "a를 지우면 b 하나라 풀림");
  assert.deepEqual(cleanSections(["a", "b", "c"], [sec, { id: "s2", name: "겹침", stageIds: ["b", "c"] }, { id: "bad id", name: "x", stageIds: ["a", "c"] }, "x"]).map((s) => s.id), ["s1"]);
  const parsed = parseGraph({ ...G(), sections: [sec, { id: "s3", name: "없는 단계", stageIds: ["zz", "yy"] }] });
  assert.ok(parsed.ok && parsed.graph.sections?.length === 1 && parsed.graph.sections[0].id === "s1");
  const none = parseGraph(G());
  assert.ok(none.ok && !("sections" in none.graph), "섹션이 없으면 키도 없음(옛 판 그대로)");
});

test("내보내기: 섹션 머리를 단계 앞에 한 번, 공통 기술은 첫 단계 전에 설치", () => {
  const g = G([{ id: "s1", name: "준비", stageIds: ["a", "b"], techs: [{ id: "t1", name: "Supabase" }] }]);
  const lines = sectionLines(g);
  assert.deepEqual(lines, ["섹션 「준비」: 단계 기획 · 개발 — 공통 기술: Supabase(이 섹션 첫 단계 전에 먼저 설치)"]);
  const text = exportText("prompt", "판", [[{ name: "기획", techs: [] }]], [], lines);
  assert.ok(text.indexOf("섹션 「준비」") < text.indexOf("기획") || text.split("섹션 「준비」").length === 2, "섹션 머리는 한 번");
  assert.equal(exportText("prompt", "판", [[{ name: "기획", techs: [] }]]).includes("섹션"), false, "섹션이 없으면 줄도 없음");
});
