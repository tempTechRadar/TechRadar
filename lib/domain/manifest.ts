// 저장소 파일 → 내 기술(SPEC-7). 네트워크·DB를 모르는 순수 규칙.
// package.json·.mcp.json(1-0)과 requirements.txt(PRD-F6, SPEC-7.1)를 읽는다. 스킬 폴더(.claude/skills)는 skills.ts(P-9e).

import { mcpServerKey, npmKey, pypiKey, type TechRef } from "./tech-key.ts";

export type FoundTech = {
  /** null이면 기술 키를 만들 수 없음 = "찾지 못함"(서버 별명만 남긴다) */
  tech: TechRef | null;
  name: string;
  type: "mcp" | "sdk" | "skill";
  sourceFile: string;
  /** 스킬만: 원본 저장소를 몰라 내 저장소 것으로 두었다(SPEC-7.3 "출처 모름") */
  unknownOrigin?: boolean;
};

// SPEC-7.2 허용 목록. `*`로 끝나면 그 접두어로 시작하는 것 모두. 관리자 고치기(rule_lists)는 P-30 뒤.
const NPM_ALLOW = [
  "@anthropic-ai/sdk", "@anthropic-ai/claude-code", "@anthropic-ai/claude-agent-sdk", "openai", "@openai/agents",
  "ai", "@ai-sdk/*", "@modelcontextprotocol/*", "mcp-remote", "@google/genai", "langchain", "@langchain/*",
  "llamaindex", "@mastra/core",
];
// PyPI 이름은 PEP 503으로 맞춘 뒤 견준다.
const PYPI_ALLOW = [
  "anthropic", "claude-agent-sdk", "openai", "openai-agents", "mcp", "fastmcp", "langchain", "langchain-*", "langgraph", "llama-index",
  "crewai", "autogen-agentchat", "google-genai", "litellm",
];

const allowed = (list: string[], name: string) => list.some((p) => (p.endsWith("*") ? name.startsWith(p.slice(0, -1)) : name === p));

export function isAllowedNpm(name: string): boolean {
  return allowed(NPM_ALLOW, name);
}

export function isAllowedPypi(name: string): boolean {
  return allowed(PYPI_ALLOW, pypiKey(name).key.slice("pypi:".length));
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
  return readMcpServers(text, "mcpServers", ".mcp.json");
}

/** 줄 주석 · 블록 주석 · 끝 쉼표 · BOM을 허용하는 JSON(VS Code · Gemini 설정은 JSONC). 글자를 한 번씩만 훑는다(되돌아가는 정규식 없음) */
export function parseJsonc(text: string): unknown {
  return JSON.parse(dropTrailingCommas(dropComments(text.replace(/^﻿/, ""))));
}
/** 문자열 밖의 주석만 뺀다 */
function dropComments(t: string): string {
  let out = "", i = 0, inStr = false;
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (inStr) { out += c; if (c === "\\") { out += n ?? ""; i += 2; continue; } if (c === '"') inStr = false; i++; continue; }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < t.length && t[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { const end = t.indexOf("*/", i + 2); i = end < 0 ? t.length : end + 2; continue; }
    out += c; i++;
  }
  return out;
}
/** 문자열 밖에서 } · ] 바로 앞(빈칸만 사이)의 쉼표를 뺀다(주석을 뺀 뒤에 부른다) */
function dropTrailingCommas(t: string): string {
  let out = "", inStr = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) { out += c; if (c === "\\") { out += t[i + 1] ?? ""; i++; } else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    if (c === ",") { let j = i + 1; while (j < t.length && " \t\r\n".includes(t[j])) j++; if (t[j] === "}" || t[j] === "]") continue; }
    out += c;
  }
  return out;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const MAX_ALIAS = 100; // 별명은 내 기술 이름 · 실행 기록에 그대로 남으니 길이를 막는다

/** MCP 서버 목록 하나를 읽는다. 도구마다 칸 이름만 다르다(Claude · Cursor · Gemini = mcpServers, VS Code = servers).
 *  칸이 객체가 아니거나 서버가 객체가 아니면 던진다: 그 파일만 수집 오류(불변 2), 틀린 기술 줄을 만들지 않는다 */
