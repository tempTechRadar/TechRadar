import { test } from "node:test";
import assert from "node:assert/strict";
import { detectConcepts, detectServices, fixedNote } from "./services.ts";
import { gradeText } from "./my-tech-view.ts";

const pkg = (deps: Record<string, string>, dev: Record<string, string> = {}) => ({ path: "package.json", text: JSON.stringify({ dependencies: deps, devDependencies: dev }) });

test("SDK로 연동 서비스를 찾는다: 키 service:<이름>, 근거 파일. 공식 MCP 한 줄과 레지스트리 근거 링크는 화면용(카탈로그에 쓰지 않음)", () => {
  const found = detectServices([pkg({ "@supabase/supabase-js": "^2", react: "^19" }, { "@sentry/nextjs": "^8" })], []);
  assert.deepEqual(found.map((f) => [f.tech!.key, f.name, f.type, f.sourceFile]), [
    ["service:supabase", "Supabase", "service", "package.json"], ["service:sentry", "Sentry", "service", "package.json"],
  ]);
  assert.deepEqual(fixedNote(found[0].tech!.key), {
    text: "공식 MCP 서버(com.supabase/mcp)가 있어 AI 도구와 연결할 수 있어요",
    source: "https://registry.modelcontextprotocol.io/v0.1/servers?search=com.supabase%2Fmcp",
  });
  assert.equal(fixedNote("npm:react"), null);
  assert.equal(fixedNote("service:없는것"), null);
});

test("requirements.txt(PEP 503 이름, 첫 줄 BOM)와 설정 파일로도 찾고, SDK를 설정 파일보다 먼저 근거로 쓴다. 일반 의존성 · 깨진 package.json은 서비스가 아니다", () => {
  const req = { path: "requirements.txt", text: "﻿Sentry_SDK==2.0\nrequests\n" };
  const found = detectServices([{ path: "package.json", text: "{ 깨짐" }, req], ["vercel.json", "supabase/config.toml", "web/vercel.json", "src/index.ts"]);
  assert.deepEqual(found.map((f) => [f.tech!.key, f.sourceFile]), [["service:supabase", "supabase/config.toml"], ["service:vercel", "vercel.json"], ["service:sentry", "requirements.txt"]]);
  assert.deepEqual(detectServices([pkg({ react: "^19", next: "16" })], ["README.md"]), []);
});

test("개념(작업 방식)은 파일로 확실한 것만: 지시 파일 · .claude/agents · .claude/commands. 등급은 '등급 없음', 등급 거르기에 섞이지 않음", () => {
  const found = detectConcepts(["AGENTS.md", ".claude/agents/reviewer.md", ".claude/commands/deploy/run.md", "docs/CLAUDE.md"]);
  assert.deepEqual(found.map((f) => [f.tech!.key, f.type, f.sourceFile]), [
    ["concept:harness", "concept", "AGENTS.md"], ["concept:subagents", "concept", ".claude/agents/reviewer.md"], ["concept:slash-commands", "concept", ".claude/commands/deploy/run.md"],
  ]);
  assert.deepEqual(detectConcepts(["docs/CLAUDE.md", ".claude/agents/README.txt"]), []);
  assert.equal(fixedNote("concept:harness")?.source, null, "개념은 공개 목록 근거가 없다");
  assert.match(fixedNote("concept:harness")!.text, /보안 등급이 없어요/);
  assert.equal(gradeText("unknown", "concept:harness"), "등급 없음");
  assert.equal(gradeText("unknown", "service:supabase"), "찾지 못함");
});
