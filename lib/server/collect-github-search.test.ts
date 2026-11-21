import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchPage, SearchRepo } from "../domain/star-candidates.ts";
import type { RepoInfo } from "../domain/github-repo.ts";
import { CollectError } from "./collect-fetch.ts";
import { githubCollector } from "./collect-github.ts";
import { githubSearchCollector } from "./collect-github-search.ts";
import type { SearchQuery } from "./github-search-fetch.ts";

type Row = Record<string, unknown>;
type Tables = { sources: Row[]; technologies: Row[]; observations: Row[]; run_steps: Row[] };
type Log = { failObservations?: boolean; updates?: number };
const NOW = Date.parse("2026-11-21T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const clone = <T>(v: T): T => structuredClone(v);
const TOKEN = "ghp_TESTTOKENTESTTOKENTESTTOKEN0123456789";

// 표를 실제로 들고 있는 가짜 클라이언트(eq·or·order·range, 줄 하나 읽기, 고치기, 넣고 돌려받기). or는 코드가 저장소로 다시 거르므로 그대로 둔다
let ids = 0; // 실행마다 새 클라이언트를 만들어도 id가 겹치지 않게 파일 전체에서 하나로 센다
function fakeDb(tables: Tables, log: Log = {}) {
  return {
    from(table: keyof Tables) {
      const rows = tables[table];
      let found = rows;
      let window: [number, number] | null = null;
      const q = {
        select: () => q,
        or: () => q,
        eq: (c: string, v: unknown) => ((found = found.filter((r) => r[c] === v)), q),
        order: (c: string) => ((found = [...found].sort((a, b) => String(a[c]).localeCompare(String(b[c])))), q),
        range: (a: number, b: number) => ((window = [a, b]), q),
        single: () => Promise.resolve(found.length === 1 ? { data: clone(found[0]), error: null } : { data: null, error: { message: `줄 ${found.length}개` } }),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: clone(window ? found.slice(window[0], window[1] + 1) : found), error: null }).then(res, rej),
        insert(input: Row | Row[]) {
          const failed = table === "observations" && log.failObservations;
          const list = failed ? [] : (Array.isArray(input) ? input : [input]).map((r) => ({ id: `${table}-${++ids}`, ...clone(r) }));
          rows.push(...list);
          const added = list[0] ?? null;
          const result = { error: failed ? { message: "수집 자료 저장 실패" } : null };
          return { ...Promise.resolve(result), then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res), select: () => ({ single: () => Promise.resolve({ data: clone(added), error: null }) }) };
        },
        update: (patch: Row) => ({
          eq: (c: string, v: unknown) => {
            log.updates = (log.updates ?? 0) + 1;
            rows.filter((r) => r[c] === v).forEach((r) => Object.assign(r, clone(patch)));
            return Promise.resolve({ error: null });
          },
        }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const repo = (name: string, over: Partial<SearchRepo> = {}): SearchRepo => {
  const [owner, r] = name.split("/");
  return {
    owner, repo: r, fullName: name, htmlUrl: `https://github.com/${name}`, description: `${r} 설명`, stars: 2000, forks: 100, pushedAt: ago(5), createdAt: ago(400),
    archived: false, fork: false, license: "MIT", ownerType: "User", ...over,
  };
};
const world = (technologies: Row[] = [], enabled = true): Tables => ({ sources: [{ id: "s-gs", name: "github_search", enabled }], technologies, observations: [], run_steps: [] });
const tech = (key: string, over: Row = {}): Row => ({
  id: `T-${key}`, tech_key: key, repo_url: null, depth: "thin", thick_reasons: null, one_liner: null, one_liner_source: null, signals: null, is_simulated: false,
  status: "active", status_by: null, missed_count: 0, license: null, last_activity_at: null, last_activity_kind: null, last_checked_ok_at: null, ...over,
});
const byKey = (t: Tables, key: string) => t.technologies.find((r) => r.tech_key === key);
const sig = (r: Row | undefined) => (r?.signals ?? {}) as Record<string, unknown>;
const steps = (t: Tables) => t.run_steps.map((s) => `${s.step_name}:${s.count_in}>${s.count_out}`);

// 검색 흉내: 태그 → 결과(한 쪽에 다 담음) 또는 던질 오류. 부른 질의와 쉰 시간을 모은다
function fakes(byTag: Record<string, SearchRepo[] | Error>, opts: { token?: string | undefined; now?: () => number; page?: (q: SearchQuery) => SearchPage } = {}) {
  const calls: SearchQuery[] = [];
  const sleeps: number[] = [];
  return {
    calls, sleeps,
    deps: {
      now: opts.now ?? (() => NOW),
      sleep: async (ms: number) => void sleeps.push(ms),
      token: () => ("token" in opts ? opts.token : TOKEN),
      fetchPage: async (q: SearchQuery) => {
        calls.push(q);
        if (opts.page) return opts.page(q);
        const s = byTag[q.tag] ?? [];
        if (s instanceof Error) throw s;
        return { total: s.length, incomplete: false, items: s };
      },
    },
  };
}
const run = (t: Tables, f: ReturnType<typeof fakes>, log: Log = {}, deadlineMs = Number.MAX_SAFE_INTEGER) =>
  githubSearchCollector(f.deps).run({ db: fakeDb(t, log), runId: "run-1", deadlineMs });

test("출처 이름은 흐름 상자 fetch_stars", () => {
  assert.equal(githubSearchCollector().source, "fetch_stars");
});

test("출처 줄 github_search가 꺼져 있으면 부르지 않고 꺼져 있다고 요약한다", async () => {
  const t = world([], false);
  const f = fakes({ mcp: [repo("a/b")] });
  const out = await run(t, f);
  assert.deepEqual([out.items, f.calls.length, t.technologies.length], [0, 0, 0]);
  assert.match(out.summary!, /꺼져 있어요\(관리자 설정\)/);
});

test("토큰이 없거나 모양이 이상하면 호출 없이 수집 오류(값은 문구에 안 넣음)", async () => {
  for (const token of [undefined, "  ", "ghp_줄\n바꿈이섞인값값값값값값값값값"]) {
    const f = fakes({}, { token });
    await assert.rejects(run(world(), f), (e: unknown) => e instanceof CollectError && !e.message.includes("바꿈이섞인"));
    assert.equal(f.calls.length, 0);
  }
});

test("검색이 하나라도 실패하면(429·403·422) 아무것도 저장하지 않고 수집 오류: 일부만 읽고 '후보 없음'이라 하지 않는다(불변 2)", async () => {
  for (const e of [new CollectError("rate_limited", "429", 429), new CollectError("http_status", "403", 403), new CollectError("http_status", "422", 422)]) {
    const t = world();
    await assert.rejects(run(t, fakes({ "mcp-server": [repo("a/one")], mcp: e })), (x: unknown) => x === e);
    assert.deepEqual([t.technologies.length, t.observations.length], [0, 0]);
  }
});

test("새 줄: 상위는 github: 키(소문자)로 두껍게(이유 stars), 의심은 얇게 NEW 후보, 관문에서 떨어진 것은 안 들임. 태그 사이 1초씩 쉰다", async () => {
  const t = world();
  const f = fakes({
    mcp: [repo("Acme/Tool", { stars: 5000 }), repo("old/gone", { archived: true }), repo("fresh/spike", { createdAt: ago(3), stars: 3000 })],
    "agent-skills": [repo("sk/Skill", { description: null })],
  });
  const out = await run(t, f);
  assert.deepEqual(f.sleeps, [1000, 1000, 1000]);
  const tool = byKey(t, "github:acme/tool")!;
  assert.deepEqual([tool.depth, tool.thick_reasons, tool.type, tool.display_name, tool.repo_url, tool.one_liner, tool.one_liner_source],
    ["thick", ["stars"], "mcp", "Acme/Tool", "https://github.com/Acme/Tool", "Tool 설명", "https://github.com/Acme/Tool"]);
  assert.deepEqual([sig(tool).stars, sig(tool).candidate_flags, sig(tool).registry_backfill, typeof sig(tool).candidate_score], [5000, [], true, "number"]);
  const skill = byKey(t, "github:sk/skill")!;
  assert.deepEqual([skill.type, skill.one_liner, skill.one_liner_source], ["skill", null, null]);
  const spike = byKey(t, "github:fresh/spike")!;
  assert.deepEqual([spike.depth, spike.thick_reasons, sig(spike).candidate_flags, sig(spike).candidate_score, sig(spike).registry_backfill], ["thin", null, ["new_spike"], null, false]);
  assert.equal(byKey(t, "github:old/gone"), undefined);
  assert.equal(t.observations.length, 3);
  assert.deepEqual(steps(t), ["normalize:4>3", "compare:3>0"]);
  assert.equal(out.items, 4);
});

test("같은 입력을 두 번 읽어도 줄·수집 자료가 늘지 않고, 별 수가 바뀐 줄만 수집 자료가 하나 더 생긴다(불변 3)", async () => {
  const t = world();
  await run(t, fakes({ mcp: [repo("a/one"), repo("b/two")] }));
  const counts = [t.technologies.length, t.observations.length];
  await run(t, fakes({ mcp: [repo("a/one"), repo("b/two")] }));
  assert.deepEqual([t.technologies.length, t.observations.length], counts);
  await run(t, fakes({ mcp: [repo("a/one", { stars: 2100 }), repo("b/two")] }));
  assert.deepEqual([t.technologies.length, t.observations.length], [counts[0], counts[1] + 1]);
  assert.deepEqual(t.observations.at(-1)!.curr_value, { stars: 2100 });
  assert.equal(t.observations.at(-1)!.change_size, "별 2000 → 2100");
});

test("같은 저장소 줄(레지스트리·사용자)이 있으면 새 줄 없이 그 줄을 두껍게: 주소 표기(대소문자·.git·끝 /)가 달라도 같다. 사용자·레지스트리 값은 안 덮는다", async () => {
  const reg = tech("npm:acme-tool", { repo_url: "https://github.com/ACME/tool.git", depth: "thick", thick_reasons: ["official"], one_liner: "레지스트리 설명", one_liner_source: "https://registry.modelcontextprotocol.io/v0.1/servers?search=x", signals: { registry_backfill: true, weekly_downloads: 9 } });
  const user = tech("pypi:mine", { repo_url: "https://github.com/me/mine/" });
  const sim = tech("sim:fake", { repo_url: "https://github.com/z/sim", is_simulated: true });
  const t = world([reg, user, sim]);
  await run(t, fakes({ mcp: [repo("Acme/Tool"), repo("me/mine"), repo("z/sim")] }));
  assert.deepEqual(t.technologies.map((r) => r.tech_key).sort(), ["github:z/sim", "npm:acme-tool", "pypi:mine", "sim:fake"]);
  assert.deepEqual([reg.depth, reg.thick_reasons, reg.one_liner, reg.repo_url], ["thick", ["official", "stars"], "레지스트리 설명", "https://github.com/ACME/tool.git"]);
  assert.deepEqual([sig(reg).weekly_downloads, sig(reg).registry_backfill, sig(reg).stars], [9, true, 2000]);
  assert.deepEqual([user.depth, user.thick_reasons, user.one_liner, user.one_liner_source], ["thick", ["stars"], "mine 설명", "https://github.com/me/mine"]);
  assert.equal(sig(sim).stars, undefined, "시뮬레이터 줄은 건드리지 않는다");
});

test("별 이유 줄이 누적 상한 150이면 새로 올리지 않고 요약에 적는다. 이미 별 이유가 있는 줄은 신호만 갱신", async () => {
  const full = Array.from({ length: 150 }, (_, i) => tech(`github:o/r${i}`, { repo_url: `https://github.com/o/r${i}`, depth: "thick", thick_reasons: ["stars"], signals: { stars: 1500 } }));
  const t = world(full);
  const out = await run(t, fakes({ mcp: [repo("new/one"), repo("o/r0", { stars: 1600 })] }));
  assert.equal(byKey(t, "github:new/one"), undefined);
  assert.equal(sig(byKey(t, "github:o/r0")).stars, 1600);
  assert.match(out.summary!, /상한 150에 닿아 1곳은 안 올림/);
});

test("수집 자료를 못 남기면 고친 칸을 되돌리고 던진다: 다음 실행이 같은 변경을 다시 한다(불변 4)", async () => {
  const row = tech("github:a/one", { repo_url: "https://github.com/a/one", depth: "thick", thick_reasons: ["stars"], signals: { stars: 1500, other: 1 } });
  const t = world([row]);
  await assert.rejects(run(t, fakes({ mcp: [repo("a/one", { stars: 1800 })] }), { failObservations: true }), /수집 자료를 저장하지 못함/);
  assert.deepEqual(row.signals, { stars: 1500, other: 1 });
});

test("쪽 넘김: 100건이 꽉 차면 다음 쪽, 1,000건을 넘으면 본 것 중 가장 적은 별 수를 상한으로 새 질의. 시간 몫이 다하면 거기까지로 매기고 요약에 적는다", async () => {
  const pageOf = (q: SearchQuery): SearchPage => {
    const base = q.upper ?? 100_000;
    if (q.tag !== "mcp") return { total: 0, incomplete: false, items: [] };
    if (q.upper !== null && q.page === 1) return { total: 50, incomplete: false, items: [repo(`low/r${base}`, { stars: base })] };
    return { total: 1500, incomplete: false, items: Array.from({ length: 100 }, (_, i) => repo(`o${q.page}/r${i}`, { stars: base - q.page * 100 - i })) };
  };
  const f = fakes({}, { page: pageOf });
  await run(world(), f);
  const mcp = f.calls.filter((c) => c.tag === "mcp");
  assert.deepEqual(mcp.map((c) => `${c.upper ?? "-"}:${c.page}`), [...Array.from({ length: 10 }, (_, i) => `-:${i + 1}`), "98901:1"]);
  let clock = NOW;
  const slow = fakes({}, { page: pageOf, now: () => (clock += 3000) });
  const out = await run(world(), slow, {}, NOW + 10_000);
  assert.match(out.summary!, /시간 몫으로 다 못 읽은 태그: /);
});

const starsObs = (t: Tables) => t.observations.filter((o) => o.metric === "stars").length;

test("별 수의 주인은 하나: 저장소 정보 수집기(fetch_github)가 읽은 줄에는 별을 쓰지 않아, 두 수집기가 번갈아 돌아도 stars 수집 자료가 늘지 않는다(불변 3)", async () => {
  const row = tech("github:a/one", { repo_url: "https://github.com/a/one" });
  const t = world([row]);
  t.sources.push({ id: "s-gh", name: "github", enabled: true });
  const info: RepoInfo = { fullName: "a/one", isPrivate: false, archived: false, pushedAt: ago(2), stars: 2100, license: "MIT" };
  const gh = () => githubCollector({ fetchRepo: async () => info, token: () => TOKEN, sleep: async () => {}, now: () => NOW }).run({ db: fakeDb(t), runId: "run-gh", deadlineMs: Number.MAX_SAFE_INTEGER });
  await run(t, fakes({ mcp: [repo("a/one", { stars: 2000 })] })); // 아직 안 읽은 줄: 별 2000을 쓰고 처음 읽음 1개
  await gh(); // 저장소 API가 2100으로 이어받음
  const after = starsObs(t);
  for (let i = 0; i < 3; i++) {
    await run(t, fakes({ mcp: [repo("a/one", { stars: 2000 })] }));
    await gh();
  }
  assert.equal(starsObs(t), after);
  assert.equal(sig(row).stars, 2100);
  assert.equal(typeof sig(row).candidate_score, "number", "점수·의심 표시는 계속 갱신");
});

test("지난 의심 표시를 지운다: new_spike였던 줄이 30일 뒤 관문을 통과했는데 100위 밖이어도 candidate_flags가 []로 바뀐다(두께는 안 올림)", async () => {
  const t = world();
  await run(t, fakes({ mcp: [repo("young/tool", { createdAt: ago(3), stars: 1000 })] }));
  const spike = byKey(t, "github:young/tool")!;
  assert.deepEqual([spike.depth, sig(spike).candidate_flags], ["thin", ["new_spike"]]);
  const later = NOW + 40 * DAY;
  const bigger = Array.from({ length: 100 }, (_, i) => repo(`big/r${i}`, { stars: 50_000 + i, forks: 5000 }));
  await run(t, fakes({ mcp: [...bigger, repo("young/tool", { createdAt: ago(3), stars: 1000 })] }, { now: () => later }));
  assert.deepEqual([spike.depth, sig(spike).candidate_flags, typeof sig(spike).candidate_score], ["thin", [], "number"]);
  assert.equal(t.technologies.length, 101, "100위 밖은 새 줄을 만들지 않는다");
});

test("시간 몫이 시작 전에 이미 지났으면 0곳 성공이 아니라 수집 오류(불변 2)", async () => {
  const f = fakes({ mcp: [repo("a/b")] });
  await assert.rejects(run(world(), f, {}, NOW - 1), (e: unknown) => e instanceof CollectError && e.kind === "timeout");
  assert.equal(f.calls.length, 0);
});

test("저장 도중 던져도 거기까지의 normalize·compare 단계는 남기고 원래 오류를 던진다", async () => {
  const t = world();
  await assert.rejects(run(t, fakes({ mcp: [repo("a/one")] }), { failObservations: true }), /수집 자료를 저장하지 못함/);
  assert.deepEqual(t.run_steps.map((s) => s.step_name), ["normalize", "compare"]);
});

test("쓸 내용이 지금 줄과 같으면 쓰지 않는다. 묶음 시간이 다하면 저장을 멈추고 요약에 적는다(다음 실행이 이어 감)", async () => {
  const t = world();
  const input = () => fakes({ mcp: [repo("a/one"), repo("b/two"), repo("c/three")] });
  await run(t, input());
  const log: Log = {};
  await run(t, input(), log);
  assert.equal(log.updates ?? 0, 0);
  let clock = NOW;
  const out = await run(world(), fakes({ mcp: [repo("a/one"), repo("b/two"), repo("c/three")] }, { now: () => (clock += 1000) }), {}, NOW + 3500);
  assert.match(out.summary!, /시간이 모자라 \d+곳은 다 저장 못 함/);
});

test("clone_cluster ④ 우리 수집기가 전에 만든 github: 줄은 알려진 원본으로 치지 않고, 레지스트리·사용자 줄(github: 아님)만 원본으로 뺀다", async () => {
  const pairOf = () => fakes({ mcp: [repo("orig/tool", { createdAt: ago(900), stars: 2000 }), repo("copy/tool", { createdAt: ago(60), stars: 1990 })] });
  const ours = tech("github:orig/tool", { repo_url: "https://github.com/orig/tool", depth: "thick", thick_reasons: ["stars"], signals: { stars: 2000, candidate_flags: [] } });
  const t1 = world([ours]);
  await run(t1, pairOf());
  assert.deepEqual([sig(ours).candidate_flags, sig(byKey(t1, "github:copy/tool")).candidate_flags], [["clone_cluster"], ["clone_cluster"]]);
  const user = tech("npm:orig-tool", { repo_url: "https://github.com/orig/tool" });
  const t2 = world([user]);
  await run(t2, pairOf());
  assert.deepEqual([sig(user).candidate_flags, user.depth, sig(byKey(t2, "github:copy/tool")).candidate_flags], [[], "thick", ["clone_cluster"]]);
});

test("공식 레지스트리 줄과 합쳐지는 저장소는 신뢰 점수를 더 받는다(같은 저장소를 가리키는 github: 줄이 따로 있어도)", async () => {
  const reg = tech("npm:a-one", { repo_url: "https://github.com/a/one", signals: { registry_backfill: true } });
  const ours = tech("github:a/one", { repo_url: "https://github.com/a/one", signals: { stars: 2000, candidate_flags: [] } });
  const t = world([reg, ours]);
  await run(t, fakes({ mcp: [repo("a/one"), repo("b/two")] }));
  assert.ok((sig(ours).candidate_score as number) > (sig(byKey(t, "github:b/two")).candidate_score as number));
});
