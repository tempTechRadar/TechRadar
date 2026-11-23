"use server";
// 지도 찾기 도우미의 서버 액션(P-12w). 로그인만, 하루 MAP_FIND_PER_USER_PER_DAY번, 호출은 ai_calls(map_find)에 남긴다. 대화는 서버에 저장하지 않는다.
// 넘기는 목록은 여기서 만든다(지도 공개 목록 = 손님 지도와 같은 캐시): 브라우저가 보낸 id는 믿지 않고 파서가 이 목록으로 다시 거른다.
import { MAP_FIND_PER_USER_PER_DAY } from "@/lib/ai/decide-ai-call";
import { buildFindPrompt, parseFindResponse, readFindTurns, type FindReply, type FindTech } from "@/lib/ai/find-on-map";
import { PREVIEW_NO_SAVE } from "@/lib/dev/login-preview";
import { categoryNames, UNSORTED } from "@/lib/map/build-map";
import { askWithSlot } from "@/lib/server/ai-slot";
import { createAnthropicClient } from "@/lib/server/anthropic-client";
import { getCurrentUser, isLoginPreview } from "@/lib/server/current-user";
import { readGuestMap } from "@/lib/server/guest-map";
import { getServiceSupabase } from "@/lib/server/service-supabase";

export type FindResult = { ok: true; reply: FindReply; techs: Record<string, { name: string; grade: string }> } | { ok: false; message: string };

const BUSY = "지금은 찾기 도우미가 대답하지 못해요. 잠시 뒤 다시 물어봐 주세요. 위 찾기 막대는 그대로 쓸 수 있어요.";
const FIND_CALL = { maxTokens: 1500, timeoutMs: 60_000 };

async function mapTechs(): Promise<FindTech[]> {
  const map = await readGuestMap();
  const cats = new Map(map.categories.map((c) => [c.id, c]));
  return map.techs.map((t) => {
    const { field, sub } = categoryNames(t.categoryId, cats);
    return { id: t.id, name: t.name, type: t.type, grade: t.grade, field: field === UNSORTED ? null : field, sub: sub === UNSORTED ? null : sub, about: t.oneLinerKo ?? t.oneLiner };
  });
}

/** 찾기 도우미에게 한 번 묻기. turns = 이 브라우저의 대화(최근 것만 씀) */
export async function findOnMapAction(turns: unknown): Promise<FindResult> {
  if (await isLoginPreview()) return { ok: false, message: PREVIEW_NO_SAVE };
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인하면 설명으로 찾아 줘요." };
  const talk = readFindTurns(turns);
  if (!talk) return { ok: false, message: "대화를 읽지 못했어요. 대화를 새로 시작해 주세요." };
  const serviceDb = getServiceSupabase();
  if (!serviceDb) return { ok: false, message: BUSY };
  let techs: FindTech[] = [];
  const r = await askWithSlot(
    { serviceDb, ai: createAnthropicClient() },
    {
      purpose: "map_find", userId: user.id, limit: MAP_FIND_PER_USER_PER_DAY,
      build: async () => { techs = await mapTechs(); return { ...buildFindPrompt(talk, techs), ...FIND_CALL }; },
      parse: (text) => { const p = parseFindResponse(text, new Set(techs.map((t) => t.id))); if (!p.ok) return p; const { ok: _ok, ...reply } = p; return { ok: true, value: reply }; },
    },
  );
  if (r.status === "ok") {
    const byId = new Map(techs.map((t) => [t.id, t]));
    return { ok: true, reply: r.value, techs: Object.fromEntries(r.value.picks.map((p) => [p.id, { name: byId.get(p.id)!.name, grade: byId.get(p.id)!.grade }])) };
  }
  if (r.status === "failed" && r.unread) return { ok: false, message: "지도 목록을 불러오지 못해 찾지 않았어요(기술이 없다는 뜻이 아니에요). 잠시 뒤 다시 물어봐 주세요." };
  if (r.status === "refused" && r.reason === "user_limit") return { ok: false, message: `오늘은 찾기 도우미에게 ${MAP_FIND_PER_USER_PER_DAY}번 모두 물었어요. 내일 0시(한국 시간)부터 다시 돼요.` };
  return { ok: false, message: BUSY };
}
