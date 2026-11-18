import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegistryEntry, RegistryPage } from "../domain/registry.ts";
import { CollectError } from "./collect-fetch.ts";
import { registryCollector } from "./collect-registry.ts";
import type { RegistryQuery } from "./registry-fetch.ts";

type Row = Record<string, unknown>;
type Tables = { sources: Row[]; rule_lists: Row[]; technologies: Row[]; observations: Row[]; run_steps: Row[] };
const NOW1 = Date.parse("2026-11-19T21:00:00Z");
const NOW2 = Date.parse("2026-11-20T21:00:00Z");
const ISO = (ms: number) => new Date(ms).toISOString();
const clone = <T>(v: T): T => structuredClone(v);
type Log = { techUpdates: Row[]; failObservations?: boolean; inSizes?: number[] };

// 표를 실제로 들고 있는 가짜 클라이언트(upsert·여러 줄 insert·이어 붙인 eq·in). 기술 줄을 고친 내용은 log에 모은다
function fakeDb(tables: Tables, log: Log) {
  let ids = 0;
  return {
    from(table: keyof Tables) {
      const rows = tables[table];
      let found = rows;
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((found = found.filter((r) => r[c] === v)), q),
        in: (c: string, vs: unknown[]) => (table === "technologies" && log.inSizes?.push(vs.length), (found = found.filter((r) => vs.includes(r[c]))), q),
        single: () => Promise.resolve(found.length === 1 ? { data: clone(found[0]), error: null } : { data: null, error: { message: `줄 ${found.length}개` } }),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: clone(found), error: null }).then(res, rej),
        insert(row: Row | Row[]) {
          if (table === "observations" && log.failObservations) return Promise.resolve({ error: { message: "수집 자료 저장 실패" } });
          for (const r of Array.isArray(row) ? row : [row]) rows.push({ id: `${table}-${++ids}`, ...clone(r) });
          return Promise.resolve({ error: null });
        },
        upsert(list: Row[], opts: { onConflict: string; ignoreDuplicates: boolean }) {
          for (const r of list) if (!rows.some((x) => x[opts.onConflict] === r[opts.onConflict])) rows.push({ id: `${table}-${++ids}`, ...clone(r) });
          return Promise.resolve({ error: null });
        },
        update: (patch: Row) => ({
          eq: (c: string, v: unknown) => {
            rows.filter((r) => r[c] === v).forEach((r) => {
              if (table === "technologies") log.techUpdates.push({ id: r.id, ...clone(patch) });
              Object.assign(r, clone(patch));
            });
            return Promise.resolve({ error: null });
          },
        }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const sourceRow = (over: Row = {}): Row => ({ id: "s-reg", name: "mcp_registry", enabled: true, last_synced_at: null, sync_started_at: null, sync_cursor: null, ...over });
const world = (over: Partial<Tables> = {}): Tables => ({ sources: [sourceRow()], rule_lists: [], technologies: [], observations: [], run_steps: [], ...over });
const srv = (name: string, over: Partial<RegistryEntry> = {}): RegistryEntry => ({
  name, title: null, description: null, packages: [], repoUrl: null, status: "active", isLatest: true, ...over,
});
const pageOf = (entries: RegistryEntry[], nextCursor: string | null = null, invalid = 0): RegistryPage => ({ entries, invalid, nextCursor });
const tech = (key: string, over: Row = {}): Row => ({
  id: `T-${key}`, tech_key: key, display_name: key, type: "mcp", depth: "thin", thick_reasons: null, status: "active", one_liner: null, one_liner_source: null, repo_url: null, is_official: false, ...over,
});

// 쪽 흉내: 커서(없으면 "start")마다 줄 쪽 또는 던질 오류. 부른 내용을 모은다
function fakes(script: Record<string, RegistryPage | Error>, now = NOW1) {
  const calls: RegistryQuery[] = [];
  const sleeps: number[] = [];
  return {
    calls, sleeps,
    deps: {
      now: () => now,
      sleep: async (ms: number) => void sleeps.push(ms),
      fetchPage: async (q: RegistryQuery) => {
        calls.push({ ...q });
        const s = script[q.cursor ?? "start"];
        if (s === undefined) throw new CollectError("http_status", `쪽 없음 ${q.cursor}`, 404);
        if (s instanceof Error) throw s;
        return s;
      },
    },
  };
}
const run = (t: Tables, f: ReturnType<typeof fakes>, log: Log = { techUpdates: [] }, deadlineMs = Number.MAX_SAFE_INTEGER) =>
  registryCollector(f.deps).run({ db: fakeDb(t, log), runId: "run-1", deadlineMs });
const steps = (t: Tables) => t.run_steps.map((s) => `${s.step_name}:${s.count_in ?? "-"}>${s.count_out ?? "-"}`);
const source = (t: Tables) => t.sources[0];
const byKey = (t: Tables, key: string) => t.technologies.find((r) => r.tech_key === key)!;

test("출처 이름은 흐름 상자 fetch_registry", () => {
  assert.equal(registryCollector().source, "fetch_registry");
});

test("처음 전체 읽기: 최신 서버만 얇은 줄로 저장(키 규칙·상태·한 줄 설명과 출처 링크), 공식 조직은 두껍게, 끝까지 읽고 나서 지난번 시각을 적는다", async () => {
  const t = world({ rule_lists: [{ kind: "official_org", value: "io.github.OpenAI", enabled: true }, { kind: "official_org", value: "io.github.DisabledOrg", enabled: false }] });
  const f = fakes({
    start: pageOf([
      srv("io.x/remote", { description: "원격 서버", repoUrl: "https://github.com/x/remote" }),
      srv("io.x/remote", { description: "옛 버전 설명", isLatest: false }), // 옛 버전은 뺀다
      srv("io.x/pkg", { packages: [{ registryType: "npm", identifier: "@x/Pkg" }] }),
      srv("io.github.openai/codex"),
      srv("io.github.disabledorg/x"), // 꺼 둔 공식 조직은 공식이 아니다
    ], "c1"),
    c1: pageOf([srv("io.x/py", { packages: [{ registryType: "pypi", identifier: "Py_Pkg" }] }), srv("io.x/old", { status: "deprecated" }), srv("io.x/gone", { status: "deleted" })]),
  });
  const out = await run(t, f);
  // 처음 보는 중단(deprecated)·삭제(deleted) 서버는 들이지 않는다(데이터설계 8절 관문 1 "빼는 것")
  assert.deepEqual(t.technologies.map((r) => [r.tech_key, r.depth, r.status]).sort(), [
    ["mcp:io.github.disabledorg/x", "thin", "active"], ["mcp:io.github.openai/codex", "thick", "active"], ["mcp:io.x/remote", "thin", "active"], ["npm:@x/pkg", "thin", "active"], ["pypi:py-pkg", "thin", "active"],
  ]);
  assert.match(String(t.run_steps.find((s) => s.step_name === "compare")!.output_summary), /새 5개, 고침 0개\(상태 바뀜 0개\), 그대로 0개, 들이지 않음 2개/);
  const remote = byKey(t, "mcp:io.x/remote");
  assert.deepEqual([remote.one_liner, remote.one_liner_source, remote.repo_url, remote.type], ["원격 서버", "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.x%2Fremote", "https://github.com/x/remote", "mcp"]);
  assert.deepEqual([byKey(t, "mcp:io.github.openai/codex").thick_reasons, byKey(t, "mcp:io.github.openai/codex").is_official], [["official"], true]);
  assert.deepEqual(f.calls, [{ since: null, cursor: null }, { since: null, cursor: "c1" }]);
  assert.deepEqual(f.sleeps, [1000]); // 쪽 사이에서만 쉰다
  assert.deepEqual([source(t).last_synced_at, source(t).sync_started_at, source(t).sync_cursor], [ISO(NOW1), null, null]);
  assert.deepEqual([out.items, steps(t)], [7, ["normalize:7>7", "compare:7>0"]]);
  assert.equal(t.observations.length, 0); // 새 서버의 기록은 기술 줄의 만든 시각이다
});

test("다음에는 지난번 시각(조금 앞)부터 바뀐 것만 읽고, 같은 걸 다시 읽어도 아무것도 쓰지 않는다(불변 3). 지난번 시각은 새로 올라간다", async () => {
  const t = world();
  const first = fakes({ start: pageOf([srv("io.x/a", { description: "설명" }), srv("io.x/b", { description: "둘째" })]) }, NOW1);
  await run(t, first);
  const log: Log = { techUpdates: [] };
  const second = fakes({ start: pageOf([srv("io.x/a", { description: "설명" }), srv("io.x/b", { description: "둘째" })]) }, NOW2);
  const out = await run(t, second, log);
  assert.deepEqual(second.calls, [{ since: "2026-11-19T20:55:00.000Z", cursor: null }]); // 지난번 시각 21:00 − 5분
  assert.deepEqual([t.technologies.length, log.techUpdates.length, t.observations.length], [2, 0, 0]);
  assert.equal(source(t).last_synced_at, ISO(NOW2));
  assert.match(String(t.run_steps.filter((s) => s.step_name === "compare").at(-1)!.output_summary), /새 0개, 고침 0개\(상태 바뀜 0개\), 그대로 2개/);
  assert.equal(out.items, 2);
});

test("사용자가 쓰는 두꺼운 줄은 덮어쓰지 않는다: 비어 있는 설명·링크·저장소만 채우고 두께·이유·종류는 그대로", async () => {
  const t = world({ technologies: [tech("npm:@x/pkg", { depth: "thick", thick_reasons: ["used"], type: "sdk", display_name: "내 이름" })] });
  await run(t, fakes({ start: pageOf([srv("io.x/pkg", { packages: [{ registryType: "npm", identifier: "@x/pkg" }], description: "새 설명", repoUrl: "https://github.com/x/pkg", title: "다른 이름" })]) }));
  const row = byKey(t, "npm:@x/pkg");
  assert.deepEqual([row.depth, row.thick_reasons, row.type, row.display_name], ["thick", ["used"], "sdk", "내 이름"]);
  assert.deepEqual([row.one_liner, row.repo_url], ["새 설명", "https://github.com/x/pkg"]);
  assert.equal(t.technologies.length, 1); // 같은 기술이 한 줄로 합쳐진다(ADR 0019)
});

test("상태가 바뀌면 줄을 고치고 수집 자료(status, 이전 → 현재)를 남긴다. 다른 출처가 정한 dormant는 active로 덮지 않는다", async () => {
  const t = world({ technologies: [tech("mcp:io.x/a"), tech("mcp:io.x/b", { status: "dormant" }), tech("mcp:io.x/c", { status: "gone" })] });
  await run(t, fakes({ start: pageOf([srv("io.x/a", { status: "deprecated" }), srv("io.x/b"), srv("io.x/c")]) }));
  assert.deepEqual([byKey(t, "mcp:io.x/a").status, byKey(t, "mcp:io.x/b").status, byKey(t, "mcp:io.x/c").status], ["deprecated", "dormant", "active"]);
  assert.deepEqual(t.observations.map((o) => [o.tech_id, o.metric, o.prev_value, o.curr_value, o.change_size, o.run_id, o.source_id]).sort(), [
    ["T-mcp:io.x/a", "status", { status: "active" }, { status: "deprecated" }, "active → deprecated", "run-1", "s-reg"],
    ["T-mcp:io.x/c", "status", { status: "gone" }, { status: "active" }, "gone → active", "run-1", "s-reg"],
  ]);
  assert.match(String(t.run_steps.find((s) => s.step_name === "compare")!.output_summary), /고침 2개\(상태 바뀜 2개\)/);
});

test("처음 보는 중단·삭제 서버는 들이지 않고, 이미 줄이 있으면 그 상태만 고친다(들였다가 중단된 서버의 상태 변화는 놓치지 않음)", async () => {
  const t = world({ technologies: [tech("mcp:io.x/known")] });
  await run(t, fakes({ start: pageOf([srv("io.x/known", { status: "deleted" }), srv("io.x/new-deprecated", { status: "deprecated" }), srv("io.x/new-deleted", { status: "deleted" })]) }));
  assert.deepEqual(t.technologies.map((r) => [r.tech_key, r.status]), [["mcp:io.x/known", "gone"]]);
});

test("이미 있던 얇은 줄이 공식 조직이면 두껍게 올린다(이유 official)", async () => {
  const t = world({ rule_lists: [{ kind: "official_org", value: "io.github.openai", enabled: true }], technologies: [tech("mcp:io.github.openai/x")] });
  await run(t, fakes({ start: pageOf([srv("io.github.openai/x")]) }));
  assert.deepEqual([byKey(t, "mcp:io.github.openai/x").depth, byKey(t, "mcp:io.github.openai/x").thick_reasons, byKey(t, "mcp:io.github.openai/x").is_official], ["thick", ["official"], true]);
});

test("같은 기술 키를 가리키는 서버가 여럿이면 기술 줄은 하나(먼저 나온 서버)", async () => {
  const t = world();
  const same = { packages: [{ registryType: "npm", identifier: "shared-pkg" }] };
  await run(t, fakes({ start: pageOf([srv("io.x/first", { ...same, description: "첫째" }), srv("io.y/second", { ...same, description: "둘째" })]) }));
  assert.deepEqual(t.technologies.map((r) => [r.tech_key, r.one_liner]), [["npm:shared-pkg", "첫째"]]);
});

test("같은 키를 가리키는 서버 중 중단된 것이 먼저 나와도 쓰는 중인(active) 서버가 이긴다 — 안 그러면 active 서버는 줄이 안 생기고 바뀐 것만 읽을 때도 다시 안 읽힌다", async () => {
  const t = world();
  const same = { packages: [{ registryType: "npm" as const, identifier: "shared-pkg" }] };
  await run(t, fakes({ start: pageOf([srv("a.dead/x", { ...same, status: "deprecated", description: "중단" }), srv("b.live/y", { ...same, description: "쓰는 중" })]) }));
  assert.deepEqual(t.technologies.map((r) => [r.tech_key, r.status, r.one_liner]), [["npm:shared-pkg", "active", "쓰는 중"]]);
});

test("상태를 고친 뒤 수집 자료 저장이 실패하면 상태를 원래대로 되돌리고 던진다 — 다음 실행이 같은 변경과 기록을 다시 한다(안 되돌리면 기록이 영영 안 남는다, 불변 3·4)", async () => {
  const t = world({ technologies: [tech("mcp:io.x/a")] });
  const log: Log = { techUpdates: [], failObservations: true };
  await assert.rejects(() => run(t, fakes({ start: pageOf([srv("io.x/a", { status: "deprecated" })], "c1"), c1: pageOf([]) }), log), /수집 자료를 저장하지 못함/);
  assert.deepEqual([byKey(t, "mcp:io.x/a").status, t.observations.length, source(t).sync_cursor], ["active", 0, null]); // 쪽을 못 끝냈으니 읽은 자리도 안 올라간다
  await run(t, fakes({ start: pageOf([srv("io.x/a", { status: "deprecated" })]) })); // 다음 실행
  assert.deepEqual([byKey(t, "mcp:io.x/a").status, t.observations.length], ["deprecated", 1]);
});

test("한 쪽 100건이 넘는 키 조회는 40개씩 나눠 읽는다(스코프 패키지 키는 주소가 길어진다). 85개를 새로 저장", async () => {
  const t = world();
  const log: Log = { techUpdates: [], inSizes: [] };
  await run(t, fakes({ start: pageOf(Array.from({ length: 85 }, (_, i) => srv(`io.x/s${i}`))) }), log);
  assert.deepEqual([log.inSizes, t.technologies.length], [[40, 40, 5], 85]);
});

test("지난번 시각이 있는 채로 읽던 중이면: 같은 시작 시각·커서에서 이어 읽되 바뀐 것만(지난번 시각 − 5분). DB가 주는 +00:00 시각도 읽고, 끝나면 이어 읽던 시작 시각을 지난번 시각으로 올린다", async () => {
  const t = world({ sources: [sourceRow({ last_synced_at: "2026-11-18T21:00:00+00:00", sync_started_at: "2026-11-19T20:00:00+00:00", sync_cursor: "c1" })] });
  const f = fakes({ c1: pageOf([srv("io.x/b")]) }, NOW2);
  await run(t, f);
  assert.deepEqual(f.calls, [{ since: "2026-11-18T20:55:00.000Z", cursor: "c1" }]);
  assert.deepEqual([Date.parse(String(source(t).last_synced_at)), source(t).sync_started_at, source(t).sync_cursor], [Date.parse("2026-11-19T20:00:00Z"), null, null]);
});

test("시간 한도로 멈추면 읽은 자리를 남기고 지난번 시각은 올리지 않는다. 다음 실행은 같은 시작 시각·커서에서 이어 읽고, 끝나면 처음 시작 시각을 지난번 시각으로 적는다", async () => {
  const t = world();
  let clock = NOW1;
  const f = fakes({ start: pageOf([srv("io.x/a")], "c1"), c1: pageOf([srv("io.x/b")]) }, NOW1);
  const slow = { ...f.deps, now: () => clock, fetchPage: async (q: RegistryQuery) => ((clock += 100_000), f.deps.fetchPage(q)) };
  const out1 = await registryCollector(slow).run({ db: fakeDb(t, { techUpdates: [] }), runId: "run-1", deadlineMs: Number.MAX_SAFE_INTEGER });
  assert.deepEqual([source(t).last_synced_at, source(t).sync_started_at, source(t).sync_cursor, t.technologies.length], [null, ISO(NOW1), "c1", 1]);
  assert.match(String(out1.summary), /이어 읽음/);
  const g = fakes({ start: pageOf([srv("io.x/a")], "c1"), c1: pageOf([srv("io.x/b")]) }, NOW2);
  const out2 = await run(t, g);
  assert.deepEqual(g.calls, [{ since: null, cursor: "c1" }]); // 처음 쪽부터 다시 읽지 않는다
  assert.deepEqual([source(t).last_synced_at, source(t).sync_started_at, source(t).sync_cursor, t.technologies.length], [ISO(NOW1), null, null, 2]);
  assert.doesNotMatch(String(out2.summary), /이어 읽음/);
});

test("쪽 읽기가 실패하면 수집 오류로 던진다: 앞서 읽은 쪽은 저장돼 있고 읽은 자리가 남으며, 지난번 시각은 올리지 않고 단계 줄은 남긴다", async () => {
  const t = world();
  const f = fakes({ start: pageOf([srv("io.x/a")], "c1"), c1: new CollectError("network", "c1: 연결 끊김") });
  await assert.rejects(() => run(t, f), (e) => e instanceof CollectError && e.kind === "network");
  assert.deepEqual([t.technologies.length, source(t).last_synced_at, source(t).sync_cursor, source(t).sync_started_at], [1, null, "c1", ISO(NOW1)]);
  assert.deepEqual(steps(t), ["normalize:1>1", "compare:1>0"]);
});

test("첫 쪽부터 실패하면 단계 줄 없이 던진다(읽은 것이 없다)", async () => {
  const t = world();
  await assert.rejects(() => run(t, fakes({ start: new CollectError("rate_limited", "429", 429) })), (e) => e instanceof CollectError && e.kind === "rate_limited");
  assert.deepEqual([t.run_steps, source(t).sync_cursor, t.technologies.length], [[], null, 0]);
});

test("모양이 이상해 읽지 못한 항목은 세어서 collect_error 줄과 요약에 남기고, 나머지는 저장한다", async () => {
  const t = world();
  const out = await run(t, fakes({ start: pageOf([srv("io.x/a")], null, 2) }));
  const err = t.run_steps.find((s) => s.step_name === "collect_error")!;
  assert.deepEqual([err.count_in, err.error_kind, t.technologies.length], [2, "parse", 1]);
  assert.match(String(out.summary), /읽지 못한 항목 2개/);
});

test("수집 오류가 아닌 오류(코드 버그)는 삼키지 않고 그대로 던진다. 읽은 자리는 건드리지 않는다", async () => {
  const t = world();
  await assert.rejects(() => run(t, fakes({ start: new TypeError("버그") })), TypeError);
  assert.deepEqual([source(t).last_synced_at, source(t).sync_cursor], [null, null]);
});

test("다음 쪽 커서가 그대로면 끝나지 않는 것을 막는다(parse 오류)", async () => {
  const t = world();
  await assert.rejects(() => run(t, fakes({ start: pageOf([srv("io.x/a")], "c1"), c1: pageOf([srv("io.x/b")], "c1") })), (e) => e instanceof CollectError && e.kind === "parse" && /그대로/.test(e.message));
});

test("관리자가 출처를 껐으면 아무것도 읽지 않고 이유를 요약에 적는다", async () => {
  const t = world({ sources: [sourceRow({ enabled: false })] });
  const f = fakes({});
  const out = await run(t, f);
  assert.deepEqual([out.items, f.calls, t.run_steps], [0, [], []]);
  assert.match(String(out.summary), /꺼져/);
});
