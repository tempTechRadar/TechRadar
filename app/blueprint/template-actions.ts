"use server";
// 하단 패널 템플릿 탭의 읽기(P-12e 조각 K): 내 템플릿 + 공개 템플릿. 쓰기(저장 · 공개)는 actions.ts. 사용자 토큰으로 부른다(본인 것 · 공개 함수만, 불변 5).
// 셋(내 것 · 공개 틀 · 공개 조합)은 따로 실패한다: 못 읽은 쪽만 null(빈 목록과 다르게, 불변 2)
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import type { TemplateKind } from "@/lib/blueprint/graph";
import { readMyTemplates, readPublicTemplates, type MyTemplate, type PublicTemplate } from "@/lib/server/blueprint-templates";
import { getServerSupabase } from "@/lib/supabase/server";

/** open은 종류마다 따로 읽는다: DB 함수가 60개로 자르므로 한데 읽고 거르면 한 종류가 "없음"으로 보일 수 있다 */
export type TemplateLists = { mine: MyTemplate[] | null; open: Record<TemplateKind, PublicTemplate[] | null> };

const orNull = <T,>(p: Promise<T>, what: string) => p.catch((e: unknown) => { console.error(what, e instanceof Error ? e.message : e); return null; });

export async function templatesAction(): Promise<TemplateLists | { message: string }> {
  if (await isLoginPreview()) return { message: "미리보기(개발용)에서는 템플릿을 읽지 않아요." }; // 가짜 계정 id로 DB를 부르지 않게
  const user = await getCurrentUser();
  if (!user) return { message: "로그인하면 템플릿을 쓸 수 있어요." };
  const db = await getServerSupabase();
  if (!db) return { message: "템플릿을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  const [mine, frame, combo] = await Promise.all([
    orNull(readMyTemplates(db, user.id), "내 템플릿 조회 실패"),
    orNull(readPublicTemplates(db, "frame"), "공개 틀 조회 실패"), orNull(readPublicTemplates(db, "combo"), "공개 조합 조회 실패"),
  ]);
  return { mine, open: { frame, combo } };
}
