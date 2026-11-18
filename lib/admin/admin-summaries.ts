// 관리자 화면(P-18)의 표 만들기. DB에서 읽은 줄을 화면용으로 묶고 센다. 순수 함수. 주인: 차세일(C).
// 판단(승인·보류)은 여기 없다: 관리자 화면은 보기만 하고 판단 버튼이 없다(불변 1·5, PRD-F27).
import { countBy, latest, newestFirst, withinPeriod } from "./admin-filter.ts";

/* ---------- 회원별 등록(IA-12) ---------- */
export type ProfileRow = { id: string; nickname: string; role: string; is_demo: boolean };
export type ProjectRow = { id: string; owner_id: string; kind: string; name: string; repo_url: string | null; archived_at: string | null; created_at: string };
export type MyTechRow = { owner_id: string; project_id: string; hidden_at: string | null; read_at: string | null; created_at: string };
export type MemberSummary = {
  id: string; nickname: string; isAdmin: boolean; isDemo: boolean;
  projects: { name: string; repoUrl: string | null; kind: string; archived: boolean; techCount: number }[];
  techCount: number; lastReadAt: string | null; lastActivityAt: string | null;
};

/** 회원마다 프로젝트·저장소 주소·읽어 낸 기술 수(숨긴 것 제외)·마지막으로 읽은 시각. 기간을 주면 그 안에 활동한 회원만. */
export function summarizeMembers(
  input: { profiles: ProfileRow[]; projects: ProjectRow[]; myTechs: MyTechRow[] },
  filter: { memberId: string | null; from: string | null },
): MemberSummary[] {
  const visible = input.myTechs.filter((t) => t.hidden_at === null);
  const rows = input.profiles
    .filter((p) => filter.memberId === null || p.id === filter.memberId)
    .map((p) => {
      const mine = input.projects.filter((pr) => pr.owner_id === p.id);
      const techs = visible.filter((t) => t.owner_id === p.id);
      const lastReadAt = latest(techs.map((t) => t.read_at));
      return {
        id: p.id, nickname: p.nickname, isAdmin: p.role === "admin", isDemo: p.is_demo,
        projects: mine.map((pr) => ({ name: pr.name, repoUrl: pr.repo_url, kind: pr.kind, archived: pr.archived_at !== null, techCount: techs.filter((t) => t.project_id === pr.id).length })),
        techCount: techs.length,
        lastReadAt,
        lastActivityAt: latest([lastReadAt, ...mine.map((pr) => pr.created_at), ...techs.map((t) => t.created_at)]),
      };
    })
    .filter((m) => withinPeriod(m.lastActivityAt, filter.from));
  return newestFirst(rows, (m) => m.lastActivityAt);
}

/* ---------- 알림과 처리 현황(IA-14) ---------- */
export type AdminAlert = {
  id: string; kind: string; status: string; createdAt: string; member: string; techName: string; isSimulated: boolean;
  judgment: { decision: string; judgedBy: string; judgedAt: string } | null;
};
export type AlertCounts = { total: number; pending: number; done: number; candidate: number; hold: number };

export function alertCounts(rows: readonly AdminAlert[]): AlertCounts {
  const byStatus = countBy(rows, (r) => r.status);
  const byDecision = countBy(rows.filter((r) => r.judgment), (r) => r.judgment?.decision);
  return { total: rows.length, pending: byStatus.pending ?? 0, done: byStatus.done ?? 0, candidate: byDecision.candidate ?? 0, hold: byDecision.hold ?? 0 };
}

export function filterAlerts(rows: readonly AdminAlert[], f: { status: string | null; kind: string | null; from: string | null }): AdminAlert[] {
  return newestFirst(
    rows.filter((r) => (f.status === null || r.status === f.status) && (f.kind === null || r.kind === f.kind) && withinPeriod(r.createdAt, f.from)),
    (r) => r.createdAt,
  );
}

/* ---------- 수집 실행과 오류(IA-15) ---------- */
export type RunRow = { id: string; trigger: string; status: string; created_at: string; item_count: number };
export type StepErrorRow = { run_id: string; step_name: string; error_kind: string | null; error_message: string | null; created_at: string };
const FAILED = new Set(["failed", "partial"]);

/** 종류(trigger)마다 가장 최근부터 이어진 실패(일부 실패 포함) 횟수. 성공을 만나면 멈춘다. 0이면 빼고 많은 순. */
export function failureStreaks(runs: readonly RunRow[]): { trigger: string; streak: number; lastFailedAt: string }[] {
  const byTrigger = new Map<string, RunRow[]>();
  for (const r of newestFirst(runs, (x) => x.created_at)) byTrigger.set(r.trigger, [...(byTrigger.get(r.trigger) ?? []), r]);
  const out: { trigger: string; streak: number; lastFailedAt: string }[] = [];
  for (const [trigger, list] of byTrigger) {
    const done = list.filter((r) => r.status !== "queued" && r.status !== "running"); // 아직 도는 실행은 판단에서 뺀다
    let streak = 0;
    while (streak < done.length && FAILED.has(done[streak].status)) streak++;
    if (streak > 0) out.push({ trigger, streak, lastFailedAt: done[0].created_at });
  }
  return out.sort((a, b) => b.streak - a.streak);
}

/** 수집 오류 종류별 건수(SPEC 수집 오류 다섯 가지). 오류 종류가 없는 줄은 빼고 센다. */
export function errorKindCounts(steps: readonly StepErrorRow[]): Record<string, number> {
  return countBy(steps.filter((s) => s.error_kind !== null), (s) => s.error_kind);
}

/* ---------- 분류 확인의 규칙 목록(IA-17) ---------- */
export type RuleRow = { id: string; kind: string; ecosystem: string | null; value: string; pattern_id: string | null; pattern_grade: string | null; enabled: boolean };
export const RULE_KINDS = ["allow_package", "github_topic", "hn_keyword", "risk_pattern", "official_org"] as const;

/** 규칙 종류마다 켜진 것·꺼진 것 수와 줄(값 순). 종류 순서는 고정. */
export function groupRules(rows: readonly RuleRow[]): { kind: string; on: number; off: number; rows: RuleRow[] }[] {
  return RULE_KINDS.map((kind) => {
    const list = rows.filter((r) => r.kind === kind).sort((a, b) => a.value.localeCompare(b.value));
    return { kind, on: list.filter((r) => r.enabled).length, off: list.filter((r) => !r.enabled).length, rows: list };
  });
}
