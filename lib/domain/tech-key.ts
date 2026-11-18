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

type McpServer = { command?: string; args?: string[]; url?: string };

/**
 * `.mcp.json` 서버 하나 → 기술 키. 서버 이름은 사용자가 붙인 별명이라 쓰지 않는다.
 * 알 수 없는 실행 방식(직접 만든 스크립트 등)이면 null = "찾지 못함".
 */
export function mcpServerKey(server: McpServer): TechRef | null {
  if (server.url) {
    try {
      return { key: `url:${new URL(server.url).host.toLowerCase()}`, version: null };
    } catch {
      return null;
    }
  }
  const args = (server.args ?? []).filter((a) => !a.startsWith("-"));
  const cmd = (server.command ?? "").trim();
  if (cmd === "npx" && args[0]) {
    const { name, version } = splitNpmSpec(args[0]);
    return npmKey(name, version);
  }
  if (cmd === "uvx" && args[0]) return pypiKey(args[0]);
  if (cmd === "pipx" && args[0] === "run" && args[1]) return pypiKey(args[1]);
  return null;
}
