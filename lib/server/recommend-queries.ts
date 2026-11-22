// 추천 목록 읽기(PRD-F32, IA-20). 주인: 황재웅(B). 로그인한 사용자의 클라이언트로 부른다(취향은 RLS가 본인 줄만 열어 줌).
// 읽기에 실패하면 던진다: 화면이 "추천 없음"과 "읽지 못함"을 다르게 보여 줘야 한다(불변 2).
import type { SupabaseClient } from "@supabase/supabase-js";
import { pickRecommendations, type Recommendation } from "../domain/recommend.ts";
import type { Taste } from "../domain/taste.ts";
import { rowsOrThrow } from "./alert-db.ts";
import { readTaste } from "./taste-store.ts";
import { listedTechs } from "./map-queries.ts";

/** 고른 갈래 안에서 읽어 올 기술의 최대 수. shortcut: 고정 개수, 갈래 안 기술이 이보다 많아지면 다운로드 순으로 DB에서 나눠 읽는다 */
export const CANDIDATE_LIMIT = 500;
const COLUMNS = "id, tech_key, display_name, one_liner, category_id, grade, status, signals";

export type RecommendView = { taste: Taste | null; items: Recommendation[] };

export async function readRecommendations(db: SupabaseClient, userId: string, isDemo: boolean): Promise<RecommendView> {
  const taste = await readTaste(db, userId);
  if (!taste || taste.interests.length === 0) return { taste, items: [] };
  const categories = rowsOrThrow(await db.from("categories").select("id, name, parent_id"), "갈래를 읽지 못함").map((r) => ({
    id: r.id as string, name: r.name as string, parentId: (r.parent_id ?? null) as string | null,
  }));
  const bigIds = new Set(categories.filter((c) => !c.parentId && taste.interests.includes(c.name)).map((c) => c.id));
  const inScope = categories.filter((c) => bigIds.has(c.id) || (c.parentId !== null && bigIds.has(c.parentId))).map((c) => c.id);
  if (inScope.length === 0) return { taste, items: [] };

  // 공개 목록 기술만(남의 비공개 저장소에서 생긴 줄 이름이 추천으로 새지 않게, ADR 0029 4항). 시뮬레이터 기술은 시연 계정에만(SPEC-3.5)
  const q = listedTechs(db, COLUMNS, isDemo).in("category_id", inScope);
  const [techRes, mineRes] = await Promise.all([
    q.order("id").limit(CANDIDATE_LIMIT),
    db.from("my_technologies").select("tech_id").eq("owner_id", userId).not("tech_id", "is", null),
  ]);
  const techs = rowsOrThrow(techRes, "기술을 읽지 못함").map((r) => ({
    id: r.id as string, techKey: r.tech_key as string, name: r.display_name as string, oneLiner: (r.one_liner ?? null) as string | null,
    categoryId: (r.category_id ?? null) as string | null, grade: r.grade as string, status: r.status as string,
    signals: (r.signals ?? null) as Record<string, unknown> | null,
  }));
  const ownedIds = rowsOrThrow(mineRes, "내 기술을 읽지 못함").map((r) => r.tech_id as string);
  return { taste, items: pickRecommendations({ interests: taste.interests, categories, techs, ownedIds }) };
}
