"use server";

import { revalidatePath, unstable_cache } from "next/cache";
import { recordActionOutcome } from "@/lib/server/action-record";
import { PREVIEW_NO_SAVE } from "@/lib/dev/login-preview";
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import { saveMark, type MarkResult, type MarkStatus } from "@/lib/server/marks";
import { findPoolTechs, type PoolTech } from "@/lib/server/blueprints";
import { readTopUsageNotes, type NoteSummary } from "@/lib/server/usage-notes";
import { searchTerm } from "@/lib/domain/my-tech-view";
import { maskSecrets } from "@/lib/domain/redact";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * 지도 사이드바에서 바로 남기는 판단(관심 · 적용 후보 · 보류, ADR 0028). status null = 표시 지우기(되돌리기도 이것으로).
 * 저장은 사용자 토큰으로 DB 함수 하나(불변 1·4·5). 함께 판단된 알림이 있으면 흐름 화면의 "조치와 기록" 단계를 남긴다(alerts/[id]/actions.ts와 같은 방식).
 */
export async function markTech(techId: string, status: MarkStatus | null, reason: string): Promise<MarkResult> {
  if (await isLoginPreview()) return { ok: false, message: PREVIEW_NO_SAVE }; // 미리보기(개발용)는 저장하지 않는다(불변 1·4)
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인하면 판단을 남길 수 있어요." };
  const db = await getServerSupabase();
  if (!db) return { ok: false, message: "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  const result = await saveMark(db, { techId, status, reason });
  if (result.ok) { revalidatePath("/"); revalidatePath("/blueprint"); }
  if (result.ok && result.judgedAlerts.length) {
    const serviceDb = getServiceSupabase();
    if (serviceDb) for (const alertId of result.judgedAlerts) await recordActionOutcome(serviceDb, alertId, { ok: true });
    revalidatePath("/alerts");
  }
  return result;
}

/** 사이드 패널 사용기 요약(도움 많은 순 3개 + 전체 수). 로그인한 사람만(사용기는 로그인해야 읽힘, RLS). null = 읽지 못함(불변 2) */
export async function usageSummaryAction(techId: string): Promise<NoteSummary | null> {
  if (!/^[0-9a-f-]{36}$/i.test(String(techId))) return null;
  if (await isLoginPreview()) return { total: 0, top: [] }; // 미리보기(개발용)는 DB를 부르지 않는다
  if (!(await getCurrentUser())) return null;
  const db = await getServerSupabase();
  try {
    return db ? await readTopUsageNotes(db, techId) : null;
  } catch (e) {
    console.error("사용기 요약 조회 실패", maskSecrets(e instanceof Error ? e.message : String(e)));
    return null;
  }
}

/** 로그인 전 찾기는 같은 글자면 10분 동안 한 번만 DB에(서버 액션은 누구나 부를 수 있는 주소라, 화면의 0.4초 쉬기만 믿지 않는다).
 *  실패는 기억하지 않는다(던지면 캐시 안 됨). 공개 목록 · 공개 칸만(ADR 0029) */
const guestSearch = unstable_cache(async (term: string) => {
  const db = getServiceSupabase();
  const r = db ? await findPoolTechs(db, term) : null;
  if (r === null) throw new Error("로그인 전 카탈로그 찾기 실패");
  return r;
}, ["guest-catalog-search"], { revalidate: 600 });

/** 지도 찾기에서 지도에 안 올린 기술 찾기(11-21 사용자: 찾기는 지도 찾기 칸 하나로). null = 찾지 못함(조회 실패, 불변 2). 빈 배열 = 찾았지만 없음 */
export async function searchCatalogAction(query: string): Promise<PoolTech[] | null> {
  const term = searchTerm(String(query ?? ""));
  if (!term) return null; // 화면이 같은 규칙으로 먼저 거른다(여기 오면 잘못 부른 것)
  try {
    const user = await getCurrentUser();
    if (!user) return await guestSearch(term.toLowerCase());
    const db = await getServerSupabase();
    return db ? await findPoolTechs(db, term) : null;
  } catch (e) {
    console.error("지도 카탈로그 찾기 실패", maskSecrets(e instanceof Error ? e.message : String(e)));
    return null;
  }
}

