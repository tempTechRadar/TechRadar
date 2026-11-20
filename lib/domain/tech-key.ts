// 기술 키 만드는 규칙(SPEC-7.3). DB·네트워크를 모르는 순수 규칙이라 어디서든 부를 수 있다.

export type TechRef = { key: string; version: string | null };

export function npmKey(name: string, version: string | null = null): TechRef {
  return { key: `npm:${name.trim().toLowerCase()}`, version };
}

/** PyPI 이름은 대소문자와 `-` `_` `.`를 같게 본다(PEP 503). */
export function pypiKey(name: string, version: string | null = null): TechRef {
  return { key: `pypi:${name.trim().toLowerCase().replace(/[-_.]+/g, "-")}`, version };
}

export function skillKey(owner: string, repo: string, name: string): TechRef {
  return { key: `skill:${owner}/${repo}/${name}`.toLowerCase(), version: null };
}

/** `pkg@1.2.3`, `@scope/pkg@1.2.3`처럼 이름 뒤에 붙은 버전을 떼어 낸다. */
export function splitNpmSpec(spec: string): { name: string; version: string | null } {
  const at = spec.lastIndexOf("@");
  if (at <= 0) return { name: spec, version: null };
  return { name: spec.slice(0, at), version: spec.slice(at + 1) || null };
}

type McpServer = { command?: string; args?: string[]; url?: string; httpUrl?: string };
// npm · PyPI 이름 모양(선택 버전 포함, 길이 100 안). 옵션 값(토큰 · git 주소 · ${input:…})이 기술 키 · 공용 카탈로그 이름이 되지 않게 이 모양만 받는다
const PACKAGE_SPEC = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*(?:@[0-9A-Za-z.^~<>=*+-]{1,40})?$/i;
const isPackageSpec = (a: string) => a.length <= 100 && PACKAGE_SPEC.test(a);

/**
 * `.mcp.json` 서버 하나 → 기술 키. 서버 이름은 사용자가 붙인 별명이라 쓰지 않는다.
 * 알 수 없는 실행 방식(직접 만든 스크립트 등)이면 null = "찾지 못함".
 */
// 값을 받지 않는 켜기/끄기 옵션. 그 밖의 옵션(--key x · --from x 등)은 다음 인자가 값이라 함께 건너뛴다: 토큰 · 주소가 기술 이름이 되지 않게
const BOOLEAN_FLAGS = new Set(["-y", "--yes", "-q", "--quiet", "--silent", "--no-install", "--prefer-offline", "--offline", "--isolated"]);
const PACKAGE_FLAGS = new Set(["-p", "--package"]); // npx -p <패키지>: 이 값은 패키지 이름이다

/** 실행 인자에서 위치 인자만(옵션과 그 값은 뺌), 패키지 이름 모양인 것만. -p/--package 값은 맨 앞에 둔다 */
export function positionalArgs(raw: unknown[]): string[] {
  const out: string[] = [], pkgs: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (typeof a !== "string") continue;
    if (a.startsWith("-")) {
      if (a.includes("=") || BOOLEAN_FLAGS.has(a)) continue; // --x=값 · 켜기 옵션은 그것만
      if (PACKAGE_FLAGS.has(a) && typeof raw[i + 1] === "string") pkgs.push(raw[i + 1] as string);
      i++; // 값을 받는 옵션: 다음 인자도 건너뜀
      continue;
    }
    out.push(a);
  }
  return [...pkgs, ...out].filter((a) => a === "run" || isPackageSpec(a));
}

export function mcpServerKey(server: McpServer): TechRef | null {
  const url = server.url ?? server.httpUrl; // Gemini CLI는 스트리밍 HTTP 서버를 httpUrl에 쓴다
  if (url) {
    try {
      return { key: `url:${new URL(url).host.toLowerCase()}`, version: null };
    } catch {
      return null;
    }
  }
  const args = positionalArgs(server.args ?? []);
  const cmd = (server.command ?? "").trim();
  if (cmd === "npx" && args[0]) {
    const { name, version } = splitNpmSpec(args[0]);
    return npmKey(name, version);
  }
  if (cmd === "uvx" && args[0]) return pypiKey(args[0]);
  if (cmd === "pipx" && args[0] === "run" && args[1]) return pypiKey(args[1]);
  return null;
}
