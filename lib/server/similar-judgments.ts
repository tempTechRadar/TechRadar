// 비슷한 과거 판단 읽기(SPEC-4.5, IA-7). 주인: 황재웅(B). 로그인한 사용자의 클라이언트로 부른다(남의 줄은 RLS가 한 번 더 막는다, 불변 5).
// 읽기에 실패하면 던진다: 화면이 "찾지 못함"과 "불러오지 못함"을 다르게 보여 줘야 한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { findSimilarJudgments, type CurrentContext, type PastJudgment, type SimilarJudgment } from "../alerts/find-similar-judgments.ts";
import { GRADE_LABEL } from "../alerts/to-alert-view.ts";
import { maskSecrets } from "../domain/redact.ts";

type Row = Record<string, any>;
type DbResult = { data: unknown; error: { message: string } | null };

function rowsOrThrow({ data, error }: DbResult, what: string): Row[] {
  if (error || !data) throw new Error(`${what}: ${maskSecrets(error?.message ?? "빈 응답")}`);
  return data as Row[];
}

async function readCurrent(db: SupabaseClient, userId: string, alertId: string): Promise<Omit<CurrentContext, "sameRoleTechIds"> | null> {
  const { data, error } = await db.from("alerts").select("id, changes(tech_id, technologies(category_id))").eq("user_id", userId).eq("id", alertId).maybeSingle();
  if (error) throw new Error(`알림을 읽지 못함: ${maskSecrets(error.message)}`);
  const row = data as Row | null;
  return row ? { alertId, techId: row.changes.tech_id, categoryId: row.changes.technologies?.category_id ?? null } : null;
}

// 확정된 같은 역할만. 짝은 작은 id가 a라서 어느 쪽에 있어도 상대편을 가져온다.
export async function readSameRoleTechIds(db: SupabaseClient, techId: string): Promise<string[]> {
  const [asA, asB] = await Promise.all(
    (["tech_a", "tech_b"] as const).map((column) => db.from("tech_relations").select("tech_a, tech_b").eq("status", "confirmed").eq(column, techId)),
  );
  return [
    ...rowsOrThrow(asA, "같은 역할을 읽지 못함").map((row) => row.tech_b as string),
    ...rowsOrThrow(asB, "같은 역할을 읽지 못함").map((row) => row.tech_a as string),
  ];
}

async function readMyJudgments(db: SupabaseClient, userId: string): Promise<PastJudgment[]> {
  const rows = rowsOrThrow(
    await db
      .from("alerts")
      .select("id, changes(tech_id, curr_value, technologies(display_name, category_id)), judgments(decision, reason, judged_at)")
      .eq("user_id", userId)
      .eq("status", "done"),
    "알림을 읽지 못함",
  );
  return rows.flatMap((row) => {
    const judgment = Array.isArray(row.judgments) ? row.judgments[0] : row.judgments;
    if (!judgment) return [];
    const grade = row.changes.curr_value?.grade;
    return [{
      alertId: row.id,
      techId: row.changes.tech_id,
      techName: row.changes.technologies.display_name,
      categoryId: row.changes.technologies.category_id ?? null,
      decision: judgment.decision,
      reason: judgment.reason,
      grade: grade ? GRADE_LABEL[grade] ?? null : null,
      judgedAt: judgment.judged_at,
    }];
  });
}

/** 이 알림과 비슷한 내 지난 판단(최대 3개). 내 알림이 아니거나 없으면 빈 목록, 읽기에 실패하면 오류. */
export async function readSimilarJudgments(db: SupabaseClient, userId: string, alertId: string): Promise<SimilarJudgment[]> {
  const current = await readCurrent(db, userId, alertId);
  if (!current) return [];
  const [sameRoleTechIds, history] = await Promise.all([readSameRoleTechIds(db, current.techId), readMyJudgments(db, userId)]);
  return findSimilarJudgments({ ...current, sameRoleTechIds }, history);
}
