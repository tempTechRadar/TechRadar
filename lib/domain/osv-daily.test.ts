import { test } from "node:test";
import assert from "node:assert/strict";
import type { GradeResult } from "./grade.ts";
import { causeIdsOf, evidenceIds, groupTargets, isChanged, planDanger, type LatestChange, type MyTechRow } from "./osv-daily.ts";

const row = (over: Partial<MyTechRow> = {}): MyTechRow => ({ techId: "t1", techKey: "npm:zod", version: "1.0.0", grade: "unknown", gradedAt: null, evidence: null, checkedAt: null, ...over });

test("groupTargets: 같은 기술·같은 버전은 사람이 여럿이어도 한 번만 묻는다. 버전이 다르거나 버전을 모르면 따로", () => {
  const targets = groupTargets([row(), row(), row(), row({ version: "2.0.0" }), row({ version: null }), row({ techId: "t2", techKey: "npm:other" })]);
  assert.deepEqual(targets.map((t) => [t.techId, t.version]).sort(), [["t1", null], ["t1", "1.0.0"], ["t1", "2.0.0"], ["t2", "1.0.0"]]);
});

test("groupTargets: npm·pypi 키만 OSV 생태계와 이름으로 바꾼다(스코프 패키지·PyPI 정규화 이름 포함). 다른 종류는 뺀다", () => {
  const targets = groupTargets([
    row({ techId: "a", techKey: "npm:@modelcontextprotocol/sdk" }),
    row({ techId: "b", techKey: "pypi:some-pkg" }),
    row({ techId: "c", techKey: "mcp:io.x/y" }),
    row({ techId: "d", techKey: "skill:o/r/s" }),
  ]);
  assert.deepEqual(targets.map((t) => [t.ecosystem, t.name]).sort(), [["PyPI", "some-pkg"], ["npm", "@modelcontextprotocol/sdk"]]);
});

test("groupTargets: 이전 등급은 위험인 줄이 하나라도 있으면 위험, 아니면 가장 최근에 등급을 매긴 줄, 매긴 적이 없으면 unknown", () => {
  const prev = (rows: MyTechRow[]) => groupTargets(rows)[0].prevGrade;
  assert.equal(prev([row({ grade: "pass", gradedAt: "2026-11-18T00:00:00Z" }), row({ grade: "danger", gradedAt: "2026-11-10T00:00:00Z" })]), "danger");
  assert.equal(prev([row({ grade: "pass", gradedAt: "2026-11-10T00:00:00Z" }), row({ grade: "caution", gradedAt: "2026-11-18T00:00:00Z" })]), "caution");
  assert.equal(prev([row(), row()]), "unknown");
});

test("groupTargets: 이전 근거는 이전 등급을 고른 줄의 것", () => {
  const [t] = groupTargets([row({ grade: "unknown" }), row({ grade: "danger", gradedAt: "2026-11-10T00:00:00Z", evidence: [{ id: "GHSA-b" }, { id: "GHSA-a" }] })]);
  assert.deepEqual(t.prevEvidenceIds, ["GHSA-a", "GHSA-b"]);
});

test("groupTargets: 마지막으로 위험이 아니라고 등급을 매긴 시각(위험인 줄·등급을 매긴 적 없는 줄은 셈에서 뺀다)", () => {
  const last = (rows: MyTechRow[]) => groupTargets(rows)[0].lastNonDangerAt;
  assert.equal(last([row({ grade: "unknown", gradedAt: "2026-11-10T00:00:00Z" }), row({ grade: "caution", gradedAt: "2026-11-18T00:00:00Z" })]), "2026-11-18T00:00:00Z");
  assert.equal(last([row({ grade: "danger", gradedAt: "2026-11-18T00:00:00Z" }), row()]), null);
  assert.equal(last([row(), row()]), null);
});

test("groupTargets: 가장 오래 안 본 것(확인 시각이 없으면 맨 먼저)부터, 같으면 키 순서로 — 순서가 늘 같다", () => {
  const targets = groupTargets([
    row({ techId: "t3", techKey: "npm:a", checkedAt: "2026-11-18T00:00:00Z" }),
    row({ techId: "t1", techKey: "npm:b", checkedAt: "2026-11-10T00:00:00Z" }),
    row({ techId: "t2", techKey: "npm:c" }),
    row({ techId: "t2", techKey: "npm:c", checkedAt: "2026-11-18T00:00:00Z" }), // 같은 조합의 다른 줄은 안 본 적이 있으면 그것이 기준
    row({ techId: "t4", techKey: "npm:d", checkedAt: "2026-11-10T00:00:00Z" }), // 확인 시각이 같으면 키 순서(b 다음 d)
  ]);
  assert.deepEqual(targets.map((t) => t.techKey), ["npm:c", "npm:b", "npm:d", "npm:a"]);
});

