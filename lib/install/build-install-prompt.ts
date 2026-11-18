// 설치 프롬프트(SPEC-6.1): 정해진 틀 그대로, 세 출처에서 온 값만. AI가 쓰지 않는 순수 함수라 같은 입력이면 항상 같은 글이다.
import type { Excluded, InstallItem, Scope } from "./types.ts";
import { validateItem } from "./validate-item.ts";

export type PromptResult = { text: string; includedCount: number; excluded: Excluded[] };

const HEAD = [
  "이 컴퓨터에 아래 AI 코딩 도구를 설치해 줘. 꼭 지킬 것:",
  "1. 하나씩, 설치하기 전에 무엇을 어디에 설치하는지 보여 주고 나에게 확인받아.",
  "2. 아래에 적힌 이름과 버전 그대로만 설치해. 비슷한 이름을 찾아 바꾸지 마.",
  "3. <여기에 직접 입력> 칸은 추측하지 말고 나에게 물어봐.",
  "4. 실패하면 멈추고 이유를 알려 줘.",
];
const BLANK = "<여기에 직접 입력>";
const MCP_PLACE: Record<Scope, string> = { project: ".mcp.json", user: "사용자 설정" };
const SKILL_PLACE: Record<Scope, string> = { project: "프로젝트 .claude/skills/", user: "~/.claude/skills/" };
const GITHUB_PATH = /^github\.com\/[^/]+\/[^/]+(\/.+)?$/;

const ver = (v: string | null | undefined) => (v ? `@${v}` : " (버전 미지정)");
const VERSION_OK = /^\d[0-9A-Za-z.+-]*$/;
// 위험 이유에는 바깥 글을 넣지 않는다(SPEC-6): 취약점 ID 모양만 뽑아 쓰고, 없으면 앱에서 보라고만 쓴다(PR #42 검토 반영)
const ADVISORY_ID = /\b(GHSA(?:-[0-9a-z]{4}){3}|CVE-\d{4}-\d{4,})\b/gi;

export function safeReason(reason: string): string {
  const ids = [...reason.matchAll(ADVISORY_ID)].map((m) => (m[1].toUpperCase().startsWith("GHSA") ? `GHSA${m[1].slice(4).toLowerCase()}` : m[1].toUpperCase()));
  const shown = [...new Set(ids)].sort();
  return shown.length > 0 ? `${shown.join(", ")} (자세한 이유는 앱에서 확인)` : "이유는 앱에서 확인";
}

/** 정렬·합치기에 쓰는 같은 항목 판단 기준: 위험 표시·출처 말고 프롬프트에 나오는 모든 칸 */
function identity(item: InstallItem): string[] {
  return [item.name, item.version ?? "", item.kind, item.pkg, item.ecosystem ?? "", item.scope ?? "", item.link ?? "", [...(item.envKeys ?? [])].sort().join(",")];
}

