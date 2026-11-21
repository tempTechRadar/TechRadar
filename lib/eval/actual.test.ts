import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { computeActual, type Reader } from "./actual.ts";
import { scoreCases, type GoldCase } from "./score.ts";

// 실제 정답 파일과 저장된 OSV 응답·시험용 스킬로 앱 규칙을 돌린다(네트워크 없음)
const reader: Reader = {
  readJson: (p) => JSON.parse(readFileSync(p, "utf8")),
  readDir: (dir) =>
    (readdirSync(dir, { recursive: true, encoding: "utf8" }) as string[])
      .map((rel) => rel.replaceAll("\\", "/"))
      .filter((rel) => statSync(join(dir, rel)).isFile())
      .sort()
      .map((rel) => ({ path: rel, text: readFileSync(join(dir, rel), "utf8") })),
};
const gold = (JSON.parse(readFileSync("eval/gold.json", "utf8")) as { cases: GoldCase[] }).cases;
const byId = (id: string) => gold.find((c) => c.id === id)!;

test("G1–G4: 저장된 OSV 응답으로 위험·원인이 정답과 같다", () => {
  for (const id of ["G1", "G2", "G3", "G4"]) {
    const a = computeActual(byId(id), reader);
    assert.deepEqual([a.grade, a.event, a.causeId], ["danger", true, byId(id).expected.causeId], id);
  }
});

test("G6–G9: 시험용 스킬을 위험 패턴 검사로 채점한다", () => {
  assert.deepEqual(["G6", "G7", "G8", "G9"].map((id) => computeActual(byId(id), reader).grade), ["danger", "danger", "caution", "pass"]);
});

test("G5a–d: 저장해 둔 저장소 확인 값(고정 now)과 OSV 0건이면 통과", () => {
  for (const id of ["G5a", "G5b", "G5c", "G5d"]) {
    const a = computeActual(byId(id), reader);
    assert.deepEqual([a.grade, a.event, a.error], ["pass", false, undefined], id);
  }
});

test("G5에 저장소 확인 값을 빼면 저장소 확인 전이라 찾지 못함(통과는 OSV만으로 안 나온다)", () => {
  const c = byId("G5a");
  assert.ok(c.input.type === "osv-batch");
  assert.equal(computeActual({ ...c, input: { ...c.input, repo: undefined } }, reader).grade, "unknown");
});

test("저장소 확인 값에 그 패키지가 없으면 실패로 남긴다(짐작하지 않음)", () => {
  const c = byId("G5a");
  assert.ok(c.input.type === "osv-batch");
  assert.match(computeActual({ ...c, input: { ...c.input, package: "없는-패키지" } }, reader).error ?? "", /없는-패키지/);
});

test("지금 전체 채점: 놓침 0·잘못 울림 0, 등급도 모두 맞음(G5는 고정 저장소 확인 값으로 통과)", () => {
  const s = scoreCases(gold, gold.map((c) => computeActual(c, reader)));
  assert.equal(s.totals.miss, 0);
  assert.equal(s.totals.falseAlarm, 0);
  assert.equal(s.totals.failed, 0);
  assert.deepEqual(s.rows.filter((r) => !r.gradeOk), []);
});

test("한 사례의 파일을 못 읽어도 멈추지 않고 그 사례만 실패로 남긴다", () => {
  const broken: Reader = { ...reader, readJson: () => { throw new Error("파일 없음"); } };
  const a = computeActual(byId("G1"), broken);
  assert.deepEqual([a.grade, a.event, a.error], ["unknown", false, "파일 없음"]);
  assert.equal(computeActual(byId("G9"), broken).grade, "pass");
});

test("묶음 조회 결과에 그 패키지가 없으면 실패로 남긴다(짐작하지 않음)", () => {
  const c: GoldCase = { ...byId("G5a"), input: { type: "osv-batch", fixture: "lib/domain/fixtures/osv-g5-latest.json", package: "없는-패키지" } };
  assert.match(computeActual(c, reader).error ?? "", /조회 결과에 없는-패키지가 없음/);
});
