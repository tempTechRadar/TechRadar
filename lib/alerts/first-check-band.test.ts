import assert from "node:assert/strict";
import test from "node:test";
import { addSeenRunId, buildFirstCheckBand, parseRunId, parseSeenRunIds, type FirstCheckRun } from "./first-check-band.ts";

// PRD-F14·UJ-A4·SPEC-5.2: 처음 읽은 뒤 띠에 "첫 점검: 위험 n · 주의 n"을 한 번. 수집 오류를 0으로 단정하지 않는다(불변 2).
const run = (over: Partial<FirstCheckRun> = {}): FirstCheckRun => ({
  id: "run-1",
  status: "succeeded",
  steps: [
    { stepName: "grade", branchCounts: { danger: 2, caution: 3, pass: 5 } },
    { stepName: "is_event", branchCounts: { event: 2, no_change: 8, collect_error: 0 } },
  ],
  ...over,
});
const gradeOnly = (branchCounts: Record<string, number> | null, status = "succeeded") => run({ status, steps: [{ stepName: "grade", branchCounts }] });

test("가장 최근 첫 읽기 실행의 등급 건수로 SPEC-5.2 문구를 만든다", () => {
  assert.deepEqual(buildFirstCheckBand([run()], []), { runId: "run-1", danger: 2, caution: 3, text: "첫 점검: 위험 2 · 주의 3", notes: [] });
});

test("통과·모름은 세지 않고, 건수 키가 없으면 0(다른 등급이 읽혔을 때)", () => {
  assert.equal(buildFirstCheckBand([gradeOnly({ pass: 4, unknown: 1 })], [])?.text, "첫 점검: 위험 0 · 주의 0");
});

test("실행이 없으면 띠가 없다", () => {
  assert.equal(buildFirstCheckBand([], []), null);
});

test("이미 확인한 실행은 건너뛰고, 확인 안 한 다른 실행이 있으면 그것을 보여 준다", () => {
  assert.equal(buildFirstCheckBand([run()], ["run-1"]), null);
  assert.equal(buildFirstCheckBand([run({ id: "run-2" }), run({ id: "run-1" })], ["run-2"])?.runId, "run-1");
  assert.equal(buildFirstCheckBand([run({ id: "run-2" }), run({ id: "run-1" })], ["run-1"])?.runId, "run-2");
});

test("프로젝트를 여러 개 등록해도 앞 프로젝트의 확인 안 한 띠가 가려지지 않는다(새것부터 하나씩)", () => {
  const runs = [run({ id: "B" }), run({ id: "A" })];
  assert.equal(buildFirstCheckBand(runs, [])?.runId, "B");
  assert.equal(buildFirstCheckBand(runs, ["B"])?.runId, "A");
  assert.equal(buildFirstCheckBand(runs, ["B", "A"]), null);
});

test("등급을 매기기 전에 끝난 실행(grade 단계 없음·건수 없음)은 '위험 0'으로 오해하지 않게 띠를 만들지 않는다", () => {
  assert.equal(buildFirstCheckBand([run({ steps: [{ stepName: "fetch_repo", branchCounts: null }] })], []), null);
  assert.equal(buildFirstCheckBand([gradeOnly(null)], []), null);
  assert.equal(buildFirstCheckBand([run({ steps: [] })], []), null);
});

test("저장소를 못 읽어 등급 건수가 비어 있는 성공 단계({})는 '위험 0 · 주의 0'이 아니라 띠 없음", () => {
  assert.equal(buildFirstCheckBand([gradeOnly({})], []), null);
  assert.equal(buildFirstCheckBand([gradeOnly({ danger: 0, caution: 0, pass: 0 })], []), null);
});

test("실패하거나 아직 도는 실행은 띠를 만들지 않는다(건수가 있어도)", () => {
  assert.equal(buildFirstCheckBand([gradeOnly({ danger: 1 }, "failed")], []), null);
  assert.equal(buildFirstCheckBand([gradeOnly({ danger: 1 }, "running")], []), null);
});

