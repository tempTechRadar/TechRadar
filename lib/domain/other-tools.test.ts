// PRD-F39: 다른 AI 도구(Cursor · VS Code · Gemini CLI)의 MCP 설정도 읽는다. 칸 이름만 다르고 서버 모양은 .mcp.json과 같다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REPO_FILES, readRepoFile } from "./manifest.ts";

const keys = (path: string, text: string) => readRepoFile(path, text).map((f) => [f.tech?.key ?? null, f.sourceFile]);

test("Cursor · Gemini CLI는 mcpServers, VS Code는 servers 칸에서 서버마다 하나(읽은 파일 이름이 출처)", () => {
  const mcp = JSON.stringify({ mcpServers: { a: { command: "npx", args: ["-y", "mcp-remote@0.1.16"] }, b: { url: "https://mcp.example.com/sse" } } });
  assert.deepEqual(keys(".cursor/mcp.json", mcp), [["npm:mcp-remote", ".cursor/mcp.json"], ["url:mcp.example.com", ".cursor/mcp.json"]]);
  assert.deepEqual(keys(".gemini/settings.json", JSON.stringify({ theme: "x", mcpServers: { t: { command: "uvx", args: ["mcp-server-time"] } } })), [["pypi:mcp-server-time", ".gemini/settings.json"]]);
  assert.deepEqual(keys(".vscode/mcp.json", JSON.stringify({ servers: { p: { type: "stdio", command: "npx", args: ["@playwright/mcp"] } } })), [["npm:@playwright/mcp", ".vscode/mcp.json"]]);
});

test("서버 칸이 없으면 빈 목록, JSON이 깨졌으면 던진다(그 파일만 수집 오류, 불변 2)", () => {
  assert.deepEqual(readRepoFile(".gemini/settings.json", JSON.stringify({ theme: "dark" })), []);
  assert.throws(() => readRepoFile(".cursor/mcp.json", "{ not json"));
});

test("다른 도구 설정은 Claude 설정 뒤에 읽는다(같은 서버면 .mcp.json 줄이 남게)", () => {
  assert.ok(REPO_FILES.indexOf(".mcp.json") < REPO_FILES.indexOf(".cursor/mcp.json"));
  assert.deepEqual(REPO_FILES.slice(-3), [".cursor/mcp.json", ".vscode/mcp.json", ".gemini/settings.json"]);
});

test("JSONC(주석 · 끝 쉼표 · BOM)도 읽고, 문자열 안의 // 는 그대로 둔다", () => {
  const text = '﻿{\n  // 회사 서버\n  "servers": {\n    "a": { "url": "https://x.example.com//mcp" }, /* 끝 쉼표 */\n  },\n}';
  assert.deepEqual(keys(".vscode/mcp.json", text), [["url:x.example.com", ".vscode/mcp.json"]]);
});

test("Gemini CLI의 httpUrl도 주소로 읽는다", () => {
  assert.deepEqual(keys(".gemini/settings.json", JSON.stringify({ mcpServers: { gh: { httpUrl: "https://api.githubcopilot.com/mcp/" } } })), [["url:api.githubcopilot.com", ".gemini/settings.json"]]);
});

test("서버 칸 · 서버가 객체가 아니면 그 파일만 수집 오류로 던진다(틀린 기술 줄을 만들지 않음)", () => {
  assert.throws(() => readRepoFile(".cursor/mcp.json", JSON.stringify({ mcpServers: "abc" })));
  assert.throws(() => readRepoFile(".vscode/mcp.json", JSON.stringify({ servers: [{ command: "npx" }] })));
  assert.throws(() => readRepoFile(".gemini/settings.json", JSON.stringify({ mcpServers: { a: "npx x" } })));
});

test("옵션 값(토큰 · git 주소 · ${input:…})은 기술 키가 되지 않는다: 패키지 이름 모양만, 없으면 찾지 못함(별명, 100자까지)", () => {
  const servers = {
    a: { command: "uvx", args: ["--from", "git+https://user:ghp_SECRET@github.com/o/r", "srv"] },
    b: { command: "npx", args: ["--key", "${input:key}"] },
    ["c".repeat(300)]: { command: "node", args: ["server.js"] },
  };
  const found = readRepoFile(".cursor/mcp.json", JSON.stringify({ mcpServers: servers }));
  assert.deepEqual(found.map((f) => f.tech?.key ?? null), ["pypi:srv", null, null]);
  assert.equal(found[2].name.length, 100);
  assert.ok(!JSON.stringify(found).includes("ghp_SECRET"), "토큰이 기술 이름 · 키에 남지 않는다");
});

test("옵션 값은 패키지 이름 모양이어도 건너뛴다(--key sk-abc123 realpkg → realpkg), -y 같은 켜기 옵션과 -p 패키지는 그대로", () => {
  const key = (args: string[], command = "npx") => readRepoFile(".cursor/mcp.json", JSON.stringify({ mcpServers: { a: { command, args } } }))[0].tech?.key ?? null;
  assert.equal(key(["--key", "sk-abc123", "realpkg"]), "npm:realpkg");
  assert.equal(key(["-y", "mcp-remote@0.1.16"]), "npm:mcp-remote");
  assert.equal(key(["--registry=https://r.example.com", "pkg-a"]), "npm:pkg-a");
  assert.equal(key(["-p", "@scope/tool", "tool-bin"]), "npm:@scope/tool");
  assert.equal(key(["--token", "ghp-ABC"]), null, "값만 있고 패키지가 없으면 찾지 못함");
  assert.equal(key(["--from", "git+https://x", "srv"], "uvx"), "pypi:srv");
});

test("첫 위치 인자만 패키지: --verbose pkg token → pkg(뒤의 token은 서버 인자), -- 에서 멈춤, 비밀값 모양은 기술 이름이 안 됨, args가 배열이 아니면 찾지 못함", () => {
  const key = (args: unknown, command = "npx") => readRepoFile(".cursor/mcp.json", JSON.stringify({ mcpServers: { a: { command, args } } }))[0].tech?.key ?? null;
  assert.equal(key(["--verbose", "pkg", "token-abc"]), "npm:pkg");
  assert.equal(key(["--", "pkg"]), null);
  assert.equal(key(["sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"]), null);
  assert.equal(key({ length: 1e9 }), null);
  assert.equal(key("npx mcp-remote"), null);
  assert.equal(key(["run", "black"], "pipx"), "pypi:black");
});
