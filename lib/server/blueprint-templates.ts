// 청사진 템플릿(틀 · 조합)과 공개 갤러리(P-12e, ADR 0035 · 0036). 로그인한 사용자의 토큰으로 부른다(불변 5).
// 쓰기는 DB 함수로만(save_blueprint_template · set_template_public · hide_blueprint_template, M2 202611221100): 그래프 검사 · 관문 · 공개 규칙은 DB가 본다.
// 갤러리는 public_blueprint_templates가 별명과 수만 준다(author_id 없음). 내 템플릿은 표를 직접 읽는다(RLS = 본인만, 관리자도 남의 것은 못 읽음).
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGraph, type Graph, type TemplateKind } from "../blueprint/graph.ts";
import { readStored, type StoredBoard } from "../blueprint/stored.ts";
import { isUuid } from "../domain/my-tech-view.ts";
import type { Row } from "./alert-db.ts";
import { readAllowedTechIds } from "./blueprints.ts";

export type TemplateResult = { ok: true } | { ok: false; message: string };
export type MyTemplate = { id: string; kind: TemplateKind; name: string; graph: Graph; board: StoredBoard; isPublic: boolean; hidden: boolean; createdAt: string };
/** 갤러리 한 장: 사람 정보는 별명뿐(ADR 0036 2) */
export type PublicTemplate = { id: string; kind: TemplateKind; name: string; graph: Graph; board: StoredBoard; authorNickname: string; uses: number; createdAt: string };
export type TemplateInput = { id: unknown; kind: unknown; name: unknown; graph: unknown };

const KINDS: readonly string[] = ["frame", "combo"];
const SAVE_FAILED = "저장하지 못했어요. 판은 그대로 있어요. 잠시 뒤 다시 시도해 주세요.";
/** DB 거절 문구의 열쇠 → 쉬운 말(열쇠는 마이그레이션 문구 그대로, blueprint-templates.test.ts가 파일과 대조) */
export const TEMPLATE_REFUSED: Record<string, string> = {
  "템플릿 한도": "템플릿은 한 사람 100개까지예요. 안 쓰는 템플릿을 정리해 주세요.",
  "이미 쓰인 템플릿 id": "저장을 다시 눌러 주세요.",
  "템플릿 이름은 1~60자": "템플릿 이름은 1~60자로 적어 주세요.",
  "내 템플릿이 아니다": "내 템플릿만 바꿀 수 있어요.",
  "관리자가 숨긴 템플릿": "관리자가 숨긴 템플릿이라 다시 공개할 수 없어요.",
  "고른 적 없는 기술": "조합에는 내 기술 · 적용 후보 · 내 이력의 기술만 넣을 수 있어요. 틀로 저장하거나 그 기술을 빼 주세요.",
  "위험 등급 기술": "위험한 기술은 템플릿에 넣지 않아요. 빼고 다시 저장해 주세요.",
  "관리자만 숨길 수 있다": "관리자만 숨길 수 있어요.",
  "공개 템플릿을 찾지 못했다": "공개된 템플릿만 숨길 수 있어요.",
  "숨긴 템플릿을 찾지 못했다": "이미 다시 보이는 템플릿이에요. 새로 고쳐 확인해 주세요.",
};

function refused(error: { message: string }, fallback: string): TemplateResult {
  console.error("템플릿 처리 실패", error.message);
  const known = Object.entries(TEMPLATE_REFUSED).find(([k]) => error.message.includes(k));
  return { ok: false, message: known?.[1] ?? fallback };
}

/** 템플릿 저장(틀 = 단계와 연결만, 조합 = 기술까지). 같은 id는 한 줄(불변 3), 실패하면 아무것도 안 남김(불변 4) */
export async function saveTemplate(db: SupabaseClient, input: TemplateInput): Promise<TemplateResult> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!isUuid(input.id)) return { ok: false, message: "저장을 다시 눌러 주세요." };
  if (typeof input.kind !== "string" || !KINDS.includes(input.kind)) return { ok: false, message: "틀 · 조합 중에서 골라 주세요." };
  if (!name || name.length > 60) return { ok: false, message: "템플릿 이름은 1~60자로 적어 주세요." };
  const parsed = parseGraph(input.graph);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  const r = await db.rpc("save_blueprint_template", { p_id: input.id, p_kind: input.kind, p_name: name, p_graph: parsed.graph });
  if (r.error) return refused(r.error, SAVE_FAILED);
  return r.data === "saved" || r.data === "exists" ? { ok: true } : { ok: false, message: "저장됐는지 확인하지 못했어요. 내 템플릿을 새로 고쳐 확인해 주세요." };
}

