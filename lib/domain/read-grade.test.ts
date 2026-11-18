import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exactVersion, parseGithubRepo, readMcpJson, readPackageJson } from "./manifest.ts";
import { gradeFromOsv, type OsvVuln } from "./grade.ts";

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
