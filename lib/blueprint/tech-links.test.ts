// P-12j H2 기술 관계선 · 단계 안 순서 · 단계 사이 옮기기 · 내보내기 관계 줄
import { test } from "node:test";
import assert from "node:assert/strict";
import { exportMermaid, exportText, linkLines } from "./export-text.ts";
import { contentKey } from "./draft.ts";
import { moveTechToStage } from "./panel-view.ts";
import { addLink, applyTemplate, asFrame, cleanLinks, linkEnd, moveTechInStage, parseDraft, parseGraph, removeLink, removeStage, removeTech, toBoardView, LIMITS, type Graph } from "./graph.ts";

const T = (n: number) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, name: `기술${n}` });
const t1 = T(1), t2 = T(2), t3 = T(3);
/** a = [t1, t2], b = [t3], a → b */
const mk = (): Graph => ({ v: 2, stages: [{ id: "a", name: "개발", x: 0, y: 0, techs: [t1, t2] }, { id: "b", name: "배포", x: 400, y: 0, techs: [t3] }], edges: [{ from: "a", to: "b" }] });
const A1 = linkEnd(t1.id, "a"), A2 = linkEnd(t2.id, "a"), B3 = linkEnd(t3.id, "b");

test("관계선 정리: 없는 기술 · 자기 자신 · 겹침 · 모양 틀림은 빼고 앞에서 100개", () => {
  const g = mk();
  assert.deepEqual(cleanLinks(g, [{ from: A1, to: B3 }, { from: A1, to: B3 }, { from: A1, to: A1 }, { from: A1, to: linkEnd(t3.id, "a") }, { from: 1, to: B3 }, null]), [{ from: A1, to: B3 }]);
  assert.deepEqual(cleanLinks(g, "x"), []);
  const many = Array.from({ length: 150 }, (_, i) => ({ id: `s${i}`, name: `s${i}`, x: 0, y: 0, techs: [T(i + 10)] }));
  const big: Graph = { v: 2, stages: many, edges: [] };
  const raw = many.slice(1).map((s, i) => ({ from: linkEnd(many[i].techs[0].id, many[i].id), to: linkEnd(s.techs[0].id, s.id) }));
  assert.equal(cleanLinks(big, raw).length, LIMITS.links);
});

test("관계선 긋기 · 끊기: 못 그으면 같은 그래프, 다 끊으면 links 키가 없다", () => {
  const g = mk();
  const one = addLink(g, A1, B3);
  assert.deepEqual(one.links, [{ from: A1, to: B3 }]);
  assert.equal(addLink(one, A1, B3), one);
  assert.equal(addLink(g, A1, A1), g);
  assert.equal(removeLink(one, A2, B3), one);
  assert.equal("links" in removeLink(one, A1, B3), false);
});

test("기술 · 단계를 지우면 그 끝의 관계선도 지운다, 틀은 관계선이 없다", () => {
  const g = addLink(addLink(mk(), A1, B3), A2, B3);
  assert.deepEqual(removeTech(g, "a", t1.id).links, [{ from: A2, to: B3 }]);
  assert.equal("links" in removeStage(g, "b"), false);
  assert.equal("links" in asFrame(g), false);
});

test("단계 안 순서 바꾸기: 자리 끝을 넘으면 맨 끝, 그대로면 같은 그래프", () => {
  const g = mk();
  assert.deepEqual(moveTechInStage(g, "a", t1.id, 1).stages[0].techs.map((t) => t.name), ["기술2", "기술1"]);
  assert.deepEqual(moveTechInStage(g, "a", t2.id, -5).stages[0].techs.map((t) => t.name), ["기술2", "기술1"]);
  assert.equal(moveTechInStage(g, "a", t1.id, 0), g);
  assert.equal(moveTechInStage(g, "a", t3.id, 0), g);
  assert.notEqual(contentKey([], moveTechInStage(g, "a", t1.id, 1)), contentKey([], g)); // 순서도 바뀐 것으로 센다
});

test("단계 사이 옮기기: putProblem 그대로, 관계선 끝이 새 단계로 따라감", () => {
  const g = addLink(mk(), A1, A2);
  const r = moveTechToStage(g, "a", "b", { id: t1.id, grade: "pass" }, 0);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.graph.stages.map((s) => s.techs.map((t) => t.name)), [["기술2"], ["기술1", "기술3"]]);
    assert.deepEqual(r.graph.links, [{ from: linkEnd(t1.id, "b"), to: A2 }]);
  }
  assert.deepEqual(moveTechToStage(g, "a", "b", { id: t1.id, grade: "danger" }), { ok: false, message: "위험 등급 기술은 청사진에 넣지 않아요." });
  assert.equal(moveTechToStage(g, "a", "a", { id: t1.id, grade: "pass" }).ok, false);
  assert.equal(moveTechToStage(g, "a", "zz", { id: t1.id, grade: "pass" }).ok, false);
});

test("읽기 · 템플릿: 관계선은 맞는 것만 남고 판은 버리지 않는다, 템플릿은 새 단계 id로 따라간다", () => {
  const g = addLink(mk(), A1, B3);
  const p = parseGraph({ ...g, links: [...g.links!, { from: A1, to: "없음@b" }] });
  assert.ok(p.ok);
  if (p.ok) assert.deepEqual(p.graph.links, [{ from: A1, to: B3 }]);
  const d = parseDraft({ ...mk(), links: "x" });
  assert.ok(d.ok && !("links" in d.graph));
  const c = applyTemplate(g, "combo");
  const [na, nb] = c.stages.map((s) => s.id);
  assert.deepEqual(c.links, [{ from: linkEnd(t1.id, na), to: linkEnd(t3.id, nb) }]);
  assert.equal("links" in applyTemplate(g, "frame"), false);
});

test("내보내기: 프롬프트 · CLAUDE.md · Mermaid에 '사용자 표시 관계: A → B', 없으면 예전 글 그대로", () => {
  const g = addLink(mk(), A1, B3), b = toBoardView(g)!;
  const rel = linkLines(g);
  assert.deepEqual(rel, ["기술1 → 기술3"]);
  assert.match(exportText("prompt", "판", b, rel), /\n사용자 표시 관계: 기술1 → 기술3\n$/);
  assert.match(exportText("md", "판", b, rel), /- 사용자 표시 관계: 기술1 → 기술3\n$/);
  assert.match(exportMermaid(g), /n1 -.->\|"사용자 표시 관계: 기술1 → 기술3"\| n2\n$/);
  assert.equal(exportText("prompt", "판", b), exportText("prompt", "판", b, []));
  assert.doesNotMatch(exportText("md", "판", b) + exportMermaid(mk()), /사용자 표시 관계|호환|검증/);
});
