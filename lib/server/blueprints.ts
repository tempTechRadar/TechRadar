// 블루프린트 화면의 읽기 · 쓰기(design.md 14절 ⑤). 로그인한 사용자의 토큰으로 부른다(본인 것만: user_id 조건 + RLS, 불변 5).
// 서랍 = 내 기술 · 적용 후보 · 확정에 쓴 기술(자주 쓴 순은 화면이 이력으로 정렬) + 카탈로그 찾기(공개 목록만, ADR 0029).
// 11-21 화면 개편 C "판단 = 청사진으로 가는 관문": 관심은 빼고 적용 후보만. 적용 후보는 보드의 "적용 후보" 칸과 같은 계산(지도 표시와 알림 판단 중 더 최근 것)이라 알림에서 고른 것도 들어온다.
// 확정(v2, P-12e)은 쉬운 실패 문구를 위해 여기서 먼저 보고(parseGraph), 진짜 막기 · 관문 · 기술 이름 다시 읽기 · 같은 id 한 줄은 DB 함수 confirm_blueprint_v2가 한다. 옛 v1 확정은 지움(M5에서 DB 실행 권한도 회수).
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryNames, type Category, type Grade } from "../map/build-map.ts";
import { isUuid } from "../domain/my-tech-view.ts";
import { HISTORY_LIMIT, readStored, readStoredGraph, type BlueprintRecord } from "../blueprint/stored.ts";
import { parseGraph, type Graph } from "../blueprint/graph.ts";
import { rowsOrThrow, type Row } from "./alert-db.ts";
import { buildKanban } from "../views/kanban.ts";
import { like } from "./capture.ts";
import { chunks, publicTechs, readCategories } from "./map-queries.ts";

/** projectIds = 이 기술을 쓰는 내 프로젝트(기술 트리 "프로젝트" 묶기, P-12h S2). 카탈로그 찾기 결과에는 없음 */
export type PoolTech = { id: string; name: string; type: string; grade: Grade; field: string | null; sub: string | null; oneLiner: string | null; projects: number; mark: "candidate" | null; projectIds?: string[] };
export type BlueprintPage = { pool: PoolTech[]; history: BlueprintRecord[] | null; projects: { id: string; name: string }[] };
/** v2 확정(P-12e): 캔버스 그래프. templateId = "이 템플릿으로 시작"한 템플릿(없으면 null) — 템플릿에 든 기술도 내 관문만 거친다(DB, ADR 0034 1) */
export type ConfirmGraphInput = { id: unknown; name: unknown; projectId: unknown; graph: unknown; templateId?: unknown };
export type ConfirmResult = { ok: true } | { ok: false; message: string };

const TECH_COLUMNS = "id, display_name, type, grade, category_id, one_liner";
const SEARCH_LIMIT = 20;

const toPool = (r: Row, cats: Map<string, Category>, extra: Pick<PoolTech, "projects" | "mark" | "projectIds">): PoolTech => {
  const c = categoryNames(r.category_id ?? null, cats);
  return { id: r.id, name: r.display_name, type: r.type, grade: r.grade as Grade, field: r.category_id ? c.field : null, sub: r.category_id ? c.sub : null, oneLiner: r.one_liner ?? null, ...extra };
};
const catMap = (cats: Category[]) => new Map(cats.map((c) => [c.id, c]));

async function readTechs(db: SupabaseClient, ids: string[]): Promise<Row[]> {
  const parts = await Promise.all(chunks(ids).map((c) => db.from("technologies").select(TECH_COLUMNS).in("id", c)));
  return parts.flatMap((p) => rowsOrThrow(p, "기술을 읽지 못함"));
}

/** 확정 이력(최근 HISTORY_LIMIT개). 표가 아직 없거나(마이그레이션 전) 못 읽으면 null: 판 만들기는 그대로 쓰고 이력만 "읽지 못함"(불변 2).
 *  모양이 틀린 줄은 빼고 센다(줄 하나가 화면 전체를 깨지 않게) */
async function readHistory(db: SupabaseClient, userId: string): Promise<BlueprintRecord[] | null> {
  const r = await db.from("blueprints").select("id, name, project_id, board, graph, created_at, projects(name)").eq("user_id", userId).order("created_at", { ascending: false }).limit(HISTORY_LIMIT);
  if (r.error) { console.error("블루프린트 이력을 읽지 못함", r.error.message); return null; }
  return (r.data as Row[]).flatMap((h) => {
    const board = readStored(h.board);
    if (!board) { console.error("블루프린트 이력 한 줄의 모양이 맞지 않아 뺌", h.id); return []; }
    return [{ id: h.id, name: h.name, projectId: h.project_id, projectName: h.projects?.name ?? null, createdAt: h.created_at, board, graph: readStoredGraph(h.graph ?? null) }];
  });
}

