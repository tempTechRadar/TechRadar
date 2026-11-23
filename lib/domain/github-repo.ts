// GitHub 저장소 정보 읽기의 순수 규칙(P-9b, SPEC-8, 데이터설계 8절, ADR 0021): 기술 → 저장소, 응답 읽기, 상태 정하기. 바깥 호출·DB는 lib/server.
// 응답 모양이 다르면 0·"없음"이 아니라 null: 못 읽은 것을 "별 0·라이선스 없음"으로 단정하지 않는다(불변 2).
import { parseGithubRepo } from "./manifest.ts";

export type RepoRef = { owner: string; repo: string };
export type RepoInfo = { fullName: string; isPrivate: boolean; archived: boolean; pushedAt: string | null; stars: number; license: string };
/** 상태를 정한 출처. 칸에는 `github:<그때의 상태>`로 적는다: 다른 수집기·관리자가 status만 고치면 적힌 상태와 어긋나, 우리가 정한 것으로 안 본다(ADR 0021). */
export const STATUS_BY = "github";
export type StatusState = { status: string; statusBy: string | null; missed: number };
/** 못 찾았을 때 "사라짐"을 정하는 데 필요한 사정: 이 저장소를 한 번이라도 찾은 적이 있는지, 이번 연속 못 찾음의 첫 시각, 지금 */
export type MissContext = { everFound: boolean; firstMissAt: number | null; nowMs: number };

const DORMANT_AFTER_MS = 365 * 24 * 60 * 60 * 1000; // 12개월(데이터설계 8절, 팀 추정)
const MISSED_TO_GONE = 2; // 성공한 읽기에서 2번 연속 못 찾으면 출처에서 사라짐(데이터설계 8절)
const MIN_MISS_SPAN_MS = 12 * 60 * 60 * 1000; // 두 번의 404가 하루 두 번 눌러서(지금 한 번 실행) 생기지 않게: 첫 404에서 12시간은 지나야 함
const RANK: Record<string, number> = { active: 0, dormant: 1, deprecated: 2, gone: 3 };
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

// 주소 경로에 그대로 쓰이므로 `.`·`..` 조각은 막는다(같은 호스트의 다른 경로로 접힌다).
const hasDotSegment = (ref: RepoRef) => [ref.owner, ref.repo].some((s) => s === "." || s === "..");

/** 같은 저장소의 다른 표기(대소문자)를 하나로 보는 키. 묶기와 "찾은 저장소" 비교에 쓴다. */
export const repoKey = (ref: RepoRef): string => `${ref.owner}/${ref.repo}`.toLowerCase();

/**
 * `github:<소유자>/<저장소>` 키가 먼저, 그다음 `skill:<소유자>/<저장소>/<이름>` 키(스킬은 읽은 저장소가 키에 들어 있다, tech-key.ts), 없으면 repo_url(GitHub 주소).
 * GitHub 저장소가 아니거나 주소에 쓸 수 없는 이름이면 null. 끝의 `.git`은 주소 쪽(`parseGithubRepo`)과 같게 뗀다.
 */
export function repoRefOf(t: { tech_key: string; repo_url: string | null }): RepoRef | null {
  const key = /^github:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/i.exec(t.tech_key) ?? /^skill:([\w.-]+)\/([\w.-]+?)(?:\.git)?\/.+$/i.exec(t.tech_key);
  const url = key || !t.repo_url ? null : parseGithubRepo(t.repo_url);
  const ref = key ? { owner: key[1], repo: key[2] } : url ? { owner: url.owner, repo: url.repo } : null;
  return ref && !hasDotSegment(ref) ? ref : null;
}

