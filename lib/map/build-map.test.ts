import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTechMap, hostOf, hostOfSource, labelOf, type MapInput } from "./build-map.ts";

import { NOW, ago, mine, tech } from "./test-fixtures.ts";

const categories = [{ id: "big-data", name: "백엔드·데이터", parentId: null }, { id: "small-db", name: "DB", parentId: "big-data" }, { id: "big-design", name: "디자인", parentId: null }];
const input = (o: Partial<MapInput>): MapInput => ({ mine: [], techs: [], relations: [], categories, ...o });

test("프로젝트가 있으면 내 기술을 합치고(등급은 가장 나쁜 것), 확정된 비교군은 한 단계만 잇고, 모은 기술은 모두 남긴다(ADR 0027)", () => {
  const m = buildTechMap(input({
    mine: [mine("m1", "a"), mine("m2", "a", { projectId: "p2", projectName: "다른 앱", grade: "danger", gradeReason: "취약점" })],
    techs: [tech("a"), tech("b"), tech("c")],
    relations: [{ a: "a", b: "b", quote: "둘 다 DB 연결" }, { a: "b", b: "c", quote: null }], // b-c는 내 기술과 닿지 않아 두 단계 → 선을 긋지 않음
    marks: [{ techId: "c", status: "hold", reason: "다음 달에 보기" }],
  }), NOW);
  assert.equal(m.mode, "mine");
  assert.deepEqual(m.nodes.map((n) => [n.key, n.mine, n.nearMine]), [["tech:a", true, false], ["tech:b", false, true], ["tech:c", false, false]]);
  assert.deepEqual(m.quotes, { "tech:a|tech:b": "둘 다 DB 연결" });
  assert.deepEqual(m.nodes[2].mark, { techId: "c", status: "hold", reason: "다음 달에 보기" });
  const a = m.nodes[0];
  assert.deepEqual([a.mine, a.grade, a.gradeReason, a.myTechIds, a.projectNames, a.attrs.grade, a.attrs.project], [true, "danger", "취약점", ["m1", "m2"], ["앱", "다른 앱"], "위험", "여러 프로젝트"]);
  assert.equal(a.catalogGrade, "pass", "판단 줄은 DB 규칙과 같은 카탈로그 등급을 본다");
  assert.deepEqual(m.edges, [["tech:a", "tech:b"]]);
});

test("공식 표시는 카탈로그 칸이 true일 때만: 칸이 없는 기술 · 이름만 넣은 내 기술은 공식 아님", () => {
  const m = buildTechMap(input({ mine: [mine("m1", null, { manualName: "직접 넣은 것" })], techs: [tech("a", { official: true }), tech("b")] }), NOW);
  assert.deepEqual(m.nodes.map((n) => [n.name, n.official]).sort(), [["a", true], ["b", false], ["직접 넣은 것", false]]);
});

test("묶기 기준 값: 작은 갈래는 큰 갈래 아래로, 갈래가 없으면 '분류 전', 종류는 한국어", () => {
  const m = buildTechMap(input({ techs: [tech("a"), tech("b", { categoryId: "big-design", type: "skill", techKey: "skill:x/y/b" }), tech("c", { categoryId: null })] }), NOW);
  const by = Object.fromEntries(m.nodes.map((n) => [n.name, n.attrs]));
  assert.deepEqual([by.a.field, by.a.sub, by.a.kind], ["백엔드·데이터", "DB", "MCP"]);
  assert.deepEqual([by.b.field, by.b.sub, by.b.kind, by.b.host], ["디자인", "아직 분류 안 됨", "스킬", "Claude Code"]);
  assert.deepEqual([by.c.field, by.c.sub], ["아직 분류 안 됨", "아직 분류 안 됨"]);
});

test("쓰는 곳은 칸이 있으면 그대로, 비면 기술 키·종류로 추정하고 추정이라고 표시", () => {
  assert.deepEqual(hostOf("mcp:x", "mcp", ["Cursor"]), { host: "Cursor", guessed: false });
  assert.deepEqual(hostOf("skill:a/b/c", "skill", null), { host: "Claude Code", guessed: true });
  assert.deepEqual(hostOf("npm:zod", "sdk", []), { host: "앱 코드", guessed: true });
  assert.deepEqual(hostOf(null, null, null), { host: "모름", guessed: true });
});

test("같은 역할이 하나도 없는 내 기술은 외톨이, 이름만 추가한 기술은 분류 전·종류 모름", () => {
  const m = buildTechMap(input({ mine: [mine("m1", "a"), mine("m2", null, { manualName: "My Tool", grade: "unknown" })], techs: [tech("a")] }), NOW);
  const manual = m.nodes.find((n) => n.key === "name:my tool")!;
  assert.deepEqual([manual.lonely, manual.attrs.field, manual.attrs.kind], [true, "아직 분류 안 됨", "직접 넣은 것"]);
});

test("NEW는 카탈로그에 들어온 지 7일 안, 수집 오류는 '업데이트 n일 전'이 아니라 '수집 오류'(불변 2)", () => {
  const m = buildTechMap(input({ techs: [tech("a", { createdAt: ago(2) }), tech("b", { createdAt: ago(9), collectErrorKind: "http_5xx" })] }), NOW);
  assert.deepEqual(m.nodes.map((n) => [n.isNew, n.label]), [[true, "업데이트 3일 전"], [false, "수집 오류"]]);
  assert.equal(labelOf(null, null, NOW), "업데이트 모름");
  const firstFill = buildTechMap(input({ techs: [tech("a", { createdAt: ago(2) }), tech("b", { createdAt: ago(1) })], newSince: ago(1.5) }), NOW);
  assert.deepEqual(firstFill.nodes.map((n) => n.isNew), [false, true], "처음 채운 날 들어온 것은 NEW가 아니다");
});

