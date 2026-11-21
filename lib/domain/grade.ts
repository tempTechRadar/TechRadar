// OSV 응답 → 보안 등급(SPEC-1 v1). 같은 입력에는 늘 같은 등급(ADR 0003). 심각도는 OSV 값 그대로 쓴다.

export const GRADE_RULE_VERSION = "v1";

export type Grade = "pass" | "caution" | "danger" | "unknown";

/** OSV 취약점 중 등급에 쓰는 부분만(https://ossf.github.io/osv-schema/). */
export type OsvVuln = {
  id: string;
  aliases?: string[];
  summary?: string;
  database_specific?: { severity?: string };
  affected?: { package?: { name?: string }; ranges?: { type?: string; events?: Record<string, string>[] }[] }[];
};

const pkgName = (n: string | undefined) => (n ?? "").toLowerCase().replace(/[-_.]+/g, "-");

/**
 * OSV는 취약점 기록을 통째로 준다. 같은 기록에 다른 패키지(`@langchain/core` 등)의 고친 버전이 함께 있을 수 있어,
 * 조회한 패키지의 항목만 남긴다(PyPI는 -·_·. 차이를 무시).
 */
export function forPackage(vulns: OsvVuln[], name: string): OsvVuln[] {
  return vulns.map((v) => ({ ...v, affected: (v.affected ?? []).filter((a) => pkgName(a.package?.name) === pkgName(name)) }));
}

export type Evidence = { id: string; aliases: string[]; severity: string; fixed: string | null; url: string };

export type GradeResult = {
  grade: Grade;
  reason: string;
  evidence: Evidence[];
  /** 위험일 때 원인(가장 앞선 HIGH·CRITICAL id). 변경 중복 막기 키에 들어간다 */
  causeId: string | null;
  fixedVersion: string | null;
};

/** 저장소 정보 확인(P-9)이 technologies에 남긴 값. 통과는 이 값이 신선할 때만 준다(SPEC-1). */
// repoName: P-9가 실제로 읽은 저장소(signals.github_found_repo, 소문자 owner/repo). 이름이 없으면 어느 저장소의 확인인지 모르므로 통과가 아니다.
// shortcut: 패키지와 그 저장소가 같은 것인지는 검증하지 않는다(레지스트리·스킬 키가 알려 준 연결을 믿는다). 이유에 저장소 이름을 보여 사람이 알아보게 한다. 검증하려면 저장소의 package.json 이름을 맞춰 본다.
export type RepoFacts = { status: string; activityAt: string | null; checkedAt: string | null; missedCount: number; repoName: string | null };
export type RepoCheck = RepoFacts & { nowMs: number };

const DAY_MS = 24 * 60 * 60 * 1000;
// 7일·90일은 팀 추정(spec 1절 "최근 3개월"). 확인 시각도 보는 이유: 수집이 멈춰 낡은 푸시 시각이 "최근"으로 남아 있어도 거짓 통과가 되지 않게(불변 2)
const CHECK_MAX_AGE_MS = 7 * DAY_MS;
const ACTIVITY_MAX_AGE_MS = 90 * DAY_MS;

// 지금 안쪽이어야 신선하다: 미래 날짜(시계 어긋남)·깨진 날짜(NaN)는 비교가 거짓이라 신선하지 않다.
const withinAge = (nowMs: number, iso: string, maxMs: number) => {
  const age = nowMs - Date.parse(iso);
  return age >= 0 && age <= maxMs;
};

// 못 찾음(missedCount>0)이 한 번이라도 쌓였거나 상태가 active가 아니면 신선하지 않다.
function repoIsFresh(r: RepoCheck): boolean {
  if (r.status !== "active" || r.missedCount > 0 || !r.checkedAt || !r.activityAt || !r.repoName) return false;
  return withinAge(r.nowMs, r.checkedAt, CHECK_MAX_AGE_MS) && withinAge(r.nowMs, r.activityAt, ACTIVITY_MAX_AGE_MS);
}

const HIGH = new Set(["HIGH", "CRITICAL"]);

// 심각도 글자가 없는 항목은 위험으로 올리지 않되 버리지도 않는다(주의).
const severityOf = (v: OsvVuln) => (v.database_specific?.severity ?? "UNKNOWN").toUpperCase();
// GIT 범위의 fixed는 버전이 아니라 커밋 해시라 건너뛴다.
const fixesOf = (v: OsvVuln): string[] =>
  (v.affected ?? []).flatMap((a) => (a.ranges ?? []).filter((r) => r.type !== "GIT").flatMap((r) => r.events ?? [])).map((e) => e.fixed).filter((f): f is string => Boolean(f));

function toEvidence(v: OsvVuln): Evidence {
  return {
    id: v.id,
    aliases: v.aliases ?? [],
    severity: severityOf(v),
    // 보이기·변경 감지용 첫 고친 버전. 올려야 할 버전은 upgradeTarget이 따로 고른다.
    fixed: fixesOf(v)[0] ?? null,
    url: `https://osv.dev/vulnerability/${v.id}`,
  };
}

