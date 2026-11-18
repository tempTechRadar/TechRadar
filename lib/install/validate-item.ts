// 값 검사(SPEC-6.3): 설치 프롬프트에 넣기 전, 가져오기로 받을 때. 어긋나면 값을 고치지 않고 항목째 뺀다.
// 금지 낱말 목록은 전각·키릴·띄어쓰기로 쉽게 피해 가므로 쓰지 않는다. **허용 글자만** 받는다(PR #42 검토 반영).
// 이유 글에는 빠진 값 자체를 쓰지 않는다(그 값이 다시 어딘가에 들어가지 않게).
import { maskSecrets } from "../domain/redact.ts";
import type { InstallItem } from "./types.ts";

const MAX_LEN = 64;
// 표시 이름: ASCII 소문자·숫자·._@/- 만, 띄어쓰기 없음. 문장을 쓸 수 없게 한다.
const DISPLAY_NAME = /^@?[a-z0-9][a-z0-9._@/-]*$/;
const NPM_NAME = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
// PyPI: 처음과 끝은 영문·숫자(PEP 508)
const PYPI_NAME = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const SKILL_PATH = /^[A-Za-z0-9._~@-]+(\/[A-Za-z0-9._~@-]+)*$/;
// 버전: semver 모양만(첫 글자는 숫자). latest·키 모양 값은 막힌다.
const VERSION = /^\d[0-9A-Za-z.+-]*$/;
const ENV_KEY = /^[A-Z][A-Z0-9_]*$/;
const ENV_MAX_LEN = 40;
const ENV_MAX_PARTS = 5;
// 환경변수 이름은 대문자 낱말이라 문장을 만들 수 있다: 명령처럼 보이는 낱말은 막는다
const ENV_BAD_PARTS = new Set(["IGNORE", "INSTEAD", "DISREGARD", "OVERRIDE", "FORGET", "SKIP", "RUN", "CURL", "WGET", "EXEC", "EVAL", "RULE", "RULES"]);
const LINK_HOSTS = new Set(["github.com", "www.npmjs.com", "pypi.org"]);
const LINK_PATH = /^\/[A-Za-z0-9._~@/-]*$/;
const LINK_MAX_LEN = 200;

// 키 모양(대소문자 구분 없이): redact의 모양 + AWS 키 ID, Slack 토큰, Google API 키, 긴 무작위 문자열
const SECRET_SHAPES: RegExp[] = [
  /akia[0-9a-z]{16}/i,
  /xox[abpr]-/i,
  /aiza[0-9a-z_-]{20,}/i,
  /(?=[a-z0-9_]*\d)(?=[a-z0-9_]*[a-z])[a-z0-9_]{32,}/i, // 하이픈은 이름에 흔해서 빼고 본다
  /(?=[A-Za-z0-9/+=]*[A-Z])(?=[A-Za-z0-9/+=]*[a-z])(?=[A-Za-z0-9/+=]*[0-9/+])[A-Za-z0-9/+=]{30,}/,
];

export type Verdict = { ok: true; item: InstallItem } | { ok: false; reason: string };

/** 비밀값처럼 보이는가. 대소문자를 바꿔 피하지 못하게 소문자로도 한 번 더 본다. */
export function looksSecret(text: string): boolean {
  const lower = text.toLowerCase();
  if (maskSecrets(text) !== text || maskSecrets(lower) !== lower) return true;
  return SECRET_SHAPES.some((re) => re.test(text));
}

const NO = (reason: string): Verdict => ({ ok: false, reason });
/** NFKC로 바꿔도 같은 글자여야 한다(전각·호환 문자로 모양을 속이지 못하게). */
const stable = (v: string) => v.normalize("NFKC") === v;

/** 한 칸의 공통 검사: 정규화·길이·비밀값. 형식은 칸마다 따로 본다. */
function textProblem(label: string, value: string, maxLen = MAX_LEN): string | null {
  if (!stable(value)) return `${label}에 허용하지 않는 글자가 있어 뺐어요`;
  if (value.length > maxLen) return `${label}이(가) ${maxLen}자를 넘어 뺐어요`;
  if (looksSecret(value)) return "비밀값처럼 보여서 뺐어요";
  return null;
}

/** 링크: https, 허용한 곳(github.com·www.npmjs.com·pypi.org)만, 계정 정보·포트·물음표·# 없이. */
export function linkOk(link: string): boolean {
  if (link.length > LINK_MAX_LEN || !stable(link)) return false;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return false;
  }
  const clean = url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash;
  return clean && LINK_HOSTS.has(url.hostname) && LINK_PATH.test(url.pathname) && link === url.origin + url.pathname;
}

function envKeyProblem(key: string): string | null {
  const problem = textProblem("환경변수 이름", key, ENV_MAX_LEN);
  if (problem) return problem;
  const parts = key.split("_").filter(Boolean);
  if (!ENV_KEY.test(key) || parts.length > ENV_MAX_PARTS || parts.some((p) => ENV_BAD_PARTS.has(p))) return "환경변수 이름 형식이 맞지 않아 뺐어요";
  return null;
}

function pkgOk(item: InstallItem): boolean {
  if (item.kind === "skill") return SKILL_PATH.test(item.pkg) && !item.pkg.split("/").includes("..");
  if (item.ecosystem === "npm") return NPM_NAME.test(item.pkg);
  if (item.ecosystem === "pypi") return PYPI_NAME.test(item.pkg);
  return false;
}

function fieldProblem(item: InstallItem): string | null {
  const checks: [string, string][] = [["이름", item.name], ["패키지·경로", item.pkg]];
  if (item.version) checks.push(["버전", item.version]);
  if (item.pinTo) checks.push(["고친 버전", item.pinTo]);
  for (const [label, value] of checks) {
    const problem = textProblem(label, value);
    if (problem) return problem;
  }
  for (const key of item.envKeys ?? []) {
    const problem = envKeyProblem(key);
    if (problem) return problem;
  }
  return null;
}

function shapeProblem(item: InstallItem): string | null {
  if (!DISPLAY_NAME.test(item.name)) return "이름 형식이 맞지 않아 뺐어요";
  if (item.kind !== "skill" && !item.ecosystem) return "생태계(npm·PyPI)를 확인하지 못해 뺐어요";
  if (!pkgOk(item)) return "패키지·경로 형식이 맞지 않아 뺐어요";
  if (item.version && !VERSION.test(item.version)) return "버전 형식이 맞지 않아 뺐어요";
  if (item.pinTo && !VERSION.test(item.pinTo)) return "고친 버전 형식이 맞지 않아 뺐어요";
  if (item.link && !linkOk(item.link)) return "링크는 github.com·npmjs.com·pypi.org의 https 주소만 넣을 수 있어 뺐어요";
  return null;
}

/** 항목 하나를 검사한다. 통과하면 같은 값 그대로, 어긋나면 이유(빠진 값은 쓰지 않음). */
export function validateItem(item: InstallItem): Verdict {
  const problem = fieldProblem(item) ?? shapeProblem(item);
  return problem ? NO(problem) : { ok: true, item };
}
