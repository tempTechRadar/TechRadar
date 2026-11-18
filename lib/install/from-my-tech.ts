// 내 기술 목록 줄 → 설치 프롬프트 항목(SPEC-4.3 세 출처). 화면이 읽은 값을 그대로 옮길 뿐, 값 검사는 buildInstallPrompt가 한다.
// 직접 이름만 쓴 기술(manual)은 세 출처가 아니라 넣지 않는다. 기술 키가 패키지가 아니면(url: 등) 넣지 않는다.
import { cmpVersion } from "../domain/grade.ts";
import type { InstallItem, ItemKind } from "./types.ts";

export type MyTechRow = {
  id: string;
  origin: "repo" | "manual" | "import";
  version: string | null;
  grade: "pass" | "caution" | "danger" | "unknown";
  grade_reason: string | null;
  grade_evidence: { id?: string; severity?: string; fixed?: string | null }[] | null;
  hidden_at: string | null;
  technologies: { tech_key: string; type: string; repo_url: string | null } | null;
};

export type NotIncluded = { id: string; why: string };

const KIND: Record<string, ItemKind> = { mcp: "mcp", skill: "skill", plugin: "plugin" };
const HIGH = new Set(["HIGH", "CRITICAL"]);

/** 위험을 모두 고치는 버전: HIGH·CRITICAL마다 고친 버전 중 가장 높은 것. 하나라도 고친 버전이 없으면 null(짐작하지 않음) */
export function fixedVersionOf(evidence: MyTechRow["grade_evidence"]): string | undefined {
  const high = (evidence ?? []).filter((e) => HIGH.has(String(e.severity ?? "").toUpperCase()));
  if (high.length === 0 || high.some((e) => !e.fixed)) return undefined;
  return high.map((e) => e.fixed as string).sort(cmpVersion).at(-1);
}

function packageOf(techKey: string, kind: ItemKind): Pick<InstallItem, "ecosystem" | "pkg" | "kind"> | null {
  const [prefix, ...rest] = techKey.split(":");
  const name = rest.join(":");
  if (prefix === "npm" || prefix === "pypi") return { kind: kind === "skill" ? "sdk" : kind, ecosystem: prefix, pkg: name };
  if (prefix === "skill") {
    const [owner, repo, skill] = name.split("/");
    return owner && repo && skill ? { kind: "skill", pkg: `github.com/${owner}/${repo}/.claude/skills/${skill}` } : null;
  }
  return null;
}

/** 링크는 허용한 곳(github.com)만 넘긴다. 나머지는 buildInstallPrompt가 빼므로 아예 넘기지 않는다 */
const linkOf = (url: string | null) => (url && url.startsWith("https://github.com/") ? url.replace(/\.git$/, "").replace(/\/$/, "") : undefined);

/**
 * pinned: 보안 경고에서 "고친 버전으로 올리기(적용 후보)"를 고른 내 기술 id → 고친 버전(ADR 0012).
 */
export function toInstallItems(rows: MyTechRow[], pinned: Map<string, string>): { items: InstallItem[]; notIncluded: NotIncluded[] } {
  const items: InstallItem[] = [];
  const notIncluded: NotIncluded[] = [];
  for (const r of rows) {
    if (r.hidden_at) continue;
    if (r.origin === "manual" || !r.technologies) { notIncluded.push({ id: r.id, why: "직접 이름만 쓴 기술은 설치 이름을 확인할 수 없어 넣지 않아요" }); continue; }
    const pkg = packageOf(r.technologies.tech_key, KIND[r.technologies.type] ?? "sdk");
    if (!pkg) { notIncluded.push({ id: r.id, why: "패키지 이름이 없는 기술이라 넣지 않아요" }); continue; }
    const name = pkg.kind === "skill" ? pkg.pkg.split("/").at(-1)! : pkg.pkg;
    const item: InstallItem = {
      ...pkg,
      name,
      source: r.origin === "import" ? "import" : "repo",
      version: r.version,
      scope: r.origin === "import" ? "user" : "project",
      link: linkOf(r.technologies.repo_url),
      pinTo: pinned.get(r.id),
    };
    if (r.grade === "danger" && !item.pinTo) {
      item.danger = { reason: r.grade_reason ?? "", fixedVersion: fixedVersionOf(r.grade_evidence) };
    }
    items.push(item);
  }
  return { items, notIncluded };
}
