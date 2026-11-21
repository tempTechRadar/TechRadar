// 청사진 하단 패널 "후보" 탭 읽기(P-12f ⑤ 보드 녹이기): 관심 · 적용 후보 · 보류 = 옛 보드 칸과 같은 계산(buildKanban: 지도 표시와 알림 판단 중 더 최근 것).
// 쓰는 중(내 기술)은 기술 탭이 보여 주므로 여기서는 뺀다. 사용자 토큰으로 본인 것만(user_id 조건 + RLS, 불변 5). 하나라도 못 읽으면 던진다(빈 칸과 다르게, 불변 2)
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSecrets } from "../domain/redact.ts";
import { categoryNames, type Category } from "../map/build-map.ts";
import { buildKanban, type Card, type KanbanInput } from "../views/kanban.ts";
import { rowsOrThrow, type Row } from "./alert-db.ts";
import { readCategories } from "./map-queries.ts";

export type CandidateBoard = { interest: Card[]; candidate: Card[]; hold: Card[] };

const one = <T,>(j: T | T[] | null): T | null => (Array.isArray(j) ? j[0] : j) ?? null;

export async function readCandidateBoard(db: SupabaseClient, userId: string): Promise<CandidateBoard> {
  const [markRes, alertRes, cats] = await Promise.all([
    db.from("tech_marks").select("tech_id, status, reason, updated_at, technologies(display_name, grade, category_id)").eq("user_id", userId),
    db.from("alerts").select("changes(tech_id, technologies(display_name, grade, category_id)), judgments(decision, reason, judged_at)").eq("user_id", userId).eq("status", "done"),
    readCategories(db).catch((e: unknown) => { throw new Error(`갈래를 읽지 못함: ${maskSecrets(e instanceof Error ? e.message : String(e))}`); }),
  ]);
  const catMap = new Map<string, Category>(cats.map((c) => [c.id, c]));
  const fieldOf = (t: Row | null) => categoryNames(t?.category_id ?? null, catMap).field;
  const input: KanbanInput = {
    mine: [],
    marks: rowsOrThrow(markRes, "내 판단 표시를 읽지 못함").map((m) => ({
      techId: m.tech_id, name: m.technologies?.display_name ?? "(이름 없음)", grade: m.technologies?.grade ?? "unknown", status: m.status, reason: m.reason, updatedAt: m.updated_at, field: fieldOf(m.technologies),
    })),
    judged: rowsOrThrow(alertRes, "알림 판단을 읽지 못함").flatMap((a) => {
      const j = one(a.judgments as Row | Row[] | null);
      return j && a.changes ? [{ techId: a.changes.tech_id, name: a.changes.technologies?.display_name ?? "(이름 없음)", grade: a.changes.technologies?.grade ?? "unknown", decision: j.decision, reason: j.reason, judgedAt: j.judged_at, field: fieldOf(a.changes.technologies) }] : [];
    }),
  };
  const k = buildKanban(input);
  return { interest: k.interest, candidate: k.candidate, hold: k.hold };
}
