// 별 후보의 순수 규칙(P-21a, ADR 0030, 데이터설계 8절 "별 후보"): 검색 응답 읽기, 관문, 의심 표시, 태그 안 점수, 상위 고르기. 바깥 호출·DB는 lib/server.
// 별은 "한번 볼 만하다"는 신호일 뿐이라 관문 → 의심 거르기 → 점수 순으로 쓴다. 숫자는 모두 팀 추정(첫 수집 뒤 세어 고친다).
// 응답 모양이 다르면 0건이 아니라 null: 못 읽은 것을 "후보 없음"으로 단정하지 않는다(불변 2).
import { repoKey, repoRefOf } from "./github-repo.ts";

export const SEARCH_TAGS = ["mcp-server", "mcp", "agent-skills", "claude-skills"] as const;
export type SearchTag = (typeof SEARCH_TAGS)[number];
export const MIN_STARS = 1_000;
export const TOP_CAP = 100;
export type Flag = "new_spike" | "clone_cluster";

/** 검색 결과 한 건. license는 SPDX 이름(파일은 있는데 못 알아보면 other), 없으면 null */
export type SearchRepo = {
  owner: string; repo: string; fullName: string; htmlUrl: string; description: string | null; stars: number; forks: number;
  pushedAt: string | null; createdAt: string; archived: boolean; fork: boolean; license: string | null; ownerType: string;
};
export type SearchPage = { total: number; incomplete: boolean; items: SearchRepo[] };
/** 읽은 태그와 공식 레지스트리 줄과 합쳐지는지(DB를 본 쪽이 채움)를 붙인 후보 */
export type Candidate = SearchRepo & { tags: SearchTag[]; inRegistry: boolean };
export type Scored = Candidate & { key: string; score: number };
/** rest: 상위·의심이 아닌 나머지(관문 탈락 포함). 전에 붙인 의심 표시·점수를 현재 값으로 맞추는 데 쓴다(score는 관문 탈락이면 null) */
export type Plan = { top: Scored[]; suspects: (Candidate & { key: string; flags: Flag[] })[]; rest: (Candidate & { key: string; score: number | null })[]; gated: number };

const DAY = 24 * 60 * 60 * 1000;
const STALE_AFTER_MS = 365 * DAY; // 마지막 푸시 12개월
const SPIKE_AGE_DAYS = 30; // 생성 30일 미만인데
const SPIKE_STARS = 500; // 별이 이만큼이면 new_spike
const CLONE_GAP_PCT = 5; // 같은 이름 다른 소유자들의 별 차이(최대 대비)가 이 % 이하면 clone_cluster
const MIN_AGE_DAYS = 30; // 성장(별÷나이)의 나이 하한: 갓 만든 저장소가 성장 점수를 독차지하지 않게
// 가중치는 한 곳에(합 100). 신뢰는 조직 소유 · 라이선스 있음 · 공식 레지스트리 줄과 합쳐짐의 개수
export const WEIGHTS = { stars: 30, growth: 25, forks: 15, activity: 15, trust: 15 } as const;
const MAX_ONE_LINER = 200;

const asRecord = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isTime = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

function licenseOf(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  const id = asRecord(v)?.spdx_id;
  if (id === null || id === "NOASSERTION") return "other";
  return typeof id === "string" ? id : undefined;
}

/** 검색 결과 한 건. 필요한 칸의 모양이 하나라도 다르거나 주소에 쓸 수 없는 이름이면 null */
function readItem(raw: unknown): SearchRepo | null {
  const r = asRecord(raw);
  const owner = asRecord(r?.owner);
  const license = licenseOf(r?.license);
  const ref = typeof r?.full_name === "string" ? repoRefOf({ tech_key: `github:${r.full_name}`, repo_url: null }) : null;
  if (!r || !owner || !ref || license === undefined || typeof r.html_url !== "string" || !isCount(r.stargazers_count) || !isCount(r.forks_count)) return null;
  if (!isTime(r.created_at) || (r.pushed_at !== null && !isTime(r.pushed_at)) || typeof r.archived !== "boolean" || typeof r.fork !== "boolean" || typeof owner.type !== "string") return null;
  return {
    owner: ref.owner, repo: ref.repo, fullName: r.full_name as string, htmlUrl: r.html_url, description: typeof r.description === "string" ? r.description : null,
    stars: r.stargazers_count, forks: r.forks_count, pushedAt: r.pushed_at as string | null, createdAt: r.created_at, archived: r.archived, fork: r.fork, license, ownerType: owner.type,
  };
}

