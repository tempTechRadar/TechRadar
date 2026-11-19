import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Reader } from "./actual.ts";
import { computeEdgeActual, type EdgeInput } from "./edge.ts";
import { EDGE_KINDS, scoreEdges, type EdgeCase } from "./edge-score.ts";

// 저장된 OSV 응답만 읽는다(네트워크 없음). 폴더 읽기는 경계 사례에서 쓰지 않는다
const reader: Reader = { readJson: (p) => JSON.parse(readFileSync(p, "utf8")), readDir: () => [] };
const G1 = "lib/domain/fixtures/osv-mcp-remote-0.1.15.json";
const G1_KEY = "change:npm:mcp-remote@0.1.15:GHSA-6xpm-ggf7-wc3p";

const osv = (reply: Extract<EdgeInput, { type: "osv-read" }>["reply"], prev: Partial<Extract<EdgeInput, { type: "osv-read" }>["prev"]> = {}): EdgeInput => ({
  type: "osv-read", package: "mcp-remote", ecosystem: "npm", techKey: "npm:mcp-remote", version: "0.1.15", reply,
  prev: { grade: "pass", evidenceIds: [], lastNonDangerAt: "2026-11-18T00:00:00Z", changes: [], ...prev },
});
const run = (input: EdgeInput) => computeEdgeActual({ id: "t", input }, reader);

test("OSV 404·모양이 다른 응답·연결 실패는 '수집 오류'다(변화 없음 아님, 불변 2). 끝나면 fetch를 되돌려 놓는다", async () => {
  const realFetch = globalThis.fetch;
  for (const reply of [{ status: 404, body: "" }, { status: 200, body: "[]" }, { status: 500, body: "oops" }, { throws: "network" as const }, { throws: "timeout" as const }]) {
    const a = await run(osv(reply));
    assert.deepEqual([a.outcome, a.event, a.error], ["수집 오류", false, undefined], JSON.stringify(reply));
  }
  assert.equal(globalThis.fetch, realFetch);
});

test("오류 종류는 비고로 남긴다(SPEC-8 종류)", async () => {
  assert.equal((await run(osv({ status: 429, body: "" }))).note, "rate_limited");
  assert.equal((await run(osv({ throws: "timeout" }))).note, "timeout");
});

test("OSV가 '취약점 없음'({})이라 답하고 전과 같으면 변화 없음, 전이 위험이면 바뀌었지만 사건 아님(SPEC-3.4)", async () => {
  assert.equal((await run(osv({ status: 200, body: "{}" }, { grade: "unknown" }))).outcome, "변화 없음");
  const fixed = await run(osv({ status: 200, body: "{}" }, { grade: "danger", evidenceIds: ["GHSA-6xpm-ggf7-wc3p"] }));
  assert.deepEqual([fixed.outcome, fixed.event], ["바뀜(사건 아님)", false]);
});

test("위험이 아니던 것이 위험이 되면 새 변경 1개(회차 1, 중복 막기 키), 이어지는 위험이면 새 변경 없음(SPEC-3.1)", async () => {
  const fresh = await run(osv({ fixture: G1 }));
  assert.deepEqual([fresh.outcome, fresh.event], [`새 변경 grade_to_danger r1 · ${G1_KEY}:r1`, true]);
  const again = await run(osv({ fixture: G1 }, { grade: "danger", evidenceIds: ["GHSA-6xpm-ggf7-wc3p"], changes: [{ id: "c1", kind: "grade_to_danger", causeId: "GHSA-6xpm-ggf7-wc3p", round: 1, createdAt: "2026-11-18T01:00:00Z" }] }));
  assert.deepEqual([again.outcome, again.event], ["위험 이어짐(새 변경 없음)", false]);
});

