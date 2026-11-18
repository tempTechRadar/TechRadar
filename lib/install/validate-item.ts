// 값 검사(SPEC-6.3): 설치 프롬프트에 넣기 전, 가져오기로 받을 때. 어긋나면 값을 고치지 않고 항목째 뺀다.
// 이유 글에는 빠진 값 자체를 쓰지 않는다(그 값이 다시 어딘가에 들어가지 않게).
import { maskSecrets } from "../domain/redact.ts";
import type { Ecosystem, InstallItem } from "./types.ts";

const MAX_LEN = 64;
const NPM_NAME = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const PYPI_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SKILL_PATH = /^[A-Za-z0-9._~@-]+(\/[A-Za-z0-9._~@-]+)*$/;
const DISPLAY_NAME = /^[\p{L}\p{N}][\p{L}\p{N}._@/ -]*$/u;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]*$/;
const ENV_KEY = /^[A-Z][A-Z0-9_]*$/;
const LINK = /^https:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+$/;
const FORBIDDEN_CHARS = /[\r\n`<>]/;
// 영어는 낱말 하나가 같을 때만(filesystem 같은 진짜 이름이 막히지 않게), 한글은 들어 있으면 막는다.
const WORDS = new Set(["ignore", "instead", "system", "disregard", "override", "instruction", "instructions"]);
const KOREAN_WORDS = ["무시", "지시", "시스템 프롬프트"];

export type Verdict = { ok: true; item: InstallItem } | { ok: false; reason: string };

export function hasInstructionWord(text: string): boolean {
  if (KOREAN_WORDS.some((w) => text.includes(w))) return true;
  return text.toLowerCase().split(/[^a-z0-9]+/).some((token) => WORDS.has(token));
}

const NO = (reason: string): Verdict => ({ ok: false, reason });
const looksSecret = (text: string) => maskSecrets(text) !== text || /(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}/.test(text);

function nameRuleOk(item: InstallItem): boolean {
  if (item.kind === "skill") return SKILL_PATH.test(item.pkg) && !item.pkg.split("/").includes("..");
  const eco: Ecosystem = item.ecosystem ?? "npm";
  return (eco === "npm" ? NPM_NAME : PYPI_NAME).test(item.pkg);
}

/** 문자열 칸 하나의 공통 검사: 금지 글자·길이·지시 낱말·비밀값. 문제가 없으면 null, 있으면 이유. */
function textProblem(label: string, value: string, maxLen = MAX_LEN): string | null {
  if (FORBIDDEN_CHARS.test(value)) return `${label}에 줄바꿈·백틱·꺾쇠가 있어 뺐어요`;
  if (value.length > maxLen) return `${label}이(가) ${maxLen}자를 넘어 뺐어요`;
  if (hasInstructionWord(value)) return `${label}에 지시처럼 보이는 낱말이 있어 뺐어요`;
  if (looksSecret(value)) return "비밀값처럼 보여서 뺐어요";
  return null;
}

function fieldProblem(item: InstallItem): string | null {
  const checks: [string, string][] = [["이름", item.name], ["패키지·경로", item.pkg]];
  if (item.version) checks.push(["버전", item.version]);
  if (item.pinTo) checks.push(["고친 버전", item.pinTo]);
  for (const [label, value] of checks) {
    const problem = textProblem(label, value);
    if (problem) return problem;
  }
  if (item.link) {
    const problem = textProblem("링크", item.link, 300);
    if (problem) return problem;
  }
  return null;
}

function shapeProblem(item: InstallItem): string | null {
  if (!DISPLAY_NAME.test(item.name)) return "이름 형식이 맞지 않아 뺐어요";
  if (!nameRuleOk(item)) return "패키지·경로 형식이 맞지 않아 뺐어요";
  if (item.version && !VERSION.test(item.version)) return "버전 형식이 맞지 않아 뺐어요";
  if (item.pinTo && !VERSION.test(item.pinTo)) return "고친 버전 형식이 맞지 않아 뺐어요";
  if (item.link && !LINK.test(item.link)) return "링크는 https 주소만 넣을 수 있어 뺐어요";
  if ((item.envKeys ?? []).some((key) => !ENV_KEY.test(key) || key.length > MAX_LEN)) return "환경변수 이름 형식이 맞지 않아 뺐어요";
  return null;
}

/** 항목 하나를 검사한다. 통과하면 같은 값 그대로, 어긋나면 이유(빠진 값은 쓰지 않음). */
export function validateItem(item: InstallItem): Verdict {
  const problem = fieldProblem(item) ?? shapeProblem(item);
  return problem ? NO(problem) : { ok: true, item };
}
