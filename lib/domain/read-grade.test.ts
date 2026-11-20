import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exactVersion, parseGithubRepo, readMcpJson, readPackageJson } from "./manifest.ts";
import { cmpVersion, forPackage, gradeFromOsv, type OsvVuln } from "./grade.ts";

const osvMcpRemote = JSON.parse(readFileSync(new URL("./fixtures/osv-mcp-remote-0.1.15.json", import.meta.url), "utf8")) as { vulns: OsvVuln[] };

test("package.json에서 허용 목록의 AI 도구만 뽑는다(react 같은 일반 의존성은 빼고, PRD-F6)", () => {
  const found = readPackageJson(JSON.stringify({
    dependencies: { react: "19.0.0", "mcp-remote": "0.1.15", "@anthropic-ai/sdk": "^0.30.0" },
    devDependencies: { "@modelcontextprotocol/inspector": "0.14.0", typescript: "5.9.3" },
  }));
  assert.deepEqual(found.map((f) => [f.tech?.key, f.tech?.version, f.type]).sort(), [
    ["npm:@anthropic-ai/sdk", null, "sdk"],
    ["npm:@modelcontextprotocol/inspector", "0.14.0", "sdk"],
    ["npm:mcp-remote", "0.1.15", "mcp"],
  ]);
});

test("범위 버전은 실제 설치 버전을 모르므로 null", () => {
  assert.equal(exactVersion("0.1.15"), "0.1.15");
  assert.equal(exactVersion("^0.1.15"), null);
  assert.equal(exactVersion("latest"), null);
});

test(".mcp.json은 서버마다 하나, 모르는 실행은 별명만(찾지 못함)", () => {
  const found = readMcpJson(JSON.stringify({ mcpServers: {
    remote: { command: "npx", args: ["-y", "mcp-remote@0.1.15", "https://x.example/sse"] },
    mine: { command: "node", args: ["./server.js"] },
  } }));
  assert.deepEqual(found.map((f) => [f.tech?.key ?? null, f.tech?.version ?? null, f.name]), [
    ["npm:mcp-remote", "0.1.15", "mcp-remote"],
    [null, null, "mine"],
  ]);
  assert.throws(() => readMcpJson("{깨진"));
});

test(".mcp.json과 같은 모양의 다른 도구 설정도 같은 규칙으로 읽고 출처 파일 이름만 다르다(.cursor/mcp.json, PRD-F39)", () => {
  const text = JSON.stringify({ mcpServers: {
    a: { command: "npx", args: ["-y", "mcp-remote@0.1.15", "https://x.example/sse"] },
    b: { url: "https://mcp.example.com/sse" },
    c: { command: "node", args: ["./my.js"] },
  } });
  const cursor = readMcpJson(text, ".cursor/mcp.json");
  assert.deepEqual(cursor.map((f) => f.sourceFile), [".cursor/mcp.json", ".cursor/mcp.json", ".cursor/mcp.json"]);
  assert.deepEqual(cursor.map((f) => f.tech?.key ?? null), ["npm:mcp-remote", "url:mcp.example.com", null]);
  assert.deepEqual(readMcpJson(text).map((f) => f.sourceFile), [".mcp.json", ".mcp.json", ".mcp.json"], "이름을 안 주면 .mcp.json");
});

test("GitHub 주소만 받는다", () => {
  assert.deepEqual(parseGithubRepo("https://github.com/Owner/Repo.git"), { owner: "Owner", repo: "Repo", url: "https://github.com/owner/repo" });
  assert.equal(parseGithubRepo("https://gitlab.com/a/b"), null);
  assert.equal(parseGithubRepo("javascript:alert(1)"), null);
});

test("G1: mcp-remote 0.1.15는 위험, 원인 GHSA-6xpm-ggf7-wc3p, 0.1.16에서 고침(SPEC-10)", () => {
  const r = gradeFromOsv("0.1.15", osvMcpRemote.vulns);
  assert.equal(r.grade, "danger");
  assert.equal(r.causeId, "GHSA-6xpm-ggf7-wc3p");
  assert.equal(r.fixedVersion, "0.1.16");
  assert.match(r.reason, /CVE-2025-6514/);
});

