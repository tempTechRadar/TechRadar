import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMs, nodeDetail } from "./detail.ts";
import type { FlowNode, StepDetail } from "./types.ts";

const node: FlowNode = { id: "fetch_osv", type: "api", name: "취약점 가져오기", badge: "OSV", config: { source: "osv", batch: true, files: ["a", "b"] } };
const FAKE = "ghp_" + "a1B2c3D4e5F6g7H8i9J0";

test("설정(config)을 칸마다 글로 보여 준다", () => {
  const d = nodeDetail(node, []);
  assert.deepEqual(d.config, [{ label: "source", value: "osv" }, { label: "batch", value: "true" }, { label: "files", value: "a, b" }]);
});

test("이 실행에 기록이 없으면 empty(회색 상자와 같은 뜻)", () => {
  const d = nodeDetail(node, [{ step_name: "grade", status: "succeeded" }]);
  assert.equal(d.empty, true);
  assert.deepEqual(d.steps, []);
});

test("호출 주소·응답 코드·걸린 시간·건수·오류를 한국어 이름으로 보여 준다", () => {
  const s: StepDetail = {
    step_name: "fetch_osv", status: "failed", input_summary: "기술 3개", output_summary: "2개 읽음",
    api_url: "https://api.osv.dev/v1/query", http_status: 503, duration_ms: 1500, count_in: 3, count_out: 2,
    branch_counts: { ok: 2, collect_error: 1 }, error_kind: "http_status", error_message: "서비스 불가",
  };
  const [v] = nodeDetail(node, [s]).steps;
  assert.equal(v.status, "실패");
  const get = (l: string) => v.fields.find((f) => f.label === l)?.value;
  assert.equal(get("들어온 것"), "기술 3개");
  assert.equal(get("나간 것"), "2개 읽음");
  assert.equal(get("호출 주소"), "https://api.osv.dev/v1/query");
  assert.equal(get("응답 코드"), "503");
  assert.equal(get("걸린 시간"), "2초");
  assert.equal(get("갈래"), "ok 2 / collect_error 1");
  assert.equal(get("오류 종류"), "상태 코드");
  assert.equal(get("오류 내용"), "서비스 불가");
});

test("비어 있는 칸은 보여 주지 않는다", () => {
  const [v] = nodeDetail(node, [{ step_name: "fetch_osv", status: "succeeded" }]).steps;
  assert.deepEqual(v.fields, []);
});

test("저장 때 못 가린 비밀값이 있어도 화면에는 가려서 보인다(새로 꺼내지 않음)", () => {
  const [v] = nodeDetail(node, [{ step_name: "fetch_osv", status: "failed", error_message: `토큰 ${FAKE}`, api_url: "https://x.dev/a?token=zzz999" }]).steps;
  const all = JSON.stringify(v);
  assert.equal(all.includes(FAKE), false);
  assert.equal(all.includes("zzz999"), false);
});

test("걸린 시간 글", () => {
  assert.equal(formatMs(400), "0.4초");
  assert.equal(formatMs(12_000), "12초");
  assert.equal(formatMs(125_000), "2분 5초");
});
