// 청사진 점검 답 읽기(P-12q). steps · risks · sources는 시나리오와 같은 규칙(parseScenarioResponse), 그 위에 프롬프트 진단을 더한다.
// 진단(중복 · 충돌 · 순서 · 다듬은 프롬프트)은 참고용이라 모양이 틀린 항목은 그 항목만 버린다(점검 전체를 실패로 만들지 않음, 옛 답 모양도 그대로 읽힘).
// 지어내기 막기: 내보낼 프롬프트에 없는 기술 이름 · 우리가 넘기지 않은 주소 · 설치 명령이 든 다듬은 프롬프트는 버린다.
import { COMMAND_LINE, parseScenarioResponse, readJson, withoutCommands } from "./parse-scenario-response.ts";

export type TechPair = { a: string; b: string; reason: string };
export type Diagnosis = { overlaps: TechPair[]; conflicts: TechPair[]; order: string[]; revisedPrompt: string | null };
export type CheckParse = ({ ok: true; steps: string[]; risks: string[]; sources: string[] } & Diagnosis) | { ok: false; error: string };

export const DIAGNOSIS = { pairs: 5, order: 5, name: 60, line: 300, prompt: 4000 } as const;
const URL = /https?:\/\/[^\s)"'<>\]]+/gi;
// 다듬은 프롬프트는 사용자가 코딩 에이전트에 붙여 넣는다: 스킴 없는 주소 · 셸 흉내도 막는다. 주소처럼 보이는 것 = 뒤에 /가 붙은 점 이름(아무 끝),
// IP, 흔한 끝(.com 등)의 점 이름. 원문 · 넘긴 주소에 똑같이 있던 이름만 된다(Next.js 같은 기술 이름은 걸리지 않게 끝 목록은 좁게 둠).
// shortcut: 셸 흉내는 흔한 것만(세미콜론 · 백틱은 보통 글에도 나와서 뺌), 다듬은 프롬프트를 구조로 다시 만들게 되면 그때 없앤다
const HOST = /\b\d{1,3}(?:\.\d{1,3}){3}\b|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?=\/)|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|sh|ai|app|co|xyz|me|ly|gg|cc|ru|cn|site|top|info|link|run|page|so|to)\b/gi;
const SHELL = /\bsudo\b|\brm\s+-|\bchmod\b|\bbash\b|\bsh\s+-c\b|\bpowershell\b|\biex\b|\beval\b|\|\s*(?:ba|z)?sh\b|\|\s*(?:python3?|node|perl|ruby)\b|&&|\$\(/i;
const hosts = (s: string) => new Set((s.match(HOST) ?? []).map((h) => h.toLowerCase()));

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null);
const list = (v: unknown) => (Array.isArray(v) ? v : []);

/** 기술 둘 · 이유. 이름은 내보낼 프롬프트에 실제로 있어야 하고(대소문자 무시), 같은 기술 둘 · 명령이 든 이유는 버린다 */
function pairs(v: unknown, inPrompt: (name: string) => boolean): TechPair[] {
  return list(v).flatMap((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const a = text(r.a, DIAGNOSIS.name), b = text(r.b, DIAGNOSIS.name), reason = text(r.reason, DIAGNOSIS.line);
    return a && b && reason && a.toLowerCase() !== b.toLowerCase() && inPrompt(a) && inPrompt(b) && !COMMAND_LINE.test(reason) ? [{ a, b, reason }] : [];
  }).slice(0, DIAGNOSIS.pairs);
}

/** 다듬은 프롬프트: 4000자 이내 · 설치 · 셸 명령 없음 · 주소와 도메인은 넘긴 것만. 어기면 통째로 버린다(일부만 고친 글을 복사하게 두지 않음) */
function revised(v: unknown, known: Set<string>, original: string): string | null {
  const t = text(v, DIAGNOSIS.prompt);
  if (!t || COMMAND_LINE.test(t) || SHELL.test(t)) return null;
  const seen = hosts(`${[...known].join(" ")} ${original}`);
  const hostsOk = [...hosts(t)].every((h) => seen.has(h));
  return hostsOk && (t.match(URL) ?? []).every((u) => known.has(u)) ? t : null;
}

export function parseCheckResponse(raw: string, allowedSources: string[], exportPrompt: string): CheckParse {
  const base = parseScenarioResponse(raw, allowedSources);
  if (!base.ok) return base;
  const v = readJson(raw) as Record<string, unknown>;
  const hay = exportPrompt.toLowerCase();
  const inPrompt = (name: string) => hay.includes(name.toLowerCase());
  const order = withoutCommands(list(v.order).flatMap((x) => text(x, DIAGNOSIS.line) ?? [])).slice(0, DIAGNOSIS.order);
  const known = new Set([...allowedSources, ...(exportPrompt.match(URL) ?? [])]);
  return { ...base, overlaps: pairs(v.overlaps, inPrompt), conflicts: pairs(v.conflicts, inPrompt), order, revisedPrompt: revised(v.revisedPrompt, known, hay) };
}
