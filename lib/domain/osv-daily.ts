// 정기 OSV 재확인의 순수 규칙(P-9d, SPEC-3.1·8): (기술, 버전)으로 묶기, 이전 상태, 위험이 이어지는 중인지와 회차. DB·네트워크는 lib/server.
import type { Grade, GradeResult, RepoFacts } from "./grade.ts";

export type OsvEcosystem = "npm" | "PyPI";
/** 내 기술 한 줄(한 사람의 한 프로젝트) 중 OSV 확인에 필요한 값. repo는 기술(카탈로그)의 값이라 같은 기술의 줄마다 같다 */
export type MyTechRow = { techId: string; techKey: string; version: string | null; grade: Grade; gradedAt: string | null; evidence: unknown; checkedAt: string | null; repo: RepoFacts };
export type OsvTarget = {
  techId: string;
  techKey: string;
  version: string | null;
  ecosystem: OsvEcosystem;
  name: string;
  /** 이 (기술, 버전)의 지금 등급: 위험인 줄이 하나라도 있으면 위험, 아니면 가장 최근에 등급을 매긴 줄(없으면 unknown) */
  prevGrade: Grade;
  prevEvidence: unknown;
  prevEvidenceIds: string[];
  /** 마지막으로 "위험이 아니다"라고 등급을 매긴 시각(없으면 null): 위험이 이어지는 중인지 가르는 기준 */
  lastNonDangerAt: string | null;
  /** 가장 오래된 확인 시각(한 줄이라도 안 본 적이 있으면 ""): 오래 안 본 것부터 읽는 순서 */
  checkedAt: string;
  /** 통과 판단에 쓰는 저장소 확인 값(P-9가 남긴 것) */
  repo: RepoFacts;
};
/** 같은 (기술, 버전, 원인)의 가장 큰 회차의 변경 */
export type LatestChange = { id: string; round: number; createdAt: string };
export type DangerPlan = { reuse: LatestChange | null; create: { kind: "grade_to_danger" | "first_seen_danger"; round: number } | null };

const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const ms = (iso: string) => Date.parse(iso);

/** 근거(grade_evidence)의 취약점 id를 정렬해 모은다. 모양이 다르면 빈 목록. */
export function evidenceIds(evidence: unknown): string[] {
  if (!Array.isArray(evidence)) return [];
  return evidence.flatMap((e) => (typeof (e as { id?: unknown } | null)?.id === "string" ? [(e as { id: string }).id] : [])).sort(byCode);
}

function osvName(techKey: string): { ecosystem: OsvEcosystem; name: string } | null {
  if (techKey.startsWith("npm:")) return { ecosystem: "npm", name: techKey.slice(4) };
  if (techKey.startsWith("pypi:")) return { ecosystem: "PyPI", name: techKey.slice(5) };
  return null;
}

const latestGraded = (rows: MyTechRow[]): MyTechRow | null =>
  rows.filter((r) => r.gradedAt !== null).sort((a, b) => ms(b.gradedAt!) - ms(a.gradedAt!))[0] ?? null;

function toTarget(rows: MyTechRow[], names: { ecosystem: OsvEcosystem; name: string }): OsvTarget {
  const danger = rows.filter((r) => r.grade === "danger");
  const basis = latestGraded(danger) ?? danger[0] ?? latestGraded(rows);
  const first = rows[0];
  return {
    techId: first.techId, techKey: first.techKey, version: first.version, ...names,
    prevGrade: danger.length > 0 ? "danger" : (latestGraded(rows)?.grade ?? "unknown"),
    prevEvidence: basis?.evidence ?? null,
    prevEvidenceIds: evidenceIds(basis?.evidence),
    lastNonDangerAt: latestGraded(rows.filter((r) => r.grade !== "danger"))?.gradedAt ?? null,
    checkedAt: rows.map((r) => r.checkedAt ?? "").sort(byCode)[0],
    repo: first.repo,
  };
}

/** 줄들을 (기술, 버전)으로 묶는다: 사람이 여럿이어도 OSV는 한 번만 묻는다. npm·pypi가 아닌 키는 뺀다. */
export function groupTargets(rows: MyTechRow[]): OsvTarget[] {
  const groups = new Map<string, MyTechRow[]>();
  for (const r of rows) {
    if (!osvName(r.techKey)) continue;
    const key = JSON.stringify([r.techId, r.version]);
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.values()]
    .map((g) => toTarget(g, osvName(g[0].techKey)!))
    .sort((a, b) => byCode(a.checkedAt, b.checkedAt) || byCode(a.techKey, b.techKey) || byCode(a.version ?? "", b.version ?? ""));
}

/** 등급이나 근거가 바뀌었나(바뀐 것만 수집 자료로 남긴다). */
export const isChanged = (t: OsvTarget, currGrade: Grade, currIds: string[]): boolean =>
  t.prevGrade !== currGrade || t.prevEvidenceIds.join(",") !== [...currIds].sort(byCode).join(",");

/** 같은 취약점을 알아보는 이름들: 원인의 id와 별칭(CVE·PYSEC·GHSA). 같은 취약점이 다른 이름으로 올라와도 새 위험으로 세지 않으려고. */
export function causeIdsOf(r: Pick<GradeResult, "causeId" | "evidence">): string[] {
  if (!r.causeId) return [];
  const cause = r.evidence.find((e) => e.id === r.causeId);
  return [...new Set([r.causeId, ...(cause?.aliases ?? [])])];
}

/**
 * 지금 위험인 (기술, 버전)에 변경을 새로 만들지, 있는 것을 쓸지(SPEC-3.1).
 * 위험이 이어지는 중인가 = 변경이 있고, 그 뒤로 "위험이 아니다"라고 등급을 매긴 적이 없다. 이어지는 중이면 그 변경을 쓴다
 * (회차 2 이상이어도, 앞 실행에서 등급 저장이 실패했어도 같은 결과). 아니면 새로 만든다: 변경이 없으면 회차 1,
 * 변경 뒤에 위험이 아니라고 매긴 기록이 있으면(고쳐졌다 다시 위험) 가장 큰 회차에서 하나 올린다.
 * 종류: 위험이 아니라고 매긴 적이 있으면 grade_to_danger, 없으면(가져오기로 들어온 줄·변경 저장이 실패한 뒤) first_seen_danger.
 */
export function planDanger(t: Pick<OsvTarget, "lastNonDangerAt">, latest: LatestChange | null): DangerPlan {
  if (latest && (t.lastNonDangerAt === null || ms(latest.createdAt) > ms(t.lastNonDangerAt))) return { reuse: latest, create: null };
  return { reuse: null, create: { kind: t.lastNonDangerAt !== null ? "grade_to_danger" : "first_seen_danger", round: latest ? latest.round + 1 : 1 } };
}
