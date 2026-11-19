// 비교 모드(PRD-F42)가 쓰는 기술 읽기. 주인: 황재웅(B). 로그인한 사용자의 클라이언트로 부른다(카탈로그는 모두 읽는 공용 표).
// 읽기에 실패하면 던진다: 화면이 "기술 없음"과 "불러오지 못함"을 다르게 보여 줘야 한다(design.md).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComparableTech } from "../alerts/build-comparison.ts";
import { rowsOrThrow } from "./alert-db.ts";
import { COMPARABLE_FIELDS, toComparable } from "./comparable.ts";

// 정한 것(문서에 없어서): 고르기 목록은 카탈로그 전체를 이름순으로 100개까지(내 기술 우선 정렬은 안 함)
const CATALOG_LIMIT = 100;

export type CatalogTech = { id: string; name: string };

export async function listCatalogTechs(db: SupabaseClient): Promise<CatalogTech[]> {
  const rows = rowsOrThrow(await db.from("technologies").select("id, display_name").order("display_name").limit(CATALOG_LIMIT), "기술 목록을 읽지 못함");
  return rows.map((row) => ({ id: row.id, name: row.display_name }));
}

/** 고른 순서대로. 찾지 못한 id는 빠진다(화면이 몇 개를 못 찾았는지 알린다). */
export async function readTechsForCompare(db: SupabaseClient, ids: string[]): Promise<{ id: string; name: string; tech: ComparableTech }[]> {
  const rows = rowsOrThrow(await db.from("technologies").select(`id, display_name, ${COMPARABLE_FIELDS}`).in("id", ids), "비교할 기술을 읽지 못함");
  const byId = new Map(rows.map((row) => [row.id as string, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [{ id, name: row.display_name as string, tech: toComparable(row) }] : [];
  });
}
