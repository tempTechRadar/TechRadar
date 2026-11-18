// 등급 정답 사례 G1–G9(SPEC-10, 채점용). OSV 샘플은 2026-11-18에 실제로 조회한 응답(fixtures/), 스킬은 sim/skills/의 가상 글.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { forPackage, gradeFromOsv, type OsvVuln } from "./grade.ts";
import { gradeFromScan, scanRiskPatterns } from "./risk-patterns.ts";

const osv = (file: string) => (JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8")) as { vulns: OsvVuln[] }).vulns;

// [사례, 샘플, 내 버전, 원인(가장 앞선 HIGH·CRITICAL id), 모든 위험을 고치는 가장 낮은 버전]
// G2·G4는 처음 취약점의 고친 버전(0.14.1·1.9.4)보다 높은 곳에서야 나머지 HIGH가 고쳐진다.
const OSV_CASES: [string, string, string, string, string][] = [
  ["G1 mcp-remote", "osv-mcp-remote-0.1.15.json", "0.1.15", "GHSA-6xpm-ggf7-wc3p", "0.1.16"],
  ["G2 inspector", "osv-g2-inspector-0.14.0.json", "0.14.0", "GHSA-7f8r-222p-6f5g", "0.16.6"],
  ["G3 server-filesystem", "osv-g3-server-filesystem-2025.3.28.json", "2025.3.28", "GHSA-hc55-p739-j48w", "2025.7.1"],
  ["G4 mcp(PyPI)", "osv-g4-mcp-1.9.3.json", "1.9.3", "GHSA-3qhf-m339-9g5v", "1.28.1"],
];

for (const [name, file, version, causeId, fixedVersion] of OSV_CASES) {
  test(`${name} ${version}: 위험, 원인 ${causeId}, 고친 버전 ${fixedVersion}`, () => {
    const r = gradeFromOsv(version, osv(file));
    assert.deepEqual([r.grade, r.causeId, r.fixedVersion], ["danger", causeId, fixedVersion]);
  });
}

const g5 = (JSON.parse(readFileSync(new URL("./fixtures/osv-g5-latest.json", import.meta.url), "utf8")) as {
  results: { name: string; version: string; vulns: OsvVuln[] }[];
}).results;

// 2026-11-18 조회 기록이라 그 뒤 새로 생긴 취약점은 잡지 못한다. 구현 때 다시 조회하는 건 SPEC-10의 약속(채점 때 확인).
test("G5: 네 패키지의 최신 버전은 OSV에 알려진 문제 0건 → 지금은 저장소 정보 확인 전이라 OSV만으로는 찾지 못함", () => {
  assert.equal(g5.length, 4);
  for (const { name, version, vulns } of g5) {
    const r = gradeFromOsv(version, forPackage(vulns, name));
    assert.deepEqual([name, r.evidence.length, r.grade], [name, 0, "unknown"]);
  }
});

test.todo("G5 기대 등급 '통과': 저장소 정보(P-9)를 확인하는 코드가 합쳐지면 위 시험을 통과로 바꾼다");

const SKILLS = new URL("../../sim/skills/", import.meta.url);

function scanSkill(dir: string) {
  const root = new URL(`${dir}/`, SKILLS);
  const files = readdirSync(root, { recursive: true, encoding: "utf8" })
    .map((p) => p.replaceAll("\\", "/"))
    .filter((rel) => statSync(new URL(rel, root)).isFile())
    .map((rel) => ({ path: rel, text: readFileSync(new URL(rel, root), "utf8") }));
  const result = scanRiskPatterns(files);
  return { findings: result.findings, grade: gradeFromScan(result, files.length).grade };
}

test("G6 시험용 스킬 A(curl | sh): 위험, P1만", () => {
  const { findings, grade } = scanSkill("skill-a-remote-exec");
  assert.deepEqual([grade, findings.map((f) => [f.pattern, f.file])], ["danger", [["P1", "SKILL.md"]]]);
});

test("G7 시험용 스킬 B(.env를 읽어 바깥 주소로): 위험, P2만, 보낸 줄과 읽은 줄이 이유에", () => {
  const { findings, grade } = scanSkill("skill-b-secret-leak");
  assert.deepEqual([grade, findings.map((f) => [f.pattern, f.file, f.line, f.detail])], ["danger", [["P2", "scripts/sync.py", 6, "비밀값을 읽는 곳: 5째 줄"]]]);
});

test("G8 시험용 스킬 C(Bash(*)): 주의, P3만", () => {
  const { findings, grade } = scanSkill("skill-c-wide-permission");
  assert.deepEqual([grade, findings.map((f) => f.pattern)], ["caution", ["P3"]]);
});

test("G9 시험용 스킬 D(패턴 없음): 통과, 발견 0건", () => {
  const { findings, grade } = scanSkill("skill-d-clean");
  assert.deepEqual([grade, findings.length], ["pass", 0]);
});