/** 검색 응답 한 쪽. 전체나 한 건이라도 모양이 다르면 null(일부만 읽고 "이게 전부"라 하지 않는다) */
export function readSearchPage(text: string): SearchPage | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const rec = asRecord(json);
  if (!rec || !isCount(rec.total_count) || typeof rec.incomplete_results !== "boolean" || !Array.isArray(rec.items)) return null;
  const items = rec.items.map(readItem);
  return items.every((i) => i !== null) ? { total: rec.total_count, incomplete: rec.incomplete_results, items: items as SearchRepo[] } : null;
}

export const candidateKey = (r: { owner: string; repo: string }) => `github:${repoKey(r)}`;
const ageDays = (iso: string, nowMs: number) => (nowMs - Date.parse(iso)) / DAY;

/** 관문(의심 빼고): 보관 아님 · 포크 아님 · 마지막 푸시 12개월 이내(푸시가 없으면 통과 못 함) */
export const passesGate = (r: SearchRepo, nowMs: number): boolean =>
  !r.archived && !r.fork && r.pushedAt !== null && nowMs - Date.parse(r.pushedAt) <= STALE_AFTER_MS;

/**
 * 의심 표시. 관문(보관·포크·12개월)을 통과한 저장소끼리만 본다: 버려진 저장소가 정상 기술을 복제본으로 끌어들이지 않게.
 * 같은 이름 묶음에서 생성일이 가장 이른 것은 원본으로 보고 표시하지 않는다(남이 같은 이름으로 만들어도 원본의 알림은 막히지 않게). 표시는 "확인 필요"이지 증명이 아니다
 */
export function flagsOf(all: SearchRepo[], nowMs: number): Map<string, Flag[]> {
  const byName = new Map<string, SearchRepo[]>();
  for (const r of all) byName.set(r.repo.toLowerCase(), [...(byName.get(r.repo.toLowerCase()) ?? []), r]);
  const flags = new Map<string, Flag[]>();
  for (const r of all) {
    const out: Flag[] = [];
    if (ageDays(r.createdAt, nowMs) < SPIKE_AGE_DAYS && r.stars >= SPIKE_STARS) out.push("new_spike");
    const group = byName.get(r.repo.toLowerCase())!;
    if (isCloneCluster(group) && oldest(group) !== r) out.push("clone_cluster");
    flags.set(candidateKey(r), out);
  }
  return flags;
}

const oldest = (group: SearchRepo[]) => group.reduce((a, b) => (Date.parse(b.createdAt) < Date.parse(a.createdAt) ? b : a));

function isCloneCluster(group: SearchRepo[]): boolean {
  if (new Set(group.map((r) => r.owner.toLowerCase())).size < 2) return false;
  const stars = group.map((r) => r.stars);
  const max = Math.max(...stars);
  return (max - Math.min(...stars)) * 100 <= max * CLONE_GAP_PCT; // 정수로 비교해 경계(정확히 5%)가 소수 오차로 흔들리지 않게
}

/** 값마다 백분위(0~1). 같은 값은 같은 자리(가운데 순위), 하나뿐이면 1 */
export function percentiles(values: number[]): number[] {
  if (values.length === 1) return [1];
  return values.map((v) => {
    const below = values.filter((x) => x < v).length;
    const same = values.filter((x) => x === v).length;
    return (below + (same - 1) / 2) / (values.length - 1);
  });
}