export async function readBlueprintPage(db: SupabaseClient, userId: string): Promise<BlueprintPage> {
  const [mineRes, candidates, projRes, cats, history] = await Promise.all([
    db.from("my_technologies").select("tech_id, project_id, projects!inner(archived_at)").eq("owner_id", userId).is("hidden_at", null).is("projects.archived_at", null).not("tech_id", "is", null),
    readCandidateIds(db, userId),
    db.from("projects").select("id, name").eq("owner_id", userId).is("archived_at", null).order("created_at"),
    readCategories(db),
    readHistory(db, userId),
  ]);
  const perTech = new Map<string, Set<string>>();
  for (const m of rowsOrThrow(mineRes, "내 기술을 읽지 못함")) perTech.set(m.tech_id, (perTech.get(m.tech_id) ?? new Set()).add(m.project_id));
  const used = (history ?? []).flatMap((h) => h.board.flat().flatMap((s) => s.techs.map((t) => t.id)));
  const ids = [...new Set([...perTech.keys(), ...candidates, ...used])].filter(isUuid);
  const map = catMap(cats);
  const pool = (await readTechs(db, ids)).map((r) => toPool(r, map, { projects: perTech.get(r.id)?.size ?? 0, mark: candidates.has(r.id) ? "candidate" : null, projectIds: [...(perTech.get(r.id) ?? [])] }));
  const projects = rowsOrThrow(projRes, "프로젝트를 읽지 못함").map((p) => ({ id: p.id as string, name: p.name as string }));
  return { pool, history, projects };
}

/** 내 적용 후보(= 화면의 "담은 기술") id: 표시 · 알림 판단을 읽어 candidateIds로. 청사진 서랍 · 메뉴 담은 수 배지(marks.countCandidates)가 같은 셈을 쓴다. 못 읽으면 던진다 */
export async function readCandidateIds(db: SupabaseClient, userId: string): Promise<Set<string>> {
  const [markRes, judgedRes] = await Promise.all([
    db.from("tech_marks").select("tech_id, status, updated_at").eq("user_id", userId),
    db.from("alerts").select("changes(tech_id), judgments(decision, judged_at)").eq("user_id", userId).eq("status", "done"),
  ]);
  return candidateIds(rowsOrThrow(markRes, "내 판단 표시를 읽지 못함"), rowsOrThrow(judgedRes, "알림 판단을 읽지 못함"));
}

/** 적용 후보인 기술 id: 보드 칸과 같은 계산(buildKanban)을 그대로 쓴다. 이름 · 등급은 이 계산에 쓰이지 않아 비워 둔다.
 *  alerts는 판단한 알림 줄(changes.tech_id, judgments 한 줄 객체 또는 배열) */
export function candidateIds(marks: Row[], alerts: Row[]): Set<string> {
  const judged = alerts.flatMap((a) => {
    const j = Array.isArray(a.judgments) ? a.judgments[0] : a.judgments;
    return j && a.changes?.tech_id ? [{ techId: a.changes.tech_id as string, name: "", grade: "unknown" as const, decision: j.decision, reason: null, judgedAt: j.judged_at }] : [];
  });
  const k = buildKanban({ mine: [], marks: marks.map((m) => ({ techId: m.tech_id, name: "", grade: "unknown", status: m.status, reason: null, updatedAt: m.updated_at })), judged });
  return new Set(k.candidate.map((c) => c.techId!));
}

/** 기술 트리(P-12h S2)의 관심 · 보류 카드에 붙일 정보(하는 일 · 세부 갈래 · 종류 · 등급): 넣을 수 있는 기술이 아니라 판단 보기용이라 projects 0 · mark null.
 *  기술 줄이나 갈래를 못 읽으면 던진다(갈래만 비우면 "아직 분류 안 됨"으로 보여 못 읽은 것이 분류 안 된 것처럼 됨, 불변 2) */
export async function readTechDetails(db: SupabaseClient, ids: string[]): Promise<PoolTech[]> {
  const ok = ids.filter(isUuid);
  if (!ok.length) return [];
  const [rows, cats] = await Promise.all([readTechs(db, ok), readCategories(db)]);
  const map = catMap(cats);
  return rows.map((r) => toPool(r, map, { projects: 0, mark: null }));
}