/** 이름 → 버전 → 종류 → 패키지 → 생태계 → 설정 위치 → 링크 → 환경변수 순. 완전히 같으면 0 */
export function compareItems(a: InstallItem, b: InstallItem): number {
  const x = identity(a), y = identity(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

function effective(item: InstallItem): InstallItem {
  return item.pinTo ? { ...item, version: item.pinTo } : item; // 보안 경고에서 고른 것은 고친 버전으로 고정(ADR 0012)
}

function sourceProblem(item: InstallItem): string | null {
  if (item.source === "candidate" && item.registryName !== item.pkg) return "공식 레지스트리 이름과 정확히 일치하지 않아 뺐어요";
  if (item.kind === "skill" && !GITHUB_PATH.test(item.pkg)) return "가져올 곳이 GitHub 주소가 아니라 뺐어요";
  return null;
}

function line(item: InstallItem): string {
  const link = `출처: ${item.link ?? "(링크 없음)"}`;
  const danger = item.danger && item.userIncluded ? ` | 위험: ${safeReason(item.danger.reason)}` : "";
  if (item.kind === "skill") return `- ${item.name} | 가져올 곳: ${item.pkg} | 넣을 곳: ${SKILL_PLACE[item.scope ?? "project"]}${danger}`;
  const pkg = `${item.pkg}${ver(item.version)}`;
  if (item.kind !== "mcp") return `- ${item.name} | ${item.ecosystem} ${pkg} | ${link}${danger}`;
  const keys = [...(item.envKeys ?? [])].sort().map((k) => `\n  환경변수: ${k}=${BLANK}`).join("");
  return `- ${item.name} | ${item.ecosystem} ${pkg} | 설정 위치: ${MCP_PLACE[item.scope ?? "project"]} | ${link}${danger}${keys}`;
}

function dangerLine(item: InstallItem): string {
  const fixed = item.danger?.fixedVersion;
  const tail = fixed && fixed.length <= 64 && VERSION_OK.test(fixed) ? `${fixed}(으)로 바꾸면 넣을 수 있어요.` : "고친 버전이 아직 없어요.";
  return `- ${item.name}${ver(item.version)} — 위험: ${safeReason(item.danger?.reason ?? "")}. ${tail}`;
}

/** 같은 항목이 여러 번 오면 하나로. 하나라도 위험이면 위험으로 남기고, 사용자가 모두 직접 넣은 경우에만 넣는다. */
function merge(group: InstallItem[]): InstallItem {
  const risky = group.filter((i) => i.danger);
  if (risky.length === 0) return group[0];
  const pick = [...risky].sort((a, b) => (JSON.stringify(a.danger) < JSON.stringify(b.danger) ? -1 : JSON.stringify(a.danger) > JSON.stringify(b.danger) ? 1 : 0))[0];
  return { ...pick, userIncluded: risky.every((i) => i.userIncluded === true) };
}

type Groups = { mcp: InstallItem[]; skill: InstallItem[]; other: InstallItem[]; danger: InstallItem[]; excluded: Excluded[] };

function sort(input: InstallItem[]): Groups {
  const g: Groups = { mcp: [], skill: [], other: [], danger: [], excluded: [] };
  const same = new Map<string, InstallItem[]>();
  for (const raw of input) {
    const item = effective(raw);
    const verdict = validateItem(item);
    const problem = verdict.ok ? sourceProblem(item) : verdict.reason;
    if (problem) { g.excluded.push({ why: problem }); continue; }
    const key = JSON.stringify(identity(item));
    same.set(key, [...(same.get(key) ?? []), item]);
  }
  for (const group of same.values()) {
    const item = merge(group);
    if (item.danger && !item.userIncluded) g.danger.push(item);
    else (item.kind === "mcp" ? g.mcp : item.kind === "skill" ? g.skill : g.other).push(item);
  }
  return g;
}

function section(title: string, lines: string[]): string[] {
  return lines.length === 0 ? [] : ["", title, ...lines];
}

export function buildInstallPrompt(items: InstallItem[]): PromptResult {
  const g = sort(items);
  const ordered = (list: InstallItem[]) => [...list].sort(compareItems);
  const reasons = [...g.excluded.map((e) => e.why)].sort().map((why) => `- (이름은 쓰지 않음) — ${why}.`);
  const included = g.mcp.length + g.skill.length + g.other.length;
  const text = [
    ...HEAD,
    ...(included === 0 ? ["", "(넣을 항목이 없어요)"] : []),
    ...section("[MCP 서버]", ordered(g.mcp).map(line)),
    ...section("[스킬]", ordered(g.skill).map(line)),
    ...section("[플러그인 · SDK]", ordered(g.other).map(line)),
    ...section("[넣지 않은 것 (위험)]", ordered(g.danger).map(dangerLine)),
    ...section("[넣지 않은 것 (값 검사)]", reasons),
  ].join("\n");
  return { text, includedCount: included, excluded: g.excluded };
}
