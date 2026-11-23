import { test } from "node:test";
import assert from "node:assert/strict";
import { addPreset, BUILTIN_PRESETS, isLsJumpUp, LS_PICKS, MAX_SAVED, parsePresets } from "./presets.ts";
import { parseView, viewQuery } from "./view-config.ts";

test("기본 묶음은 보기 주소로 읽힌다: 입문자 추천 = MCP 뺀 종류, 보안 위험 = 위험·주의 + 등급 색", () => {
  const by = Object.fromEntries(BUILTIN_PRESETS.map((p) => [p.name, parseView(p.query)]));
  assert.deepEqual(by["입문자 추천"].filter.kinds, ["스킬", "플러그인", "개념", "개발 도구"]);
  assert.equal(by["이번 주 새 기술"].filter.period, "week");
  assert.deepEqual([by["보안 위험"].filter.risky, by["보안 위험"].color], [true, "grade"]);
  assert.deepEqual(by["내 관심"].filter.marks, ["interest"]);
});

test("저장: 같은 이름은 바꿔 쓰고 새것이 앞, 5개 넘으면 오래된 것부터 빠짐, 빈 이름은 무시", () => {
  let list = addPreset([], "보안", "risky=1");
  list = addPreset(list, "새것", "t=day");
  list = addPreset(list, "보안", "risky=1&c=grade");
  assert.deepEqual(list, [{ name: "보안", query: "risky=1&c=grade" }, { name: "새것", query: "t=day" }]);
  for (let i = 0; i < 6; i++) list = addPreset(list, `v${i}`, "");
  assert.equal(list.length, MAX_SAVED);
  assert.equal(list.at(-1)!.name, "v1");
  assert.deepEqual(addPreset(list, "   ", "t=day"), list);
});

test("브라우저 값은 믿지 않는다: 깨진 JSON · 모양이 다른 줄은 버리고 이름은 20자로 자른다", () => {
  assert.deepEqual(parsePresets("{"), []);
  assert.deepEqual(parsePresets(null), []);
  assert.deepEqual(parsePresets(JSON.stringify([{ name: 1, query: "" }, { name: "가".repeat(30), query: "t=week" }, "x"])), [{ name: "가".repeat(20), query: "t=week" }]);
  assert.deepEqual(parsePresets(JSON.stringify([{ name: "a", query: "x".repeat(601) }])), []);
});

test("LS점프업(P-12p): 규칙(스킬 · 플러그인 · 개념 · 개발 도구 · AI 작업 방식) 또는 고른 목록, 해당 없으면 빠짐, 보기 주소 pick=ls", () => {
  const n = (type: string | null, techKey: string | null, field = "백엔드·데이터") => ({ type, techKey, attrs: { field } });
  for (const t of ["skill", "plugin", "concept", "sdk"]) assert.equal(isLsJumpUp(n(t, null)), true, t);
  assert.equal(isLsJumpUp(n("mcp", "npm:x", "AI 작업 방식")), true, "AI 작업 방식 분야");
  assert.equal(isLsJumpUp(n("mcp", [...LS_PICKS][0])), true, "고른 목록");
  assert.equal(isLsJumpUp(n("mcp", "npm:pg")), false, "해당 없음");
  assert.ok(BUILTIN_PRESETS.some((p) => p.name === "LS점프업" && parseView(p.query).filter.ls));
  assert.equal(viewQuery(parseView("pick=ls")).includes("pick=ls"), true, "주소로 다시 써도 남음");
});
