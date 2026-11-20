// "+ 기술 넣기"(design.md 13절 5): 붙여 넣은 글을 한 줄에 하나씩 무엇을 찾을지로 바꾸는 순수 함수.
// 패키지 주소·설치 명령은 기술 키로 정확히, GitHub 주소는 저장소로, 글은 이름으로. 영상·SNS 링크는 기술을 알 수 없어 이름을 적어 달라고 한다.
import { npmKey, pypiKey } from "../domain/tech-key.ts";

export type CaptureLine =
  | { kind: "key"; text: string; key: string }
  | { kind: "repo"; text: string; owner: string; repo: string }
  | { kind: "name"; text: string; name: string }
  | { kind: "media"; text: string }
  | { kind: "bad"; text: string; reason: string };

export const MAX_LINES = 20;
const MEDIA = /(^|\.)(youtube\.com|youtu\.be|x\.com|twitter\.com|instagram\.com|tiktok\.com|threads\.net|facebook\.com|linkedin\.com|naver\.me|blog\.naver\.com|velog\.io|medium\.com)$/i;
const len = (s: string) => [...s].length; // DB처럼 코드 포인트로 센다

function fromUrl(text: string, url: URL): CaptureLine {
  const host = url.hostname.replace(/^www\./, ""), parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (host === "github.com" && parts.length >= 2) return { kind: "repo", text, owner: parts[0].toLowerCase(), repo: parts[1].replace(/\.git$/i, "").toLowerCase() };
  if (host === "npmjs.com" && parts[0] === "package" && parts[1]) return { kind: "key", text, key: npmKey(parts[1].startsWith("@") && parts[2] ? `${parts[1]}/${parts[2]}` : parts[1]).key };
  if (host === "pypi.org" && parts[0] === "project" && parts[1]) return { kind: "key", text, key: pypiKey(parts[1]).key };
  if (MEDIA.test(host)) return { kind: "media", text };
  return { kind: "bad", text, reason: "이 주소에서는 어떤 기술인지 알 수 없어요. GitHub·npm·PyPI 주소나 기술 이름을 적어 주세요." };
}

const NPM_RUN = new Set(["npx", "bunx"]), NPM_ADD = new Set(["i", "install", "add", "dlx"]);
const PY_RUN = new Set(["uvx"]), PY_ADD = new Set(["install", "add", "run"]);

/** `npx -y @scope/pkg`, `pnpm dlx pkg`, `uvx tool`, `pip install "pkg[cli]==1.0"`, `uv pip install pkg` 같은 설치·실행 명령의 패키지 */
function fromCommand(text: string): CaptureLine | null {
  const words = text.replace(/["'`]/g, "").split(/\s+/).map((w) => w.toLowerCase());
  if (words[0] === "uv" && words[1] === "pip") words.splice(0, 2, "pip"); // uv pip install x = pip install x
  const [tool, sub = ""] = words;
  const skip = NPM_RUN.has(tool) || PY_RUN.has(tool) ? 1 : 2;
  const spec = words.slice(skip).find((w) => !w.startsWith("-"));
  if (!spec) return null;
  if (NPM_RUN.has(tool) || (["npm", "pnpm", "yarn", "bun"].includes(tool) && NPM_ADD.has(sub))) {
    const at = spec.lastIndexOf("@"); // 이름 뒤 버전 떼기(@scope 앞의 @는 그대로)
    return { kind: "key", text, key: npmKey(at > 0 ? spec.slice(0, at) : spec).key };
  }
  if (PY_RUN.has(tool) || (["pip", "pip3", "pipx", "uv"].includes(tool) && PY_ADD.has(sub))) {
    return { kind: "key", text, key: pypiKey(spec.split(/[[=<>~!@]/)[0]).key }; // 추가 기능 [cli] · 버전 조건 떼기
  }
  return null;
}

export function parseCaptureLines(raw: string): CaptureLine[] {
  const seen = new Set<string>();
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !seen.has(l) && seen.add(l)).slice(0, MAX_LINES);
  return lines.map((text): CaptureLine => {
    if (/^https?:\/\//i.test(text)) { try { return fromUrl(text, new URL(text)); } catch { return { kind: "bad", text, reason: "주소 모양이 아니에요." }; } }
    const cmd = fromCommand(text);
    if (cmd) return cmd;
    if (len(text) < 2) return { kind: "bad", text, reason: "두 글자 이상 적어 주세요." };
    if (len(text) > 60) return { kind: "bad", text, reason: "한 줄에 기술 하나만, 60자 안으로 적어 주세요." };
    return { kind: "name", text, name: text };
  });
}
