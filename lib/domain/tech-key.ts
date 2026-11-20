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

// 안쪽에서만 쓰이는 이름의 끝맺음. 점 단위로만 맞춘다(localhostx.com·example.local.com은 공개 주소다).
const PRIVATE_SUFFIXES = ["localhost", "local", "internal", "lan", "home", "corp", "intranet", "private", "home.arpa"];

// IPv4 앞 두 칸으로 판단: 0/8·10/8·127/8·100.64/10(공유)·169.254/16(링크로컬)·172.16/12·192.168/16·224 이상(멀티캐스트·예약)
const ipv4Private = ([a, b]: number[]) =>
  a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);

function ipv6Private(addr: string): boolean {
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(addr); // URL이 ::ffff:1.2.3.4를 이 모양으로 바꿔 준다
  if (mapped) {
    const hi = parseInt(mapped[1], 16);
    return ipv4Private([hi >> 8, hi & 255]);
  }
  if (addr.startsWith("::")) return true; // ::(미지정)·::1(루프백)·옛 IPv4 호환 주소. 공개 IPv6는 ::로 시작하지 않는다
  return /^f[cd][0-9a-f]{2}:/.test(addr) || /^fe[89ab][0-9a-f]:/.test(addr) || /^ff[0-9a-f]{2}:/.test(addr); // fc00::/7(사설)·fe80::/10(링크로컬)·ff00::/8(멀티캐스트)
}

/**
 * 인터넷의 원격 서버가 아닌 호스트인가: 내 컴퓨터·사설·링크로컬 주소, 점이 없는 이름(localhost·도커 서비스 이름), .local·.internal·.lan 같은 안쪽 이름.
 * `URL.hostname`을 받는다: URL이 10진·16진·줄임 IPv4(2130706433·0x7f000001·127.1)를 점 표기로 바꿔 주므로 여기서는 점 표기만 본다.
 * shortcut: 이름을 DNS로 풀어 보지 않는다(공개 이름이 사설 IP를 가리키면 못 거른다). 필요해지면 서버에서 풀어 확인한다.
 */
export function isPrivateHost(rawHost: string): boolean {
  let host = rawHost.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) return ipv6Private(host.slice(1, -1));
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (!host.includes(".")) return true; // 빈 이름·점 없는 이름은 공개 주소가 아니다
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) return ipv4Private([Number(v4[1]), Number(v4[2])]);
  return PRIVATE_SUFFIXES.some((s) => host === s || host.endsWith("." + s));
}

/**
 * `.mcp.json` 서버 하나 → 기술 키. 서버 이름은 사용자가 붙인 별명이라 쓰지 않는다.
 * 알 수 없는 실행 방식(직접 만든 스크립트 등)과, 원격이 아닌 주소(내 컴퓨터·사설 주소·http(s)가 아닌 주소)는 null = "찾지 못함·서버 별명만".
 * 모두가 보는 공용 카탈로그에 쓸모없는 점이나 안쪽 호스트 이름이 올라가지 않게 한다(SPEC-7.3의 url 규칙은 원격 주소만).
 */
export function mcpServerKey(server: McpServer): TechRef | null {
  if (server.url) {
    try {
      const u = new URL(server.url);
      if ((u.protocol !== "http:" && u.protocol !== "https:") || isPrivateHost(u.hostname)) return null;
      return { key: `url:${u.host.toLowerCase()}`, version: null };
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