test("evidenceIds: 근거 id를 정렬해 모은다. 배열이 아니거나 id가 없으면 빈 목록", () => {
  assert.deepEqual(evidenceIds([{ id: "b" }, { id: "a" }]), ["a", "b"]);
  for (const bad of [null, undefined, "x", 5, {}, [null, 3, { id: 4 }, {}]]) assert.deepEqual(evidenceIds(bad), [], String(bad));
});

test("isChanged: 등급이 다르거나 근거 id 목록이 다르면 바뀐 것, 둘 다 같으면 아니다", () => {
  const [t] = groupTargets([row({ grade: "caution", gradedAt: "2026-11-18T00:00:00Z", evidence: [{ id: "a" }] })]);
  assert.equal(isChanged(t, "caution", ["a"]), false);
  assert.equal(isChanged(t, "danger", ["a"]), true);
  assert.equal(isChanged(t, "caution", ["a", "b"]), true);
  assert.equal(isChanged(t, "caution", []), true);
});

const latest = (round: number, createdAt: string): LatestChange => ({ id: `c${round}`, round, createdAt });
const LAST_OK = "2026-11-18T00:00:00Z"; // 마지막으로 위험이 아니라고 매긴 시각

test("planDanger: 변경이 하나도 없으면 새로 만든다 — 위험이 아니라고 매긴 적이 있으면 grade_to_danger, 없으면(가져오기·저장 실패 뒤) first_seen_danger, 회차 1", () => {
  assert.deepEqual(planDanger({ lastNonDangerAt: LAST_OK }, null), { reuse: null, create: { kind: "grade_to_danger", round: 1 } });
  assert.deepEqual(planDanger({ lastNonDangerAt: null }, null), { reuse: null, create: { kind: "first_seen_danger", round: 1 } });
});

test("planDanger: 위험이 아니라고 매긴 뒤에 생긴 변경이면 그 위험은 이어지는 중이다 — 새로 만들지 않고 그 변경을 쓴다(앞 실행에서 등급 저장이 실패했어도 같은 결과, 회차 2 이상도 마찬가지)", () => {
  const afterRecovery = latest(2, "2026-11-19T05:00:00Z");
  assert.deepEqual(planDanger({ lastNonDangerAt: LAST_OK }, afterRecovery), { reuse: afterRecovery, create: null });
});

test("planDanger: 위험이 아니라고 매긴 적이 없으면(모두 위험이거나 가져와 등급 전인 줄뿐) 변경이 있기만 하면 이어지는 중이다", () => {
  const old = latest(1, "2026-11-01T00:00:00Z");
  assert.deepEqual(planDanger({ lastNonDangerAt: null }, old), { reuse: old, create: null });
});

test("planDanger: 변경 뒤에 위험이 아니라고 매긴 기록이 있으면 고쳐졌다 다시 위험해진 것 — 회차를 하나 올려 새 grade_to_danger(SPEC-3.1)", () => {
  assert.deepEqual(planDanger({ lastNonDangerAt: LAST_OK }, latest(1, "2026-11-10T00:00:00Z")), { reuse: null, create: { kind: "grade_to_danger", round: 2 } });
  assert.deepEqual(planDanger({ lastNonDangerAt: LAST_OK }, latest(4, "2026-11-10T00:00:00Z")), { reuse: null, create: { kind: "grade_to_danger", round: 5 } });
});

test("planDanger: 시각은 표기가 달라도(Z와 +00:00) 같은 순간으로 비교한다", () => {
  assert.equal(planDanger({ lastNonDangerAt: "2026-11-18T00:00:00.000Z" }, latest(1, "2026-11-18T00:00:01.000+00:00")).create, null);
  assert.notEqual(planDanger({ lastNonDangerAt: "2026-11-18T00:00:02.000Z" }, latest(1, "2026-11-18T00:00:01.000+00:00")).create, null);
});

const result = (over: Partial<GradeResult>): Pick<GradeResult, "causeId" | "evidence"> => ({ causeId: "GHSA-new", evidence: [], ...over });

test("causeIdsOf: 원인 취약점의 id와 별칭(CVE·PYSEC·GHSA)을 모은다 — 같은 취약점이 다른 이름으로 다시 올라와도 같은 위험으로 알아본다", () => {
  const ev = (id: string, aliases: string[]) => ({ id, aliases, severity: "HIGH", fixed: null, url: "" });
  assert.deepEqual(causeIdsOf(result({ evidence: [ev("GHSA-new", ["PYSEC-1", "CVE-1", "PYSEC-1"]), ev("OTHER", ["CVE-9"])] })), ["GHSA-new", "PYSEC-1", "CVE-1"]);
  assert.deepEqual(causeIdsOf(result({ evidence: [ev("OTHER", ["CVE-9"])] })), ["GHSA-new"]);
  assert.deepEqual(causeIdsOf(result({ causeId: null })), []);
});
