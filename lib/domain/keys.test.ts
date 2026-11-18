import { test } from "node:test";
import assert from "node:assert/strict";
import { mcpServerKey, npmKey, pypiKey, splitNpmSpec } from "./tech-key.ts";
import { changeKey, firstSeenAlertKey, opportunityKey } from "./dedupe-key.ts";

test("npx 실행 명령에서 패키지와 버전을 뽑는다(스코프 패키지 포함)", () => {
  assert.deepEqual(mcpServerKey({ command: "npx", args: ["-y", "mcp-remote@0.1.15"] }), { key: "npm:mcp-remote", version: "0.1.15" });
  assert.deepEqual(splitNpmSpec("@modelcontextprotocol/inspector@0.14.0"), { name: "@modelcontextprotocol/inspector", version: "0.14.0" });
  assert.deepEqual(splitNpmSpec("@scope/pkg"), { name: "@scope/pkg", version: null });
});

test("uvx·pipx run은 PyPI 키, 원격 주소는 호스트 키, 모르는 실행은 찾지 못함", () => {
  assert.equal(mcpServerKey({ command: "uvx", args: ["mcp-server-git"] })?.key, "pypi:mcp-server-git");
  assert.equal(mcpServerKey({ command: "pipx", args: ["run", "Some_Pkg"] })?.key, "pypi:some-pkg");
  assert.equal(mcpServerKey({ url: "https://Mcp.Example.com/sse" })?.key, "url:mcp.example.com");
  assert.equal(mcpServerKey({ command: "node", args: ["./my-server.js"] }), null);
});

test("PyPI 이름은 대소문자·구분 기호가 달라도 같은 키", () => {
  assert.equal(pypiKey("Claude_Agent.SDK").key, pypiKey("claude-agent-sdk").key);
});

test("같은 변경은 같은 키(불변 3), 다시 위험해지면 회차로 새 키", () => {
  const t = npmKey("mcp-remote", "0.1.15");
  assert.equal(changeKey(t, "GHSA-6xpm-ggf7-wc3p"), changeKey(npmKey("mcp-remote", "0.1.15"), "GHSA-6xpm-ggf7-wc3p"));
  assert.notEqual(changeKey(t, "GHSA-6xpm-ggf7-wc3p", 1), changeKey(t, "GHSA-6xpm-ggf7-wc3p", 2));
  assert.notEqual(firstSeenAlertKey(t, "GHSA-6xpm-ggf7-wc3p"), firstSeenAlertKey(npmKey("mcp-remote", "0.1.16"), "GHSA-6xpm-ggf7-wc3p"));
  assert.equal(opportunityKey(npmKey("a"), npmKey("b")), "opp:npm:a->npm:b");
});
