// technologies 줄을 비교표에 넣을 값으로 바꾼다(적용 기회 알림 P-14와 비교 모드 P-25가 같이 쓴다). 서버 전용 읽기 도우미.
import type { ComparableTech } from "../alerts/build-comparison.ts";
import type { Row } from "./alert-db.ts";

/** 비교표가 읽는 칸(이름 id 포함). select에 그대로 쓴다 */
export const COMPARABLE_FIELDS =
  "grade, grade_reason, grade_evidence, one_liner, one_liner_source, last_activity_at, last_activity_kind, repo_url, license, signals";

export const toComparable = (row: Row): ComparableTech => ({
  oneLiner: row.one_liner, oneLinerSource: row.one_liner_source, grade: row.grade, gradeReason: row.grade_reason,
  gradeEvidenceUrl: row.grade_evidence?.[0]?.url ?? null, lastActivityAt: row.last_activity_at, lastActivityKind: row.last_activity_kind,
  repoUrl: row.repo_url, license: row.license, signals: row.signals,
});
