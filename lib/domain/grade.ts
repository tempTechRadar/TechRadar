// OSV 응답 → 보안 등급(SPEC-1 v1). 같은 입력에는 늘 같은 등급(ADR 0003). 심각도는 OSV 값 그대로 쓴다.

export const GRADE_RULE_VERSION = "v1";

export type Grade = "pass" | "caution" | "danger" | "unknown";

/** OSV 취약점 중 등급에 쓰는 부분만(https://ossf.github.io/osv-schema/). */
export type OsvVuln = {
  id: string;
  aliases?: string[];
  summary?: string;
  database_specific?: { severity?: string };
  affected?: { ranges?: { events?: Record<string, string>[] }[] }[];
};

export type Evidence = { id: string; aliases: string[]; severity: string; fixed: string | null; url: string };

export type GradeResult = {
  grade: Grade;
  reason: string;
  evidence: Evidence[];
  /** 위험일 때 원인(가장 앞선 HIGH·CRITICAL id). 변경 중복 막기 키에 들어간다 */
  causeId: string | null;
  fixedVersion: string | null;
};

const HIGH = new Set(["HIGH", "CRITICAL"]);

function toEvidence(v: OsvVuln): Evidence {
  const fixes = (v.affected ?? []).flatMap((a) => (a.ranges ?? []).flatMap((r) => r.events ?? [])).map((e) => e.fixed).filter(Boolean);
  return {
    id: v.id,
    aliases: v.aliases ?? [],
    // 심각도 글자가 없는 항목은 위험으로 올리지 않되 버리지도 않는다(주의).
    severity: (v.database_specific?.severity ?? "UNKNOWN").toUpperCase(),
    // shortcut: 범위가 여럿(백포트)이면 첫 고친 버전만 보인다. 내 버전이 든 범위를 고르는 건 G5 사례가 생기면
    fixed: fixes[0] ?? null,
    url: `https://osv.dev/vulnerability/${v.id}`,
  };
}

const named = (e: Evidence) => [e.id, ...e.aliases.filter((a) => a.startsWith("CVE-"))].join(" / ");

/**
 * version이 있으면 OSV는 그 버전에 해당하는 취약점만 준다 → HIGH·CRITICAL이 하나라도 있으면 위험.
 * version이 없으면(범위·미지정) 그 패키지의 모든 취약점 → 아직 안 고친 HIGH·CRITICAL만 위험, 고친 것뿐이면 주의.
 * 취약점이 없어도 저장소 정보(P-9) 확인 전에는 "통과"를 주지 않는다(SPEC-1 통과 조건).
 */
export function gradeFromOsv(version: string | null, vulns: OsvVuln[]): GradeResult {
  const evidence = vulns.map(toEvidence).sort((a, b) => a.id.localeCompare(b.id));
  const high = evidence.filter((e) => HIGH.has(e.severity));
  const dangerous = version ? high : high.filter((e) => e.fixed === null);
  if (dangerous.length > 0) {
    const cause = dangerous[0];
    const fix = cause.fixed ? ` ${cause.fixed} 이상으로 올리면 고쳐져요.` : " 아직 고친 버전이 없어요.";
    return {
      grade: "danger",
      reason: `${version ? `이 버전(${version})` : "이 패키지"}에 심각도 ${cause.severity}인 알려진 문제가 있어요(${named(cause)}).${fix}`,
      evidence,
      causeId: cause.id,
      fixedVersion: cause.fixed,
    };
  }
  if (!version && high.length > 0) {
    return { grade: "caution", reason: "버전을 확인할 수 없어요. 심각한 문제는 고친 버전이 나와 있으니 최신으로 쓰세요.", evidence, causeId: null, fixedVersion: null };
  }
  if (evidence.length > 0) {
    return { grade: "caution", reason: `덜 심각한 알려진 문제가 ${evidence.length}건 있어요(${named(evidence[0])}).`, evidence, causeId: null, fixedVersion: null };
  }
  return { grade: "unknown", reason: "알려진 취약점은 없어요. 저장소 정보는 아직 확인하지 않았어요.", evidence, causeId: null, fixedVersion: null };
}
