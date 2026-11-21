// 바깥 소식 저장(P-12f ⑥, 마이그레이션 M7 news_items). 서비스 키 연결로만 쓴다(RLS: 읽기는 공개, 쓰기는 서버).
// 같은 주소(url)는 한 줄: 같은 소식을 다시 읽어도 늘지 않는다(불변 3, 유일 색인 + on conflict do nothing).
// 상대 경로 import: node --test가 `@/` 별칭을 못 읽는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSecrets } from "../domain/redact.ts";

export const NEWS_SOURCE = "news"; // sources.name — 관리자가 끄는 스위치(IA-15)이자 "하루 한 번" 기준 시각(last_synced_at)

export type NewsSource = { id: string; enabled: boolean; lastSyncedAt: string | null };
export type NewsRow = { source_key: string; title: string; url: string; summary: string | null; published_at: string; tools: string[]; official: true };

const fail = (what: string, message: string) => new Error(`${what}: ${maskSecrets(message)}`);

/** 출처 줄(news)이 없으면 던진다: 마이그레이션 M7 전에 "소식 없음"으로 보이지 않게(불변 2) */
export async function readNewsSource(db: SupabaseClient): Promise<NewsSource> {
  const { data, error } = await db.from("sources").select("id, enabled, last_synced_at").eq("name", NEWS_SOURCE).maybeSingle();
  if (error) throw fail("출처 목록을 읽지 못함", error.message);
  if (!data) throw new Error(`출처 ${NEWS_SOURCE}를 찾지 못함(마이그레이션 P-12f news_items 전인지 확인)`);
  return { id: data.id as string, enabled: data.enabled === true, lastSyncedAt: (data.last_synced_at as string | null) ?? null };
}

/** 새로 들어간 줄 수를 돌려준다(이미 있는 주소는 건너뜀). 저장 실패는 던진다 */
export async function saveNewsItems(db: SupabaseClient, rows: NewsRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { data, error } = await db.from("news_items").upsert(rows, { onConflict: "url", ignoreDuplicates: true }).select("id");
  if (error) throw fail("소식을 저장하지 못함", error.message);
  return data?.length ?? 0;
}

/** 이번에 읽은 시각을 남긴다(하루 한 번 기준). 실패는 던진다: 남기지 못하면 다음 실행이 또 읽어 약관 조건(하루 1번)을 넘길 수 있다 */
export async function markSynced(db: SupabaseClient, sourceId: string, iso: string): Promise<void> {
  const { error } = await db.from("sources").update({ last_synced_at: iso }).eq("id", sourceId);
  if (error) throw fail("소식 읽은 시각을 남기지 못함", error.message);
}
