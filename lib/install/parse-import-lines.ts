// 내 컴퓨터 목록 가져오기(SPEC-6.2): "종류|이름|패키지 또는 경로|버전" 한 줄에 하나만 받는다.
// 키·토큰처럼 보이는 줄은 저장하지 않고 줄 번호만 돌려준다(값은 어디에도 다시 쓰지 않는다).
import { maskSecrets } from "../domain/redact.ts";
import type { Ecosystem, InstallItem, ItemKind } from "./types.ts";
import { validateItem } from "./validate-item.ts";

export type ParseResult = {
  items: InstallItem[];
  /** 형식이 어긋나거나 값 검사에서 걸려 건너뛴 줄(번호와 이유만) */
  skipped: { line: number; reason: string }[];
  /** "비밀값처럼 보여서 뺐어요"로 보여 줄 줄 번호 */
  secretLines: number[];
};

const KINDS: Record<string, ItemKind> = { mcp: "mcp", skill: "skill", "스킬": "skill", plugin: "plugin", "플러그인": "plugin", sdk: "sdk" };
const HEADER = "종류|이름|패키지 또는 경로|버전";
const LONG_RANDOM = /(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}/;
const NPM_NAME = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

const looksSecret = (line: string) => maskSecrets(line) !== line || LONG_RANDOM.test(line);

/** `npm:이름` · `pypi:이름` 접두어가 있으면 따르고, 없으면 npm 규칙에 맞을 때 npm, 아니면 PyPI로 본다. */
function splitEcosystem(raw: string): { ecosystem: Ecosystem; pkg: string } {
  const m = /^(npm|pypi):(.+)$/.exec(raw);
  if (m) return { ecosystem: m[1] as Ecosystem, pkg: m[2] };
  return { ecosystem: NPM_NAME.test(raw) ? "npm" : "pypi", pkg: raw };
}

function toItem(fields: string[]): InstallItem | string {
  const [kindRaw, name, target, versionRaw] = fields.map((f) => f.trim());
  const kind = KINDS[kindRaw.toLowerCase()];
  if (!kind) return "종류는 mcp·skill·plugin·sdk만 쓸 수 있어요";
  if (!name || !target) return "이름과 패키지 또는 경로가 비어 있어요";
  const version = versionRaw === "" || versionRaw === "-" ? null : versionRaw;
  if (kind === "skill") return { kind, name, source: "import", pkg: target, version };
  return { kind, name, source: "import", version, ...splitEcosystem(target) };
}

export function parseImportLines(text: string): ParseResult {
  const result: ParseResult = { items: [], skipped: [], secretLines: [] };
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === HEADER) return;
    if (looksSecret(trimmed)) return void result.secretLines.push(line);
    const fields = trimmed.split("|");
    if (fields.length !== 4) return void result.skipped.push({ line, reason: "형식이 맞지 않아요(종류|이름|패키지 또는 경로|버전, 4칸)" });
    const item = toItem(fields);
    if (typeof item === "string") return void result.skipped.push({ line, reason: item });
    const verdict = validateItem(item);
    if (!verdict.ok) return void result.skipped.push({ line, reason: verdict.reason });
    const key = `${item.kind}|${item.name}|${item.pkg}|${item.version ?? ""}`;
    if (!seen.has(key)) result.items.push(item);
    seen.add(key);
  });
  return result;
}
