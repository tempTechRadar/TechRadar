import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readNewsFeed } from "./news-feed.ts";

type Row = Record<string, any>;
const NOW = Date.parse("2026-11-22T00:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

// 읽기 조건(eq · neq · not · in · gt · gte · or(무시) · order · limit)을 지키는 메모리 표. fail: 이 표를 읽을 때 오류. reads: 어느 표를 읽었는지
function fakeDb(tables: Record<string, Row[]>, fail: string[] = []) {
  const reads: string[] = [];
  const pick = (r: Row, path: string): unknown => path.split(/->>?/).reduce<any>((v, k) => (v == null ? v : v[k]), r);
  const db = {
    from(table: string) {
      return {
        select() {
          reads.push(table);
          let rows = [...(tables[table] ?? [])];
          const q: any = {
            eq(c: string, v: unknown) { rows = rows.filter((r) => r[c] === v); return q; },
            neq(c: string, v: unknown) { rows = rows.filter((r) => r[c] !== v); return q; },
            not(c: string, _o: string, v: unknown) { rows = rows.filter((r) => r[c] !== v && r[c] !== undefined); return q; },
            in(c: string, vals: unknown[]) { rows = rows.filter((r) => vals.includes(r[c])); return q; },
            gt(c: string, v: string) { rows = rows.filter((r) => String(pick(r, c) ?? "") > v); return q; },
            gte(c: string, v: string) { rows = rows.filter((r) => String(pick(r, c) ?? "") >= v); return q; },
            or() { return q; },
            order() { return q; },
            limit(n: number) { rows = rows.slice(0, n); return q; },
            then: (res: (v: unknown) => unknown) => Promise.resolve(fail.includes(table) ? { data: null, error: { message: "DB 오류" } } : { data: rows, error: null }).then(res),
          };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, reads };
}

const tech = (id: string, over: Row = {}): Row => ({ id, display_name: `기술-${id}`, grade: "pass", status: "active", one_liner_source: "https://example.com", is_simulated: false, is_official: false, type: "mcp", signals: {}, repo_url: `https://github.com/acme/${id}`, created_at: ago(40), ...over });
const tables = (): Record<string, Row[]> => ({
  news_items: [
    { id: "n1", source_key: "github_changelog", title: "새 기능", url: "https://github.blog/x", summary: null, published_at: ago(2), tools: ["github"], official: true },
    { id: "n2", source_key: "github_changelog", title: "한 달 전 소식", url: "https://github.blog/old", summary: null, published_at: ago(40), tools: [], official: true },
  ],
  observations: [{ tech_id: "hot", metric: "stars", is_simulated: false, observed_at: ago(1), prev_value: { stars: 100 }, curr_value: { stars: 190 } }],
  technologies: [tech("hot", { signals: { stars: 190 } }), tech("off", { is_official: true, type: "skill", created_at: ago(3), repo_url: "https://github.com/anthropics/skills" }), tech("plain")],
  changes: [{ id: "c1", kind: "grade_to_danger", is_simulated: false, detected_at: ago(1), curr_value: { reason: "문제", evidence: [{ id: "GHSA-1", url: "https://osv.dev/v/1" }] }, technologies: { display_name: "mcp-remote" } }],
});
const ids = (r: { items: { id: string }[] }) => r.items.map((i) => i.id).sort();

test("소식 읽기(로그인 전): 바깥 소식 + 새 공식 스킬 + 요즘 뜨는 기술만, 내 취약점은 읽지도 않는다, 30일 지난 소식은 뺀다", async () => {
  const t = fakeDb(tables());
  const r = await readNewsFeed({ db: t.db, serviceDb: t.db, userId: null, nowMs: NOW });
  assert.deepEqual(ids(r), ["news:n1", "official:off", "trending:hot"]);
  assert.deepEqual([r.failed, r.omitted], [[], 0]);
  assert.ok(!t.reads.includes("changes"), "로그인 전에는 내 사건 표를 읽지 않는다(불변 5)");
});

test("소식 읽기(로그인): 내 새 취약점이 더해지고 출처는 OSV 근거 주소", async () => {
  const t = fakeDb(tables());
  const r = await readNewsFeed({ db: t.db, serviceDb: t.db, userId: "u1", nowMs: NOW });
  assert.deepEqual(ids(r), ["news:n1", "official:off", "trending:hot", "vuln:c1"]);
  assert.equal(r.items.find((i) => i.id === "vuln:c1")!.url, "https://osv.dev/v/1");
  assert.deepEqual(r.items.map((i) => i.publishedAt).sort().reverse(), r.items.map((i) => i.publishedAt), "새것부터");
});

test("소식 읽기: 한 출처를 못 읽어도 나머지는 보여 주고, 못 읽은 출처 이름을 알린다(빈 목록으로 속이지 않음, 불변 2)", async () => {
  const t = fakeDb(tables(), ["news_items", "changes"]);
  const r = await readNewsFeed({ db: t.db, serviceDb: t.db, userId: "u1", nowMs: NOW });
  assert.deepEqual(ids(r), ["official:off", "trending:hot"]);
  assert.deepEqual(r.failed.sort(), ["내 기술의 새 취약점", "바깥 소식"]);
});

test("소식 읽기: 서비스 연결이 없으면 요즘 뜨는 기술만 못 읽은 것으로 알린다", async () => {
  const t = fakeDb(tables());
  const r = await readNewsFeed({ db: t.db, serviceDb: null, userId: null, nowMs: NOW });
  assert.deepEqual(ids(r), ["news:n1", "official:off"]);
  assert.deepEqual(r.failed, ["요즘 뜨는 기술"]);
});

test("소식 읽기: 출처 링크가 없어 뺀 항목은 건수로 알리고, 고른 도구로 거를 수 있다", async () => {
  const data = tables();
  data.technologies[1] = tech("off", { is_official: true, type: "skill", created_at: ago(3), repo_url: null });
  const t = fakeDb(data);
  const all = await readNewsFeed({ db: t.db, serviceDb: t.db, userId: null, nowMs: NOW });
  assert.equal(all.omitted, 1);
  const github = await readNewsFeed({ db: t.db, serviceDb: t.db, userId: null, nowMs: NOW, tools: ["GitHub"] });
  assert.deepEqual(ids(github), ["news:n1"]);
});