test("고친 버전은 위험한 문제를 모두 고치는 가장 낮은 버전: 백포트 줄은 내 줄에서, 안 고친 게 있으면 null", () => {
  const high = (id: string, ...fixed: string[]): OsvVuln => ({
    id, database_specific: { severity: "HIGH" },
    affected: [{ ranges: [{ events: [{ introduced: "0" }, ...fixed.map((f) => ({ fixed: f }))] }] }],
  });
  assert.equal(gradeFromOsv("1.9.3", [high("A", "1.9.4"), high("B", "2.2.0", "1.30.0")]).fixedVersion, "1.30.0");
  assert.equal(gradeFromOsv("2.0.0", [high("B", "2.2.0", "1.30.0")]).fixedVersion, "2.2.0");
  assert.equal(gradeFromOsv("1.0.0", [high("A", "1.9.4"), high("C")]).fixedVersion, null);
  assert.equal(gradeFromOsv("1.9.10", [high("A", "1.10.0"), high("D", "1.9.12")]).fixedVersion, "1.10.0");
});

test("버전 비교: 사전 배포 < 정식 < post, 빌드(+…)는 무시, 숫자는 숫자로", () => {
  const order = ["1.0.0-alpha", "1.0.0-alpha.2", "1.0.0-beta.1", "1.0.0-rc.1", "1.0.0", "1.0.0.post1", "1.0.1", "1.9.9", "1.9.10", "2.0.0-beta.1", "2.0.0"];
  for (let i = 1; i < order.length; i++) assert.ok(cmpVersion(order[i - 1], order[i]) < 0, `${order[i - 1]} < ${order[i]}`);
  assert.equal(cmpVersion("1.0.0+build5", "1.0.0"), 0);
  assert.ok(cmpVersion("1.0rc1", "1.0") < 0);
  // 내 버전이 사전 배포여도 정식으로 고쳐졌다면 올릴 곳이 있다
  const high: OsvVuln = { id: "A", database_specific: { severity: "HIGH" }, affected: [{ ranges: [{ events: [{ introduced: "0" }, { fixed: "2.0.0" }] }] }] };
  assert.equal(gradeFromOsv("2.0.0-beta.1", [high]).fixedVersion, "2.0.0");
});

test("고친 버전은 조회한 패키지의 것만, GIT 범위의 커밋 해시는 버전이 아니다", () => {
  const sibling: OsvVuln = {
    id: "GHSA-sib", database_specific: { severity: "HIGH" },
    affected: [
      { package: { name: "langchain" }, ranges: [{ type: "ECOSYSTEM", events: [{ introduced: "0" }, { fixed: "0.3.37" }] }] },
      { package: { name: "@langchain/core" }, ranges: [{ type: "ECOSYSTEM", events: [{ introduced: "0" }, { fixed: "0.3.30" }] }] },
      { package: { name: "langchain" }, ranges: [{ type: "GIT", events: [{ introduced: "0" }, { fixed: "5f3c9e0000000000000000000000000000000000" }] }] },
    ],
  };
  assert.equal(gradeFromOsv("0.3.0", forPackage([sibling], "langchain")).fixedVersion, "0.3.37");
  assert.equal(gradeFromOsv("0.3.0", forPackage([sibling], "@langchain/core")).fixedVersion, "0.3.30");
  const pypi: OsvVuln = { id: "PY", affected: [{ package: { name: "typing_extensions" } }, { package: { name: "Other.Pkg" } }] };
  assert.deepEqual(forPackage([pypi], "typing-extensions")[0].affected, [{ package: { name: "typing_extensions" } }]);
});

test("버전을 모르면: 안 고친 HIGH는 위험, 고친 것뿐이면 주의", () => {
  assert.equal(gradeFromOsv(null, osvMcpRemote.vulns).grade, "caution");
  const open: OsvVuln = { id: "GHSA-open", database_specific: { severity: "HIGH" }, affected: [{ ranges: [{ events: [{ introduced: "0" }] }] }] };
  assert.equal(gradeFromOsv(null, [open]).grade, "danger");
});

test("MODERATE·심각도 없음은 주의, 취약점 없음은 저장소 확인 전이라 찾지 못함", () => {
  assert.equal(gradeFromOsv("1.0.0", [{ id: "GHSA-m", database_specific: { severity: "MODERATE" } }]).grade, "caution");
  assert.equal(gradeFromOsv("1.0.0", [{ id: "OSV-x" }]).grade, "caution");
  assert.equal(gradeFromOsv("0.1.16", []).grade, "unknown");
});