/** 손님이 지도에서 담은 기술(P-12h-2 T3): 공개 목록 · 공개 칸만(지도 손님 찾기와 같은 길), 담은 차례 그대로. 공개 목록에서 빠진 것은 뺀다. 못 읽으면 null(불변 2) */
export async function readPublicPoolTechs(db: SupabaseClient, ids: string[]): Promise<PoolTech[] | null> {
  const ok = [...new Set(ids.filter(isUuid))].slice(0, 30);
  if (!ok.length) return [];
  const [r, cats] = await Promise.all([publicTechs(db, TECH_COLUMNS).in("id", ok), readCategories(db).catch(() => null)]);
  if (r.error || !cats) { console.error("담은 기술 읽기 실패", r.error?.message ?? "갈래를 읽지 못함"); return null; }
  const map = catMap(cats), by = new Map((r.data as unknown as Row[]).map((x) => [x.id as string, toPool(x, map, { projects: 0, mark: null })]));
  return ok.flatMap((id) => by.get(id) ?? []);
}

/** 지도 찾기(searchCatalogAction)가 쓰는 공개 목록 찾기: 공개 목록에서 그 글자로 시작하는 이름 먼저, 그다음 들어 있는 이름(각각 이름순)으로 20개. 못 읽으면 null(빈 결과와 다르게, 불변 2) */
export async function findPoolTechs(db: SupabaseClient, query: string): Promise<PoolTech[] | null> {
  const term = like(query);
  if (!term) return [];
  const [pre, any, cats] = await Promise.all([
    publicTechs(db, TECH_COLUMNS).ilike("display_name", `${term}%`).order("display_name").limit(SEARCH_LIMIT),
    publicTechs(db, TECH_COLUMNS).ilike("display_name", `%${term}%`).order("display_name").limit(SEARCH_LIMIT),
    readCategories(db).catch(() => null),
  ]);
  if (pre.error || any.error || !cats) { console.error("블루프린트 기술 찾기 실패", pre.error?.message ?? any.error?.message ?? "갈래를 읽지 못함"); return null; }
  const rows = [...(pre.data as unknown as Row[]), ...(any.data as unknown as Row[])];
  const unique = rows.filter((r, i) => rows.findIndex((x) => x.id === r.id) === i).slice(0, SEARCH_LIMIT);
  const map = catMap(cats);
  return unique.map((x) => toPool(x, map, { projects: 0, mark: null }));
}

/** DB 거절 문구의 열쇠 → 쉬운 말. 열쇠는 마이그레이션 문구 그대로여야 한다(blueprints.test.ts가 파일과 대조) */
export const DB_REFUSED: Record<string, string> = {
  "본인 프로젝트가 아니다": "프로젝트를 다시 골라 주세요.",
  "이미 쓰인 확정 id": "확정을 다시 눌러 주세요.",
  // v2(M1 202611221000 blueprint_graph_clean)의 거절 문구
  "위험 등급 기술": "위험한 기술은 넣지 않아요. 빼고 다시 확정해 주세요.",
  "고른 적 없는 기술": "청사진에는 내 기술 · 담은 기술 · 내 이력의 기술만 넣을 수 있어요. 지도에서 \"청사진에 담기\"를 누른 뒤 넣어 주세요.",
  "기술을 찾지 못했다": "찾지 못한 기술이 있어요. 빼고 다시 넣어 주세요.",
  "사이클": "연결선이 돌고 있어 순서를 정할 수 없어요. 연결 하나를 끊어 주세요.",
  "단계 깊이는 12": "단계는 12단계 깊이까지예요.",
  "같은 깊이의 단계는 4": "같은 순서(동시)에 둘 수 있는 단계는 4개까지예요.",
  "단계는 1~48": "단계는 1~48개까지예요.",
  "단계마다 기술은 8": "단계마다 기술은 8개까지예요.",
  "연결선은 200": "연결선은 200개까지예요.",
  "단계 이름은 1~20자": "단계 이름은 1~20자로 적어 주세요.",
  "단계 자리(x, y)": "단계 자리가 맞지 않아요. 자동 정렬을 누른 뒤 다시 확정해 주세요.",
  "자기 자신": "단계를 자기 자신에 이을 수 없어요.",
  "같은 연결선": "같은 연결선이 두 번 있어요. 하나를 지워 주세요.",
  "없는 단계": "연결선이 없는 단계를 가리켜요. 그 연결을 지워 주세요.",
  "단계 id": "단계 하나의 이름표가 맞지 않아요. 그 단계를 지우고 다시 놓아 주세요.",
  "청사진 이름은 1~60자": "청사진 이름은 1~60자로 적어 주세요.",
  "v2가 아니다": "청사진 모양이 맞지 않아요. 새로 고친 뒤 다시 확정해 주세요.",
  "단계 열은 1~12": "단계 열은 1~12개까지예요.",
  "나란히 단계는 1~4": "나란히 둘 수 있는 단계는 4개까지예요.",
  "쓸 수 없는 템플릿": "이 템플릿은 지금 쓸 수 없어요(비공개로 바뀌었거나 숨겨졌어요). 템플릿 없이 다시 확정해 주세요.",
};
const CONFIRM_FAILED = "확정하지 못했어요. 판은 그대로 있어요. 잠시 뒤 다시 시도해 주세요.";