// semver·PEP 440의 큰 줄기만: 숫자 칸을 앞에서부터 비교하고, 같으면 사전 배포(-beta.1, rc1) < 정식 < post. 빌드(+…)는 무시.
// shortcut: 사전 배포끼리는 글자·숫자 칸을 차례로 비교할 뿐 a < b < rc 같은 PEP 440 순서표는 없다. 사전 배포를 고친 버전으로 쓰는 일이 생기면
export function cmpVersion(a: string, b: string): number {
  const parse = (v: string) => {
    const [, nums = "", rest = ""] = /^v?(\d+(?:\.\d+)*)(.*)$/.exec(v.split("+")[0]) ?? [];
    const tag = rest.replace(/^[.-]/, "");
    return { nums: nums.split(".").map(Number), tag, rank: tag === "" ? 1 : /^post/i.test(tag) ? 2 : 0 };
  };
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return d;
  }
  if (x.rank !== y.rank) return x.rank - y.rank;
  const [s, t] = [x.tag.split(/[.-]/), y.tag.split(/[.-]/)];
  for (let i = 0; i < Math.max(s.length, t.length); i++) {
    if (s[i] === undefined || t[i] === undefined) return s.length - t.length;
    const d = /^\d+$/.test(s[i]) && /^\d+$/.test(t[i]) ? Number(s[i]) - Number(t[i]) : s[i] < t[i] ? -1 : s[i] > t[i] ? 1 : 0;
    if (d) return d;
  }
  return 0;
}

/**
 * 위험한 문제를 모두 고치는 가장 낮은 버전. 문제마다 내 버전보다 높은 가장 낮은 고친 버전(백포트 줄 포함)을 고르고
 * 그중 가장 높은 것. 하나라도 고친 버전이 없으면 null. 설치 프롬프트가 이 버전으로 고정하므로(ADR 0012) 첫 문제의 고친 버전이면 안 된다.
 */
function upgradeTarget(version: string, dangerous: OsvVuln[]): string | null {
  let target: string | null = null;
  for (const v of dangerous) {
    const next = fixesOf(v).filter((f) => cmpVersion(f, version) > 0).sort(cmpVersion)[0];
    if (!next) return null;
    if (!target || cmpVersion(next, target) > 0) target = next;
  }
  return target;
}

const named = (e: Evidence) => [e.id, ...e.aliases.filter((a) => a.startsWith("CVE-"))].join(" / ");

/**
 * version이 있으면 OSV는 그 버전에 해당하는 취약점만 준다 → HIGH·CRITICAL이 하나라도 있으면 위험.
 * version이 없으면(범위·미지정) 그 패키지의 모든 취약점 → 아직 안 고친 HIGH·CRITICAL만 위험, 고친 것뿐이면 주의.
 * 취약점이 없어도 저장소 정보(P-9)가 신선하게 확인되기 전에는 "통과"를 주지 않는다(SPEC-1 통과 조건). repo를 안 주면 늘 확인 전이다.
 */
export function gradeFromOsv(version: string | null, vulns: OsvVuln[], repo?: RepoCheck): GradeResult {
  const evidence = vulns.map(toEvidence).sort((a, b) => a.id.localeCompare(b.id));
  const high = evidence.filter((e) => HIGH.has(e.severity));
  const dangerous = version ? high : high.filter((e) => e.fixed === null);
  if (dangerous.length > 0) {
    const cause = dangerous[0];
    // 버전을 모르면 dangerous는 고친 버전이 없는 것뿐이라 올릴 곳도 없다.
    const fixedVersion = version ? upgradeTarget(version, vulns.filter((v) => HIGH.has(severityOf(v)))) : null;
    const fix = fixedVersion ? ` ${fixedVersion} 이상으로 올리면 고쳐져요.` : " 아직 고친 버전이 없어요.";
    return {
      grade: "danger",
      reason: `${version ? `이 버전(${version})` : "이 패키지"}에 심각도 ${cause.severity}인 알려진 문제가 있어요(${named(cause)}).${fix}`,
      evidence,
      causeId: cause.id,
      fixedVersion,
    };
  }
  if (!version && high.length > 0) {
    return { grade: "caution", reason: "버전을 확인할 수 없어요. 심각한 문제는 고친 버전이 나와 있으니 최신으로 쓰세요.", evidence, causeId: null, fixedVersion: null };
  }
  if (evidence.length > 0) {
    return { grade: "caution", reason: `덜 심각한 알려진 문제가 ${evidence.length}건 있어요(${named(evidence[0])}).`, evidence, causeId: null, fixedVersion: null };
  }
  if (repo && repoIsFresh(repo)) {
    return { grade: "pass", reason: `알려진 취약점이 없고, 저장소(${repo.repoName})가 최근 3개월 안에 고쳐지고 있어요.`, evidence, causeId: null, fixedVersion: null };
  }
  return { grade: "unknown", reason: "알려진 취약점은 없어요. 저장소 정보는 아직 확인하지 않았거나 오래됐어요.", evidence, causeId: null, fixedVersion: null };
}
