import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HnHit } from "../domain/hn.ts";
import { CollectError } from "./collect-fetch.ts";
import { hnCollector, MAX_NEW_PER_RUN } from "./collect-hn.ts";

type Row = Record<string, unknown>;
type Tables = { technologies: Row[]; sources: Row[]; observations: Row[]; run_steps: Row[] };
const NOW = Date.parse("2026-11-21T06:00:00Z");
const clone = <T>(v: T): T => structuredClone(v);

// 표를 실제로 들고 있는 가짜 클라이언트(collect-downloads.test.ts와 같은 모양 + upsert). writes는 technologies 쓰기 횟수
function fakeDb(tables: Tables, fail: { observation?: boolean } = {}) {
  const stats = { writes: 0 };
  const db = {
    from(table: keyof Tables) {
      const rows = tables[table];
      let found = rows;
      let page: [number, number] | null = null;
      const q = {
        select: () => q,
        order: () => q,
        or: () => q, // 찾을 수 있는 줄만 읽는 조건은 DB가 거른다(여기 표는 작아 그대로)
        range: (from: number, to: number) => ((page = [from, to]), q),
        eq: (c: string, v: unknown) => ((found = found.filter((r) => r[c] === v)), q),
        single: () => Promise.resolve(found.length === 1 ? { data: clone(found[0]), error: null } : { data: null, error: { message: `줄 ${found.length}개` } }),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: clone(page ? found.slice(page[0], page[1] + 1) : found), error: null }).then(res, rej),
        insert(row: Row) {
          if (table === "observations" && fail.observation) return Promise.resolve({ error: { message: "쓰기 거부" } });
          rows.push(row);
          return Promise.resolve({ error: null });
        },
        upsert(row: Row) {
          const exists = rows.some((r) => r.tech_key === row.tech_key);
          const made = exists ? [] : [{ id: `new-${rows.length}`, is_simulated: false, ...clone(row) }];
          rows.push(...made);
          if (made.length) stats.writes++;
          return { select: () => Promise.resolve({ data: made.map((r) => ({ id: r.id })), error: null }) };
        },
        update: (patch: Row) => ({
          eq: (c: string, v: unknown) => {
            stats.writes++;
            rows.filter((r) => r[c] === v).forEach((r) => Object.assign(r, clone(patch)));
            return Promise.resolve({ error: null });
          },
        }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, stats };
}

const tech = (id: string, key: string, over: Row = {}): Row => ({ id, tech_key: key, repo_url: null, is_simulated: false, signals: null, ...over });
const world = (technologies: Row[], enabled = true): Tables => ({ technologies, sources: [{ id: "s-hn", name: "hn", enabled }], observations: [], run_steps: [] });
const story = (id: string, title: string, url: string | null, points = 20, comments = 3): HnHit => ({ objectID: id, title, url, points, num_comments: comments, created_at_i: 1 });

// 키워드별 응답 흉내: 배열이면 그 글들, Error면 던진다. 부른 키워드와 쉰 시간을 모은다
function fakes(byKeyword: Record<string, HnHit[] | Error>) {
  const asked: string[] = [];
  const sleeps: number[] = [];
  return {
    asked, sleeps,
    deps: {
      now: () => NOW,
      sleep: async (ms: number) => void sleeps.push(ms),
      fetchHits: async (keyword: string) => {
        asked.push(keyword);
        const v = byKeyword[keyword] ?? [];
        if (v instanceof Error) throw v;
        return { hits: clone(v), invalid: 0 };
      },
    },
  };
}
const run = (t: Tables, f: ReturnType<typeof fakes>, fail = {}) => {
  const { db, stats } = fakeDb(t, fail);
  return { stats, result: hnCollector(f.deps).run({ db, runId: "run-1", deadlineMs: Number.MAX_SAFE_INTEGER }) };
};
const steps = (t: Tables) => t.run_steps.map((s) => `${s.step_name}:${s.count_in ?? "-"}>${s.count_out ?? "-"}`);
const hnOf = (t: Tables, id: string) => (t.technologies.find((r) => r.id === id)?.signals as Row | null)?.hn as Row | undefined;

test("출처 이름은 흐름 상자 fetch_popularity", () => {
  assert.equal(hnCollector().source, "fetch_popularity");
});

test("꺼져 있으면 부르지 않는다", async () => {
  const f = fakes({});
  const r = await run(world([], false), f).result;
  assert.deepEqual(r, { items: 0, summary: "Hacker News 출처가 꺼져 있어요(관리자 설정)" });
  assert.deepEqual(f.asked, []);
});

test("처음 읽음: 알려진 기술에 신호, 이름 맞는 모르는 저장소만 얇게, 모르는 패키지·키워드 없는 글은 안 만듦", async () => {
  const t = world([
    tech("reg", "mcp:io.github.foo/bar", { repo_url: "https://github.com/Foo/Bar.git", signals: { weekly_downloads: 5 } }),
    tech("npm", "npm:mcp-remote"),
    tech("sim", "github:x/sim-mcp", { is_simulated: true }),
  ]);
  const f = fakes({
    mcp: [
      story("1", "Show HN: Bar, an MCP server", "https://github.com/foo/bar/issues/3", 50),
      story("2", "MCP remote release", "https://www.npmjs.com/package/mcp-remote", 30),
      story("3", "New MCP gateway", "https://github.com/acme/gateway-mcp", 15),
      story("4", "An MCP thing", "https://github.com/acme/awesome-list", 15), // 이름에 mcp·skill 없음
      story("5", "MCP sdk", "https://npmjs.com/package/unknown-pkg", 12), // 모르는 패키지
      story("6", "MCP blog post", "https://example.com/post", 99), // 저장소·패키지 아님
      story("7", "mcpserver", "https://github.com/acme/other-mcp", 99), // 제목에 낱말 키워드 없음
      story("8", "MCP sim", "https://github.com/x/sim-mcp", 40), // 가짜 줄은 건드리지 않음
    ],
    "claude code": [story("1", "Show HN: Bar, an MCP server", "https://github.com/foo/bar/issues/3", 50)], // 같은 글이 다른 키워드에도
  });
  const r = await run(t, f).result;
  assert.deepEqual(f.asked, ["mcp", "model context protocol", "claude code", "agent skills"]);
  assert.deepEqual(f.sleeps, [1000, 1000, 1000]);
  assert.equal(hnOf(t, "reg")?.points, 50);
  assert.equal((t.technologies.find((x) => x.id === "reg")!.signals as Row).weekly_downloads, 5); // 다른 신호는 그대로
  assert.equal(hnOf(t, "npm")?.story_url, "https://news.ycombinator.com/item?id=2");
  assert.equal(t.technologies.find((x) => x.id === "sim")!.signals, null);
  const made = t.technologies.filter((x) => String(x.id).startsWith("new-"));
  assert.deepEqual(made.map((x) => [x.tech_key, x.type, x.depth, x.repo_url, x.one_liner]), [["github:acme/gateway-mcp", "mcp", "thin", "https://github.com/acme/gateway-mcp", null]]);
  assert.deepEqual({ ...(made[0].signals as Row), hn: undefined }, { registry_backfill: true, hn: undefined });
  assert.equal(t.observations.length, 3); // reg·npm·새 줄. 가짜 줄의 저장소는 같은 키가 이미 있어 새로 만들지도 않는다(upsert가 건너뜀)
  assert.ok(t.observations.every((o) => o.metric === "hn_points" && o.source_id === "s-hn" && o.run_id === "run-1"));
  assert.match(r.summary ?? "", /미등록 패키지 1개/);
  assert.match(r.summary ?? "", /이름에 mcp·skill이 없어 안 만든 저장소 1개/);
  assert.deepEqual(steps(t), ["normalize:8>6", "compare:6>0"]);
});

test("같은 것을 두 번 읽어도 줄·수집 자료·쓰기가 늘지 않는다(불변 3)", async () => {
  const t = world([tech("a", "npm:mcp-remote")]);
  const f = fakes({ mcp: [story("1", "MCP remote", "https://npmjs.com/package/mcp-remote"), story("2", "MCP tool", "https://github.com/acme/tool-mcp")] });
  await run(t, f).result;
  const rows = t.technologies.length;
  const obs = t.observations.length;
  const second = run(t, f);
  await second.result;
  assert.equal(t.technologies.length, rows);
  assert.equal(t.observations.length, obs);
  assert.equal(second.stats.writes, 0);
});

test("점수가 바뀌면 신호를 고치고 수집 자료에 이전 값을 남긴다", async () => {
  const t = world([tech("a", "npm:mcp-remote")]);
  await run(t, fakes({ mcp: [story("1", "MCP remote", "https://npmjs.com/package/mcp-remote", 20)] })).result;
  await run(t, fakes({ mcp: [story("1", "MCP remote", "https://npmjs.com/package/mcp-remote", 35)] })).result;
  assert.equal(hnOf(t, "a")?.points, 35);
  assert.deepEqual(t.observations.at(-1)?.prev_value, { hn_points: 20 });
});

test("첫 키워드가 429면 나머지는 부르지 않고 수집 오류로 던진다(빈 결과로 단정하지 않음)", async () => {
  const t = world([tech("a", "npm:mcp-remote")]);
  const f = fakes({ mcp: new CollectError("rate_limited", "429", 429) });
  await assert.rejects(run(t, f).result, (e: unknown) => e instanceof CollectError && e.kind === "rate_limited");
  assert.deepEqual(f.asked, ["mcp"]);
  assert.equal(t.technologies[0].signals, null);
});

test("일부 키워드만 실패하면 읽은 것은 쓰고 collect_error 줄에 센다", async () => {
  const t = world([tech("a", "npm:mcp-remote")]);
  const f = fakes({ mcp: new CollectError("http_status", "500", 500), "claude code": [story("1", "Claude Code + MCP remote", "https://npmjs.com/package/mcp-remote")] });
  const r = await run(t, f).result;
  assert.equal(hnOf(t, "a")?.story_id, "1");
  assert.ok(steps(t).includes("collect_error:1>-"));
  assert.match(r.summary ?? "", /수집 오류 키워드 1개/);
});

test(`한 실행에 새 얇은 줄은 최대 ${MAX_NEW_PER_RUN}개`, async () => {
  const t = world([]);
  const many = Array.from({ length: MAX_NEW_PER_RUN + 5 }, (_, i) => story(String(i + 1), "MCP server", `https://github.com/o${i}/r-mcp`));
  const r = await run(t, fakes({ mcp: many })).result;
  assert.equal(t.technologies.length, MAX_NEW_PER_RUN);
  assert.match(r.summary ?? "", new RegExp(`새 줄 상한 ${MAX_NEW_PER_RUN}개에 닿아 5개는 다음 실행으로`));
});

test("수집 자료를 못 남기면 신호를 되돌리고 던진다(불변 4)", async () => {
  const t = world([tech("a", "npm:mcp-remote", { signals: { weekly_downloads: 9 } })]);
  const { db } = fakeDb(t, { observation: true });
  const f = fakes({ mcp: [story("1", "MCP remote", "https://npmjs.com/package/mcp-remote")] });
  await assert.rejects(hnCollector(f.deps).run({ db, runId: "run-1", deadlineMs: Number.MAX_SAFE_INTEGER }), /수집 자료를 저장하지 못함/);
  assert.deepEqual(t.technologies[0].signals, { weekly_downloads: 9 });
});

test("한 기술이 저장소·패키지 키로 둘 다 걸리면 점수 높은 글 하나만, 다시 읽어도 안 늘어남(불변 3)", async () => {
  const t = world([tech("a", "npm:foo", { repo_url: "https://github.com/o/foo" })]);
  const f = fakes({ mcp: [story("1", "MCP foo repo", "https://github.com/o/foo", 30), story("2", "MCP foo pkg", "https://npmjs.com/package/foo", 80)] });
  await run(t, f).result;
  assert.equal(hnOf(t, "a")?.story_id, "2");
  assert.equal(t.observations.length, 1);
  const second = run(t, f);
  await second.result;
  assert.equal(t.observations.length, 1);
  assert.equal(second.stats.writes, 0);
});

test("다른 글로 바뀌면 이전 점수와 잇지 않는다(새 글)", async () => {
  const t = world([tech("a", "npm:mcp-remote")]);
  await run(t, fakes({ mcp: [story("1", "MCP remote", "https://npmjs.com/package/mcp-remote", 120)] })).result;
  await run(t, fakes({ mcp: [story("9", "MCP remote again", "https://npmjs.com/package/mcp-remote", 12)] })).result;
  assert.equal(t.observations.at(-1)?.prev_value, null);
  assert.match(String(t.observations.at(-1)?.change_size), /새 글/);
});

test("같은 키의 가짜 줄이 있으면 만들지 않고 건너뜀으로 센다", async () => {
  const t = world([tech("sim", "github:x/sim-mcp", { is_simulated: true })]);
  const r = await run(t, fakes({ mcp: [story("1", "MCP sim", "https://github.com/x/sim-mcp")] })).result;
  assert.equal(t.technologies.length, 1);
  assert.equal(t.technologies[0].signals, null);
  assert.match(r.summary ?? "", /같은 키가 이미 있어 건너뛴 저장소 1개/);
});

test("모노레포: 같은 저장소를 가리키는 줄이 여럿이면 github: 키 줄 하나에만, 다시 읽어도 안 늘어남", async () => {
  const repo = "https://github.com/acme/mono";
  const t = world([tech("p1", "npm:@acme/a", { repo_url: repo }), tech("p2", "npm:@acme/b", { repo_url: `${repo}.git` }), tech("p3", "github:Acme/Mono"), tech("p4", "npm:@acme/c", { repo_url: repo })]);
  const f = fakes({ mcp: [story("1", "MCP monorepo", repo)] });
  await run(t, f).result;
  assert.deepEqual(t.technologies.filter((r) => r.signals).map((r) => r.id), ["p3"]);
  assert.equal(t.observations.length, 1);
  const second = run(t, f);
  await second.result;
  assert.equal(t.observations.length, 1);
  assert.equal(second.stats.writes, 0);
});

test("모노레포에 github: 키 줄이 없으면 id가 가장 작은 줄 하나에만", async () => {
  const repo = "https://github.com/acme/mono";
  const t = world([tech("p1", "npm:@acme/a", { repo_url: repo }), tech("p2", "npm:@acme/b", { repo_url: repo })]);
  await run(t, fakes({ mcp: [story("1", "MCP monorepo", repo)] })).result;
  assert.deepEqual(t.technologies.filter((r) => r.signals).map((r) => r.id), ["p1"]);
});

test("저장 중 시간 한도를 넘으면 멈추고 요약에 남긴다(다음 실행이 이어 감)", async () => {
  const t = world([tech("a", "npm:mcp-remote"), tech("b", "npm:other-mcp")]);
  let clock = NOW;
  const f = fakes({ "agent skills": [], mcp: [story("1", "MCP remote", "https://npmjs.com/package/mcp-remote"), story("2", "MCP other", "https://npmjs.com/package/other-mcp")] });
  const deps = { ...f.deps, now: () => clock, fetchHits: async (k: string, n: number) => { const r = await f.deps.fetchHits(k); if (k === "agent skills") clock = NOW + 60_000; return r; } };
  const { db } = fakeDb(t);
  const r = await hnCollector(deps).run({ db, runId: "run-1", deadlineMs: Number.MAX_SAFE_INTEGER });
  assert.equal(t.observations.length, 0);
  assert.match(r.summary ?? "", /시간 한도로 대상 2개는 다음 실행으로/);
});