/** DB 함수 답 → 결과. 거절 문구는 쉬운 말로, 'saved' · 'exists'만 성공(같은 id는 한 줄, 불변 3). 그 밖은 실패(불변 4) */
function confirmResult(r: { data: unknown; error: { message: string } | null }): ConfirmResult {
  if (r.error) {
    console.error("청사진을 확정하지 못함", r.error.message);
    const known = Object.entries(DB_REFUSED).find(([k]) => r.error!.message.includes(k));
    // 관문 · 위험 등급은 DB가 막힌 기술 이름을 ": 이름"으로 붙인다(어느 기술을 뺄지 알게)
    const tech = /(?:고른 적 없는 기술|위험 등급 기술)[^:]*: (.+)$/.exec(r.error.message)?.[1];
    return { ok: false, message: known ? (tech ? `${known[1]} (${tech})` : known[1]) : CONFIRM_FAILED };
  }
  return r.data === "saved" || r.data === "exists" ? { ok: true } : { ok: false, message: "확정됐는지 확인하지 못했어요. 내 이력을 새로 고쳐 확인해 주세요." };
}

/**
 * 이 그래프로 확정(v2, P-12e). 모양 · 한도 · 고리 · 기술 이름 · 위험 등급 · 관문(내 기술 · 적용 후보 · 내 이력만)은 DB 함수
 * confirm_blueprint_v2가 본다(화면 · 서버를 건너뛴 직접 호출도 같은 검사). 여기서는 값의 겉모양과 쉬운 실패 문구만.
 */
export async function confirmBlueprintGraph(db: SupabaseClient, input: ConfirmGraphInput): Promise<ConfirmResult> {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
  if (!isUuid(input.id)) return { ok: false, message: "확정을 다시 눌러 주세요." };
  if (!name) return { ok: false, message: "청사진 이름을 적어 주세요." };
  if (input.projectId !== null && !isUuid(input.projectId)) return { ok: false, message: "프로젝트를 다시 골라 주세요." };
  const templateId = input.templateId ?? null;
  if (templateId !== null && !isUuid(templateId)) return { ok: false, message: "템플릿을 다시 골라 주세요." };
  const parsed = parseGraph(input.graph); // 쉬운 문구용 미리 보기(모양 · 한도 · 고리). 진짜 막기는 DB 함수
  if (!parsed.ok) return { ok: false, message: parsed.message };
  return confirmResult(await db.rpc("confirm_blueprint_v2", { p_id: input.id, p_name: name, p_project_id: input.projectId, p_graph: parsed.graph, p_template_id: templateId }));
}

/** 확정본 하나의 그래프(스튜디오가 열 때). 옛 v1 확정본 · 없는 id · 남의 것은 null(화면은 board를 fromV1로). 못 읽으면 던진다(불변 2) */
export async function readBlueprintGraph(db: SupabaseClient, userId: string, id: string): Promise<Graph | null> {
  if (!isUuid(id)) return null;
  const r = await db.from("blueprints").select("graph").eq("user_id", userId).eq("id", id).maybeSingle();
  if (r.error) throw new Error(`청사진 그래프를 읽지 못함: ${r.error.message}`);
  return readStoredGraph((r.data as { graph?: unknown } | null)?.graph ?? null);
}

/** 청사진에 넣을 수 있는 내 기술 id(내 기술 · 적용 후보 · 내 이력) — DB 관문과 같은 목록(my_blueprint_tech_ids). 못 읽으면 던진다 */
export async function readAllowedTechIds(db: SupabaseClient): Promise<Set<string>> {
  const r = await db.rpc("my_blueprint_tech_ids");
  if (r.error || !Array.isArray(r.data)) throw new Error(`청사진에 넣을 수 있는 기술을 읽지 못함: ${r.error?.message ?? "빈 응답"}`);
  return new Set((r.data as unknown[]).map(String));
}

