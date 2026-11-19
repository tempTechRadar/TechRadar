// 저장소 파일 → 내 기술(SPEC-7). 네트워크·DB를 모르는 순수 규칙.
// 이 파일은 package.json·.mcp.json만 읽는다. 스킬 폴더는 skills.ts(P-9e), requirements.txt는 3순위.

import { mcpServerKey, npmKey, type TechRef } from "./tech-key.ts";

export type FoundTech = {
  /** null이면 기술 키를 만들 수 없음 = "찾지 못함"(서버 별명만 남긴다) */
  tech: TechRef | null;
  name: string;
  type: "mcp" | "sdk" | "skill";
  sourceFile: string;
  /** 스킬만: 원본 저장소를 몰라 내 저장소 것으로 두었다(SPEC-7.3 "출처 모름") */
  unknownOrigin?: boolean;
};

export const REPO_FILES = ["package.json", ".mcp.json"] as const;

// SPEC-7.2 허용 목록(npm). `*`로 끝나면 그 접두어로 시작하는 것 모두. 관리자 고치기(rule_lists)는 P-30 뒤.
const NPM_ALLOW = [
  "@anthropic-ai/sdk", "@anthropic-ai/claude-code", "@anthropic-ai/claude-agent-sdk", "openai", "@openai/agents",
  "ai", "@ai-sdk/*", "@modelcontextprotocol/*", "mcp-remote", "@google/genai", "langchain", "@langchain/*",
  "llamaindex", "@mastra/core",
];

export function isAllowedNpm(name: string): boolean {
  return NPM_ALLOW.some((p) => (p.endsWith("*") ? name.startsWith(p.slice(0, -1)) : name === p));
}

/** `^1.2.3`·`latest` 같은 범위는 실제 설치 버전을 알 수 없어 null(SPEC-1 "버전을 모르면" 규칙으로 간다). */
export function exactVersion(spec: string | null | undefined): string | null {
  const s = (spec ?? "").trim().replace(/^=/, "");
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(s) ? s : null;
}

const npmType = (name: string): "mcp" | "sdk" =>
  name === "mcp-remote" || name.startsWith("@modelcontextprotocol/server-") ? "mcp" : "sdk";

/** package.json → 허용 목록에 있는 의존성만. JSON이 깨졌으면 던진다(호출한 쪽이 그 파일만 수집 오류로). */
export function readPackageJson(text: string): FoundTech[] {
  const pkg = JSON.parse(text) as Record<string, unknown>;
  const deps = { ...(pkg.devDependencies as object), ...(pkg.dependencies as object) } as Record<string, string>;
  return Object.entries(deps)
    .filter(([name]) => isAllowedNpm(name))
    .map(([name, spec]) => ({ tech: npmKey(name, exactVersion(spec)), name, type: npmType(name), sourceFile: "package.json" }));
}

/** .mcp.json → 서버마다 하나(허용 목록 없이 모두). 서버 이름은 별명이라 키로 쓰지 않는다(SPEC-7.3). */
export function readMcpJson(text: string): FoundTech[] {
  const servers = ((JSON.parse(text) as { mcpServers?: object }).mcpServers ?? {}) as Record<string, Parameters<typeof mcpServerKey>[0]>;
  return Object.entries(servers).map(([alias, server]) => {
    const tech = mcpServerKey(server);
    const version = tech?.key.startsWith("npm:") ? exactVersion(tech.version) : (tech?.version ?? null);
    return {
      tech: tech && { key: tech.key, version },
      name: tech ? tech.key.slice(tech.key.indexOf(":") + 1) : alias,
      type: "mcp" as const,
      sourceFile: ".mcp.json",
    };
  });
}

/** `https://github.com/owner/repo(.git)(/...)` → owner/repo. 다른 모양이면 null(입력 경계에서 거른다). */
export function parseGithubRepo(url: string): { owner: string; repo: string; url: string } | null {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?(?:[/?#].*)?$/i.exec(url.trim());
  if (!m) return null;
  return { owner: m[1], repo: m[2], url: `https://github.com/${m[1]}/${m[2]}`.toLowerCase() };
}
