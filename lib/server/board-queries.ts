// 프로젝트 관리 보드 읽기(P-12i D2 · P-12k K1): 청사진 판 · 지도 · 소식 판 · 숫자 띠 · 레포 서랍. 사용자 토큰으로 본인 줄만(user_id 조건 + RLS, 불변 5).
// 못 읽으면 던진다: 위젯이 "없음"과 "읽지 못함"을 다르게 보인다(불변 2). 상대 경로 import: node --test가 `@/` 별칭을 못 읽는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSecrets } from "../domain/redact.ts";
import type { Trending } from "../domain/trending.ts";
import { readCandidateIds } from "./blueprints.ts";
import { NOT_BULK_FILTER } from "../domain/registry.ts";
import { chunks, listedTechs } from "./map-queries.ts";
import { readTrending } from "./trending.ts";

type Res<T> = { data: T | null; error: { message: string } | null; count?: number | null };
function ok<T>(r: Res<T>, what: string): T {
  if (r.error || r.data === null) throw new Error(`${what}: ${maskSecrets(r.error?.message ?? "빈 응답")}`);
  return r.data;
}

export type ConfirmedBp = { id: string; name: string; projectId: string | null; createdAt: string };
/** 청사진 판: 담은 기술(청사진 서랍과 같은 셈) → 확정한 청사진(최근 200, 레포별로 묶는 것은 화면) → 내보내기 수 */
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

/** 레포 서랍 "판단 상태": 지도 표시(관심 · 담음 · 보류) */
export async function readMarkMap(db: SupabaseClient, userId: string): Promise<Map<string, string>> {
  const rows = ok(await db.from("tech_marks").select("tech_id, status").eq("user_id", userId) as Res<{ tech_id: string; status: string }[]>, "판단 표시를 읽지 못함");
  return new Map(rows.map((r) => [r.tech_id, r.status]));
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

/** 숫자 띠 "오늘의 새 기술": 지도 NEW와 같은 규칙(공개 목록 listedTechs + 일괄 채움 제외 NOT_BULK_FILTER, map-queries)으로 since 뒤에 생긴 수만 센다. 서비스 연결(기술 표는 손님 연결로 못 읽음, ADR 0029) */
export async function countNewTechs(serviceDb: SupabaseClient, sinceIso: string): Promise<number> {
  const r = await listedTechs(serviceDb, "id", false, true).gt("created_at", sinceIso).or(NOT_BULK_FILTER);
  if (r.error || typeof r.count !== "number") throw new Error(`새 기술 수를 읽지 못함: ${maskSecrets(r.error?.message ?? "빈 응답")}`);
  return r.count;
}
