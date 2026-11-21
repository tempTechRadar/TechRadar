// 블루프린트 화면의 읽기 · 쓰기(design.md 14절 ⑤). 로그인한 사용자의 토큰으로 부른다(본인 것만: user_id 조건 + RLS, 불변 5).
// 서랍 = 내 기술 · 적용 후보 · 확정에 쓴 기술(자주 쓴 순은 화면이 이력으로 정렬) + 카탈로그 찾기(공개 목록만, ADR 0029).
// 11-21 화면 개편 C "판단 = 청사진으로 가는 관문": 관심은 빼고 적용 후보만. 적용 후보는 보드의 "적용 후보" 칸과 같은 계산(지도 표시와 알림 판단 중 더 최근 것)이라 알림에서 고른 것도 들어온다.
// 확정은 쉬운 실패 문구를 위해 여기서 먼저 보고(parseBoard · 위험 등급), 진짜 막기 · 기술 이름 다시 읽기 · 같은 id 한 줄은 DB 함수 confirm_blueprint가 한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryNames, type Category, type Grade } from "../map/build-map.ts";
import { isUuid } from "../domain/my-tech-view.ts";
import { HISTORY_LIMIT, parseBoard, readStored, type BlueprintRecord } from "../blueprint/stored.ts";
import { rowsOrThrow, type Row } from "./alert-db.ts";
import { buildKanban } from "../views/kanban.ts";
import { like } from "./capture.ts";
import { chunks, publicTechs, readCategories } from "./map-queries.ts";

export type PoolTech = { id: string; name: string; type: string; grade: Grade; field: string | null; sub: string | null; oneLiner: string | null; projects: number; mark: "candidate" | null };
export type BlueprintPage = { pool: PoolTech[]; history: BlueprintRecord[] | null; projects: { id: string; name: string }[] };
export type ConfirmInput = { id: unknown; name: unknown; projectId: unknown; board: unknown };
export type ConfirmResult = { ok: true } | { ok: false; message: string };

const TECH_COLUMNS = "id, display_name, type, grade, category_id, one_liner";
const SEARCH_LIMIT = 20;

const toPool = (r: Row, cats: Map<string, Category>, extra: Pick<PoolTech, "projects" | "mark">): PoolTech => {
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
  const r = await db.from("blueprints").select("id, name, project_id, board, created_at, projects(name)").eq("user_id", userId).order("created_at", { ascending: false }).limit(HISTORY_LIMIT);
  if (r.error) { console.error("블루프린트 이력을 읽지 못함", r.error.message); return null; }
  return (r.data as Row[]).flatMap((h) => {
    const board = readStored(h.board);
    if (!board) { console.error("블루프린트 이력 한 줄의 모양이 맞지 않아 뺌", h.id); return []; }
    return [{ id: h.id, name: h.name, projectId: h.project_id, projectName: h.projects?.name ?? null, createdAt: h.created_at, board }];
  });
}

export async function readBlueprintPage(db: SupabaseClient, userId: string): Promise<BlueprintPage> {
  const [mineRes, markRes, judgedRes, projRes, cats, history] = await Promise.all([
    db.from("my_technologies").select("tech_id, project_id, projects!inner(archived_at)").eq("owner_id", userId).is("hidden_at", null).is("projects.archived_at", null).not("tech_id", "is", null),
    db.from("tech_marks").select("tech_id, status, updated_at").eq("user_id", userId),
    db.from("alerts").select("changes(tech_id), judgments(decision, judged_at)").eq("user_id", userId).eq("status", "done"),
    db.from("projects").select("id, name").eq("owner_id", userId).is("archived_at", null).order("created_at"),
    readCategories(db),
    readHistory(db, userId),
  ]);
  const perTech = new Map<string, Set<string>>();
  for (const m of rowsOrThrow(mineRes, "내 기술을 읽지 못함")) perTech.set(m.tech_id, (perTech.get(m.tech_id) ?? new Set()).add(m.project_id));
  const candidates = candidateIds(rowsOrThrow(markRes, "내 판단 표시를 읽지 못함"), rowsOrThrow(judgedRes, "알림 판단을 읽지 못함"));
  const used = (history ?? []).flatMap((h) => h.board.flat().flatMap((s) => s.techs.map((t) => t.id)));
  const ids = [...new Set([...perTech.keys(), ...candidates, ...used])].filter(isUuid);
  const map = catMap(cats);
  const pool = (await readTechs(db, ids)).map((r) => toPool(r, map, { projects: perTech.get(r.id)?.size ?? 0, mark: candidates.has(r.id) ? "candidate" : null }));
  const projects = rowsOrThrow(projRes, "프로젝트를 읽지 못함").map((p) => ({ id: p.id as string, name: p.name as string }));
  return { pool, history, projects };
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

/** 서랍의 "카탈로그에서 찾기": 공개 목록에서 그 글자로 시작하는 이름 먼저, 그다음 들어 있는 이름(각각 이름순)으로 20개. 못 읽으면 null(빈 결과와 다르게, 불변 2) */
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

const DB_REFUSED: Record<string, string> = { "본인 프로젝트가 아니다": "프로젝트를 다시 골라 주세요.", "이미 쓰인 확정 id": "확정을 다시 눌러 주세요." };

/** 이 조합으로 확정: 쉬운 문구용 미리 보기(판 모양 · 없는 기술 · 위험 등급) → DB 함수가 다시 막고 남김(같은 id는 한 줄, 불변 3). 실패하면 아무것도 안 남김(불변 4) */
export async function confirmBlueprint(db: SupabaseClient, input: ConfirmInput): Promise<ConfirmResult> {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
  if (!isUuid(input.id)) return { ok: false, message: "확정을 다시 눌러 주세요." };
  if (!name) return { ok: false, message: "청사진 이름을 적어 주세요." };
  if (input.projectId !== null && !isUuid(input.projectId)) return { ok: false, message: "프로젝트를 다시 골라 주세요." };
  const parsed = parseBoard(input.board);
  if (!parsed.ok) return parsed;
  const ids = [...new Set(parsed.cols.flat().flatMap((s) => s.techIds))];
  let techs: Map<string, Row>;
  try { techs = new Map((await readTechs(db, ids)).map((r) => [r.id as string, r])); }
  catch (e) { console.error("확정할 기술을 읽지 못함", e instanceof Error ? e.message : e); return { ok: false, message: "기술을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요." }; }
  if (ids.some((id) => !techs.has(id))) return { ok: false, message: "찾지 못한 기술이 있어요. 서랍에서 다시 넣어 주세요." };
  const risky = ids.map((id) => techs.get(id)!).filter((t) => t.grade === "danger");
  if (risky.length) return { ok: false, message: `위험한 기술은 넣지 않아요: ${risky.map((t) => t.display_name).join(", ")}. 빼고 다시 확정해 주세요.` };
  const board = parsed.cols.map((c) => c.map((s) => ({ name: s.name, techs: s.techIds.map((id) => ({ id })) })));
  const r = await db.rpc("confirm_blueprint", { p_id: input.id, p_name: name, p_project_id: input.projectId, p_board: board });
  if (r.error) {
    console.error("블루프린트를 확정하지 못함", r.error.message);
    const known = Object.entries(DB_REFUSED).find(([k]) => r.error!.message.includes(k));
    return { ok: false, message: known?.[1] ?? "확정하지 못했어요. 판은 그대로 있어요. 잠시 뒤 다시 시도해 주세요." };
  }
  return r.data === "saved" || r.data === "exists" ? { ok: true } : { ok: false, message: "확정됐는지 확인하지 못했어요. 내 이력을 새로 고쳐 확인해 주세요." };
}
