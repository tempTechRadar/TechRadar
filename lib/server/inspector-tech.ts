// 청사진 Inspector(P-12j H3)가 기술 하나를 고르면 읽는 것. 개요 · 관계 · 검증 · 이력 탭이 쓴다(화면은 app/blueprint, DevAssi2).
// 기술 상세와 같은 읽기(getCatalogTechDetail: 등급 · 보안 이유 · 수집 오류 · 마지막 확인 · 출처 · 지도 비교군 tech_relations · 내 판단 이력 tech_mark_events)에
// 청사진 관문 상태(DB 관문과 같은 목록 my_blueprint_tech_ids)를 더한다. 근거가 없는 칸은 null(화면 "정보 없음"), 읽지 못하면 던진다(화면 "읽지 못함", 불변 2 · 정직성 규칙 4).
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCatalogTechDetail, type CatalogTechDetail } from "./catalog-tech.ts";
import { readAllowedTechIds } from "./blueprints.ts";

/** gate: "in" = 청사진에 넣을 수 있음(내 기술 · 적용 후보 · 내 이력), "out" = 담지 않은 기술(관문 밖), null = 손님(관문은 이 브라우저 담은 목록이라 화면이 안다) */
export type InspectorTech = CatalogTechDetail & { gate: "in" | "out" | null };

/** 없거나 볼 수 없으면 null. user = null(손님)이면 db는 서버 키, 내 줄 · 내 판단 · 관문은 읽지 않는다(불변 5) */
export async function readInspectorTech(db: SupabaseClient, user: { id: string; isDemo: boolean } | null, techId: string): Promise<InspectorTech | null> {
  const [d, allowed] = await Promise.all([getCatalogTechDetail(db, user, techId), user ? readAllowedTechIds(db) : null]);
  return d && { ...d, gate: allowed ? (allowed.has(techId) ? "in" : "out") : null };
}
