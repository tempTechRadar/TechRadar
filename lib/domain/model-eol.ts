// 모델 지원 종료(PRD-F38, SPEC-3.3). 내 코드 속 모델 이름 + 공식 지원 종료 공지. DB · 네트워크를 모르는 순수 규칙.
// 표는 공식 쪽에 적힌 날짜 · 추천 대체만 옮겼다(2026-11-20 읽음, docs/agents.md). 날짜가 없거나 "자동으로 넘어감"인 모델은 넣지 않았다.
// shortcut: 공식 표가 바뀌면 이 파일을 고쳐 배포해야 반영된다. 바뀌는 일이 잦아지면 정기 수집으로 옮긴다
import type { FoundTech } from "./manifest.ts";

export type Provider = "anthropic" | "openai" | "google";
export type EolNotice = { model: string; provider: Provider; retireOn: string; replacement: string; source: string };

export const EOL_SOURCE: Record<Provider, string> = {
  anthropic: "https://platform.claude.com/docs/en/about-claude/model-deprecations",
  openai: "https://developers.openai.com/api/docs/deprecations",
  google: "https://aistudio.google.com/docs/deprecations",
};
export const PROVIDER_KO: Record<Provider, string> = { anthropic: "Anthropic", openai: "OpenAI", google: "Google" };
/** Google 표의 날짜는 "가장 이르면 이날"이라고 적혀 있다 */
export const EARLIEST_ONLY: ReadonlySet<Provider> = new Set(["google"]);

