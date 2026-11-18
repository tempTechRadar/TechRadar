import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { branchKey, edgeLabels } from "./counts.ts";
import type { Flow, StepDetail } from "./types.ts";

const flow = JSON.parse(readFileSync("flow/flow.json", "utf8")) as Flow;
const step = (step_name: string, extra: Partial<StepDetail> = {}): StepDetail => ({ step_name, status: "succeeded", ...extra });

test("기록이 없으면 화살표 숫자를 하나도 쓰지 않는다(불변 6)", () => {
  assert.equal(edgeLabels(flow, []).size, 0);
});

test("분기는 갈래마다 branch_counts 숫자를 쓴다(0도 쓴다)", () => {
  const labels = edgeLabels(flow, [step("is_event", { branch_counts: { event: 3, no_change: 9, collect_error: 0 } })]);
  assert.equal(labels.get("is_event>save_change"), "사건 3");
  assert.equal(labels.get("is_event>no_change"), "변화 없음 9");
});

test("갈래 키는 팀 표준 영문(event·no_change·collect_error·ok)", () => {
  assert.equal(branchKey("is_event", "save_change"), "event");
  assert.equal(branchKey("is_event", "no_change"), "no_change");
  assert.equal(branchKey("fetch_osv", "collect_error"), "collect_error");
  assert.equal(branchKey("fetch_osv", "normalize"), "ok");
});

test("수집 상자의 ok·collect_error 갈래도 화살표마다 나뉜다", () => {
  const labels = edgeLabels(flow, [step("fetch_osv", { status: "failed", count_out: 5, branch_counts: { ok: 5, collect_error: 2 } })]);
  assert.equal(labels.get("fetch_osv>normalize"), "성공 5");
  assert.equal(labels.get("fetch_osv>collect_error"), "수집 오류 2");
});

test("분기가 아니면 count_out을, 받는 상자에 기록이 있을 때만 쓴다", () => {
  const labels = edgeLabels(flow, [step("normalize", { count_out: 4 }), step("compare", { count_out: 4 })]);
  assert.equal(labels.get("normalize>compare"), "4건");
  assert.equal(labels.has("compare>grade"), false); // grade 기록이 없으니 넘어간 것이 아님
});

test("같은 상자에 기록이 여러 줄이면 더한다", () => {
  const labels = edgeLabels(flow, [step("normalize", { count_out: 2 }), step("normalize", { count_out: 3 }), step("compare")]);
  assert.equal(labels.get("normalize>compare"), "5건");
});

test("갈래 키가 받는 상자와 맞지 않으면(등급별 개수 등) count_out으로 돌아간다", () => {
  const labels = edgeLabels(flow, [step("grade", { count_out: 7, branch_counts: { pass: 5, danger: 2 } }), step("is_event")]);
  assert.equal(labels.get("grade>is_event"), "7건");
});

test("갈래 숫자가 없는 실패는 실패한 줄 수로 수집 오류 화살표를 쓴다", () => {
  const labels = edgeLabels(flow, [step("fetch_repo", { status: "failed" }), step("collect_error")]);
  assert.equal(labels.get("fetch_repo>collect_error"), "실패 1");
  assert.equal(labels.has("fetch_repo>extract_my_tech"), false);
});

test("count_out이 비어 있으면 숫자를 짐작하지 않는다", () => {
  const labels = edgeLabels(flow, [step("normalize"), step("compare")]);
  assert.equal(labels.has("normalize>compare"), false);
});