/** 공개 · 비공개 바꾸기(내 템플릿만, ADR 0036 1). DB가 바뀐 뒤 값을 돌려줘야 성공 */
export async function setTemplatePublic(db: SupabaseClient, id: unknown, isPublic: boolean): Promise<TemplateResult> {
  if (!isUuid(id)) return { ok: false, message: "템플릿을 다시 골라 주세요." };
  const r = await db.rpc("set_template_public", { p_id: id, p_public: isPublic });
  if (r.error) return refused(r.error, "바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  return r.data === isPublic ? { ok: true } : { ok: false, message: "바뀌었는지 확인하지 못했어요. 새로 고쳐 확인해 주세요." };
}

/** 관리자 숨김 · 되돌리기(ADR 0036 4). 관리자 확인은 DB 함수가 한다 */
export async function hideTemplate(db: SupabaseClient, id: unknown, hidden: boolean): Promise<TemplateResult> {
  if (!isUuid(id)) return { ok: false, message: "템플릿을 다시 골라 주세요." };
  const r = await db.rpc("hide_blueprint_template", { p_id: id, p_hidden: hidden });
  if (r.error) return refused(r.error, "바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  return r.data === hidden ? { ok: true } : { ok: false, message: "바뀌었는지 확인하지 못했어요. 새로 고쳐 확인해 주세요." };
}

/** DB 줄 → 템플릿 공통 칸. 모양이 틀린 줄은 null(그 줄만 빼고, 화면 전체가 깨지지 않게) */
function toCommon(r: Row): Pick<MyTemplate, "id" | "kind" | "name" | "graph" | "board" | "createdAt"> | null {
  const parsed = parseGraph(r.graph);
  const board = readStored(r.board);
  if (!parsed.ok || !board || !KINDS.includes(r.kind)) { console.error("템플릿 한 줄의 모양이 맞지 않아 뺌", r.id); return null; }
  return { id: r.id, kind: r.kind as TemplateKind, name: r.name, graph: parsed.graph, board, createdAt: r.created_at };
}

/** 내 템플릿(새것 순). 못 읽으면 던진다(빈 목록과 다르게, 불변 2) */
export async function readMyTemplates(db: SupabaseClient, userId: string): Promise<MyTemplate[]> {
  const r = await db.from("blueprint_templates").select("id, kind, name, graph, board, is_public, hidden_at, created_at").eq("author_id", userId).order("created_at", { ascending: false });
  if (r.error || !r.data) throw new Error(`내 템플릿을 읽지 못함: ${r.error?.message ?? "빈 응답"}`);
  return (r.data as Row[]).flatMap((x) => { const c = toCommon(x); return c ? [{ ...c, isPublic: x.is_public === true, hidden: x.hidden_at !== null }] : []; });
}

/** 공개 갤러리(쓰인 수 많은 순 → 새것 순). kind로 거를 수 있다. 못 읽으면 던진다 */
export async function readPublicTemplates(db: SupabaseClient, kind: TemplateKind | null = null): Promise<PublicTemplate[]> {
  const r = await db.rpc("public_blueprint_templates", { p_kind: kind, p_limit: 60, p_offset: 0 });
  if (r.error || !Array.isArray(r.data)) throw new Error(`공개 템플릿을 읽지 못함: ${r.error?.message ?? "빈 응답"}`);
  return (r.data as Row[]).flatMap((x) => { const c = toCommon(x); return c ? [{ ...c, authorNickname: String(x.author_nickname ?? "익명"), uses: Number(x.uses ?? 0) }] : []; });
}

/** 템플릿 열기 결과. outsideGate = 내 관문(내 기술 · 적용 후보 · 내 이력) 밖 기술 id: 화면은 옅은 후보 칩으로만 보이고 "적용 후보로 고르기" 뒤에 넣는다(ADR 0034 1) */
export type TemplateForUse = { id: string; kind: TemplateKind; name: string; graph: Graph; outsideGate: string[] };

/** "이 템플릿으로 시작": 내 것이거나 공개(숨김 · 시연 계정 아님)인 템플릿의 그래프. 쓸 수 없거나 없으면 null. 못 읽으면 던진다 */
export async function readTemplateForUse(db: SupabaseClient, id: unknown): Promise<TemplateForUse | null> {
  if (!isUuid(id)) return null;
  const r = await db.rpc("blueprint_template_for_use", { p_id: id });
  if (r.error || !Array.isArray(r.data)) throw new Error(`템플릿을 읽지 못함: ${r.error?.message ?? "빈 응답"}`);
  const row = (r.data as Row[])[0];
  if (!row) return null;
  const parsed = parseGraph(row.graph);
  if (!parsed.ok || !KINDS.includes(row.kind)) return null;
  const techIds = [...new Set(parsed.graph.stages.flatMap((s) => s.techs.map((t) => t.id)))];
  const allowed = techIds.length ? await readAllowedTechIds(db) : new Set<string>();
  return { id: row.id, kind: row.kind as TemplateKind, name: row.name, graph: parsed.graph, outsideGate: techIds.filter((t) => !allowed.has(t)) };
}