// [회사, 종료일, 공식 추천 대체, 모델 이름…] — 같은 줄의 이름은 같은 날 같은 대체
const ROWS: [Provider, string, string, ...string[]][] = [
  ["anthropic", "2026-11-30", "claude-sonnet-5-5", "claude-sonnet-4-5-20250929", "claude-sonnet-4-5"],
  ["anthropic", "2026-08-05", "claude-opus-4-8", "claude-opus-4-1-20250805"],
  ["anthropic", "2026-06-15", "claude-opus-4-8", "claude-opus-4-20250514"],
  ["anthropic", "2026-06-15", "claude-sonnet-5-5", "claude-sonnet-4-20250514"],
  ["anthropic", "2026-04-20", "claude-haiku-4-5-20251001", "claude-3-haiku-20240307"],
  ["anthropic", "2026-02-19", "claude-sonnet-5-5", "claude-3-7-sonnet-20250219"],
  ["anthropic", "2026-02-19", "claude-haiku-4-5-20251001", "claude-3-5-haiku-20241022"],
  ["anthropic", "2026-01-05", "claude-opus-4-8", "claude-3-opus-20240229"],
  ["anthropic", "2025-10-28", "claude-sonnet-5-5", "claude-3-5-sonnet-20240620", "claude-3-5-sonnet-20241022"],
  ["anthropic", "2025-07-21", "claude-sonnet-5-5", "claude-3-sonnet-20240229"],
  ["anthropic", "2025-07-21", "claude-opus-4-8", "claude-2.0", "claude-2.1"],
  ["anthropic", "2024-11-06", "claude-haiku-4-5-20251001", "claude-1.0", "claude-1.1", "claude-1.2", "claude-1.3", "claude-instant-1.0", "claude-instant-1.1", "claude-instant-1.2"],
  ["openai", "2027-04-01", "gpt-6-sol", "gpt-5.3-codex", "gpt-5.1", "gpt-5.1-2025-11-13"],
  ["openai", "2027-04-01", "gpt-6-luna", "gpt-5.4-nano", "gpt-5.4-nano-2026-03-17"],
  ["openai", "2027-01-14", "gpt-6-luna", "gpt-4o-2024-08-06", "gpt-4o-2024-11-20", "gpt-4o-mini-2024-07-18", "gpt-4.1-2025-04-14", "gpt-4.1-mini-2025-04-14"],
  ["openai", "2026-12-11", "gpt-6.1-sol", "gpt-5", "gpt-5-2025-08-07", "o3", "o3-2025-04-16"],
  ["openai", "2026-12-11", "gpt-6.1-sol (reasoning.mode: pro)", "gpt-5-pro", "gpt-5-pro-2025-10-06", "o3-pro", "o3-pro-2025-06-10"],
  ["openai", "2026-12-11", "gpt-6.1-terra", "gpt-5-mini", "gpt-5-mini-2025-08-07"],
  ["openai", "2026-12-11", "gpt-6-luna", "gpt-5-nano", "gpt-5-nano-2025-08-07"],
  ["openai", "2026-10-23", "gpt-5.6-sol", "gpt-4-0613", "gpt-4", "gpt-4-1106-preview", "gpt-4-turbo", "gpt-4-turbo-2024-04-09", "gpt-4o-2024-05-13",
    "o1-2024-12-17", "o1", "o3-mini-2025-01-31", "o3-mini"],
  ["openai", "2026-10-23", "gpt-5.6-sol (reasoning.mode: pro)", "o1-pro-2025-03-19", "o1-pro"],
  ["openai", "2026-10-23", "gpt-5.6-terra", "gpt-3.5-turbo-0125", "gpt-3.5-turbo", "o4-mini-2025-04-16", "o4-mini"],
  ["openai", "2026-10-23", "gpt-5.6-luna", "gpt-4.1-nano", "gpt-4.1-nano-2025-04-14"],
  ["openai", "2026-09-28", "gpt-5.6-terra", "gpt-3.5-turbo-instruct", "babbage-002", "davinci-002", "gpt-3.5-turbo-1106"],
  ["openai", "2026-08-10", "gpt-5.6-sol", "gpt-5.2-chat-latest", "gpt-5.3-chat-latest"],
  ["openai", "2026-07-23", "gpt-5.6-sol", "gpt-5-chat-latest", "gpt-5-codex", "gpt-5.1-chat-latest", "gpt-5.1-codex", "gpt-5.1-codex-max", "gpt-5.2-codex",
    "o3-deep-research", "o3-deep-research-2025-06-26", "o4-mini-deep-research", "o4-mini-deep-research-2025-06-26"],
  ["openai", "2026-07-23", "gpt-5.6-terra", "gpt-5.1-codex-mini", "gpt-4o-mini-search-preview-2025-03-11", "gpt-4o-search-preview-2025-03-11",
    "computer-use-preview", "computer-use-preview-2025-03-11"],
  ["openai", "2026-03-26", "gpt-5", "gpt-4-0314", "gpt-4-0125-preview", "gpt-4-turbo-preview"],
  ["openai", "2026-02-17", "gpt-5.1-chat-latest", "chatgpt-4o-latest"],
  ["openai", "2026-02-12", "gpt-5-codex-mini", "codex-mini-latest"],
  ["google", "2027-05-07", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"],
  ["google", "2026-12-01", "gemini-3.8-flash", "gemini-2.5-pro"],
  ["google", "2026-12-01", "gemini-3.5-flash-lite", "gemini-2.5-flash"],
  ["google", "2026-06-01", "gemini-3.6-flash", "gemini-2.0-flash", "gemini-2.0-flash-001"],
  ["google", "2026-06-01", "gemini-3.1-flash-lite", "gemini-2.0-flash-lite", "gemini-2.0-flash-lite-001"],
  ["google", "2026-05-25", "gemini-3.1-flash-lite", "gemini-3.1-flash-lite-preview"],
  ["google", "2026-03-31", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite-preview-09-2025"],
  ["google", "2026-03-09", "gemini-3.1-pro-preview", "gemini-3-pro-preview"],
  ["google", "2026-02-17", "gemini-3.6-flash", "gemini-2.5-flash-preview-09-2025"],
  ["google", "2026-01-14", "gemini-embedding-2", "text-embedding-004"],
  ["google", "2025-12-09", "gemini-3.1-flash-lite", "gemini-2.0-flash-lite-preview", "gemini-2.0-flash-lite-preview-02-05"],
  ["google", "2025-12-02", "gemini-3.8-flash", "gemini-2.5-pro-preview-03-25", "gemini-2.5-pro-preview-05-06", "gemini-2.5-pro-preview-06-05"],
  ["google", "2025-11-18", "gemini-3.6-flash", "gemini-2.5-flash-preview-05-20"],
  ["google", "2025-10-30", "gemini-embedding-2", "embedding-001", "gemini-embedding-exp", "gemini-embedding-exp-03-07"],
];

export const MODEL_EOL: ReadonlyMap<string, EolNotice> = new Map(
  ROWS.flatMap(([provider, retireOn, replacement, ...models]) => models.map((model) => [model, { model, provider, retireOn, replacement, source: EOL_SOURCE[provider] }] as const)),
);

// 따옴표로 감싼 글자 하나(문자열 값)만 본다: 주석 · 문서의 "o1", "GPT-4" 같은 말은 모델 지정이 아니라서. Gemini SDK의 `models/` 앞붙이는 뗀다
const QUOTED = /(["'`])(?:models\/)?([a-z0-9][a-z0-9.-]{0,79})\1/g;
// 한 파일에 서로 다른 종료 모델이 이보다 많으면 모델을 부르는 코드가 아니라 모델 목록 · 가격표로 본다(이 앱의 표 파일처럼)
export const LIST_FILE_MODELS = 5;

/** 코드 글 → 그 안에 문자열로 쓴 지원 종료 모델(겹치면 한 번). 목록 · 표 파일이면 빈 목록 */
export function findEolModels(text: string): EolNotice[] {
  const found = new Map<string, EolNotice>();
  for (const m of text.matchAll(QUOTED)) {
    const notice = MODEL_EOL.get(m[2]);
    if (notice) found.set(notice.model, notice);
  }
  return found.size > LIST_FILE_MODELS ? [] : [...found.values()];
}

export const modelTechKey = (model: string) => `model:${model}`;
export const eolOfKey = (key: string): EolNotice | undefined => (key.startsWith("model:") ? MODEL_EOL.get(key.slice(6)) : undefined);

export function modelFound(notice: EolNotice, sourceFile: string): FoundTech {
  return { tech: { key: modelTechKey(notice.model), version: null }, name: notice.model, type: "model", sourceFile };
}

// 읽을 코드 파일 고르기: 사람이 쓴 코드 · 설정만. 의존성 폴더 · 빌드 결과 · 잠금 파일은 남의 글이라, 시험 · 예시 자료는 실제로 부르는 곳이 아니라서 뺀다
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt|rs|cs|php|json|ya?ml|toml)$|(^|\/)\.env\.example$/;
const SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|out|\.next|coverage|\.git|__pycache__|\.?venv|site-packages|tests?|__tests__|__mocks__|fixtures?|mocks?)\//;
const SKIP_FILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|composer\.lock|Cargo\.lock)$|[._-](test|spec)\.[a-z]+$/;
// 모델을 부를 법한 경로를 먼저 읽는다: 파일이 많은 저장소에서 깊은 src/lib/ai/… 가 한도 뒤로 밀리지 않게
const LIKELY = /(^|[/._-])(ai|llms?|models?|agents?|openai|anthropic|claude|gemini|gpt|chat|prompts?|completions?)([/._-]|$)/i;
export const MAX_CODE_FILES = 100;
export const MAX_CODE_BYTES = 200_000;

export type TreeEntry = { path: string; type: string; size?: number };

/**
 * GitHub 트리 응답 → 읽을 코드 파일. skip = 다른 단계가 이미 읽는 파일(package.json 등).
 * skipped = 한도 · 크기 때문에 못 보는 코드 파일 수(못 본 곳의 모델 줄은 "사라짐"이 아니라 수집 오류). 모양이 다르면 null(해석 실패)
 */
export function codeFilesOf(treeJson: string, skip: ReadonlySet<string> = new Set()): { paths: string[]; skipped: number; truncated: boolean; all: string[] } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(treeJson);
  } catch {
    return null;
  }
  const tree = (parsed as { tree?: unknown })?.tree;
  if (!Array.isArray(tree)) return null;
  const code = (tree as TreeEntry[]).filter((e) => e && e.type === "blob" && typeof e.path === "string" && e.path.length <= 300
    && CODE_EXT.test(e.path) && !SKIP_DIR.test(e.path) && !SKIP_FILE.test(e.path) && !skip.has(e.path));
  const small = code.filter((e) => (e.size ?? 0) <= MAX_CODE_BYTES);
  const rank = (p: string) => (LIKELY.test(p) ? 0 : 1);
  small.sort((a, b) => rank(a.path) - rank(b.path) || a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));
  const paths = small.slice(0, MAX_CODE_FILES).map((e) => e.path);
  // all = 모든 파일 경로(연동 서비스 · 개념을 설정 파일로 찾을 때 쓴다)
  const all = (tree as TreeEntry[]).filter((e) => e && e.type === "blob" && typeof e.path === "string" && e.path.length <= 300).map((e) => e.path);
  return { paths, skipped: code.length - paths.length, truncated: (parsed as { truncated?: unknown }).truncated === true, all };
}
