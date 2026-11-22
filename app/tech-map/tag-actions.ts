"use server";

// 내 태그 서버 액션(P-12d-my-tech-tags). 저장·읽기는 사용자 토큰으로(본인 줄만, 불변 5). 미리보기(개발용)는 저장하지 않는다(불변 1·4).
import { revalidatePath } from "next/cache";
import { PREVIEW_NO_SAVE } from "@/lib/dev/login-preview";
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import { addTag, readTagPanel, removeTag, type MyTag, type TagResult } from "@/lib/server/my-tech-tags";
import { getServerSupabase } from "@/lib/supabase/server";

export type TechTagsResult = { ok: true; tags: string[]; mine: MyTag[] } | { ok: false; message: string };

const NOT_SIGNED_IN = "로그인하면 태그를 붙일 수 있어요.";
const NOT_CONNECTED = "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.";

/** 붙이기·떼기 공통: 로그인 → 연결 → 저장. 바뀌었으면 지도·보기 화면을 새로 그린다. 미리보기 막기는 부르는 액션이 먼저 한다 */
async function changeTag(save: typeof addTag, techId: string, tag: string): Promise<TagResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: NOT_SIGNED_IN };
  const db = await getServerSupabase();
  if (!db) return { ok: false, message: NOT_CONNECTED };
  const result = await save(db, user.id, { techId, tag });
  if (result.ok && result.changed) { revalidatePath("/"); revalidatePath("/blueprint"); }
  return result;
}

export async function addTagAction(techId: string, tag: string): Promise<TagResult> {
  if (await isLoginPreview()) return { ok: false, message: PREVIEW_NO_SAVE };
  return changeTag(addTag, techId, tag);
}

export async function removeTagAction(techId: string, tag: string): Promise<TagResult> {
  if (await isLoginPreview()) return { ok: false, message: PREVIEW_NO_SAVE };
  return changeTag(removeTag, techId, tag);
}

/** 이 기술의 내 태그와 내 태그 종류(붙이기 칸의 자동 완성). 미리보기는 빈 목록. 못 읽으면 실패(빈 목록으로 보이지 않게, 불변 2) */
export async function techTagsAction(techId: string): Promise<TechTagsResult> {
  if (await isLoginPreview()) return { ok: true, tags: [], mine: [] };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: NOT_SIGNED_IN };
  const db = await getServerSupabase();
  if (!db) return { ok: false, message: "태그를 불러오지 못했어요." };
  try {
    return { ok: true, ...(await readTagPanel(db, user.id, techId)) };
  } catch (e) {
    console.error("내 태그 읽기 실패", e instanceof Error ? e.message : e);
    return { ok: false, message: "태그를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  }
}
