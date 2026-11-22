// 프로젝트 관리 보드 W5 · W6 · W8 · W9 · 레포 서랍 읽기(P-12i D2). 사용자 토큰으로 본인 줄만(user_id 조건 + RLS, 불변 5).
// 못 읽으면 던진다: 위젯이 "없음"과 "읽지 못함"을 다르게 보인다(불변 2). 상대 경로 import: node --test가 `@/` 별칭을 못 읽는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSecrets } from "../domain/redact.ts";
import type { Trending } from "../domain/trending.ts";
import { readCandidateIds } from "./blueprints.ts";
import { chunks } from "./map-queries.ts";
import { readTrending } from "./trending.ts";

type Res<T> = { data: T | null; error: { message: string } | null; count?: number | null };
function ok<T>(r: Res<T>, what: string): T {
  if (r.error || r.data === null) throw new Error(`${what}: ${maskSecrets(r.error?.message ?? "빈 응답")}`);
  return r.data;
}

export type ConfirmedBp = { id: string; name: string; projectId: string | null; createdAt: string };
/** W5 옮기기 진행: 담은 기술(청사진 서랍과 같은 셈) → 확정한 청사진(최근 200, 레포별로 묶는 것은 화면) → 내보내기 수 */
export type MoveProgress = { candidates: number; blueprints: ConfirmedBp[]; exports: number };
export async function readMoveProgress(db: SupabaseClient, userId: string): Promise<MoveProgress> {
  const [cand, bp, ex] = await Promise.all([
    readCandidateIds(db, userId),
    db.from("blueprints").select("id, name, project_id, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
    db.from("exports").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  if (ex.error || ex.count === null || ex.count === undefined) throw new Error(`내보내기 수를 읽지 못함: ${maskSecrets(ex.error?.message ?? "빈 응답")}`);
  const rows = ok(bp as Res<{ id: string; name: string; project_id: string | null; created_at: string }[]>, "확정한 청사진을 읽지 못함");
  return { candidates: cand.size, blueprints: rows.map((r) => ({ id: r.id, name: r.name, projectId: r.project_id, createdAt: r.created_at })), exports: ex.count };
}

/** W6: 등급 · 이유를 본 기술(grade_views) */
export async function readViewedTechIds(db: SupabaseClient, userId: string): Promise<Set<string>> {
  const rows = ok(await db.from("grade_views").select("tech_id").eq("user_id", userId) as Res<{ tech_id: string }[]>, "등급을 본 기록을 읽지 못함");
  return new Set(rows.map((r) => r.tech_id));
}

/** 레포 서랍 "판단 상태": 지도 표시(관심 · 담음 · 보류) */
export async function readMarkMap(db: SupabaseClient, userId: string): Promise<Map<string, string>> {
  const rows = ok(await db.from("tech_marks").select("tech_id, status").eq("user_id", userId) as Res<{ tech_id: string; status: string }[]>, "판단 표시를 읽지 못함");
  return new Map(rows.map((r) => [r.tech_id, r.status]));
}

/** W9: 최근 담기 · 관심 · 보류 기록 */
export type MarkEventRow = { id: string; createdAt: string; status: string | null; name: string };
export async function readRecentMarks(db: SupabaseClient, userId: string, limit = 5): Promise<MarkEventRow[]> {
  const rows = ok(await db.from("tech_mark_events").select("id, created_at, new_status, technologies(display_name)").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit) as
    Res<{ id: string; created_at: string; new_status: string | null; technologies: { display_name: string } | null }[]>, "판단 기록을 읽지 못함");
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at, status: r.new_status, name: r.technologies?.display_name ?? "(이름 없음)" }));
}

/** W8 요즘 뜨는 대안: 뜨는 기술(서비스 연결, 공개 목록 규칙은 readTrending) 중 내 기술과 같은 갈래, 내가 이미 쓰는 것은 뺌.
 *  같은 갈래가 없으면 전체에서(same=false로 화면이 그렇다고 말함) */
export async function readTrendingForMe(serviceDb: SupabaseClient, db: SupabaseClient, myTechIds: string[], now = Date.now()): Promise<{ items: Trending[]; same: boolean }> {
  const trending = (await readTrending(serviceDb, now, 30)).filter((t) => !myTechIds.includes(t.id));
  const ids = [...new Set([...trending.map((t) => t.id), ...myTechIds])];
  const parts = await Promise.all(chunks(ids).map(async (c) => ok(await db.from("technologies").select("id, category_id").in("id", c) as Res<{ id: string; category_id: string | null }[]>, "갈래를 읽지 못함")));
  const cat = new Map(parts.flat().map((r) => [r.id, r.category_id]));
  const mine = new Set(myTechIds.map((id) => cat.get(id)).filter(Boolean));
  const same = trending.filter((t) => mine.has(cat.get(t.id) ?? null));
  return same.length ? { items: same.slice(0, 6), same: true } : { items: trending.slice(0, 6), same: false };
}
