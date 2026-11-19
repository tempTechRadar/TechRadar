// 관리자 화면(P-18) 읽기. 주인: 차세일(C). 로그인한 관리자의 클라이언트로 부른다(서비스 키 아님): 일반 계정이면 RLS가 0줄로 막는다(불변 5).
// 읽기만 한다. 판단(judgments)에 쓰는 코드는 없다(불변 1). 규칙·같은 역할 고치기는 lib/server/classify-edit.ts(P-18b).
// 읽기에 실패하면 던진다: 화면이 "없음"과 "불러오지 못함"을 다르게 보여 줘야 한다(design.md).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAlert, MyTechRow, ProfileRow, ProjectRow, RuleRow, RunRow, StepErrorRow } from "../admin/admin-summaries.ts";
import { maskSecrets } from "../domain/redact.ts";

type Row = Record<string, any>;
type Answer = PromiseLike<{ data: unknown; error: { message: string } | null }>;
const LIMIT = 500; // 한 화면에 다 그릴 수 있는 만큼. 넘으면 화면이 "최근 n건만"이라고 알린다.

async function rows<T>(query: Answer, what: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}을(를) 읽지 못함: ${maskSecrets(error.message)}`);
  return (data ?? []) as T[];
}

const one = (raw: Row | Row[] | null | undefined): Row | null => (Array.isArray(raw) ? raw[0] ?? null : raw ?? null);

/* IA-12 회원별 등록 */
export async function readMembers(db: SupabaseClient): Promise<{ profiles: ProfileRow[]; projects: ProjectRow[]; myTechs: MyTechRow[] }> {
  const [profiles, projects, myTechs] = await Promise.all([
    rows<ProfileRow>(db.from("profiles").select("id, nickname, role, is_demo").order("nickname"), "회원"),
    rows<ProjectRow>(db.from("projects").select("id, owner_id, kind, name, repo_url, archived_at, created_at").limit(LIMIT), "프로젝트"),
    rows<MyTechRow>(db.from("my_technologies").select("owner_id, project_id, hidden_at, read_at, created_at").limit(LIMIT * 10), "내 기술"),
  ]);
  return { profiles, projects, myTechs };
}

/* IA-13 수집 자료 */
export type AdminObservation = {
  id: string; observedAt: string; source: string; techName: string; metric: string;
  prevValue: unknown; currValue: unknown; changeSize: string | null; isSimulated: boolean;
};

export async function readSources(db: SupabaseClient): Promise<{ id: string; name: string }[]> {
  return rows(db.from("sources").select("id, name").order("name"), "출처");
}

export async function readObservations(db: SupabaseClient, f: { sourceId: string | null; from: string | null }): Promise<AdminObservation[]> {
  let q = db.from("observations").select("id, observed_at, metric, prev_value, curr_value, change_size, is_simulated, sources(name), technologies(display_name)");
  if (f.sourceId) q = q.eq("source_id", f.sourceId);
  if (f.from) q = q.gte("observed_at", f.from);
  const data = await rows<Row>(q.order("observed_at", { ascending: false }).limit(LIMIT), "수집 자료");
  return data.map((r) => ({
    id: r.id, observedAt: r.observed_at, metric: r.metric, prevValue: r.prev_value, currValue: r.curr_value,
    changeSize: r.change_size, isSimulated: r.is_simulated,
    source: one(r.sources)?.name ?? "(출처 모름)", techName: one(r.technologies)?.display_name ?? "(기술 모름)",
  }));
}

/* IA-14 알림과 처리 현황 */
export async function readAlerts(db: SupabaseClient): Promise<AdminAlert[]> {
  const cols = "id, kind, status, created_at, profiles(nickname), changes(is_simulated, technologies(display_name)), judgments(decision, judged_at, profiles(nickname))";
  const data = await rows<Row>(db.from("alerts").select(cols).order("created_at", { ascending: false }).limit(LIMIT), "알림");
  return data.map((r) => {
    const change = one(r.changes);
    const j = one(r.judgments);
    return {
      id: r.id, kind: r.kind, status: r.status, createdAt: r.created_at,
      member: one(r.profiles)?.nickname ?? "(회원 모름)",
      techName: one(change?.technologies)?.display_name ?? "(기술 모름)",
      isSimulated: change?.is_simulated === true,
      judgment: j ? { decision: j.decision, judgedAt: j.judged_at, judgedBy: one(j.profiles)?.nickname ?? "(모름)" } : null,
    };
  });
}

/* IA-15 수집 실행과 오류 */
export async function readRuns(db: SupabaseClient): Promise<{ runs: RunRow[]; errors: StepErrorRow[] }> {
  const [runs, errors] = await Promise.all([
    rows<RunRow>(db.from("runs").select("id, trigger, status, created_at, item_count").order("created_at", { ascending: false }).limit(LIMIT), "실행 기록"),
    rows<StepErrorRow>(
      db.from("run_steps").select("run_id, step_name, error_kind, error_message, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(LIMIT),
      "실패한 단계",
    ),
  ]);
  return { runs, errors };
}

/* IA-17 분류 확인 */
export type Relation = { id: string; a: string; b: string; status: string; madeBy: string; quote: string | null; createdAt: string; confirmedAt: string | null };
export type Unclassified = { id: string; name: string; type: string; techKey: string };
/** 분류 확인에서 바꾼 기록(담당자·시각·사유, P-18b). */
export type ClassifyAudit = { at: string; action: string; reason: string | null; actorId: string | null };
const AUDIT_SHOWN = 10;

export async function readClassify(db: SupabaseClient): Promise<{ rules: RuleRow[]; relations: Relation[]; unclassified: Unclassified[]; manualNames: { name: string; createdAt: string }[]; audits: ClassifyAudit[] }> {
  const [rules, rel, techs, manual, audits] = await Promise.all([
    rows<RuleRow>(db.from("rule_lists").select("id, kind, ecosystem, value, pattern_id, pattern_grade, enabled"), "규칙 목록"),
    rows<Row>(
      db.from("tech_relations")
        .select("id, status, made_by, quote, created_at, confirmed_at, a:technologies!tech_relations_tech_a_fkey(display_name), b:technologies!tech_relations_tech_b_fkey(display_name)")
        .order("created_at", { ascending: false }).limit(LIMIT),
      "같은 역할 후보",
    ),
    // 얇은 줄(공식 MCP 레지스트리가 넣은 수천 개)은 쓰는 사람이 생겨 두꺼워지면 보인다: 안 거르면 목록 500칸을 다 차지한다
    rows<Row>(db.from("technologies").select("id, display_name, type, tech_key").is("category_id", null).eq("depth", "thick").order("display_name").limit(LIMIT), "갈래가 없는 기술"),
    rows<Row>(db.from("my_technologies").select("manual_name, created_at").not("manual_name", "is", null).order("created_at", { ascending: false }).limit(LIMIT), "직접 추가한 이름"),
    rows<Row>(
      db.from("audit_logs").select("created_at, action, reason, actor_id").in("target_table", ["tech_relations", "rule_lists"])
        .order("created_at", { ascending: false }).limit(AUDIT_SHOWN),
      "분류 확인 바꾼 기록",
    ),
  ]);
  return {
    rules,
    relations: rel.map((r) => ({ id: r.id, a: one(r.a)?.display_name ?? "?", b: one(r.b)?.display_name ?? "?", status: r.status, madeBy: r.made_by, quote: r.quote, createdAt: r.created_at, confirmedAt: r.confirmed_at ?? null })),
    audits: audits.map((x) => ({ at: x.created_at, action: x.action, reason: x.reason ?? null, actorId: x.actor_id ?? null })),
    unclassified: techs.map((t) => ({ id: t.id, name: t.display_name, type: t.type, techKey: t.tech_key })),
    manualNames: manual.map((m) => ({ name: m.manual_name, createdAt: m.created_at })),
  };
}

export const ADMIN_READ_LIMIT = LIMIT;
