import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { colorize, pathFrom } from "./status.ts";
import type { Flow, RunRow, StepRow } from "./types.ts";

const flow = JSON.parse(readFileSync("flow/flow.json", "utf8")) as Flow;
const run = (trigger: string, status: RunRow["status"] = "succeeded"): RunRow => ({ id: "r1", trigger, status });
const step = (step_name: string, status: StepRow["status"]): StepRow => ({ step_name, status });

test("실행이 없으면 아무것도 칠하지 않는다(꺼 둔 상자가 없으면 모두 '안 켜짐')", () => {
  const { states, activeStart, boldEdges } = colorize(flow, null, []);
  assert.equal(activeStart, null);
  assert.equal(boldEdges.size, 0);
  assert.ok(Object.values(states).every((s) => s === "off")); // fetch_popularity는 11-21(ADR 0033)에 HN으로 켜서 지금 flow.json에는 꺼 둔 상자가 없다
});

test("누른 시작 상자만 켜지고 그 시작의 길이 굵어진다", () => {
  const { states, activeStart, boldEdges } = colorize(flow, run("simulator"), []);
  assert.equal(activeStart, "start_simulator");
  assert.equal(states.start_simulator, "ok");
  assert.equal(states.start_schedule, "off");
  assert.ok(boldEdges.has("start_simulator>normalize"));
});

test("기록이 없는 상자는 실행이 성공해도 회색으로 남는다(미리 칠하지 않음, 불변 6)", () => {
  const { states } = colorize(flow, run("manual"), [step("fetch_osv", "succeeded")]);
  assert.equal(states.fetch_osv, "ok");
  assert.equal(states.fetch_registry, "off");
  assert.equal(states.grade, "off");
});

test("기록 상태가 색으로 옮겨진다: 성공 초록·실행 중 파랑·실패 빨강·판단 대기 주황", () => {
  const steps = [step("fetch_osv", "succeeded"), step("fetch_github", "running"), step("fetch_registry", "failed"), step("human_judgment", "awaiting_judgment"), step("action_record", "waiting")];
  const { states } = colorize(flow, run("manual", "running"), steps);
  assert.deepEqual(
    [states.fetch_osv, states.fetch_github, states.fetch_registry, states.human_judgment, states.action_record, states.start_manual],
    ["ok", "running", "bad", "wait", "off", "running"],
  );
});

test("한 상자에 기록이 여러 줄이면 더 나쁜 쪽을 보인다(일부 실패도 빨강)", () => {
  const { states } = colorize(flow, run("manual", "partial"), [step("fetch_osv", "succeeded"), step("fetch_osv", "failed"), step("fetch_osv", "succeeded")]);
  assert.equal(states.fetch_osv, "bad");
});

test("실패한 실행의 시작 상자는 빨강, 판단 대기 뒤 조치가 켜지면 둘 다 초록", () => {
  assert.equal(colorize(flow, run("scoring", "failed"), []).states.start_scoring, "bad");
  const done = colorize(flow, run("simulator"), [step("human_judgment", "succeeded"), step("action_record", "succeeded")]);
  assert.equal(done.states.human_judgment, "ok");
  assert.equal(done.states.action_record, "ok");
});

test("enabled:false 상자는 실행이 없을 때 '꺼짐', 그 상자의 단계가 있으면 단계 상태를 따른다(지금 flow.json에는 꺼 둔 상자가 없어서 합성 흐름으로 본다)", () => {
  const synthetic: Flow = { ...flow, nodes: [...flow.nodes, { id: "fetch_later", type: "api", name: "나중에", enabled: false }] };
  assert.equal(colorize(synthetic, null, []).states.fetch_later, "disabled");
  assert.equal(colorize(synthetic, run("manual"), [step("fetch_later", "succeeded")]).states.fetch_later, "ok");
});

test("시작 상자를 고르면 그 시작에서 갈 수 있는 상자·화살표만 길이 된다(flow.json 연결 기준), 다른 시작의 길은 섞이지 않는다", () => {
  const sim = pathFrom(flow, "start_simulator");
  assert.ok(sim.nodes.has("start_simulator"));
  assert.ok([...sim.edges].every((k) => sim.nodes.has(k.split(">")[0]) && sim.nodes.has(k.split(">")[1])), "길의 화살표 양끝은 길의 상자");
  const starts = flow.nodes.filter((n) => n.type === "start" && n.id !== "start_simulator").map((n) => n.id);
  assert.ok(starts.length > 0 && starts.every((id) => !sim.nodes.has(id)), "다른 시작 상자는 길에 없다");
  const sched = pathFrom(flow, "start_schedule");
  assert.ok(sched.edges.has("start_schedule>fetch_osv"));
  assert.ok(!sched.nodes.has("fetch_repo"), "예약 길에 내 저장소 읽기는 없다");
  assert.notDeepEqual([...sim.edges].sort(), [...sched.edges].sort());
});