const trustOf = (c: Candidate) => Number(c.ownerType === "Organization") + Number(c.license !== null) + Number(c.inRegistry);
const metricsOf = (c: Candidate, nowMs: number) => ({
  stars: c.stars, growth: c.stars / Math.max(ageDays(c.createdAt, nowMs), MIN_AGE_DAYS), forks: c.forks, activity: Date.parse(c.pushedAt!), trust: trustOf(c),
});

/** 한 태그 안 점수(0~100): 항목마다 백분위에 가중치를 곱해 더한다 */
function scoreTag(group: Candidate[], nowMs: number): Map<string, number> {
  const m = group.map((c) => metricsOf(c, nowMs));
  const total = group.map(() => 0);
  for (const [name, w] of Object.entries(WEIGHTS) as [keyof typeof WEIGHTS, number][]) {
    percentiles(m.map((x) => x[name])).forEach((p, i) => (total[i] += p * w));
  }
  return new Map(group.map((c, i) => [candidateKey(c), Math.round(total[i] * 10) / 10]));
}

/** 태그마다 따로 매기고, 여러 태그에 나온 후보는 가장 높은 점수를 쓴다 */
export function scoreByTag(eligible: Candidate[], nowMs: number): Map<string, number> {
  const best = new Map<string, number>();
  for (const tag of SEARCH_TAGS) {
    for (const [key, s] of scoreTag(eligible.filter((c) => c.tags.includes(tag)), nowMs)) best.set(key, Math.max(best.get(key) ?? 0, s));
  }
  return best;
}

/** 점수 높은 순(같으면 별 많은 순, 그다음 키) 상위 cap곳 */
export const pickTop = (scored: Scored[], cap = TOP_CAP): Scored[] =>
  [...scored].sort((a, b) => b.score - a.score || b.stars - a.stars || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).slice(0, cap);

/** 관문에서 떨어진 것(보관·포크·12개월)은 버리고, 의심이 붙은 것은 NEW 후보(얇게)로 따로, 나머지를 태그 안 점수로 매겨 상위를 고른다 */
export function planCandidates(all: Candidate[], nowMs: number): Plan {
  const open = all.filter((c) => passesGate(c, nowMs));
  const flags = flagsOf(open, nowMs);
  const suspects = open.filter((c) => flags.get(candidateKey(c))!.length > 0).map((c) => ({ ...c, key: candidateKey(c), flags: flags.get(candidateKey(c))! }));
  const eligible = open.filter((c) => flags.get(candidateKey(c))!.length === 0);
  const scores = scoreByTag(eligible, nowMs);
  const top = pickTop(eligible.map((c) => ({ ...c, key: candidateKey(c), score: scores.get(candidateKey(c))! })));
  const picked = new Set([...top, ...suspects].map((c) => c.key));
  const rest = all.filter((c) => !picked.has(candidateKey(c))).map((c) => ({ ...c, key: candidateKey(c), score: scores.get(candidateKey(c)) ?? null }));
  return { top, suspects, rest, gated: all.length - open.length };
}

/** 종류 임시 추정: mcp 태그가 하나라도 있으면 mcp(여러 태그면 mcp 먼저), 아니면 skill */
export const typeOf = (tags: SearchTag[]): "mcp" | "skill" => (tags.some((t) => t === "mcp-server" || t === "mcp") ? "mcp" : "skill");

/** 한 줄 설명: 공백을 한 칸으로, 200자(코드 포인트)에서 자름, 비면 null. 이모지(대리쌍)를 반으로 자르면 Postgres가 그 글을 거부한다 */
export function oneLinerOf(description: string | null): string | null {
  const chars = Array.from((description ?? "").replace(/\s+/g, " ").trim());
  if (chars.length === 0) return null;
  return chars.length > MAX_ONE_LINER ? `${chars.slice(0, MAX_ONE_LINER - 1).join("")}…` : chars.join("");
}