function readMcpServers(text: string, field: "mcpServers" | "servers", sourceFile: string): FoundTech[] {
  const doc = parseJsonc(text);
  if (!isPlainObject(doc)) throw new Error(`${sourceFile}: 설정이 객체가 아니에요`);
  const servers = doc[field] ?? {};
  if (!isPlainObject(servers) || !Object.values(servers).every(isPlainObject)) throw new Error(`${sourceFile}: ${field} 칸 모양이 달라요`);
  return Object.entries(servers as Record<string, Parameters<typeof mcpServerKey>[0]>).map(([alias, server]) => {
    const tech = mcpServerKey(server);
    const version = tech?.key.startsWith("npm:") ? exactVersion(tech.version) : (tech?.version ?? null);
    return {
      tech: tech && { key: tech.key, version },
      name: tech ? tech.key.slice(tech.key.indexOf(":") + 1) : alias.slice(0, MAX_ALIAS),
      type: "mcp" as const,
      sourceFile,
    };
  });
}

// requirements.txt는 사용자가 고른 공개 저장소의 것이라 믿을 수 없다. 줄을 읽는 데는 되돌아가는(backtracking) 정규식을 쓰지 않는다
// (공백 몇만 개로 서버가 몇 분 멈출 수 있다). 아래 함수들은 글자를 한 번씩만 훑는다: 시험이 긴 줄·공백 폭탄으로 이를 지킨다.
const LINE_BREAK = /\r\n|\r|\n/; // 낱개 CR(옛 줄바꿈)도 줄바꿈이다
// PEP 440 꼴 버전(1.0, 1.2.3, 2.0.0rc1, 1.0.0.post1, 1.0+local). 글자 종류·길이·구분 글자가 겹치거나 끝에 오지 않는지만 본다.
// 설치 안내의 검사(install/validate-item)와 같은 글자 집합이다. epoch(`1!2.0`)는 cmpVersion이 비교하지 못해 버전을 모르는 것으로 둔다.
const PYPI_VERSION = /^\d[0-9A-Za-z.+-]{0,63}$/;
const isVersionShape = (v: string) => PYPI_VERSION.test(v) && isAlnum(v[v.length - 1]) && !/[.+-]{2}/.test(v);
const MAX_PACKAGE_NAME = 100; // 공용 카탈로그·OSV에 가는 이름이라 길이를 막는다
const isSpace = (c: string | undefined) => c === " " || c === "\t";
const isAlnum = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9");
const isNameChar = (c: string) => isAlnum(c) || c === "." || c === "_" || c === "-";

/** 한 줄에서 `# 주석`(줄 처음이거나 공백 뒤의 #)·`; 환경 표식`·같은 줄 옵션(` --hash=…`)·이음줄 `\`를 뗀 앞부분 */
function requirementCore(line: string): string {
  let end = line.length;
  for (let i = 0; i < end; i++) {
    const c = line[i];
    if ((c === "#" && (i === 0 || isSpace(line[i - 1]))) || c === ";" || (isSpace(c) && line[i + 1] === "-")) end = i;
  }
  return line.slice(0, end).replace(/\\$/, "").trim();
}

/** requirements.txt 한 줄 → 이름과 버전. 기술이 아닌 줄(주석·옵션·주소·VCS·로컬 경로)은 null. 버전은 `==`로 딱 하나 고정했을 때만(아니면 null, SPEC-1 "버전을 모르면"). */
function requirementOf(line: string): { name: string; version: string | null } | null {
  const s = requirementCore(line);
  if (!s || s.includes("://") || !isAlnum(s[0])) return null; // 주소(`이름 @ 주소`도)·옵션(-)·경로·주석 모양은 기술이 아니다
  let i = 1;
  while (i < s.length && isNameChar(s[i])) i++;
  if (i > MAX_PACKAGE_NAME || !isAlnum(s[i - 1])) return null; // PEP 508: 이름은 영숫자로 시작하고 끝난다(`langchain_`는 이름이 아니다)
  let rest = s.slice(i).trimStart();
  if (rest.startsWith("[")) { // [extras]
    const close = rest.indexOf("]");
    if (close < 0) return null;
    rest = rest.slice(close + 1).trimStart();
  }
  if (rest && !"=<>~!(".includes(rest[0])) return null; // `이름 @ ./경로`·`이름/하위경로`처럼 버전 범위가 아닌 것이 붙으면 PyPI 패키지가 아니다
  const pinned = rest.startsWith("==") ? rest.slice(2).trim() : null; // `===`는 `=1.0`이 되어 버전 모양 검사(숫자로 시작)에서 걸러진다
  return { name: s.slice(0, i), version: pinned !== null && isVersionShape(pinned) ? pinned : null };
}

