import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RepoInfo, RepoRef } from "../domain/github-repo.ts";
import { CollectError } from "./collect-fetch.ts";
import { githubCollector } from "./collect-github.ts";

type Row = Record<string, unknown>;
type Tables = { sources: Row[]; technologies: Row[]; observations: Row[]; run_steps: Row[] };
type Log = { failObservations?: boolean };
const NOW = Date.parse("2026-11-19T21:00:00Z");
const ISO = new Date(NOW).toISOString();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const clone = <T>(v: T): T => structuredClone(v);
const TOKEN = "ghp_TESTTOKENTESTTOKENTESTTOKEN0123456789";

// 표를 실제로 들고 있는 가짜 클라이언트(이어 붙인 eq·order·range, 줄 하나 읽기, 고치기, 여러 줄 insert)
function fakeDb(tables: Tables, log: Log = {}) {
  let ids = 0;
  return {
    from(table: keyof Tables) {
      const rows = tables[table];
      let found = rows;
      let window: [number, number] | null = null;
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((found = found.filter((r) => r[c] === v)), q),
        order: (c: string) => ((found = [...found].sort((a, b) => String(a[c]).localeCompare(String(b[c])))), q),
        range: (a: number, b: number) => ((window = [a, b]), q),
        single: () => Promise.resolve(found.length === 1 ? { data: clone(found[0]), error: null } : { data: null, error: { message: `줄 ${found.length}개` } }),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: clone(window ? found.slice(window[0], window[1] + 1) : found), error: null }).then(res, rej),
        insert(row: Row | Row[]) {
          if (table === "observations" && log.failObservations) return Promise.resolve({ error: { message: "수집 자료 저장 실패" } });
          for (const r of Array.isArray(row) ? row : [row]) rows.push({ id: `${table}-${++ids}`, ...clone(r) });
          return Promise.resolve({ error: null });
        },
        update: (patch: Row) => ({
          eq: (c: string, v: unknown) => {
            rows.filter((r) => r[c] === v).forEach((r) => Object.assign(r, clone(patch)));
            return Promise.resolve({ error: null });
          },
        }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const tech = (key: string, over: Row = {}): Row => ({
  id: `T-${key}`, tech_key: key, repo_url: null, depth: "thick", is_simulated: false, status: "active", status_by: null, missed_count: 0,
  license: null, last_activity_at: null, last_activity_kind: null, last_checked_ok_at: null, signals: null, ...over,
});
const world = (technologies: Row[] = [], over: Partial<Tables> = {}): Tables => ({ sources: [{ id: "s-gh", name: "github", enabled: true }], technologies, observations: [], run_steps: [], ...over });
const info = (over: Partial<RepoInfo> = {}): RepoInfo => ({ fullName: "o/r", isPrivate: false, archived: false, pushedAt: ago(3), stars: 10, license: "MIT", ...over });
const byKey = (t: Tables, key: string) => t.technologies.find((r) => r.tech_key === key)!;
const sigOf = (t: Tables, key: string) => (byKey(t, key).signals ?? {}) as Record<string, unknown>;
const steps = (t: Tables) => t.run_steps.map((s) => `${s.step_name}:${s.count_in ?? "-"}>${s.count_out ?? "-"}`);
const metrics = (t: Tables) => t.observations.map((o) => o.metric).sort();
const stateOf = (t: Tables, key: string) => [byKey(t, key).status, byKey(t, key).status_by, byKey(t, key).missed_count];

// 저장소 흉내: "소유자/저장소" → 정보 또는 null(404) 또는 던질 오류. 부른 내용과 쉰 시간을 모은다
function fakes(script: Record<string, RepoInfo | null | Error>, opts: { token?: string | undefined; now?: () => number; onCall?: (ref: RepoRef) => void } = {}) {
  const calls: { ref: string; token: string }[] = [];
  const sleeps: number[] = [];
  return {
    calls, sleeps,
    deps: {
      now: opts.now ?? (() => NOW),
      sleep: async (ms: number) => void sleeps.push(ms),
      token: () => ("token" in opts ? opts.token : TOKEN),
      fetchRepo: async (ref: RepoRef, token: string) => {
        const name = `${ref.owner}/${ref.repo}`;
        calls.push({ ref: name, token });
        opts.onCall?.(ref);
        const s = script[name];
        if (s === undefined) throw new CollectError("http_status", `주소 없음 ${name}`, 500);
        if (s instanceof Error) throw s;
        return s;
      },
    },
  };
}
const run = (t: Tables, f: ReturnType<typeof fakes>, log: Log = {}, deadlineMs = Number.MAX_SAFE_INTEGER) => githubCollector(f.deps).run({ db: fakeDb(t, log), runId: "run-1", deadlineMs });
const at = (hours: number) => ({ now: () => NOW + hours * HOUR });

test("출처 이름은 흐름 상자 fetch_github", () => {
  assert.equal(githubCollector().source, "fetch_github");
});

test("두꺼운 기술 중 GitHub 저장소가 있는 것만 읽는다: github: 키·repo_url이 GitHub인 기술. 얇은 줄·시뮬레이터·저장소 없는 기술·다른 호스트는 안 읽음. 토큰을 넘기고 요청 사이에서만 쉰다", async () => {
  const t = world([
    tech("github:acme/a"), tech("npm:b", { repo_url: "https://github.com/acme/b" }), tech("mcp:c"), tech("npm:d", { repo_url: "https://gitlab.com/x/d" }),
    tech("github:acme/thin", { depth: "thin" }), tech("github:acme/sim", { is_simulated: true }),
  ]);
  const f = fakes({ "acme/a": info(), "acme/b": info() });
  const out = await run(t, f);
  assert.deepEqual(f.calls.map((c) => [c.ref, c.token]).sort(), [["acme/a", TOKEN], ["acme/b", TOKEN]]);
  assert.deepEqual(f.sleeps, [1000]);
  assert.equal(out.items, 2);
  assert.deepEqual(steps(t), ["normalize:2>2", "compare:2>0"]);
});

test("같은 저장소를 가리키는 기술(모노레포의 패키지들)은 저장소를 한 번만 읽고 모두에 적용한다 — 대소문자가 달라도 같은 저장소. 시간 몫을 한 저장소가 다 쓰지 않는다", async () => {
  const t = world([
    tech("npm:@acme/one", { repo_url: "https://github.com/Acme/Mono" }), tech("npm:@acme/two", { repo_url: "https://github.com/acme/mono.git" }),
    tech("github:acme/mono"), tech("github:acme/other"),
  ]);
  const f = fakes({ "Acme/Mono": info({ stars: 77 }), "acme/mono": info({ stars: 77 }), "acme/other": info({ stars: 5 }) });
  const out = await run(t, f);
  assert.equal(f.calls.length, 2); // 모노레포 한 번 + other 한 번
  assert.deepEqual(f.sleeps, [1000]);
  assert.deepEqual(["npm:@acme/one", "npm:@acme/two", "github:acme/mono"].map((k) => sigOf(t, k).stars), [77, 77, 77]);
  assert.equal(out.items, 4);
});

test("읽은 값 저장: 라이선스·마지막 푸시(종류 commit)·별·확인 성공 시각. 처음 읽는 값은 수집 자료(activity·stars·license)로 남고 상태는 그대로면 status는 없다", async () => {
  const t = world([tech("github:acme/a")]);
  await run(t, fakes({ "acme/a": info({ pushedAt: ago(3), stars: 10, license: "MIT" }) }));
  const row = byKey(t, "github:acme/a");
  assert.deepEqual([row.license, row.last_activity_at, row.last_activity_kind, row.status, row.missed_count, row.last_checked_ok_at], ["MIT", ago(3), "commit", "active", 0, ISO]);
  const sig = sigOf(t, "github:acme/a");
  assert.deepEqual([sig.stars, sig.github_found_repo, sig.github_checked_at, sig.github_tried_at, "github_error" in sig], [10, "acme/a", ISO, ISO, false]);
  assert.deepEqual(metrics(t), ["activity", "license", "stars"]);
  assert.deepEqual(t.observations.map((o) => [o.metric, o.prev_value, o.curr_value, o.run_id, o.source_id, o.is_simulated]).sort(), [
    ["activity", null, { last_activity_at: ago(3) }, "run-1", "s-gh", false],
    ["license", null, { license: "MIT" }, "run-1", "s-gh", false],
    ["stars", null, { stars: 10 }, "run-1", "s-gh", false],
  ]);
});

test("같은 값을 다시 읽어도 수집 자료가 늘지 않는다(불변 3). 바뀐 칸만 수집 자료가 된다", async () => {
  const t = world([tech("github:acme/a")]);
  await run(t, fakes({ "acme/a": info() }));
  const out2 = await run(t, fakes({ "acme/a": info() }));
  assert.equal(t.observations.length, 3);
  assert.match(String(out2.summary), /바뀐 것 0개/);
  await run(t, fakes({ "acme/a": info({ stars: 15 }) }));
  assert.deepEqual(t.observations.slice(3).map((o) => [o.metric, o.change_size]), [["stars", "별 10 → 15"]]);
  await run(t, fakes({ "acme/a": info({ stars: 15, pushedAt: ago(1), license: "none" }) }));
  assert.deepEqual(t.observations.slice(4).map((o) => o.metric).sort(), ["activity", "license"]);
});

test("마지막 활동은 이미 적힌 시각보다 같거나 새로운 푸시일 때만 바꾼다 — 나중에 릴리스 수집이 더 새로운 시각을 적어도 옛 푸시 날짜가 덮지 않고 수집 자료도 안 늘어난다", async () => {
  const t = world([tech("github:acme/a", { last_activity_at: ago(1), last_activity_kind: "release" })]);
  await run(t, fakes({ "acme/a": info({ pushedAt: ago(5) }) }));
  const row = byKey(t, "github:acme/a");
  assert.deepEqual([row.last_activity_at, row.last_activity_kind, metrics(t).includes("activity")], [ago(1), "release", false]);
});

test("보관된 저장소는 중단(deprecated, 정한 출처 github:deprecated)이고 수집 자료(status)를 남긴다. 보관이 풀리면 우리가 정한 것이라 활동 중으로 되돌리고 정한 출처를 비운다", async () => {
  const t = world([tech("github:acme/a")]);
  await run(t, fakes({ "acme/a": info({ archived: true }) }));
  assert.deepEqual(stateOf(t, "github:acme/a"), ["deprecated", "github:deprecated", 0]);
  assert.ok(t.observations.some((o) => o.metric === "status" && o.change_size === "active → deprecated"));
  await run(t, fakes({ "acme/a": info({ archived: false }) }));
  assert.deepEqual(stateOf(t, "github:acme/a"), ["active", null, 0]);
  assert.ok(t.observations.some((o) => o.metric === "status" && o.change_size === "deprecated → active"));
});

test("12개월 넘게 푸시가 없으면 쉬는 중(dormant), 다시 푸시가 생기면 되돌린다", async () => {
  const t = world([tech("github:acme/a")]);
  await run(t, fakes({ "acme/a": info({ pushedAt: ago(400) }) }));
  assert.deepEqual(stateOf(t, "github:acme/a"), ["dormant", "github:dormant", 0]);
  await run(t, fakes({ "acme/a": info({ pushedAt: ago(2) }) }));
  assert.deepEqual(stateOf(t, "github:acme/a"), ["active", null, 0]);
});

test("우리가 정한 게 아닌 중단·사라짐은 건드리지 않는다 — 레지스트리가 정한 값(정한 출처 표시가 없거나 다름)이든, 우리가 쓴 뒤 다른 쪽이 status만 고친 값이든. 수집 자료(status)도 안 남는다(ADR 0021)", async () => {
  const t = world([
    tech("github:acme/a", { status: "deprecated" }), tech("github:acme/b", { status: "gone", status_by: "mcp_registry:gone" }),
    tech("github:acme/c", { status: "deprecated", status_by: "github:dormant" }), tech("github:acme/d", { status: "dormant" }),
  ]);
  await run(t, fakes({ "acme/a": info(), "acme/b": info(), "acme/c": info({ pushedAt: ago(500) }), "acme/d": info({ archived: true }) }));
  assert.deepEqual(["a", "b", "c", "d"].map((n) => stateOf(t, `github:acme/${n}`).slice(0, 2)), [["deprecated", null], ["gone", "mcp_registry:gone"], ["deprecated", "github:dormant"], ["dormant", null]]);
  assert.equal(metrics(t).filter((m) => m === "status").length, 0);
  assert.equal(byKey(t, "github:acme/a").license, "MIT"); // 라이선스·별 같은 칸은 채운다
});

test("404는 첫 번째에는 못 찾은 횟수와 첫 시각만 적고 상태·수집 자료는 그대로. 12시간 안의 두 번째는 사라짐으로 정하지 않고, 12시간이 지난 두 번째 연속 404에서 출처에서 사라짐(gone). 다시 찾으면 되돌린다", async () => {
  const t = world([tech("github:acme/a", { signals: { github_found_repo: "acme/a" } })]);
  const out1 = await run(t, fakes({ "acme/a": null }));
  assert.deepEqual([stateOf(t, "github:acme/a"), sigOf(t, "github:acme/a").github_missed_at, t.observations.length], [["active", null, 1], ISO, 0]);
  assert.match(String(out1.summary), /못 찾음 1개/);
  await run(t, fakes({ "acme/a": null }, at(1))); // 한 시간 뒤(지금 한 번 실행을 또 누름)
  assert.deepEqual(stateOf(t, "github:acme/a"), ["active", null, 2]);
  await run(t, fakes({ "acme/a": null }, at(13)));
  assert.deepEqual(stateOf(t, "github:acme/a"), ["gone", "github:gone", 3]);
  assert.deepEqual(t.observations.map((o) => [o.metric, o.change_size]), [["status", "active → gone"]]);
  await run(t, fakes({ "acme/a": info() }, at(40)));
  assert.deepEqual(stateOf(t, "github:acme/a"), ["active", null, 0]);
  assert.equal("github_missed_at" in sigOf(t, "github:acme/a"), false); // 다시 찾으면 못 찾음 기록을 비운다
});

test("한 번도 찾은 적 없는 저장소(잘못 적은 repo_url)는 404가 몇 번 이어져도 사라짐으로 정하지 않는다 — 횟수만 올라가고 상태·수집 자료는 그대로", async () => {
  const t = world([tech("npm:x", { repo_url: "https://github.com/orgs/acme" }), tech("github:acme/never")]);
  for (const h of [0, 30, 60, 90]) await run(t, fakes({ "orgs/acme": null, "acme/never": null }, at(h)));
  assert.deepEqual([stateOf(t, "npm:x"), stateOf(t, "github:acme/never"), t.observations.length], [["active", null, 4], ["active", null, 4], 0]);
});

test("읽기 실패(수집 오류)는 404 연속 세기를 올리지도 끊지도 않는다 — 성공한 읽기에서만 센다: 404, 실패, 12시간 뒤 404는 두 번 연속", async () => {
  const t = world([tech("github:acme/a", { signals: { github_found_repo: "acme/a" } })]);
  await run(t, fakes({ "acme/a": null }));
  await assert.rejects(() => run(t, fakes({ "acme/a": new CollectError("network", "끊김") }, at(2))), CollectError); // 하나뿐인 기술이 실패하면 읽은 것이 없어 수집기가 실패
  assert.deepEqual(stateOf(t, "github:acme/a"), ["active", null, 1]);
  await run(t, fakes({ "acme/a": null }, at(13)));
  assert.deepEqual(stateOf(t, "github:acme/a"), ["gone", "github:gone", 2]);
});

test("레지스트리가 정한 중단이 있는 기술은 404가 두 번 이어져도 사라짐으로 덮지 않는다(횟수만). 다시 찾아도 그 값은 그대로", async () => {
  const t = world([tech("github:acme/a", { status: "deprecated", status_by: "mcp_registry:deprecated", signals: { github_found_repo: "acme/a" } })]);
  await run(t, fakes({ "acme/a": null }));
  await run(t, fakes({ "acme/a": null }, at(13)));
  assert.deepEqual(stateOf(t, "github:acme/a"), ["deprecated", "mcp_registry:deprecated", 2]);
  await run(t, fakes({ "acme/a": info() }, at(30)));
  assert.deepEqual(stateOf(t, "github:acme/a"), ["deprecated", "mcp_registry:deprecated", 0]);
});

test("비공개 저장소는 공용 카탈로그에 정보를 넣지 않는다: 못 찾음과 같게 본다(라이선스·별을 저장하지 않음)", async () => {
  const t = world([tech("github:acme/a")]);
  await run(t, fakes({ "acme/a": info({ isPrivate: true, stars: 99, license: "MIT" }) }));
  const row = byKey(t, "github:acme/a");
  assert.deepEqual([row.license, row.missed_count, sigOf(t, "github:acme/a").stars, t.observations.length], [null, 1, undefined, 0]);
});

test("한 기술의 수집 오류는 그 기술만: 이전 값·상태는 그대로 두고 읽어 본 시각과 오류 종류만 남기며(signals.github_error), 다른 기술은 저장한다. collect_error 줄이 남는다(불변 2·4)", async () => {
  const t = world([tech("github:acme/ok"), tech("github:acme/bad", { license: "MIT", last_activity_at: ago(9), signals: { stars: 5 } })]);
  const out = await run(t, fakes({ "acme/ok": info(), "acme/bad": new CollectError("timeout", "시간 초과") }));
  const bad = byKey(t, "github:acme/bad");
  assert.deepEqual([bad.license, bad.last_activity_at, bad.status, sigOf(t, "github:acme/bad").stars, sigOf(t, "github:acme/bad").github_error], ["MIT", ago(9), "active", 5, "timeout"]);
  assert.equal(byKey(t, "github:acme/ok").license, "MIT");
  const err = t.run_steps.find((s) => s.step_name === "collect_error")!;
  assert.deepEqual([err.count_in, err.error_kind], [1, "timeout"]);
  assert.match(String(out.summary), /수집 오류 1개/);
  await run(t, fakes({ "acme/ok": info(), "acme/bad": info({ stars: 6 }) })); // 다음에 성공하면 오류 표시가 지워진다
  assert.equal("github_error" in sigOf(t, "github:acme/bad"), false);
});

test("같은 저장소를 가리키는 기술이 여럿인데 읽기가 실패하면 그 기술마다 수집 오류가 남는다", async () => {
  const t = world([tech("github:acme/mono"), tech("npm:@acme/pkg", { repo_url: "https://github.com/acme/mono" }), tech("github:acme/fine")]);
  await run(t, fakes({ "acme/mono": new CollectError("timeout", "시간 초과"), "acme/fine": info() }));
  assert.deepEqual(["github:acme/mono", "npm:@acme/pkg"].map((k) => sigOf(t, k).github_error), ["timeout", "timeout"]);
  assert.equal(t.run_steps.find((s) => s.step_name === "collect_error")!.count_in, 2);
});

test("한도 초과가 나면 이번 실행에서 더 부르지 않는다. 못 읽은 것은 다음 실행으로 넘긴다", async () => {
  const t = world([tech("github:acme/a"), tech("github:acme/b"), tech("github:acme/c")]);
  const f = fakes({ "acme/a": info(), "acme/b": new CollectError("rate_limited", "429", 429), "acme/c": info() });
  const out = await run(t, f);
  assert.deepEqual(f.calls.map((c) => c.ref), ["acme/a", "acme/b"]);
  assert.match(String(out.summary), /1개는 다음 실행으로/);
  assert.equal(sigOf(t, "github:acme/b").github_error, "rate_limited");
});

test("토큰이 거절되면(401) 더 불러 봐야 같다: 이번 실행은 거기서 멈춘다. 첫 호출부터 거절이면 읽은 것이 없어 수집기가 실패한다", async () => {
  const keys = ["github:acme/a", "github:acme/b", "github:acme/c"];
  const t = world(keys.map((k) => tech(k)));
  const f = fakes({ "acme/a": new CollectError("http_status", "401", 401), "acme/b": info(), "acme/c": info() });
  await assert.rejects(() => run(t, f), (e) => e instanceof CollectError && e.httpStatus === 401);
  assert.deepEqual(f.calls.map((c) => c.ref), ["acme/a"]);
  assert.equal(sigOf(t, "github:acme/b").github_tried_at, undefined); // 부르지 않은 기술은 건드리지 않는다
  const g = fakes({ "acme/a": info(), "acme/b": new CollectError("http_status", "401", 401), "acme/c": info() }); // 중간에 거절돼도 거기서 멈추고, 앞서 읽은 것은 남는다
  const out = await run(world(keys.map((k) => tech(k))), g);
  assert.deepEqual(g.calls.map((c) => c.ref), ["acme/a", "acme/b"]);
  assert.match(String(out.summary), /1개는 다음 실행으로/);
});

test("읽은 것이 하나도 없고 실패만 있으면 수집기가 실패한다(runBatch가 수집 오류·재시도·3번 연속 강조로 기록)", async () => {
  const t = world([tech("github:acme/a"), tech("github:acme/b")]);
  await assert.rejects(() => run(t, fakes({ "acme/a": new CollectError("network", "끊김"), "acme/b": new CollectError("network", "끊김") })), (e) => e instanceof CollectError && e.kind === "network" && /network 2/.test(e.message));
  assert.deepEqual(steps(t), []); // 던질 때는 collect_error를 runBatch가 남긴다
});

test("서버 토큰이 없거나 모양이 이상하면 호출하지 않고 수집 오류로 멈춘다 — 환경변수 이름을 알려 주되 값은 문구에 넣지 않는다", async () => {
  for (const token of [undefined, "", "   "]) {
    const f = fakes({ "acme/a": info() }, { token });
    await assert.rejects(() => run(world([tech("github:acme/a")]), f), (e) => e instanceof CollectError && e.kind === "http_status" && /GITHUB_TOKEN이 없어/.test(e.message));
    assert.equal(f.calls.length, 0);
  }
  for (const token of [`${TOKEN}\nextra: header`, `"${TOKEN}"`, "ghp_short", `${TOKEN} ${TOKEN}`, `${TOKEN}\0`]) {
    const f = fakes({ "acme/a": info() }, { token });
    await assert.rejects(() => run(world([tech("github:acme/a")]), f), (e) => e instanceof CollectError && /모양이 이상/.test(e.message) && !e.message.includes("ghp_") && !e.message.includes("extra"));
    assert.equal(f.calls.length, 0);
  }
});

test("토큰 앞뒤 공백·줄바꿈(.env에 붙여 넣을 때 흔함)은 다듬어서 쓴다", async () => {
  const f = fakes({ "acme/a": info() }, { token: `  ${TOKEN}\n` });
  await run(world([tech("github:acme/a")]), f);
  assert.deepEqual(f.calls.map((c) => c.token), [TOKEN]);
});

test("읽은 값·기록 어디에도 토큰이 들어가지 않는다", async () => {
  const t = world([tech("github:acme/a"), tech("github:acme/b")]);
  await run(t, fakes({ "acme/a": info(), "acme/b": new CollectError("network", "연결 끊김") }));
  assert.ok(!JSON.stringify(t).includes(TOKEN));
});

test("관리자가 출처를 껐으면 토큰이 없어도 아무것도 읽지 않고 이유를 요약에 적는다", async () => {
  const t = world([tech("github:acme/a")], { sources: [{ id: "s-gh", name: "github", enabled: false }] });
  const f = fakes({ "acme/a": info() }, { token: undefined });
  const out = await run(t, f);
  assert.deepEqual([out.items, f.calls.length, t.run_steps.length], [0, 0, 0]);
  assert.match(String(out.summary), /꺼져/);
});

test("읽을 기술이 없으면 토큰이 있어도 0개 읽고 끝난다(단계 줄 없음)", async () => {
  const t = world([tech("mcp:x"), tech("github:acme/thin", { depth: "thin" })]);
  const out = await run(t, fakes({}));
  assert.deepEqual([out.items, t.run_steps.length], [0, 0]);
});

test("오래 안 읽어 본 기술부터 읽고(안 읽은 것 먼저), 시간 한도에서 멈추면 나머지는 다음 실행으로 넘긴다", async () => {
  let clock = NOW;
  const t = world([
    tech("github:acme/new"), tech("github:acme/old", { signals: { github_checked_at: ago(5), github_tried_at: ago(5) } }), tech("github:acme/mid", { signals: { github_tried_at: ago(2) } }),
  ]);
  const f = fakes({ "acme/new": info(), "acme/old": info(), "acme/mid": info() }, { now: () => clock, onCall: () => void (clock += 40_000) });
  const out = await run(t, f);
  assert.deepEqual(f.calls.map((c) => c.ref), ["acme/new", "acme/old"]); // 안 읽은 것 → 오래된 것, 60초 몫이 끝나 mid는 다음 실행
  assert.match(String(out.summary), /1개는 다음 실행으로/);
});

test("고친 값을 쓴 뒤 수집 자료 저장이 실패하면 고친 값을 원래대로 되돌리고 던진다 — 다음 실행이 같은 변경과 기록을 다시 한다(불변 3·4). 이 기술은 읽어 본 시각만 적어 뒤로 보낸다(맨 앞에서 매번 멈춰 뒤가 굶지 않게)", async () => {
  const t = world([tech("github:acme/a", { license: "GPL-3.0", last_activity_at: ago(9), signals: { stars: 5 } })]);
  await assert.rejects(() => run(t, fakes({ "acme/a": info({ stars: 8, license: "MIT" }) }), { failObservations: true }), /수집 자료를 저장하지 못함/);
  const row = byKey(t, "github:acme/a");
  assert.deepEqual([row.license, row.last_activity_at, row.status, row.last_checked_ok_at, sigOf(t, "github:acme/a").stars, sigOf(t, "github:acme/a").github_tried_at], ["GPL-3.0", ago(9), "active", null, 5, ISO]);
  assert.equal(t.observations.length, 0);
  await run(t, fakes({ "acme/a": info({ stars: 8, license: "MIT" }) }));
  assert.deepEqual([byKey(t, "github:acme/a").license, metrics(t)], ["MIT", ["activity", "license", "stars"]]);
});

test("저장 실패로 멈춰도 거기까지 읽은 것은 실행 기록(normalize·compare)에 남고 원래 오류가 그대로 던져진다", async () => {
  const t = world([tech("github:acme/a"), tech("github:acme/b")]);
  let n = 0; // 첫 기술은 저장되고 둘째 기술의 수집 자료 저장이 실패
  const f = fakes({ "acme/a": info(), "acme/b": info() });
  await assert.rejects(() => run(t, f, { get failObservations() { return ++n > 1; } } as Log), /수집 자료를 저장하지 못함/);
  assert.deepEqual(steps(t), ["normalize:1>1", "compare:1>0"]);
});

test("수집 오류가 아닌 오류(코드 버그)는 삼키지 않고 그대로 던진다", async () => {
  const t = world([tech("github:acme/a")]);
  await assert.rejects(() => run(t, fakes({ "acme/a": new TypeError("버그") })), TypeError);
});

test("줄은 쓰기 직전에 다시 읽는다: 읽는 동안 다른 수집기가 정한 상태를 시작 때의 옛 값으로 덮어쓰지 않는다", async () => {
  const t = world([tech("github:acme/a")]);
  const f = fakes({ "acme/a": info({ archived: true }) }, { onCall: () => Object.assign(byKey(t, "github:acme/a"), { status: "deprecated", status_by: "mcp_registry:deprecated" }) });
  await run(t, f);
  assert.deepEqual(stateOf(t, "github:acme/a").slice(0, 2), ["deprecated", "mcp_registry:deprecated"]);
});

test("푸시가 한 번도 없는 빈 저장소는 마지막 활동을 지우지 않고 쉬는 중으로도 단정하지 않는다", async () => {
  const t = world([tech("github:acme/a", { last_activity_at: ago(9), last_activity_kind: "commit" })]);
  await run(t, fakes({ "acme/a": info({ pushedAt: null }) }));
  const row = byKey(t, "github:acme/a");
  assert.deepEqual([row.last_activity_at, row.status, metrics(t).includes("activity")], [ago(9), "active", false]);
});

test("'찾은 적'은 지금 읽는 저장소 기준이다 — 주소를 고쳐 다른 저장소를 가리키게 된 줄은 옛 저장소를 찾은 적으로 사라짐(gone)이 되지 않는다. 찾으면 새 저장소를 기억한다", async () => {
  const t = world([tech("npm:x", { repo_url: "https://github.com/acme/b", signals: { github_found_repo: "acme/a" } })]);
  await run(t, fakes({ "acme/b": null }));
  await run(t, fakes({ "acme/b": null }, at(13)));
  await run(t, fakes({ "acme/b": null }, at(40)));
  assert.deepEqual(stateOf(t, "npm:x"), ["active", null, 3]);
  await run(t, fakes({ "acme/b": info() }, at(60)));
  assert.equal(sigOf(t, "npm:x").github_found_repo, "acme/b");
  await run(t, fakes({ "acme/b": null }, at(61)));
  await run(t, fakes({ "acme/b": null }, at(75))); // 이제 b를 찾은 적이 있으므로 12시간 뒤 두 번째 연속 404는 사라짐
  assert.deepEqual(stateOf(t, "npm:x"), ["gone", "github:gone", 2]);
});

test("저장소가 바뀐 줄은 옛 저장소의 마지막 활동 시각을 지키지 않고 읽은 푸시로 바꾼다. 같은 저장소면 더 새로운 시각을 지킨다", async () => {
  const t = world([
    tech("github:acme/b", { last_activity_at: ago(1), last_activity_kind: "commit", signals: { github_found_repo: "acme/a" } }),
    tech("github:acme/c", { last_activity_at: ago(1), last_activity_kind: "release", signals: { github_found_repo: "acme/c" } }),
    tech("github:acme/d", { last_activity_at: ago(30), last_activity_kind: "commit", signals: { github_found_repo: "acme/x" } }), // 저장소가 바뀌었지만 시각이 같다
  ]);
  await run(t, fakes({ "acme/b": info({ pushedAt: ago(30) }), "acme/c": info({ pushedAt: ago(30) }), "acme/d": info({ pushedAt: ago(30) }) }));
  assert.deepEqual(["b", "c"].map((n) => [byKey(t, `github:acme/${n}`).last_activity_at, byKey(t, `github:acme/${n}`).last_activity_kind]), [[ago(30), "commit"], [ago(1), "release"]]);
  assert.equal(t.observations.some((o) => o.tech_id === "T-github:acme/d" && o.metric === "activity"), false); // 시각이 같으면 수집 자료를 남기지 않는다
});

test("한 번도 찾은 적 없는 저장소는 '정보를 확인한 시각'을 올리지 않는다 — 읽은 적 없는 정보가 방금 확인한 것처럼 보이지 않게. 읽어 본 시각(순서용)과 못 찾은 횟수만 적는다. 찾은 적 있는 저장소의 404는 올린다", async () => {
  const t = world([tech("github:acme/never"), tech("github:acme/known", { signals: { github_found_repo: "acme/known" } }), tech("github:acme/priv")]);
  await run(t, fakes({ "acme/never": null, "acme/known": null, "acme/priv": info({ isPrivate: true }) }));
  const never = byKey(t, "github:acme/never");
  assert.deepEqual([never.last_checked_ok_at, sigOf(t, "github:acme/never").github_checked_at, sigOf(t, "github:acme/never").github_tried_at, never.missed_count], [null, undefined, ISO, 1]);
  assert.equal(byKey(t, "github:acme/priv").last_checked_ok_at, null); // 비공개도 읽은 적 없는 정보
  assert.deepEqual([byKey(t, "github:acme/known").last_checked_ok_at, sigOf(t, "github:acme/known").github_checked_at], [ISO, ISO]);
});

test("상태는 줄에 적힌 활동과 읽은 푸시 중 더 새로운 쪽으로 정한다 — 줄에 최근 활동이 있는데 '쉬는 중'으로 적히지 않는다. 같은 시각이면 활동 종류(릴리스)를 푸시로 덮지 않는다", async () => {
  const t = world([
    tech("github:acme/a", { last_activity_at: ago(1), last_activity_kind: "release", signals: { github_found_repo: "acme/a" } }),
    tech("github:acme/b", { last_activity_at: ago(3), last_activity_kind: "release", signals: { github_found_repo: "acme/b" } }),
  ]);
  await run(t, fakes({ "acme/a": info({ pushedAt: ago(400) }), "acme/b": info({ pushedAt: ago(3) }) }));
  assert.deepEqual(stateOf(t, "github:acme/a"), ["active", null, 0]);
  assert.deepEqual(["a", "b"].map((n) => byKey(t, `github:acme/${n}`).last_activity_kind), ["release", "release"]);
  assert.equal(metrics(t).includes("activity"), false);
});

test("활동 중인 줄에 남은 낡은 정한 출처 표시는 읽을 때 비운다(다른 쪽이 status만 active로 고친 뒤). 그 뒤 다른 쪽이 dormant를 정해도 우리가 정한 것으로 읽혀 되돌려지지 않는다", async () => {
  const t = world([tech("github:acme/a", { status: "active", status_by: "github:dormant" })]);
  await run(t, fakes({ "acme/a": info() }));
  assert.deepEqual(stateOf(t, "github:acme/a"), ["active", null, 0]);
  Object.assign(byKey(t, "github:acme/a"), { status: "dormant" }); // 레지스트리·관리자가 status만 고침
  await run(t, fakes({ "acme/a": info() }));
  assert.deepEqual(stateOf(t, "github:acme/a"), ["dormant", null, 0]);
});

test("한도 머리글이 없는 403(2차 한도·정지된 토큰·권한 없는 토큰)이 서로 다른 저장소에서 연달아 2번 나오면 이번 실행을 멈춘다. 사이에 한 번이라도 답을 받으면(404 포함) 다시 센다", async () => {
  const forbidden = () => new CollectError("http_status", "403", 403);
  const keys = ["a", "b", "c", "d", "e"].map((n) => `github:acme/${n}`);
  const t = world(keys.map((k) => tech(k)));
  const f = fakes({ "acme/a": info(), "acme/b": forbidden(), "acme/c": forbidden(), "acme/d": info(), "acme/e": info() });
  const out = await run(t, f);
  assert.deepEqual(f.calls.map((c) => c.ref), ["acme/a", "acme/b", "acme/c"]);
  assert.match(String(out.summary), /2개는 다음 실행으로/);
  const six = [...keys, "github:acme/f"];
  const g = fakes({ "acme/a": forbidden(), "acme/b": null, "acme/c": forbidden(), "acme/d": new CollectError("timeout", "시간 초과"), "acme/e": forbidden(), "acme/f": info() }); // 403, 404, 403, 다른 실패, 403: 사이에 끊겨 연달아가 아니다
  await run(world(six.map((k) => tech(k))), g);
  assert.deepEqual(g.calls.map((c) => c.ref), ["acme/a", "acme/b", "acme/c", "acme/d", "acme/e", "acme/f"]);
});
