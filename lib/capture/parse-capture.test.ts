import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_LINES, parseCaptureLines } from "./parse-capture.ts";

test("패키지 주소·설치 명령은 기술 키로, GitHub 주소는 저장소로", () => {
  assert.deepEqual(parseCaptureLines([
    "https://www.npmjs.com/package/@modelcontextprotocol/inspector",
    "https://pypi.org/project/Mcp_Server-Time/",
    "https://github.com/Supabase-Community/supabase-mcp.git",
    "npx -y mcp-remote@0.1.16",
    "pip install fastmcp==2.0",
    "uvx mcp-server-time",
    'pip install "fastmcp[cli]"',
    "uv pip install Requests",
    "pnpm dlx @scope/tool@2",
  ].join("\n")).map((l) => (l.kind === "key" ? l.key : l.kind === "repo" ? `${l.owner}/${l.repo}` : l.kind)), [
    "npm:@modelcontextprotocol/inspector", "pypi:mcp-server-time", "supabase-community/supabase-mcp", "npm:mcp-remote", "pypi:fastmcp",
    "pypi:mcp-server-time", "pypi:fastmcp", "pypi:requests", "npm:@scope/tool",
  ]);
});

test("글은 이름으로, 영상·SNS 링크는 이름을 적어 달라고, 모르는 주소·너무 짧은 글은 이유와 함께", () => {
  const out = parseCaptureLines("context7\nhttps://youtu.be/abc\nhttps://example.com/x\na\n\n  context7  ");
  assert.deepEqual(out.map((l) => l.kind), ["name", "media", "bad", "bad"], "빈 줄·같은 줄은 한 번");
});

test(`한 번에 ${MAX_LINES}줄까지`, () => {
  assert.equal(parseCaptureLines(Array.from({ length: 30 }, (_, i) => `tool-${i}`).join("\n")).length, MAX_LINES);
});
