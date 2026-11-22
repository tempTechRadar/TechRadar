import assert from "node:assert/strict";
import test from "node:test";
import { COMPARABLE_FIELDS, toComparable } from "./comparable.ts";

// 비교표 사용량의 출처는 기술 키(tech_key)로 만든다. 읽는 칸에 tech_key가 빠지면 출처가 조용히 사라지므로 칸 목록을 확인한다.
test("비교 모드가 읽는 칸 목록에 tech_key가 있다", () => {
  assert.match(COMPARABLE_FIELDS, /(^|, )tech_key(,|$)/);
});

test("toComparable: tech_key를 techKey로 넘기고, 없으면 null", () => {
  const row = { grade: "pass", signals: { weekly_downloads: 5 } };
  assert.equal(toComparable({ ...row, tech_key: "npm:mcp-proxy" }).techKey, "npm:mcp-proxy");
  assert.equal(toComparable(row).techKey, null);
});