/**
 * requirements.txt → 허용 목록에 있는 패키지만(SPEC-7.2). 줄 단위로 읽어 못 읽는 줄은 건너뛴다(JSON처럼 통째로 깨지지 않는다).
 * 글자 파일이 아니면(UTF-16 등, NUL이 섞임) "기술 없음"이 아니라 던진다: 호출한 쪽이 그 파일만 수집 오류로 남긴다(불변 2).
 */
export function readRequirementsTxt(text: string): FoundTech[] {
  if (text.includes("\u0000")) throw new Error("텍스트 파일이 아니에요(UTF-16 등으로 저장됐을 수 있어요)");
  return text.replace(/^﻿/, "").split(LINE_BREAK).flatMap((line) => {
    const req = requirementOf(line);
    if (!req || !isAllowedPypi(req.name)) return [];
    const tech = pypiKey(req.name, req.version);
    // 파이썬 쪽은 모두 sdk다: mcp·fastmcp도 라이브러리이지 설치할 서버가 아니다(npm의 @modelcontextprotocol/sdk도 sdk)
    return [{ tech, name: tech.key.slice("pypi:".length), type: "sdk" as const, sourceFile: "requirements.txt" }];
  });
}

/** `-r 파일`·`--requirement=파일`이 가리키는 다른 파일들. 따라가지 않으니 호출한 쪽이 "목록이 전부가 아닐 수 있다"고 알린다. `-c`(제약)는 기술을 더하지 않아 뺀다. */
export function requirementIncludes(text: string): string[] {
  const paths: string[] = [];
  for (const raw of text.split(LINE_BREAK)) {
    const line = raw.trim();
    const rest = line.startsWith("--requirement") ? line.slice("--requirement".length) : line.startsWith("-r") ? line.slice(2) : null;
    const path = rest === null ? "" : /^\S*/.exec(rest.trimStart().replace(/^=/, "").trimStart())?.[0];
    if (path) paths.push(path);
  }
  return paths;
}

// 읽는 파일과 그 해석기를 한 곳에 둔다. 같은 기술이 두 파일에 있으면 버전을 아는 쪽을, 같으면 앞 파일 쪽을 남긴다(first-read). 그래서 순서가 의미를 가진다.
// 다른 AI 도구의 MCP 설정(PRD-F39)은 Claude 것 뒤에 둔다(같은 서버가 두 파일에 있으면 버전을 아는 쪽, 같으면 앞 파일 = .mcp.json 줄이 남음).
// AGENTS.md · GEMINI.md는 지시 글이라 기술 목록을 믿을 만하게 뽑을 수 없어 읽지 않는다(I-P-22-other-tools).
const READERS: Record<string, (text: string, path: string) => FoundTech[]> = {
  "package.json": readPackageJson,
  ".mcp.json": (text, path) => readMcpServers(text, "mcpServers", path),
  "requirements.txt": readRequirementsTxt,
  ".cursor/mcp.json": (text, path) => readMcpServers(text, "mcpServers", path),
  ".vscode/mcp.json": (text, path) => readMcpServers(text, "servers", path),
  ".gemini/settings.json": (text, path) => readMcpServers(text, "mcpServers", path),
};
export const REPO_FILES: readonly string[] = Object.freeze(Object.keys(READERS));

/** 읽은 파일 이름으로 해석기를 고른다. 모르는 파일이면 던진다(호출한 쪽이 그 파일만 해석 실패로 남김). */
export function readRepoFile(path: string, text: string): FoundTech[] {
  if (!Object.hasOwn(READERS, path)) throw new Error(`읽는 법을 모르는 파일: ${path}`);
  return READERS[path](text, path);
}

/** `https://github.com/owner/repo(.git)(/...)` → owner/repo. 다른 모양이면 null(입력 경계에서 거른다). */
export function parseGithubRepo(url: string): { owner: string; repo: string; url: string } | null {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?(?:[/?#].*)?$/i.exec(url.trim());
  if (!m || /^\.+$/.test(m[1]) || /^\.+$/.test(m[2])) return null; // `..`·`.`만인 이름은 주소 경로를 바꿔 버린다(raw 주소를 이어 붙이는 곳이 있음)
  return { owner: m[1], repo: m[2], url: `https://github.com/${m[1]}/${m[2]}`.toLowerCase() };
}
