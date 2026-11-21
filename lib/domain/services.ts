// 연동 서비스 · 개념 노드(PRD-F40, ADR 0008 2항, 데이터설계 7절 `service:<이름>`). DB · 네트워크를 모르는 순수 규칙.
// 서비스는 공식 MCP가 있는 것만: 공식 레지스트리에서 이름 앞부분(회사 도메인 · GitHub 조직)이 인증된 서버를 2026-11-20에 찾았다.
// 일반 의존성은 넣지 않는다(Dependabot과 겹침, ADR 0008). shortcut: 목록은 코드에 고정, 팀 · 관리자가 고치게 되면 rule_lists로 옮긴다
import type { FoundTech } from "./manifest.ts";
import { requirementOf } from "./manifest.ts";
import { registryLink } from "./registry.ts";
import { pypiKey } from "./tech-key.ts";

type Service = { id: string; name: string; mcp: string; npm: (string | RegExp)[]; pypi?: string[]; files?: RegExp[] };

const SERVICES: Service[] = [
  { id: "supabase", name: "Supabase", mcp: "com.supabase/mcp", npm: [/^@supabase\//], pypi: ["supabase"], files: [/^supabase\/config\.toml$/] },
  { id: "vercel", name: "Vercel", mcp: "com.vercel/vercel-mcp", npm: ["vercel", /^@vercel\//], files: [/^vercel\.json$/] },
  { id: "stripe", name: "Stripe", mcp: "com.stripe/mcp", npm: ["stripe", /^@stripe\//], pypi: ["stripe"] },
  { id: "sentry", name: "Sentry", mcp: "io.github.getsentry/sentry-mcp", npm: [/^@sentry\//], pypi: ["sentry-sdk"] },
  { id: "notion", name: "Notion", mcp: "com.notion/mcp", npm: ["@notionhq/client"], pypi: ["notion-client"] },
  { id: "linear", name: "Linear", mcp: "app.linear/linear", npm: ["@linear/sdk"] },
  { id: "cloudflare", name: "Cloudflare", mcp: "com.cloudflare.mcp/mcp", npm: ["wrangler", /^@cloudflare\//], files: [/^wrangler\.(toml|jsonc?)$/] },
  { id: "firebase", name: "Firebase", mcp: "io.github.firebase/firebase-mcp", npm: ["firebase", "firebase-admin"], pypi: ["firebase-admin"], files: [/^firebase\.json$/] },
  { id: "firecrawl", name: "Firecrawl", mcp: "io.github.firecrawl/firecrawl-mcp-server", npm: ["@mendable/firecrawl-js"], pypi: ["firecrawl-py"] },
  { id: "neon", name: "Neon", mcp: "com.neon/mcp", npm: ["@neondatabase/serverless"] },
  { id: "upstash", name: "Upstash", mcp: "io.github.upstash/mcp-server", npm: [/^@upstash\//], pypi: ["upstash-redis"] },
  { id: "mongodb", name: "MongoDB", mcp: "io.github.mongodb-js/mongodb-mcp-server", npm: ["mongodb", "mongoose"], pypi: ["pymongo"] },
  { id: "prisma", name: "Prisma", mcp: "io.prisma/mcp", npm: ["prisma", "@prisma/client"], files: [/(^|\/)schema\.prisma$/] },
];

// 개념(작업 방식): 설치물이 아니라 등급 · 알림이 없다. 파일로 확실히 알 수 있는 것만
// shortcut: 처음 목록은 팀 · 관리자가 정하기로 했다(데이터설계 18). 그 전까지 파일 셋으로만
const CONCEPTS: { id: string; name: string; oneLiner: string; files: RegExp }[] = [
  { id: "harness", name: "하네스(에이전트 지시 파일)", oneLiner: "AI 에이전트에게 규칙 · 절차를 적어 주는 파일로 일하는 방식", files: /^(CLAUDE|AGENTS|GEMINI)\.md$/ },
  { id: "subagents", name: "서브에이전트", oneLiner: "일을 나눠 맡는 보조 에이전트를 정의해 쓰는 방식", files: /^\.claude\/agents\/[^/]+\.md$/ },
  { id: "slash-commands", name: "슬래시 명령", oneLiner: "자주 하는 지시를 /명령으로 저장해 쓰는 방식", files: /^\.claude\/commands\/.+\.md$/ },
];

const matches = (rules: (string | RegExp)[], name: string) => rules.some((r) => (typeof r === "string" ? r === name : r.test(name)));
const pypiName = (n: string) => pypiKey(n).key.slice("pypi:".length);
const serviceFound = (s: Service, sourceFile: string): FoundTech => ({ tech: { key: `service:${s.id}`, version: null }, name: s.name, type: "service", sourceFile });

/**
 * 연동 서비스 · 개념의 한 줄 설명과 근거 링크(화면용). 카탈로그 줄에는 쓰지 않는다: 쓰면 사용자 저장소에서 생긴 줄이 공개 목록 · 로그인 전 지도에
 * 나가고(ADR 0029 4항) NEW 판정(isBulkFilled)이 날짜에 따라 갈린다. 정해 둔 목록에서만 나오는 글이다
 * (예외: 입문 세트 시드가 확인한 공식 출처로 개념 줄을 채워 공개한다, ADR 0031)
 */
export function fixedNote(techKey: string | null | undefined): { text: string; source: string | null } | null {
  const [kind, id] = (techKey ?? "").split(":");
  if (kind === "service") {
    const s = SERVICES.find((x) => x.id === id);
    return s ? { text: `공식 MCP 서버(${s.mcp})가 있어 AI 도구와 연결할 수 있어요`, source: registryLink(s.mcp) } : null;
  }
  const c = kind === "concept" ? CONCEPTS.find((x) => x.id === id) : undefined;
  return c ? { text: `${c.oneLiner}. 설치물이 아니라 보안 등급이 없어요`, source: null } : null;
}

/** package.json 의존성 이름(깨졌으면 빈 목록: 그 파일의 해석 오류는 기술 읽기가 따로 남긴다) */
function npmNames(text: string): string[] {
  try {
    const pkg = JSON.parse(text) as Record<string, unknown>;
    const deps = { ...(pkg.devDependencies as object), ...(pkg.dependencies as object) };
    return Object.keys(deps);
  } catch {
    return [];
  }
}

/** 읽은 저장소 파일 · 파일 목록 → 연동 서비스(서비스마다 하나, 처음 근거가 된 파일). 설정 파일보다 SDK를 먼저 본다 */
export function detectServices(files: { path: string; text: string }[], treePaths: string[]): FoundTech[] {
  const npm = files.filter((f) => f.path === "package.json").flatMap((f) => npmNames(f.text));
  const pypi = files.filter((f) => f.path === "requirements.txt").flatMap((f) => f.text.replace(/^﻿/, "").split(/\r\n|\r|\n/).map(requirementOf).flatMap((r) => (r ? [pypiName(r.name)] : [])));
  return SERVICES.flatMap((s) => {
    const source = npm.some((n) => matches(s.npm, n)) ? "package.json"
      : pypi.some((n) => s.pypi?.includes(n)) ? "requirements.txt"
      : treePaths.find((p) => s.files?.some((r) => r.test(p)));
    return source ? [serviceFound(s, source)] : [];
  });
}

/** 파일 목록 → 개념 노드(등급 · 알림 없음) */
export function detectConcepts(treePaths: string[]): FoundTech[] {
  return CONCEPTS.flatMap((c) => {
    const source = treePaths.find((p) => c.files.test(p));
    return source ? [{ tech: { key: `concept:${c.id}`, version: null }, name: c.name, type: "concept" as const, sourceFile: source }] : [];
  });
}
