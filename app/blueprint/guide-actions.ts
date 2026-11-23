"use server";
// 청사진 가이드 캐릭터의 서버 액션(P-12s). 로그인만, 하루 BLUEPRINT_GUIDE_PER_USER_PER_DAY번, 호출은 ai_calls에 남긴다. 대화는 서버에 저장하지 않는다.
// 넘기는 기술 목록은 여기서 만든다(관문 안 내 기술 먼저 + 지도 공개 목록, 위험 등급 빼고 GUIDE_TECHS개까지): 브라우저가 보낸 목록은 믿지 않는다.
import { BLUEPRINT_GUIDE_PER_USER_PER_DAY } from "@/lib/ai/decide-ai-call";
import { GUIDE_TECHS, type GuideTech } from "@/lib/ai/build-guide-prompt";
import type { GuideReply } from "@/lib/ai/parse-guide-response";
import { catalogToPool } from "@/lib/blueprint/catalog-pool";
import { PREVIEW_NO_SAVE } from "@/lib/dev/login-preview";
import { createAnthropicClient } from "@/lib/server/anthropic-client";
import { talkToGuide } from "@/lib/server/blueprint-guide";
import { readAllowedTechIds, readBlueprintPage, type PoolTech } from "@/lib/server/blueprints";
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import { readGuestMap } from "@/lib/server/guest-map";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { getServerSupabase } from "@/lib/supabase/server";

export type GuideTurnResult = { ok: true; reply: GuideReply; techs: Record<string, { name: string; grade: string }> } | { ok: false; message: string };

const BUSY = "지금은 가이드가 대답하지 못해요. 잠시 뒤 다시 말해 주세요. 판은 그대로예요.";
const toGuide = (t: PoolTech): GuideTech => ({ id: t.id, name: t.name, type: t.type, field: t.field, sub: t.sub, grade: t.grade });

async function guideTechs(userId: string): Promise<GuideTech[]> {
  const db = await getServerSupabase();
  if (!db) throw new Error("DB 연결 없음");
  const [page, allowed, map] = await Promise.all([readBlueprintPage(db, userId), readAllowedTechIds(db), readGuestMap()]);
  const mine = page.pool.filter((t) => allowed.has(t.id));
  const all = [...mine, ...catalogToPool(map.techs, map.categories, mine.map((t) => t.id))].filter((t) => t.grade !== "danger");
  // shortcut: 지도 목록은 앞에서부터 잘라 넘긴다(관련도 순 아님), 기술이 안 맞는다는 말이 많으면 대화 낱말로 고르기
  return all.slice(0, GUIDE_TECHS).map(toGuide);
}

/** 가이드에게 한 번 말하기. turns = 이 브라우저의 대화(최근 것만 씀), stages = 지금 판 단계 이름 */
export async function guideTurnAction(turns: unknown, stages: unknown): Promise<GuideTurnResult> {
  if (await isLoginPreview()) return { ok: false, message: PREVIEW_NO_SAVE };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인하면 가이드와 같이 설계할 수 있어요." };
  const serviceDb = getServiceSupabase();
  if (!serviceDb) return { ok: false, message: BUSY };
  const r = await talkToGuide({ serviceDb, ai: createAnthropicClient() }, { userId: user.id, turns, stages, loadTechs: () => guideTechs(user.id) });
  if (r.status === "failed" && r.techs === "unread") return { ok: false, message: "기술 목록을 불러오지 못해 가이드가 대답하지 않았어요(기술이 없다는 뜻이 아니에요). 잠시 뒤 다시 말해 주세요." };
  if (r.status === "ok") return { ok: true, reply: r.reply, techs: Object.fromEntries(r.techs.filter((t) => r.reply.techs.some((p) => p.id === t.id)).map((t) => [t.id, { name: t.name, grade: t.grade }])) };
  if (r.status === "refused" && r.reason === "user_limit") return { ok: false, message: `오늘은 가이드와 ${BLUEPRINT_GUIDE_PER_USER_PER_DAY}번 모두 이야기했어요. 내일 0시(한국 시간)부터 다시 돼요.` };
  if (r.status === "refused" && r.reason === "bad_input") return { ok: false, message: "대화를 읽지 못했어요. 대화를 새로 시작해 주세요." };
  return { ok: false, message: BUSY };
}
