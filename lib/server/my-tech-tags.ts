// 내 태그 읽기·붙이기·떼기(P-12d-my-tech-tags). 주인: 김영식 A. 로그인한 사용자의 클라이언트로만 부른다:
// my_tech_tags의 RLS가 본인 줄만 열어 준다(관리자도 못 봄, 불변 5). 공개하지 않는다(ADR 0009).
// 같은 태그를 다시 붙여도 한 줄(유일 색인, 불변 3). 저장하지 못했으면 실패로 알린다(불변 4).
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_TAG_KINDS, MAX_TAG_ROWS, MAX_TAGS_PER_TECH, normalizeTag, tagKey } from "../domain/my-tech-tag.ts";
import { isUuid } from "../domain/my-tech-view.ts";
import { maskSecrets } from "../domain/redact.ts";

/** changed = 이번에 붙였다/뗐다. false면 이미 붙어 있었거나 이미 없었다(다시 눌러도 한 줄) */
export type TagResult = { ok: true; tag: string; changed: boolean } | { ok: false; message: string };
export type TagRequest = { techId: string; tag: unknown };
export type MyTag = { tag: string; count: number };

type Row = { tech_id: string; tag: string };
const SAVE_FAILED = "저장하지 못했어요. 다시 시도해 주세요. 태그는 전 상태 그대로예요.";
const NO_TECH = "기술을 찾지 못했어요.";

/**
 * 내 태그 줄 전부(붙인 순). 한 사람 합은 DB 트리거가 MAX_TAG_ROWS로 막아 한 번에 읽는다(PostgREST 한 번 최대 1,000줄과 같다).
 * 못 읽으면 던진다(빈 목록과 다르게, 불변 2). 받은 줄이 실제 수(count)보다 적거나 한도를 넘으면 잘린 목록이라 던진다
 * (PostgREST의 한 번 최대 줄 수가 줄어도 최신 태그가 조용히 빠지지 않게)
 */
async function readRows(db: SupabaseClient, userId: string): Promise<Row[]> {
  const { data, error, count } = await db.from("my_tech_tags").select("tech_id, tag", { count: "exact" }).eq("user_id", userId).order("created_at").range(0, MAX_TAG_ROWS);
  if (error || !data) throw new Error(`내 태그를 읽지 못함: ${maskSecrets(error?.message ?? "빈 응답")}`);
  if (data.length > MAX_TAG_ROWS || (count !== null && data.length < count)) throw new Error(`내 태그를 읽지 못함: ${count ?? data.length}줄 중 ${data.length}줄만 받음(한도 ${MAX_TAG_ROWS}줄)`);
  return data as Row[];
}

/** 태그 붙이기 칸: 이 기술의 내 태그(이름순)와 내 태그 종류(자동 완성). 한 번 읽어 둘 다 낸다. 못 읽으면 던진다 */
export async function readTagPanel(db: SupabaseClient, userId: string, techId: string): Promise<{ tags: string[]; mine: MyTag[] }> {
  const rows = await readRows(db, userId);
  return { tags: rows.filter((r) => r.tech_id === techId).map((r) => r.tag).sort((a, b) => a.localeCompare(b)), mine: countTags(rows) };
}