test("같은 위험을 두 번 읽어도 변경 1개·알림은 사람마다 1개(불변 3). 등급 저장이 실패한 뒤 다시 읽어도 같다", async () => {
  const usages = [
    { userId: "u1", myTechnologyId: "m1", techId: "npm:mcp-remote", isDemo: false, hidden: false, archived: false },
    { userId: "u2", myTechnologyId: "m2", techId: "npm:mcp-remote", isDemo: false, hidden: false, archived: false },
  ];
  const base = osv({ fixture: G1 }) as Extract<EdgeInput, { type: "osv-read" }>;
  for (const gradeSaveFails of [false, true]) {
    const a = await run({ ...base, type: "osv-read-twice", usages, firstReadAt: "2026-11-19T06:00:00Z", gradeSaveFails });
    assert.deepEqual([a.outcome, a.event], ["변경 1 · 알림 2", true], String(gradeSaveFails));
  }
});

test("적용 기회: 두 번 정하면 두 번째는 이미 있는 키라 새 알림 없음", async () => {
  const input: EdgeInput = {
    type: "opportunity", times: 2,
    change: { id: "c1", isSimulated: false },
    newTech: { id: "t-new", techKey: "npm:new", grade: "pass", status: "active", createdAt: "2026-11-19T00:00:00Z" },
    relations: [{ otherTechId: "t-mine", status: "confirmed", confirmedAt: "2026-11-01T00:00:00Z" }],
    usages: [{ userId: "u1", myTechnologyId: "m1", techId: "t-mine", techKey: "npm:mine", isDemo: false, hidden: false, archived: false, registeredAt: "2026-11-10T00:00:00Z" }],
  };
  assert.deepEqual([(await run(input)).outcome, (await run(input)).event], ["알림 1(u1)", true]);
});

test("판단: 이유가 짧은 보류는 입력 검사에서 거절(저장까지 안 감), 보류는 고친 버전을 저장하지 않음(SPEC-4.1). 저장 실패 쪽은 채점 밖", async () => {
  const refused = await run({ type: "judgment", decision: "hold", reason: "음", alertKind: "security", fixedVersion: "0.1.16" });
  assert.deepEqual([refused.outcome, refused.event], ["입력 검사 거절(저장 안 함)", false]);
  const held = await run({ type: "judgment", decision: "hold", reason: "다음 배포 때 올림", alertKind: "security", fixedVersion: "0.1.16" });
  assert.deepEqual([held.outcome, held.event], ["저장으로 넘김 · hold · 고친 버전 없음", true]);
});

test("응답 모양은 맞는데 등급으로 읽다 터지면 수집기(gradeOf)처럼 해석 실패 = 수집 오류", async () => {
  const a = await run(osv({ status: 200, body: JSON.stringify({ vulns: [{ id: "GHSA-x", database_specific: { severity: 5 } }] }) }));
  assert.deepEqual([a.outcome, a.event, a.note, a.error], ["수집 오류", false, "parse", undefined]);
});

test("이전 변경은 원인(별칭 포함)이 같을 때만 잇는다: 다른 원인이면 새 변경 r1, 별칭(CVE)으로 저장된 같은 원인이면 이어짐", async () => {
  const at = { grade: "danger" as const, evidenceIds: ["GHSA-6xpm-ggf7-wc3p"], lastNonDangerAt: "2026-11-17T00:00:00Z" };
  const other = await run(osv({ fixture: G1 }, { ...at, changes: [{ id: "c-b", kind: "grade_to_danger", causeId: "GHSA-bbbb-bbbb-bbbb", round: 1, createdAt: "2026-11-18T00:00:00Z" }] }));
  assert.deepEqual([other.outcome, other.event], [`새 변경 grade_to_danger r1 · ${G1_KEY}:r1`, true]);
  const alias = await run(osv({ fixture: G1 }, { ...at, changes: [{ id: "c-a", kind: "grade_to_danger", causeId: "CVE-2025-6514", round: 1, createdAt: "2026-11-18T00:00:00Z" }] }));
  assert.deepEqual([alias.outcome, alias.event], ["위험 이어짐(새 변경 없음)", false]);
});

const twoUsers = ["u1", "u2"].map((u) => ({ userId: u, myTechnologyId: `m-${u}`, techId: "npm:mcp-remote", isDemo: false, hidden: false, archived: false }));

