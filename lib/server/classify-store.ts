// 갈래 자동 분류 단계(PRD-F24 "규칙 먼저"). 주인: 김영식 A. 매일 정기 실행·지금 실행이 수집 묶음을 마친 뒤 같은 실행에 붙여 부른다(흐름 상자는 아직 없음).
// 수집이 아니므로 수집기 목록에 넣지 않는다: 분류가 실패해도 "수집 오류"·묶음 재시도가 생기지 않고, 실행의 수집 건수에 분류 수가 섞이지 않는다.
// 갈래가 비어 있고 관리자가 정하지 않은(category_set_by 없음) 진짜 기술만 채운다. 서비스 키는 RLS를 건너뛰므로 고칠 때 조건을 다시 건다(P-18c 규칙).
// 규칙으로 못 정한 기술은 그대로 비워 두고 관리자 분류 확인(IA-17)에 남는다. 상대 경로 import: node --test가 `@/` 별칭을 못 읽는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { classify, type ClassifyCategory } from "../map/classify.ts";
import { logFailure } from "./log-failure.ts";
import { recordStep } from "./run-log.ts";

const PAGE = 500, CHUNK = 100;
type Row = { id: string; display_name: string; one_liner: string | null };

export const CLASSIFY_STEP = "classify_category";
export const CLASSIFY_BUDGET_MS = 45_000; // 정기 실행 한도 300초 중 수집 묶음(240초) 뒤 남는 시간 안
export const CLASSIFY_NOW_BUDGET_MS = 40_000; // 관리자 "규칙으로 한 번에 분류"(P-12f ⑧): 화면 한도(maxDuration 60초) 안

/** 수집 묶음 뒤 같은 실행(runId)에 분류 단계를 하나 남긴다. 실패도 이 단계의 실패로 실행 기록(run_steps)에 남고, 이미 끝난 수집 결과를 되돌리지 않는다 */
export async function classifyAfterBatch(db: SupabaseClient, runId: string, now: () => number = Date.now): Promise<void> {
  const t0 = now();
  try {
    const out = await classifyCatalog(db, t0 + CLASSIFY_BUDGET_MS, now);
    await recordStep(db, runId, { stepName: CLASSIFY_STEP, status: "succeeded", countOut: out.items, outputSummary: out.summary, durationMs: now() - t0 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await recordStep(db, runId, { stepName: CLASSIFY_STEP, status: "failed", errorMessage: message, durationMs: now() - t0 }).catch(logFailure("갈래 분류 실패를 기록하지 못함"));
  }
}

async function readSmalls(db: SupabaseClient): Promise<ClassifyCategory[]> {
  const { data, error } = await db.from("categories").select("id, parent_id, keywords");
  if (error) throw new Error(`갈래 목록을 읽지 못함: ${error.message}`);
  return ((data ?? []) as { id: string; parent_id: string | null; keywords: string[] | null }[])
    .filter((c) => c.parent_id && c.keywords?.length).map((c) => ({ id: c.id, parentId: c.parent_id!, keywords: c.keywords }));
}

// 갈래가 빈 기술을 쪽으로 나눠 모두 읽는다(PostgREST는 한 번에 1000줄까지라 안 나누면 뒤쪽이 조용히 잘린다)
async function readUnsorted(db: SupabaseClient): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("technologies").select("id, display_name, one_liner")
      .is("category_id", null).is("category_set_by", null).eq("is_simulated", false).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`갈래가 빈 기술을 읽지 못함: ${error.message}`);
    rows.push(...((data ?? []) as Row[]));
    if ((data?.length ?? 0) < PAGE) return rows;
  }
}

export async function classifyCatalog(db: SupabaseClient, deadlineMs: number, now: () => number = Date.now): Promise<{ items: number; summary: string }> {
  const smalls = await readSmalls(db);
  if (!smalls.length) return { items: 0, summary: "classify_category 갈래 목록이 없어 건너뜀(갈래 시드 마이그레이션 전)" };
  const rows = await readUnsorted(db);
  const byCategory = new Map<string, string[]>();
  for (const r of rows) {
    const { categoryId } = classify(r.display_name, r.one_liner, smalls);
    if (categoryId) byCategory.set(categoryId, [...(byCategory.get(categoryId) ?? []), r.id]);
  }
  let items = 0, cut = false;
  for (const [categoryId, ids] of [...byCategory].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      if (now() >= deadlineMs) { cut = true; break; }
      const chunk = ids.slice(i, i + CHUNK);
      const { data, error } = await db.from("technologies").update({ category_id: categoryId })
        .in("id", chunk).is("category_id", null).is("category_set_by", null).select("id"); // 읽은 뒤 관리자가 정했으면 덮지 않는다
      if (error) throw new Error(`갈래를 저장하지 못함(${items}개 저장 뒤): ${error.message}`);
      items += data?.length ?? 0; // 실제로 바뀐 줄만 센다
    }
    if (cut) break;
  }
  return { items, summary: `classify_category 갈래 ${items}개 정함, 규칙으로 못 정한 ${rows.length - [...byCategory.values()].flat().length}개는 관리자 확인으로${cut ? ", 시간이 다 돼 나머지는 다음 실행에서" : ""}` };
}