/** 태그 종류와 붙인 기술 수(많은 순, 같으면 이름순). 같은 태그(대소문자 무시)는 처음 붙인 표기로 묶는다 */
function countTags(rows: Row[]): MyTag[] {
  const byKey = new Map<string, MyTag>();
  for (const r of rows) {
    const t = byKey.get(tagKey(r.tag)) ?? { tag: r.tag, count: 0 };
    t.count++;
    byKey.set(tagKey(r.tag), t);
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** 이 기술에 붙인 내 태그(이름순). 못 읽으면 던진다 */
export async function readTechTags(db: SupabaseClient, userId: string, techId: string): Promise<string[]> {
  if (!isUuid(techId)) return [];
  const { data, error } = await db.from("my_tech_tags").select("tag").eq("user_id", userId).eq("tech_id", techId);
  if (error || !data) throw new Error(`이 기술의 내 태그를 읽지 못함: ${maskSecrets(error?.message ?? "빈 응답")}`);
  return (data as { tag: string }[]).map((r) => r.tag).sort((a, b) => a.localeCompare(b));
}

/** 기술 id → 내 태그(이름순). 지도·보드가 한 번에 읽는다. 못 읽으면 던진다 */
export async function readMyTechTagMap(db: SupabaseClient, userId: string): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (const r of await readRows(db, userId)) map.set(r.tech_id, [...(map.get(r.tech_id) ?? []), r.tag]);
  for (const tags of map.values()) tags.sort((a, b) => a.localeCompare(b));
  return map;
}

/** 한도 검사. 같은 태그를 다른 기술에 이미 썼으면 그 표기를 따른다(대소문자가 섞여 종류가 갈라지지 않게) */
function placeTag(rows: Row[], techId: string, tag: string): { tag: string; exists: boolean } | { message: string } {
  const key = tagKey(tag);
  const onTech = rows.filter((r) => r.tech_id === techId);
  const same = onTech.find((r) => tagKey(r.tag) === key);
  if (same) return { tag: same.tag, exists: true };
  if (onTech.length >= MAX_TAGS_PER_TECH) return { message: `기술 하나에 태그는 ${MAX_TAGS_PER_TECH}개까지예요.` };
  if (rows.length >= MAX_TAG_ROWS) return { message: `태그는 모두 ${MAX_TAG_ROWS}번까지 붙일 수 있어요. 안 쓰는 태그를 떼어 주세요.` };
  const spelled = rows.find((r) => tagKey(r.tag) === key);
  if (spelled) return { tag: spelled.tag, exists: false };
  const kinds = new Set(rows.map((r) => tagKey(r.tag)));
  return kinds.size >= MAX_TAG_KINDS ? { message: `태그 종류는 ${MAX_TAG_KINDS}개까지예요. 있는 태그를 골라 주세요.` } : { tag, exists: false };
}

/** 태그 붙이기. user_id는 DB 기본값(auth.uid())이 정한다(사용자는 tech_id·tag만 넣을 수 있다, 칸 권한) */
export async function addTag(db: SupabaseClient, userId: string, request: TagRequest): Promise<TagResult> {
  if (!isUuid(request.techId)) return { ok: false, message: NO_TECH };
  const checked = normalizeTag(request.tag);
  if (!checked.ok) return checked;
  let rows: Row[];
  try {
    rows = await readRows(db, userId);
  } catch (e) {
    console.error("태그 붙이기 전 읽기 실패", maskSecrets(String(e instanceof Error ? e.message : e)));
    return { ok: false, message: SAVE_FAILED };
  }
  const placed = placeTag(rows, request.techId, checked.tag);
  if ("message" in placed) return { ok: false, message: placed.message };
  if (placed.exists) return { ok: true, tag: placed.tag, changed: false };
  const { data, error } = await db.from("my_tech_tags").insert({ tech_id: request.techId, tag: placed.tag }).select("id");
  // 동시에 같은 태그(대소문자만 달라도)를 붙임: 이미 한 줄(불변 3). 화면에 저장된 표기를 돌려준다
  if (error?.code === "23505") return { ok: true, tag: await storedSpelling(db, userId, request.techId, placed.tag), changed: false };
  if (error) return insertFailure(error);
  if (!data || data.length === 0) {
    console.error("태그 붙이기 실패: 바뀐 줄 없음");
    return { ok: false, message: SAVE_FAILED };
  }
  return { ok: true, tag: placed.tag, changed: true };
}

// DB 트리거의 한도 문구(마이그레이션 202611211400) → 쉬운 말. 서버가 먼저 보지만 동시 요청·직접 호출은 DB가 막는다
const LIMIT_TEXT: [string, string][] = [
  ["기술당", `기술 하나에 태그는 ${MAX_TAGS_PER_TECH}개까지예요.`],
  ["종류", `태그 종류는 ${MAX_TAG_KINDS}개까지예요. 있는 태그를 골라 주세요.`],
  ["합", `태그는 모두 ${MAX_TAG_ROWS}번까지 붙일 수 있어요. 안 쓰는 태그를 떼어 주세요.`],
];

/** 이 기술에 저장된 같은 태그의 표기. 못 읽거나 못 찾으면(대소문자 규칙이 JS와 DB에서 다른 글자) 요청한 표기 */
async function storedSpelling(db: SupabaseClient, userId: string, techId: string, tag: string): Promise<string> {
  const current = await readTechTags(db, userId, techId).catch(() => []);
  return current.find((t) => tagKey(t) === tagKey(tag)) ?? tag;
}

/** 넣기 오류 → 결과. 기술 외래 키 = 없는 기술, 한도 = 그 문구, 그 밖은 실패(불변 4) */
function insertFailure(error: { code?: string; message: string }): TagResult {
  if (error.code === "23503" && error.message.includes("tech_id")) return { ok: false, message: NO_TECH };
  const limit = error.message.startsWith("태그 한도:") ? LIMIT_TEXT.find(([word]) => error.message.includes(word)) : undefined;
  if (limit) return { ok: false, message: limit[1] };
  console.error("태그 붙이기 실패", maskSecrets(error.message));
  return { ok: false, message: SAVE_FAILED };
}

/**
 * 태그 떼기. 받은 글자를 정리하지 않고 대소문자 무시로 먼저 찾고, 없으면 정리한 표기로 찾는다:
 * 직접 호출로 들어온 겹빈칸·특수 빈칸 태그도 화면이 보여 준 글자 그대로 뗄 수 있게. 없으면 이미 뗀 것(changed: false)
 */
export async function removeTag(db: SupabaseClient, userId: string, request: TagRequest): Promise<TagResult> {
  if (!isUuid(request.techId)) return { ok: false, message: NO_TECH };
  if (typeof request.tag !== "string" || request.tag.trim() === "") return { ok: false, message: "뗄 태그를 골라 주세요." };
  const wanted = request.tag;
  let current: string[];
  try {
    current = await readTechTags(db, userId, request.techId);
  } catch (e) {
    console.error("태그 떼기 전 읽기 실패", maskSecrets(String(e instanceof Error ? e.message : e)));
    return { ok: false, message: SAVE_FAILED };
  }
  const stored = current.find((t) => tagKey(t) === tagKey(wanted))
    ?? current.find((t) => tagKey(t) === tagKey(wanted.trim().replace(/ {2,}/g, " ")));
  if (!stored) return { ok: true, tag: request.tag.trim(), changed: false };
  const { data, error } = await db.from("my_tech_tags").delete().eq("user_id", userId).eq("tech_id", request.techId).eq("tag", stored).select("id");
  if (error || !data) {
    console.error("태그 떼기 실패", maskSecrets(error?.message ?? "빈 응답"));
    return { ok: false, message: SAVE_FAILED };
  }
  return { ok: true, tag: stored, changed: data.length > 0 };
}