test("이어지는 위험: 이미 알림을 받은 사람은 키(change:…:r1)로 걸러지고, 아직 못 받은 사람만 새 알림", async () => {
  const base = osv({ fixture: G1 }, {
    grade: "danger", evidenceIds: ["GHSA-6xpm-ggf7-wc3p"], lastNonDangerAt: "2026-11-17T00:00:00Z",
    changes: [{ id: "uuid-1", kind: "first_seen_danger", causeId: "GHSA-6xpm-ggf7-wc3p", round: 1, createdAt: "2026-11-18T00:00:00Z", alertedUsers: ["u1"] }],
  }) as Extract<EdgeInput, { type: "osv-read" }>;
  const a = await run({ ...base, type: "osv-read-twice", usages: twoUsers, firstReadAt: "2026-11-19T06:00:00Z", gradeSaveFails: false });
  assert.deepEqual([a.outcome, a.event], ["변경 0 · 알림 1", true]);
});

test("두 번 읽기 사이에 고쳐졌다 다시 위험: 첫 읽기의 '위험 아님' 등급 시각을 저장해 두 번째에 새 회차(r2)를 만든다", async () => {
  const base = osv({ status: 200, body: "{}" }, {
    grade: "danger", evidenceIds: ["GHSA-6xpm-ggf7-wc3p"], lastNonDangerAt: "2026-11-17T00:00:00Z",
    changes: [{ id: "uuid-1", kind: "grade_to_danger", causeId: "GHSA-6xpm-ggf7-wc3p", round: 1, createdAt: "2026-11-18T00:00:00Z", alertedUsers: ["u1", "u2"] }],
  }) as Extract<EdgeInput, { type: "osv-read" }>;
  const a = await run({ ...base, type: "osv-read-twice", secondReply: { fixture: G1 }, usages: twoUsers, firstReadAt: "2026-11-19T06:00:00Z", gradeSaveFails: false });
  assert.deepEqual([a.outcome, a.event], ["변경 1 · 알림 2", true]);
});

test("모르는 입력 종류는 짐작하지 않고 실패로 남긴다", async () => {
  const a = await computeEdgeActual({ id: "x", input: { type: "모름" } as unknown as EdgeInput }, reader);
  assert.match(a.error ?? "", /모르는 입력 종류: 모름/);
});

test("사례 하나가 터져도 멈추지 않고 실패로 남긴다", async () => {
  const a = await run(osv({ fixture: "없는/파일.json" }));
  assert.equal(a.event, false);
  assert.match(a.error ?? "", /ENOENT/);
});

const edges = (JSON.parse(readFileSync("eval/gold.json", "utf8")) as { edgeCases: EdgeCase[] }).edgeCases;

test("정답 파일 경계 사례: 여섯 종류가 다 있고, 사례마다 출처(SPEC·G·불변)가 있으며 id가 겹치지 않는다", () => {
  for (const kind of EDGE_KINDS) assert.ok(edges.some((c) => c.kind === kind), kind);
  for (const c of edges) {
    assert.ok(EDGE_KINDS.includes(c.kind), c.id);
    assert.match(c.source, /SPEC-|G\d|불변 \d/, c.id);
    assert.ok(c.expected.outcome.length > 0, c.id);
  }
  assert.equal(new Set(edges.map((c) => c.id)).size, edges.length);
  assert.ok(edges.every((c) => /^E-/.test(c.id)), "등급 사례(G…)와 id가 섞이지 않게 E-로 시작");
});

test("지금 경계 사례 전체 채점: 실행 실패 0, 정답과 다른 사례는 알고 있는 것만(debug-note에 적은 것)", async () => {
  const s = scoreEdges(edges, await Promise.all(edges.map((c) => computeEdgeActual(c, reader))));
  assert.equal(s.totals.failed, 0);
  assert.deepEqual(s.rows.filter((r) => r.verdict !== "맞음").map((r) => [r.id, r.verdict]), [["E-collect-next-page", "결과 다름"]]);
});
