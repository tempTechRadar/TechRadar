// 정기 OSV 재확인의 DB 읽기·쓰기(P-9d). 주인: 김영식 A. 수집기(collect-osv.ts)는 순서·기록을 맡고, 저장 규칙은 여기에 둔다.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { GRADE_RULE_VERSION, type GradeResult, type RepoFacts } from "../domain/grade.ts";
import { groupTargets, type MyTechRow, type OsvTarget } from "../domain/osv-daily.ts";
import type { ErrorKind } from "./collect-fetch.ts";

const PAGE = 500;
// 통과 판단에 쓰는 저장소 확인 값은 기술(technologies)에 있다(P-9 github-store가 씀)
const REPO_COLUMNS = "status, last_activity_at, last_checked_ok_at, missed_count";
// 두꺼운 진짜 기술의 줄 중 숨기지 않았고 보관하지 않은 프로젝트의 것만(쓰는 사람이 없는 위험은 알림 대상이 없다)
const SELECT =`id, tech_id, version, grade, graded_at, grade_evidence, last_checked_ok_at, technologies!inner(tech_key, ${REPO_COLUMNS}), projects!inner(archived_at)`;

type RepoCols = { status: string; last_activity_at: string | null; last_checked_ok_at: string | null; missed_count: number };
type TechCols = RepoCols & { tech_key: string };
type Raw = {
  tech_id: string; version: string | null; grade: MyTechRow["grade"]; graded_at: string | null; grade_evidence: unknown; last_checked_ok_at: string | null;
  technologies: TechCols | TechCols[];
};
const factsOf = (t: RepoCols): RepoFacts => ({ status: t.status, activityAt: t.last_activity_at, checkedAt: t.last_checked_ok_at, missedCount: t.missed_count });
const techOf = (r: Raw) => (Array.isArray(r.technologies) ? r.technologies[0] : r.technologies);
const toRow = (r: Raw): MyTechRow => ({
  techId: r.tech_id, techKey: techOf(r).tech_key, version: r.version, grade: r.grade, gradedAt: r.graded_at, evidence: r.grade_evidence, checkedAt: r.last_checked_ok_at, repo: factsOf(techOf(r)),
});

/** 기술 id → 저장소 확인 값(처음 읽기용). 읽지 못한 기술은 맵에 없다. */
export async function readRepoFacts(db: SupabaseClient, techIds: string[]): Promise<Map<string, RepoFacts>> {
  if (techIds.length === 0) return new Map();
  const { data, error } = await db.from("technologies").select(`id, ${REPO_COLUMNS}`).in("id", techIds);
  if (error) throw new Error(`저장소 확인 값을 읽지 못함: ${error.message}`);
  return new Map((data as (RepoCols & { id: string })[]).map((t) => [t.id, factsOf(t)]));
}

/** 읽을 (기술, 버전) 목록: 오래 안 본 것부터. 쪽으로 나눠 모두 읽는다(PostgREST는 한 번에 1000줄까지). */
export async function readOsvTargets(db: SupabaseClient): Promise<OsvTarget[]> {
  const rows: MyTechRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("my_technologies").select(SELECT)
      .is("hidden_at", null).eq("technologies.depth", "thick").eq("technologies.is_simulated", false).is("projects.archived_at", null)
      .order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`내 기술 목록을 읽지 못함: ${error.message}`);
    const page = (data ?? []) as unknown as Raw[];
    rows.push(...page.map(toRow));
    if (page.length < PAGE) break;
  }
  return groupTargets(rows);
}

export async function readOsvSource(db: SupabaseClient): Promise<{ id: string; enabled: boolean }> {
  const { data, error } = await db.from("sources").select("id, enabled").eq("name", "osv").single();
  if (error) throw new Error(`출처 osv를 찾지 못함: ${error.message}`);
  return { id: data.id as string, enabled: Boolean(data.enabled) };
}

// 같은 기술·같은 버전의 내 기술 줄(사람 상관없이). 등급은 버전마다라서 여기에 쓴다(first-read의 sameVersion과 같은 규칙).
const sameVersion = (db: SupabaseClient, t: OsvTarget, patch: Record<string, unknown>) => {
  const q = db.from("my_technologies").update(patch).eq("tech_id", t.techId);
  return t.version === null ? q.is("version", null) : q.eq("version", t.version);
};

/**
 * 등급과 확인 시각을 이 (기술, 버전)을 쓰는 모든 줄에 쓰고, 성공했으니 수집 오류 표시를 지운다.
 * shortcut: 같은 칸(collect_error_kind)에 파일 읽기 오류도 들어 있어, 그 줄의 파일 오류 표시가 OSV 성공으로 지워질 수 있다.
 * 파일 오류는 읽기 실행의 단계 기록에 남아 있다. 칸을 나누려면 마이그레이션이 필요(팀 결정)
 */
export async function saveGrade(db: SupabaseClient, t: OsvTarget, graded: { result: GradeResult; at: string }): Promise<void> {
  const { result: r, at } = graded;
  const { error } = await sameVersion(db, t, {
    grade: r.grade, grade_reason: r.reason, grade_evidence: r.evidence, grade_rule_version: GRADE_RULE_VERSION, graded_at: at, last_checked_ok_at: at, collect_error_kind: null,
  });
  if (error) throw new Error(`등급을 저장하지 못함: ${error.message}`);
}

/** 읽지 못함: 등급·확인 시각은 그대로 두고 오류 종류만 적는다(불변 2·4). */
export async function markError(db: SupabaseClient, t: OsvTarget, kind: ErrorKind): Promise<void> {
  const { error } = await sameVersion(db, t, { collect_error_kind: kind });
  if (error) throw new Error(`수집 오류를 저장하지 못함: ${error.message}`);
}

/** 바뀐 값 하나를 수집 자료로 남기고 id를 돌려준다(변경이 이 자료에 이어진다). */
export async function insertObservation(db: SupabaseClient, at: { runId: string; sourceId: string; at: string }, c: { target: OsvTarget; result: GradeResult }): Promise<string> {
  const { target: t, result: r } = c;
  const { data, error } = await db.from("observations").insert({
    source_id: at.sourceId, tech_id: t.techId, metric: "osv_vulns", run_id: at.runId, observed_at: at.at,
    prev_value: { version: t.version, grade: t.prevGrade, vulns: t.prevEvidence },
    curr_value: { version: t.version, grade: r.grade, vulns: r.evidence.map((e) => ({ id: e.id, severity: e.severity, fixed: e.fixed })) },
    change_size: t.prevGrade === r.grade ? "small" : "large",
  }).select("id").single();
  if (error) throw new Error(`수집 자료를 저장하지 못함: ${error.message}`);
  return data.id as string;
}
