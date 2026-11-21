// 현황 "소식" 탭이 읽는 소식 목록(P-12f ⑥): 바깥 소식(news_items, 공개) + 이미 모은 사건(내 취약점 · 요즘 뜨는 기술 · 새 공식 스킬/플러그인).
// 로그인 전에는 공개 값만(바깥 소식 · 뜨는 기술 · 새 공식), 로그인하면 내 알림에 이어진 취약점이 더해진다(불변 5: changes는 RLS로 본인 것만 읽힘).
// 기술 표(technologies)는 손님(anon) 연결로 읽을 수 없다(ADR 0029): 손님도 보는 항목은 서비스 키 연결(serviceDb) + 공개 칸(listedTechs)으로만 읽는다. db(사용자 연결)로 읽는 것은 바깥 소식(공개 읽기)과 내 취약점(RLS 본인)뿐이다.
// 출처 하나가 읽기에 실패해도 나머지는 보여 주고, 못 읽은 출처 이름을 failed로 알린다("없음"으로 속이지 않음, 불변 2). 상대 경로 import: node --test가 `@/` 별칭을 못 읽는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { NEWS_FEEDS } from "../domain/news-feeds.ts";
import { NOT_BULK_FILTER } from "../domain/registry.ts";
import { maskSecrets } from "../domain/redact.ts";
import { NEWS_DAYS, newsBoard, type NewsItem } from "../views/news.ts";
import { externalNews, officialNews, trendingNews, vulnNews, type NewsRowIn, type OfficialNewIn, type VulnChangeIn } from "../views/news-events.ts";
import { rowsOrThrow } from "./alert-db.ts";
import { listedTechs } from "./map-queries.ts";
import { readTrending } from "./trending.ts";

export type NewsFeedResult = { items: NewsItem[]; failed: string[]; omitted: number };
type Deps = { db: SupabaseClient; serviceDb: SupabaseClient | null; userId: string | null; nowMs?: number; tools?: string[] };
type Part = { name: string; run: () => Promise<{ items: NewsItem[]; omitted?: number }> };

const DAY_MS = 86_400_000;
const LABELS = Object.fromEntries(NEWS_FEEDS.map((f) => [f.key, f.label]));
const LIMIT = 100;

export async function readNewsFeed({ db, serviceDb, userId, nowMs = Date.now(), tools = [] }: Deps): Promise<NewsFeedResult> {
  const sinceIso = new Date(nowMs - NEWS_DAYS * DAY_MS).toISOString();
  const parts: Part[] = [
    { name: "바깥 소식", run: async () => ({ items: externalNews((rowsOrThrow(await db.from("news_items").select("id, source_key, title, url, summary, published_at, tools, official").gte("published_at", sinceIso).order("published_at", { ascending: false }).limit(LIMIT), "바깥 소식을 읽지 못함")) as NewsRowIn[], LABELS) }) },
    { name: "새 공식 스킬 · 플러그인", run: async () => { if (!serviceDb) throw new Error("서버 연결이 없어요"); return officialNews(rowsOrThrow(await listedTechs(serviceDb, "id, display_name, type, repo_url, created_at").eq("is_official", true).in("type", ["skill", "plugin"]).gt("created_at", sinceIso).or(NOT_BULK_FILTER).order("created_at", { ascending: false }).limit(LIMIT), "새 공식 기술을 읽지 못함") as OfficialNewIn[]); } },
    { name: "요즘 뜨는 기술", run: async () => { if (!serviceDb) throw new Error("서버 연결이 없어요"); return trendingNews(await readTrending(serviceDb, nowMs), nowMs); } },
  ];
  if (userId) {
    parts.push({ name: "내 기술의 새 취약점", run: async () => vulnNews(rowsOrThrow(await db.from("changes").select("id, kind, detected_at, curr_value, technologies(display_name)").in("kind", ["grade_to_danger", "first_seen_danger"]).eq("is_simulated", false).gte("detected_at", sinceIso).order("detected_at", { ascending: false }).limit(LIMIT), "내 취약점 소식을 읽지 못함") as VulnChangeIn[]) });
  }
  const settled = await Promise.allSettled(parts.map((p) => p.run()));
  const failed: string[] = [];
  const all: NewsItem[] = [];
  let omitted = 0;
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") { all.push(...s.value.items); omitted += s.value.omitted ?? 0; return; }
    failed.push(parts[i].name);
    console.error(`소식 읽기 실패(${parts[i].name})`, maskSecrets(s.reason instanceof Error ? s.reason.message : String(s.reason)));
  });
  return { items: newsBoard(all, nowMs, tools), failed, omitted };
}
