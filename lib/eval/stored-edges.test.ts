import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readStoredEdges } from "./stored-edges.ts";

const real = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const row = (id: string, verdict = "맞음") => ({ id, kind: "수집 실패", target: "t", source: "s", expectedOutcome: "수집 오류", expectedEvent: false, actualOutcome: "수집 오류", verdict, note: "" });
const totals = { cases: 1, hit: 0, quietOk: 1, miss: 0, falseAlarm: 0, outcomeWrong: 0, failed: 0 };
const files = (result: unknown, ids = ["A"]) => (p: string) => (p === "eval/result.json" ? result : { edgeCases: ids.map((id) => ({ id })) });

test("저장소의 저장된 결과는 지금 정답 파일의 경계 사례와 같은 사례를 담고 있다(낡은 결과를 화면에 내지 않게)", () => {
  const s = readStoredEdges({ readJson: real });
  assert.equal(s.ok, true);
  if (!s.ok) return;
  const gold = (real("eval/gold.json") as { edgeCases: { id: string }[] }).edgeCases;
  assert.deepEqual(s.edges.rows.map((r) => r.id), gold.map((c) => c.id));
  assert.equal(s.edges.totals.cases, gold.length);
  assert.ok(s.when.length > 0);
});

test("결과 파일을 못 읽으면 '없음'이 아니라 읽지 못한 이유를 돌려준다(불변 2)", () => {
  const s = readStoredEdges({ readJson: (p) => { if (p === "eval/result.json") throw new Error("ENOENT"); return {}; } });
  assert.deepEqual(s, { ok: false, reason: "저장된 채점 결과(eval/result.json)를 읽지 못했어요." });
});

test("결과 파일에 경계 사례 절이 없거나 모양이 다르면 읽지 못함", () => {
  for (const bad of [{}, { when: "x", edges: {} }, { when: "x", edges: { rows: [row("A")], totals: { cases: "1" }, byKind: {} } }, { edges: { rows: [row("A")], totals, byKind: {} } }, { when: "x", edges: { rows: [{ id: "A" }], totals, byKind: {} } }]) {
    const s = readStoredEdges({ readJson: files(bad) });
    assert.equal(s.ok, false, JSON.stringify(bad));
  }
});

test("저장된 결과의 사례가 정답 파일과 다르면(더해짐·빠짐·순서) 낡은 결과로 보고 내지 않는다", () => {
  const result = { when: "2026. 11. 19.", edges: { rows: [row("A")], totals, byKind: {} } };
  assert.equal(readStoredEdges({ readJson: files(result, ["A"]) }).ok, true);
  for (const ids of [["A", "B"], ["B"], []]) {
    const s = readStoredEdges({ readJson: files(result, ids) });
    assert.equal(s.ok, false);
    if (!s.ok) assert.match(s.reason, /npm run eval/);
  }
});

test("정답 파일을 못 읽으면 견줄 수 없으니 내지 않는다", () => {
  const result = { when: "x", edges: { rows: [row("A")], totals, byKind: {} } };
  const s = readStoredEdges({ readJson: (p) => { if (p === "eval/gold.json") throw new Error("x"); return result; } });
  assert.equal(s.ok, false);
});
