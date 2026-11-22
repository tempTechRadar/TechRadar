import { test } from "node:test";
import assert from "node:assert/strict";
import { toScenarioView, type ScenarioRecord } from "./to-scenario-view.ts";

const NOW = new Date("2026-11-19T05:00:00Z"); // 한국 시간 14시
const row = (over: Partial<ScenarioRecord> = {}): ScenarioRecord => ({
  id: "s1", status: "done", createdAt: "2026-11-19T05:02:00Z", body: validBody(), sources: ["https://example.com/a", "mcp-registry", 3], ...over,
});

function validBody() {
  return {
    comparison: {
      techName: "mcp-remote", altName: "supergateway",
      rows: [{ item: "하는 일", mine: { value: "원격 연결", source: "https://example.com/m" }, theirs: { value: "찾지 못함", source: null } }],
    },
    steps: ["버전을 올려요."], risks: ["연결이 달라질 수 있어요."],
  };
}

test("만든 적이 없으면 누르기 전 카드(남은 횟수), 5번을 다 썼으면 한도 카드", () => {
  assert.deepEqual(toScenarioView(null, 1, NOW), { state: "idle", remaining: 4 });
  assert.deepEqual(toScenarioView(null, 0, NOW), { state: "idle", remaining: 5 });
  assert.deepEqual(toScenarioView(null, 5, NOW), { state: "limit" });
  assert.deepEqual(toScenarioView(null, 7, NOW), { state: "limit" });
});

test("만드는 중은 10분까지만 만드는 중으로 보이고, 더 오래되면 실패로 본다(서버가 멈춘 줄을 영원히 기다리지 않음)", () => {
  assert.deepEqual(toScenarioView(row({ status: "generating", createdAt: "2026-11-19T04:55:00Z", body: null }), 1, NOW), { state: "generating" });
  assert.deepEqual(toScenarioView(row({ status: "generating", createdAt: "2026-11-19T04:49:00Z", body: null }), 1, NOW), { state: "failed", canRetry: true });
});

test("실패는 다시 요청할 수 있는지(오늘 남은 횟수)와 함께 보여 준다", () => {
  assert.deepEqual(toScenarioView(row({ status: "failed", body: null }), 2, NOW), { state: "failed", canRetry: true });
  assert.deepEqual(toScenarioView(row({ status: "failed", body: null }), 5, NOW), { state: "failed", canRetry: false });
});

test("완료는 비교표(코드가 채운 값)·적용 단계·위험·출처를 화면 값으로 바꾼다(출처는 http(s)만 링크)", () => {
  const view = toScenarioView(row(), 1, NOW);
  assert.equal(view.state, "done");
  if (view.state !== "done") return;
  assert.equal(view.createdAtLabel, "11월 19일 14:02");
  assert.deepEqual(view.steps, ["버전을 올려요."]);
  assert.deepEqual(view.risks, ["연결이 달라질 수 있어요."]);
  assert.deepEqual(view.comparison?.headers, { mine: "사용 중인 항목 mcp-remote", theirs: "대체 supergateway" });
  assert.deepEqual(view.comparison?.rows[0].mine, { value: "원격 연결", source: "https://example.com/m", sourceIsLink: true });
  assert.deepEqual(view.comparison?.rows[0].theirs, { value: "찾지 못함", source: null, sourceIsLink: false });
  assert.deepEqual(view.sources, [{ text: "https://example.com/a", isLink: true }, { text: "mcp-registry", isLink: false }]); // 글자가 아닌 값은 버림
});

test("비교표가 없는 시나리오(대체 기술 없음)도 완료로 보인다", () => {
  const view = toScenarioView(row({ body: { ...validBody(), comparison: null } }), 1, NOW);
  assert.equal(view.state === "done" && view.comparison, null);
});

test("javascript: 같은 주소는 링크가 아니라 글자로만 보인다", () => {
  const view = toScenarioView(row({ sources: ["javascript:alert(1)"] }), 1, NOW);
  assert.deepEqual(view.state === "done" && view.sources, [{ text: "javascript:alert(1)", isLink: false }]);
});

test("완료인데 본문이 깨졌으면(단계·위험이 글자 목록이 아님) 완료로 보이지 않고 실패로 본다", () => {
  for (const body of [null, "글", { ...validBody(), steps: "한 줄" }, { ...validBody(), risks: [] }, { ...validBody(), steps: [3] }]) {
    assert.deepEqual(toScenarioView(row({ body }), 1, NOW), { state: "failed", canRetry: true }, JSON.stringify(body));
  }
});
