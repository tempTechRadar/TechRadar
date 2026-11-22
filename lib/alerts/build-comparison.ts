// 적용 기회 비교표(SPEC-5.3): 내 기술과 새 기술을 5개 항목으로 견주고, 항목마다 출처를 붙인다. DB·화면을 모르는 순수 함수.
// 값이 없으면 "찾지 못함"(추측하지 않는다, 불변 2). 알림을 만들 때 이 결과를 alerts.comparison에 저장한다.

import { packagePageUrl } from "../domain/downloads.ts";

export type ComparableTech = {
  oneLiner: string | null;
  oneLinerSource: string | null;
  grade: string;
  gradeReason: string | null;
  /** 등급의 근거 링크(grade_evidence의 첫 줄) */
  gradeEvidenceUrl: string | null;
  lastActivityAt: string | null;
  lastActivityKind: "release" | "commit" | null;
  repoUrl: string | null;
  license: string | null;
  signals: { weekly_downloads?: number } | null;
  /** 기술 키(`npm:이름`·`pypi:이름`…). 사용량의 출처(패키지 소개 페이지)를 만드는 데 쓴다 */
  techKey: string | null;
};

export type ComparisonCell = { value: string; source: string | null };
export type ComparisonRow = { item: string; mine: ComparisonCell; theirs: ComparisonCell };

const NOT_FOUND = "찾지 못함";
const GRADE_LABEL: Record<string, string> = { danger: "위험", caution: "주의", pass: "통과", unknown: NOT_FOUND };
const KIND_LABEL = { release: "릴리스", commit: "커밋" };
const koreanDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

const missing: ComparisonCell = { value: NOT_FOUND, source: null };

function oneLiner(t: ComparableTech): ComparisonCell {
  return t.oneLiner ? { value: t.oneLiner, source: t.oneLinerSource } : missing;
}

function security(t: ComparableTech): ComparisonCell {
  const label = GRADE_LABEL[t.grade] ?? NOT_FOUND;
  if (label === NOT_FOUND) return missing;
  return { value: t.gradeReason ? `${label} — ${t.gradeReason}` : label, source: t.gradeEvidenceUrl };
}

function lastActivity(t: ComparableTech): ComparisonCell {
  if (!t.lastActivityAt) return missing;
  const kind = t.lastActivityKind ? ` (${KIND_LABEL[t.lastActivityKind]})` : "";
  return { value: `${koreanDate.format(new Date(t.lastActivityAt))}${kind}`, source: t.repoUrl };
}

// 사용량은 signals.weekly_downloads(숫자, P-9 수집기가 쓰는 키)를 읽는다. 출처는 기술 키로 만든 패키지 소개 페이지(npm·pypi만, 그 밖은 null).
function usage(t: ComparableTech): ComparisonCell {
  const downloads = t.signals?.weekly_downloads;
  if (typeof downloads !== "number") return missing;
  return { value: `주간 ${downloads.toLocaleString("en-US")}회 다운로드`, source: t.techKey ? packagePageUrl(t.techKey) : null };
}

// GitHub 수집기가 저장하는 표시용 낱말(P-9b): none = 라이선스 없음, other = 파일은 있는데 못 알아봄. 그 밖은 SPDX 이름 그대로.
const LICENSE_LABEL: Record<string, string> = { none: "라이선스 없음", other: "종류를 알아보지 못함" };

function license(t: ComparableTech): ComparisonCell {
  return t.license ? { value: LICENSE_LABEL[t.license] ?? t.license, source: t.repoUrl } : missing;
}

const ITEMS: [string, (t: ComparableTech) => ComparisonCell][] = [
  ["하는 일", oneLiner],
  ["보안 등급과 이유", security],
  ["최근 업데이트", lastActivity],
  ["사용량", usage],
  ["라이선스", license],
];

export function buildComparison(mine: ComparableTech, theirs: ComparableTech): ComparisonRow[] {
  return ITEMS.map(([item, read]) => ({ item, mine: read(mine), theirs: read(theirs) }));
}

/** 비교 모드(PRD-F42): 기술 2–3개를 같은 5항목으로 나란히. 칸 순서는 넘긴 순서. */
export type ComparisonTableRow = { item: string; cells: ComparisonCell[] };

export function buildComparisonTable(techs: ComparableTech[]): ComparisonTableRow[] {
  return ITEMS.map(([item, read]) => ({ item, cells: techs.map(read) }));
}