test("일부만 읽은 실행(partial)은 띠에 '전부가 아닐 수 있다'를 덧붙인다", () => {
  const band = buildFirstCheckBand([gradeOnly({ danger: 1, caution: 0 }, "partial")], []);
  assert.equal(band?.text, "첫 점검: 위험 1 · 주의 0");
  assert.deepEqual(band?.notes, ["저장소 일부를 읽지 못해 이 숫자가 전부가 아닐 수 있어요"]);
});

test("읽지 못한 기술이 있으면 빠졌다고 덧붙인다(0으로 단정하지 않기)", () => {
  const band = buildFirstCheckBand(
    [run({ steps: [{ stepName: "grade", branchCounts: { danger: 0, caution: 1 } }, { stepName: "is_event", branchCounts: { collect_error: 3 } }] })],
    [],
  );
  assert.equal(band?.text, "첫 점검: 위험 0 · 주의 1");
  assert.deepEqual(band?.notes, ["읽지 못한 기술 3개는 이 숫자에서 빠졌어요"]);
});

test("partial이면서 읽지 못한 기술도 있으면 안내가 둘 다 붙는다", () => {
  const band = buildFirstCheckBand(
    [run({ status: "partial", steps: [{ stepName: "grade", branchCounts: { caution: 1 } }, { stepName: "is_event", branchCounts: { collect_error: 2 } }] })],
    [],
  );
  assert.equal(band?.notes.length, 2);
});

test("is_event 단계가 없어도 오류 칸이 없으면 덧붙이지 않는다", () => {
  assert.deepEqual(buildFirstCheckBand([gradeOnly({ danger: 1 })], [])?.notes, []);
});

test("숫자가 아닌·음수 건수 값은 0으로 본다", () => {
  const band = buildFirstCheckBand([gradeOnly({ danger: "x" as unknown as number, caution: -2, pass: 1 })], []);
  assert.equal(band?.text, "첫 점검: 위험 0 · 주의 0");
});

test("쿠키·폼 값은 uuid 모양의 실행 id만 받는다", () => {
  assert.equal(parseRunId("070c6274-e0f4-4e89-8331-bad60a22f539"), "070c6274-e0f4-4e89-8331-bad60a22f539");
  for (const bad of ["", "run-1", "070c6274-e0f4-4e89-8331-bad60a22f539x", " 070c6274-e0f4-4e89-8331-bad60a22f539", "'; drop table runs;--", null, undefined, 7]) {
    assert.equal(parseRunId(bad), null);
  }
});

const A = "070c6274-e0f4-4e89-8331-bad60a22f539";
const B = "929deed7-f467-4b8a-934b-6f27a2f263bc";

test("확인한 실행 목록 쿠키: 쉼표로 이어 읽고 모양이 틀린 것은 버린다", () => {
  assert.deepEqual(parseSeenRunIds(`${A},${B}`), [A, B]);
  assert.deepEqual(parseSeenRunIds(`${A},nope,,${B}`), [A, B]);
  assert.deepEqual(parseSeenRunIds(undefined), []);
  assert.deepEqual(parseSeenRunIds(""), []);
});

test("확인한 실행을 더하면 앞의 것은 덮어쓰지 않고 남고, 같은 것은 두 번 안 들어가며, 오래된 것부터 밀려난다(최대 10개)", () => {
  assert.equal(addSeenRunId(undefined, A), A);
  assert.equal(addSeenRunId(A, B), `${A},${B}`);
  assert.equal(addSeenRunId(`${A},${B}`, A), `${B},${A}`);
  const ids = Array.from({ length: 10 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`);
  const full = ids.join(",");
  const next = addSeenRunId(full, A).split(",");
  assert.equal(next.length, 10);
  assert.equal(next[9], A);
  assert.equal(next.includes(ids[0]), false);
});

test("가장 새 실행이 쓸 수 없어도(실패) 그 앞의 확인 안 한 정상 실행의 띠를 보여 준다", () => {
  assert.equal(buildFirstCheckBand([gradeOnly({ danger: 9 }, "failed"), run({ id: "A" })], [])?.runId, "A");
});
