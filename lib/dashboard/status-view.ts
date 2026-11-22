// 현황 개요의 "내 레포 현황"과 "적용한 기술"(P-12f ④). DB를 모르는 순수 함수: 읽은 프로젝트 줄(+ 내 기술 · 읽기 실행)을 카드 값으로.
// 숨긴 기술은 세지 않는다(/projects와 같은 기준). 마지막 읽기가 끝나지 않았거나 실패했으면 그 안내를 같이 둔다(빈 목록을 "없음"으로 단정하지 않게, 불변 2).
import { readStatusNotice, type ReadRun } from "../domain/my-tech-view.ts";
import { GRADE_RANK, isConcept, type Grade } from "../map/build-map.ts";

export type StatusTechRow = {
  id: string; tech_id: string | null; manual_name: string | null; hidden_at: string | null; read_at: string | null;
  collect_error_kind: string | null; grade: Grade; technologies: { display_name: string; tech_key?: string | null; type?: string | null } | null;
};
export type StatusProjectRow = { id: string; name: string; kind: "repo" | "local"; my_technologies: StatusTechRow[]; runs?: ReadRun[] };

export type RepoCard = { id: string; name: string; techCount: number; errorCount: number; lastReadAt: string | null; notice: string | null };
/** tags: null = 내 태그를 읽지 못함(태그 없음과 다르게). concept = 작업 방식(설치물이 아님): 등급 대신 "등급 없음"(ADR 0008 2항, 지도와 같게) */
export type AppliedTech = { key: string; techId: string | null; myTechId: string; name: string; grade: Grade; concept: boolean; projects: string[]; collectError: boolean; tags: string[] | null };

const shown = (p: StatusProjectRow) => p.my_technologies.filter((t) => !t.hidden_at);
const latest = (xs: (string | null)[]) => xs.reduce<string | null>((m, x) => (x && (!m || Date.parse(x) > Date.parse(m)) ? x : m), null);

/** 프로젝트마다: 기술 수 · 수집 오류 수 · 마지막으로 읽은 때 · 읽기 상태 안내(성공이면 null) */
export function repoCards(rows: StatusProjectRow[], now: Date): RepoCard[] {
  return rows.map((p) => {
    const techs = shown(p);
    return {
      id: p.id, name: p.name, techCount: techs.length, errorCount: techs.filter((t) => t.collect_error_kind).length,
      lastReadAt: latest(techs.map((t) => t.read_at)), notice: readStatusNotice(p.kind, p.runs, now),
    };
  });
}

/** 적용한 기술: 같은 카탈로그 기술은 프로젝트를 합쳐 한 줄(가장 나쁜 등급), 이름만 넣은 기술은 따로. 위험한 것 먼저, 그다음 이름순 */
export function appliedTechs(rows: StatusProjectRow[], tags: Map<string, string[]> | null): AppliedTech[] {
  const acc = new Map<string, AppliedTech>();
  for (const p of rows) for (const t of shown(p)) {
    const key = t.tech_id ?? `my:${t.id}`;
    const prev = acc.get(key);
    const name = t.technologies?.display_name ?? t.manual_name ?? "(이름 없음)";
    if (!prev) {
      acc.set(key, { key, techId: t.tech_id, myTechId: t.id, name, grade: t.grade, concept: isConcept(t.technologies?.tech_key, t.technologies?.type), projects: [p.name], collectError: Boolean(t.collect_error_kind), tags: tags ? (t.tech_id ? tags.get(t.tech_id) ?? [] : []) : null });
      continue;
    }
    if (!prev.projects.includes(p.name)) prev.projects.push(p.name);
    if (GRADE_RANK[t.grade] > GRADE_RANK[prev.grade]) { prev.grade = t.grade; prev.myTechId = t.id; } // 상세는 가장 위험한 쪽으로
    prev.collectError ||= Boolean(t.collect_error_kind);
  }
  const rank = (t: AppliedTech) => (t.concept ? -1 : GRADE_RANK[t.grade]); // 개념은 위험 순서에서 맨 뒤
  return [...acc.values()].sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
}