export function repoApiUrl(ref: RepoRef): string {
  if (hasDotSegment(ref)) throw new RangeError(`주소에 쓸 수 없는 이름: ${ref.owner}/${ref.repo}`);
  return `https://api.github.com/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
}

const asRecord = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** 라이선스 칸: 없으면 none, 파일은 있는데 GitHub가 못 알아보면 other, 알아보면 SPDX 이름. 모양이 다르면 null. */
function licenseOf(v: unknown): string | null {
  if (v === null) return "none";
  const rec = asRecord(v);
  if (!rec || !("spdx_id" in rec)) return null;
  const id = rec.spdx_id;
  if (id !== null && typeof id !== "string") return null;
  return id === null || id === "NOASSERTION" ? "other" : id;
}

/** 마지막 푸시 시각: null(푸시가 없는 빈 저장소)이거나 ISO 시각 글. 그 밖은 undefined(모양이 다름). DB가 받아 주지 않는 모양은 걸러 둔다. */
function pushedOf(v: unknown): string | null | undefined {
  if (v === null) return null;
  return typeof v === "string" && ISO_TIME.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined;
}

export type RepoMeta = { description: string | null; language: string | null; pushedAt: string | null };
const trimmed = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? [...v.trim()].slice(0, max).join("") : null); // 글자(코드 포인트) 단위: DB char_length와 같게

/** 레포 카드의 설명 · 주 언어 · 마지막 푸시(P-12i, 마이그레이션 202611232100). 빈 글은 null, 설명은 300자 · 언어는 60자로 자른다.
 *  칸 모양이 다르면(날짜가 깨짐 · 글이 아님) 전체 null: 예전 값을 엉뚱한 값으로 덮지 않고 수집 오류로 남기게(불변 2 · 4) */
export function parseRepoMeta(json: unknown): RepoMeta | null {
  const r = asRecord(json);
  if (!r) return null;
  const { description: d, language: l } = r;
  const pushedAt = pushedOf(r.pushed_at);
  if (pushedAt === undefined || (d != null && typeof d !== "string") || (l != null && typeof l !== "string")) return null;
  return { description: trimmed(d, 300), language: trimmed(l, 60), pushedAt };
}

/** 저장소 정보 응답 읽기. 필요한 칸의 모양이 하나라도 다르면 null. */
export function readRepoInfo(text: string): RepoInfo | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const r = asRecord(json);
  if (!r) return null;
  const license = licenseOf(r.license);
  const pushedAt = pushedOf(r.pushed_at);
  if (license === null || pushedAt === undefined) return null;
  const { full_name: fullName, private: isPrivate, archived, stargazers_count: stars } = r;
  if (typeof fullName !== "string" || fullName === "" || typeof isPrivate !== "boolean" || typeof archived !== "boolean" || !isCount(stars)) return null;
  return { fullName, isPrivate, archived, pushedAt, stars, license };
}

/** 읽은 값이 말하는 상태: 보관은 중단, 12개월 넘게 푸시가 없으면 쉬는 중. 푸시가 없는 빈 저장소는 쉬는 중으로 단정하지 않는다. */
export function desiredStatus(info: RepoInfo, nowMs: number): "active" | "dormant" | "deprecated" {
  if (info.archived) return "deprecated";
  if (info.pushedAt !== null && nowMs - Date.parse(info.pushedAt) > DORMANT_AFTER_MS) return "dormant";
  return "active";
}

const rank = (status: string) => RANK[status] ?? 0;
const stamp = (status: string) => `${STATUS_BY}:${status}`;
/**
 * 건드려도 되는 상태: 활동 중이거나, 우리가 정해 놓은 것(적힌 출처·상태가 지금 상태와 같음).
 * 그 밖의 중단·쉬는 중·사라짐은 레지스트리·관리자·모르는 출처가 정했으므로 올리지도 되돌리지도 않는다(ADR 0021: 되돌리면 그 출처의 값이 사라진다).
 */
const canTouch = (cur: StatusState) => cur.status === "active" || cur.statusBy === stamp(cur.status);

/**
 * 저장소를 찾았을 때의 상태. 건드릴 수 있는 상태만 읽은 값에 맞춰 올리고(더 나쁘게) 되돌린다(덜 나쁘게). 못 찾은 횟수는 0으로.
 * 우리가 올린 상태는 `github:<상태>`로 적고, 활동 중으로 돌아가면 비운다. 다른 쪽이 status만 active로 고쳐 낡은 표시가 남은 활동 중 줄도 비운다:
 * 남겨 두면 나중에 다른 쪽이 같은 상태를 정했을 때 우리가 정한 것으로 읽혀 되돌려진다.
 */
export function afterFound(cur: StatusState, desired: "active" | "dormant" | "deprecated"): StatusState {
  if (cur.status === "active" && desired === "active") return { status: "active", statusBy: null, missed: 0 };
  if (!canTouch(cur) || rank(desired) === rank(cur.status)) return { ...cur, missed: 0 };
  return { status: desired, statusBy: desired === "active" ? null : stamp(desired), missed: 0 };
}

/**
 * 저장소를 못 찾았을 때(404): 횟수를 올리고, **이 저장소를 찾은 적이 있고** 성공한 읽기에서 2번 연속이며 첫 못 찾음에서 12시간이 지났으면 출처에서 사라짐.
 * 한 번도 찾은 적 없는 주소(잘못 적은 repo_url)는 상태를 바꾸지 않는다. 건드릴 수 없는 상태나 이미 사라짐이면 횟수만 올린다.
 */
export function afterMissing(cur: StatusState, ctx: MissContext): StatusState {
  const missed = cur.missed + 1;
  const stays = { ...cur, missed };
  if (!canTouch(cur) || cur.status === "gone") return stays;
  const confirmed = missed >= MISSED_TO_GONE && ctx.everFound && ctx.firstMissAt !== null && ctx.nowMs - ctx.firstMissAt >= MIN_MISS_SPAN_MS;
  return confirmed ? { status: "gone", statusBy: stamp("gone"), missed } : stays;
}