test("같은 입력이면 같은 결과(입력 순서가 달라도)", () => {
  const i = input({ mine: [mine("m1", "a"), mine("m2", "b")], techs: [tech("a"), tech("b"), tech("c")], relations: [{ a: "a", b: "c", quote: null }] });
  assert.deepEqual(buildTechMap(i, NOW), buildTechMap({ ...i, mine: [...i.mine].reverse(), techs: [...i.techs].reverse() }, NOW));
});

test("내 프로젝트로 묶을 값: 이름이 같은 두 프로젝트는 갈라 보이고, 한 프로젝트만 쓰면 그 이름", () => {
  const m = buildTechMap(input({
    mine: [mine("m1", "a", { projectId: "aaaa-1", projectName: "web" }), mine("m2", "b", { projectId: "bbbb-2", projectName: "web" }), mine("m3", "c", { projectId: "cccc-3", projectName: "앱" })],
    techs: [tech("a"), tech("b"), tech("c")],
  }), NOW);
  assert.deepEqual(m.nodes.map((n) => n.attrs.project), ["web (aaaa)", "web (bbbb)", "앱"]);
});

test("내 기술의 쓰는 곳은 읽은 파일로 안다(추정 아님, PRD-F39): Cursor · VS Code · Gemini CLI · Claude Code · 앱 코드", () => {
  assert.deepEqual([".cursor/mcp.json", ".vscode/mcp.json", ".gemini/settings.json", ".mcp.json", ".claude/skills/x", "package.json", null].map(hostOfSource),
    ["Cursor", "VS Code", "Gemini CLI", "Claude Code", "Claude Code", "앱 코드", null]);
  const m = buildTechMap(input({ mine: [mine("m1", "a", { sourceFile: ".cursor/mcp.json" })], techs: [tech("a")] }), NOW);
  assert.deepEqual([m.nodes[0].attrs.host, m.nodes[0].hostGuessed], ["Cursor", false]);
});

test("쓰는 곳: 카탈로그가 정한 값은 그대로, 정하지 않았으면 읽은 파일로, 다른 도구 파일에서도 쓰면 여러 도구", () => {
  const set = buildTechMap(input({ mine: [mine("m1", "a", { sourceFile: "package.json" })], techs: [tech("a", { hosts: ["Claude Code"] })] }), NOW);
  assert.equal(set.nodes[0].attrs.host, "Claude Code", "관리자가 정한 쓰는 곳은 덮어쓰지 않는다");
  const two = buildTechMap(input({ mine: [mine("m1", "a", { sourceFile: ".cursor/mcp.json" }), mine("m2", "a", { projectId: "p2", sourceFile: ".mcp.json" })], techs: [tech("a")] }), NOW);
  assert.equal(two.nodes[0].attrs.host, "여러 도구");
});

test("개념(작업 방식) 노드는 등급 칸이 '등급 없음'이다: 카탈로그 줄 · 내 기술 줄 둘 다(ADR 0008)", () => {
  const concept = tech("h", { type: "concept", techKey: "concept:harness", grade: "unknown" });
  const m = buildTechMap(input({ techs: [concept, tech("x", { grade: "unknown" })], mine: [mine("m1", "h", { grade: "unknown" })] }), NOW);
  assert.deepEqual(m.nodes.map((n) => [n.key, n.attrs.grade]), [["tech:h", "등급 없음"], ["tech:x", "찾지 못함"]]);
});

test("지도 NEW 표시는 인기 상위만 남기고, 내 기술은 늘 NEW", async () => {
  const { capNew } = await import("./build-map.ts");
  const m = buildTechMap(input({
    mine: [mine("m1", "c")],
    techs: [tech("a", { createdAt: ago(1), signals: { stars: 900 } }), tech("b", { createdAt: ago(1), signals: { stars: 10 } }), tech("c", { createdAt: ago(1) }), tech("d", { createdAt: ago(1), signals: { stars: 50 } })],
  }), NOW);
  const capped = capNew(m, 2);
  assert.deepEqual(capped.nodes.filter((n) => n.isNew).map((n) => n.name).sort(), ["a", "c", "d"]);
  assert.equal(m.nodes.filter((n) => n.isNew).length, 4); // 원래 모델은 그대로
});

test("여러 프로젝트에서 쓰는 내 기술의 확인 시각은 가장 오래된 것, 하나라도 확인한 적 없으면 없음(최근 확인으로 부풀리지 않게)", () => {
  const two = (a: string | null, b: string | null) => buildTechMap(input({
    mine: [mine("m1", "a", { lastCheckedOkAt: a }), mine("m2", "a", { projectId: "p2", projectName: "다른 앱", lastCheckedOkAt: b })], techs: [tech("a")],
  }), NOW).nodes[0].lastCheckedOkAt;
  assert.equal(two("2026-11-22T00:00:00Z", "2026-11-20T00:00:00Z"), "2026-11-20T00:00:00Z");
  assert.equal(two("2026-11-20T00:00:00Z", "2026-11-22T00:00:00Z"), "2026-11-20T00:00:00Z", "순서와 상관없이");
  assert.equal(two("2026-11-22T00:00:00Z", null), null);
});
