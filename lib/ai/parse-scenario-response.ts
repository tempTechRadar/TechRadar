// 적용 시나리오(SPEC-4.2)에 대한 Claude의 답을 정해진 모양으로 다시 검사한다. DB·Claude를 모르는 순수 함수.
// 출처는 우리가 넘긴 것(allowedSources)만 인정한다. 설치·실행 명령으로 보이는 줄은 지우고 "공식 문서에서 직접 확인하세요"로 바꾼다:
// 카탈로그의 공식 설치 명령만 쓸 수 있는데 v1에는 그 칸이 없어서, 바깥 글에서 온 명령이 사용자에게 가지 않게 모두 바꾼다(ADR 0009).
export type ScenarioParse = { ok: true; steps: string[]; risks: string[]; sources: string[] } | { ok: false; error: string };

export const COMMAND_NOTICE = "설치 명령은 공식 문서에서 직접 확인하세요.";

const MAX_STEPS = 8;
const MAX_RISKS = 6;
const MAX_LINE_CHARS = 300;

const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

// shortcut: 명령 이름 뒤에 글자가 이어지면 명령으로 본다("docker 이미지" 같은 일반 문장도 바뀔 수 있음, 안전한 쪽). 화이트리스트가 생기면 그때 좁힌다.
export const COMMAND_LINE = /(^|[\s`$(])(npm|npx|pnpm|yarn|pip3?|pipx|uvx?|brew|apt(?:-get)?|curl|wget|docker|git\s+clone|claude\s+mcp\s+add)\s+\S/i;

type Lines = { ok: true; lines: string[] } | { ok: false; error: string };

function readLines(value: unknown, label: string, max: number): Lines {
  if (!Array.isArray(value) || value.length === 0 || !value.every((line) => typeof line === "string" && line.trim() !== "")) {
    return { ok: false, error: `${label}이 비어 있거나 글자 목록이 아니에요` };
  }
  if (value.length > max) return { ok: false, error: `${label}이 ${max}개를 넘어요` };
  if (value.some((line: string) => line.trim().length > MAX_LINE_CHARS)) return { ok: false, error: `${label} 한 줄이 ${MAX_LINE_CHARS}자를 넘어요` };
  return { ok: true, lines: value.map((line: string) => line.trim()) };
}

export function withoutCommands(lines: string[]): string[] {
  const replaced = lines.map((line) => (COMMAND_LINE.test(line) ? COMMAND_NOTICE : line));
  return replaced.filter((line, index) => line !== COMMAND_NOTICE || replaced.indexOf(COMMAND_NOTICE) === index);
}

/** 답 글 → JSON 값(```json 울타리는 벗김). JSON이 아니면 undefined */
export function readJson(raw: string): unknown {
  const text = raw.trim();
  try {
    return JSON.parse(FENCE.exec(text)?.[1] ?? text);
  } catch {
    return undefined;
  }
}

export function parseScenarioResponse(raw: string, allowedSources: string[]): ScenarioParse {
  const value = readJson(raw);
  if (value === undefined) return { ok: false, error: "답이 JSON이 아니에요" };
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "답이 객체가 아니에요" };
  const { steps, risks, sources } = value as { steps?: unknown; risks?: unknown; sources?: unknown };
  const stepLines = readLines(steps, "적용 단계", MAX_STEPS);
  if (!stepLines.ok) return stepLines;
  const riskLines = readLines(risks, "위험", MAX_RISKS);
  if (!riskLines.ok) return riskLines;
  if (!Array.isArray(sources) || !sources.every((source) => typeof source === "string")) return { ok: false, error: "출처가 글자 목록이 아니에요" };
  const allowed = new Set(allowedSources);
  return {
    ok: true,
    steps: withoutCommands(stepLines.lines),
    risks: withoutCommands(riskLines.lines),
    sources: [...new Set((sources as string[]).filter((source) => allowed.has(source)))],
  };
}
