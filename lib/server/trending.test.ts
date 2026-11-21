import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readTrending } from "./trending.ts";

type Row = Record<string, any>;
const NOW = Date.parse("2026-11-22T00:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

// 읽기 조건(eq · neq · not is null · in · gte(경로 포함) · order · limit)을 지키는 메모리 표. fail: 이 표를 읽을 때 오류
function fakeDb(tables: Record<string, Row[]>, fail?: string) {
  const reads: { table: string; eq: [string, unknown][]; gte: [string, string][] }[] = [];
  const pick = (r: Row, path: string): unknown => path.split(/->>?/).reduce<any>((v, k) => (v == null ? v : v[k]), r);
  const db = {
    from(table: string) {
      return {
        select() {
          let rows = [...(tables[table] ?? [])];
          const log = { table, eq: [] as [string, unknown][], gte: [] as [string, string][] };
          reads.push(log);
          const q: any = {
            eq(c: string, v: unknown) { log.eq.push([c, v]); rows = rows.filter((r) => r[c] === v); return q; },
            neq(c: string, v: unknown) { rows = rows.filter((r) => r[c] !== v); return q; },
            not(c: string, _op: string, v: unknown) { rows = rows.filter((r) => r[c] !== v && r[c] !== undefined); return q; },
            in(c: string, vals: unknown[]) { rows = rows.filter((r) => vals.includes(r[c])); return q; },
            gte(c: string, v: string) { log.gte.push([c, v]); rows = rows.filter((r) => String(pick(r, c) ?? "") >= v); return q; },
            order() { return q; },
            limit(n: number) { rows = rows.slice(0, n); return q; },
            then: (res: (v: unknown) => unknown) => Promise.resolve(fail === table ? { data: null, error: { message: "DB 오류" } } : { data: rows, error: null }).then(res),
          };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, reads };
}

const tech = (id: string, over: Row = {}): Row => ({ id, display_name: `기술-${id}`, grade: "pass", status: "active", one_liner_source: "https://example.com", is_simulated: false, signals: {}, ...over });
const star = (techId: string, daysAgo: number, prev: number | null, curr: number, over: Row = {}): Row => ({ tech_id: techId, metric: "stars", is_simulated: false, observed_at: ago(daysAgo), prev_value: prev === null ? null : { stars: prev }, curr_value: { stars: curr }, ...over });
const hn = (points: number, daysAgo: number) => ({ hn: { points, comments: 5, story_id: "1", story_url: "https://news.ycombinator.com/item?id=1", title: "글", seen_at: ago(daysAgo) } });

test("뜨는 기술 읽기: 별이 는 기술과 최근 HN 글이 있는 기술을 모아 점수순으로 돌려준다", async () => {
  const { db } = fakeDb({
    observations: [star("a", 1, 100, 170), star("a", 3, 90, 100), star("b", 2, null, 999), star("c", 1, 10, 20)],
    technologies: [tech("a", { signals: { stars: 170 } }), tech("b", { signals: hn(200, 2) }), tech("c", { signals: { stars: 20 } }), tech("d", { signals: hn(100, 9) })],
  });
  const r = await readTrending(db, NOW);
  assert.deepEqual(r.map((x) => [x.id, x.score]), [["b", 40], ["a", 16]]);
  assert.deepEqual(r[1].reasons, [{ kind: "stars", gain: 80, stars: 170 }]);
  assert.equal(r[0].reasons[0].kind, "hn");
});

test("뜨는 기술 읽기: 공개 목록 규칙을 다시 건다 — 시뮬레이터 · 사라진 기술 · 목록에 못 오른(출처 없는) 줄 · 의심 표시 · 위험 등급은 뺀다", async () => {
  const sig = (extra: Row = {}) => ({ stars: 500, ...extra });
  const ids = ["ok", "sim", "gone", "nosrc", "flag", "danger"];
  const { db } = fakeDb({
    observations: ids.map((id) => star(id, 1, 100, 400)),
    technologies: [
      tech("ok", { signals: sig() }), tech("sim", { is_simulated: true, signals: sig() }), tech("gone", { status: "gone", signals: sig() }),
      tech("nosrc", { one_liner_source: null, signals: sig() }), tech("flag", { signals: sig({ candidate_flags: ["new_spike"] }) }), tech("danger", { grade: "danger", signals: sig() }),
    ],
  });
  assert.deepEqual((await readTrending(db, NOW)).map((x) => x.id), ["ok"]);
});

test("뜨는 기술 읽기: 가짜(시뮬레이터) 별 관찰과 7일 밖 관찰은 읽지 않는다(DB 조건을 건다)", async () => {
  const { db, reads } = fakeDb({
    observations: [star("a", 1, 100, 300, { is_simulated: true }), star("a", 9, 100, 300)],
    technologies: [tech("a", { signals: { stars: 300 } })],
  });
  assert.deepEqual(await readTrending(db, NOW), []);
  const obs = reads.find((x) => x.table === "observations")!;
  assert.deepEqual(obs.eq, [["metric", "stars"], ["is_simulated", false]]);
  assert.equal(obs.gte[0][1], ago(7));
});

test("뜨는 기술 읽기: 모양이 다른 신호는 신호 없음으로 보고(없는 줄 · 깨진 hn), 이름이 없는 줄은 건너뛴다", async () => {
  const { db } = fakeDb({
    observations: [{ tech_id: "x", metric: "stars", is_simulated: false, observed_at: ago(1), prev_value: "깨짐", curr_value: null }],
    technologies: [tech("h1", { signals: { hn: { points: "많음", story_url: 7 } } }), tech("h2", { signals: null }), tech("noname", { display_name: "", signals: hn(500, 1) }), tech("good", { signals: hn(60, 1) })],
  });
  assert.deepEqual((await readTrending(db, NOW)).map((x) => x.id), ["good"]);
});

test("뜨는 기술 읽기: 읽기에 실패하면 던진다 — 빈 목록('뜨는 게 없음')으로 속이지 않는다(불변 2)", async () => {
  await assert.rejects(() => readTrending(fakeDb({ observations: [], technologies: [] }, "observations").db, NOW), /별 변화를 읽지 못함: DB 오류/);
  await assert.rejects(() => readTrending(fakeDb({ observations: [], technologies: [] }, "technologies").db, NOW), /화제가 된 기술을 읽지 못함: DB 오류/);
});
