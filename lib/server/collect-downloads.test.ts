import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CollectError } from "./collect-fetch.ts";
import { downloadsCollector } from "./collect-downloads.ts";

type Row = Record<string, unknown>;
type Tables = { technologies: Row[]; sources: Row[]; observations: Row[]; run_steps: Row[] };
type Fail = { observationAt?: number; update?: boolean }; // observationAt: 몇 번째 수집 자료 쓰기가 실패하나(1부터)
const NOW = Date.parse("2026-11-19T21:00:00Z");
const NOW_ISO = new Date(NOW).toISOString();
const OLD = "2026-11-18T21:00:00.000Z";
const clone = <T>(v: T): T => structuredClone(v);

// 표를 실제로 들고 있는 가짜 클라이언트. 읽기는 줄의 복사본을 돌려준다(읽은 뒤 바뀐 것을 시험에서 볼 수 있게)
function fakeDb(tables: Tables, fail: Fail = {}) {
  let observationInserts = 0;
  return {
    from(table: keyof Tables) {
      const rows = tables[table];
      let found = rows;
      let page: [number, number] | null = null;
      const q = {
        select: () => q,
        order: () => q,
        range: (from: number, to: number) => ((page = [from, to]), q),
        eq: (c: string, v: unknown) => ((found = found.filter((r) => r[c] === v)), q),
        in: (c: string, vs: unknown[]) => ((found = found.filter((r) => vs.includes(r[c]))), q),
        single: () => Promise.resolve(found.length === 1 ? { data: clone(found[0]), error: null } : { data: null, error: { message: `줄 ${found.length}개` } }),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve({ data: clone(page ? found.slice(page[0], page[1] + 1) : found), error: null }).then(res, rej),
        insert(row: Row) {
          if (table === "observations" && ++observationInserts === fail.observationAt) return Promise.resolve({ error: { message: "쓰기 거부" } });
          rows.push(row);
          return Promise.resolve({ error: null });
        },
        update: (patch: Row) => ({
          eq: (c: string, v: unknown) => {
            if (fail.update) return Promise.resolve({ error: { message: "쓰기 거부" } });
            rows.filter((r) => r[c] === v).forEach((r) => Object.assign(r, clone(patch)));
            return Promise.resolve({ error: null });
          },
        }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const tech = (id: string, key: string, over: Row = {}): Row => ({ id, tech_key: key, depth: "thick", is_simulated: false, signals: null, ...over });
const sources = (over: Row[] = []): Row[] => [
  { id: "s-npm", name: "npm_downloads", enabled: true },
  { id: "s-pypi", name: "pypi_downloads", enabled: true },
  ...over,
];
const world = (technologies: Row[], over: Partial<Tables> = {}): Tables => ({ technologies, sources: sources(), observations: [], run_steps: [], ...over });
type Ref = { ecosystem: string; name: string };

// 읽기 흉내: 값이 숫자면 그 값을, Error면 던진다(없으면 404). 부른 순서와 쉰 시간도 모은다
function fakes(values: Record<string, number | Error>) {
  const asked: string[] = [];
  const sleeps: number[] = [];
  return {
    asked,
    sleeps,
    deps: {
      now: () => NOW,
      sleep: async (ms: number) => void sleeps.push(ms),
      fetchWeekly: async (ref: Ref) => {
        const key = `${ref.ecosystem}:${ref.name}`;
        asked.push(key);
        const v = values[key];
        if (v === undefined) throw new CollectError("http_status", `${key}: 404`, 404);
        if (v instanceof Error) throw v;
        return v;
      },
    },
  };
}
const run = (tables: Tables, f: ReturnType<typeof fakes>, deadlineMs = Number.MAX_SAFE_INTEGER, fail: Fail = {}) =>
  downloadsCollector(f.deps).run({ db: fakeDb(tables, fail), runId: "run-1", deadlineMs });
const steps = (t: Tables) => t.run_steps.map((s) => `${s.step_name}:${s.count_in ?? "-"}>${s.count_out ?? "-"}`);
const signalsOf = (t: Tables) => t.technologies.map((r) => r.signals);

test("출처 이름은 흐름 상자 fetch_downloads", () => {
  assert.equal(downloadsCollector().source, "fetch_downloads");
});

test("처음 읽음: 주간 다운로드를 signals에 넣고, 수집 자료를 출처별로 남기고, normalize·compare 줄을 남긴다", async () => {
  const t = world([tech("t1", "npm:zod"), tech("t2", "pypi:anthropic")]);
  const out = await run(t, fakes({ "npm:zod": 1200, "pypi:anthropic": 50 }));
  assert.equal(out.items, 2);
  assert.deepEqual(signalsOf(t), [
    { weekly_downloads: 1200, downloads_checked_at: NOW_ISO, downloads_tried_at: NOW_ISO },
    { weekly_downloads: 50, downloads_checked_at: NOW_ISO, downloads_tried_at: NOW_ISO },
  ]);
  assert.deepEqual(
    t.observations.map((o) => [o.source_id, o.tech_id, o.metric, o.prev_value, o.curr_value, o.change_size, o.run_id, o.observed_at, o.is_simulated]),
    [
      ["s-npm", "t1", "downloads", null, { weekly_downloads: 1200 }, "처음 읽음: 주간 1,200회", "run-1", NOW_ISO, false],
      ["s-pypi", "t2", "downloads", null, { weekly_downloads: 50 }, "처음 읽음: 주간 50회", "run-1", NOW_ISO, false],
    ],
  );
  assert.deepEqual(steps(t), ["normalize:2>2", "compare:2>0"]); // 나가는 건수 0: 등급 계산으로 넘어가지 않아 compare→grade 화살표에 안 섞인다
  assert.match(String(t.run_steps.find((s) => s.step_name === "compare")!.output_summary), /바뀐 값 2개/); // 바뀐 개수는 요약에
});

test("같은 값을 다시 읽으면 수집 자료가 늘지 않는다(불변 3). 확인 시각만 새로 적고 지난 오류 흔적은 지운다", async () => {
  const t = world([tech("t1", "npm:zod", { signals: { weekly_downloads: 1200, downloads_checked_at: OLD, downloads_tried_at: OLD, downloads_error: "network" } })]);
  await run(t, fakes({ "npm:zod": 1200 }));
  assert.equal(t.observations.length, 0);
  assert.deepEqual(signalsOf(t), [{ weekly_downloads: 1200, downloads_checked_at: NOW_ISO, downloads_tried_at: NOW_ISO }]);
  assert.deepEqual(steps(t), ["normalize:1>1", "compare:1>0"]);
});

test("값이 바뀌면 이전 값 → 현재 값과 바뀐 폭을 남기고, 다른 신호는 그대로 둔다", async () => {
  const t = world([tech("t1", "npm:zod", { signals: { weekly_downloads: 1000, stars: 7 } })]);
  await run(t, fakes({ "npm:zod": 1123 }));
  assert.deepEqual(signalsOf(t), [{ weekly_downloads: 1123, stars: 7, downloads_checked_at: NOW_ISO, downloads_tried_at: NOW_ISO }]);
  assert.deepEqual([t.observations[0].prev_value, t.observations[0].curr_value, t.observations[0].change_size], [{ weekly_downloads: 1000 }, { weekly_downloads: 1123 }, "주간 다운로드 +12.3%"]);
});

test("쓰기 직전에 신호를 다시 읽는다: 읽는 동안 다른 쪽이 쓴 신호를 옛 복사본으로 덮어쓰지 않는다", async () => {
  const t = world([tech("t1", "npm:zod", { signals: { weekly_downloads: 1 } })]);
  const f = fakes({});
  const deps = { ...f.deps, fetchWeekly: async () => ((t.technologies[0].signals = { weekly_downloads: 1, stars: 9 }), 5) }; // 요청 중에 다른 수집기가 별을 씀
  await downloadsCollector(deps).run({ db: fakeDb(t), runId: "run-1", deadlineMs: Number.MAX_SAFE_INTEGER });
  assert.deepEqual(signalsOf(t), [{ weekly_downloads: 5, stars: 9, downloads_checked_at: NOW_ISO, downloads_tried_at: NOW_ISO }]);
});

test("signals가 배열·문자처럼 객체가 아니면 빈 값으로 보고 새로 쓴다", async () => {
  const t = world([tech("t1", "npm:a", { signals: [1, 2] }), tech("t2", "npm:b", { signals: "x" })]);
  await run(t, fakes({ "npm:a": 3, "npm:b": 4 }));
  assert.deepEqual(signalsOf(t).map((s) => (s as Row).weekly_downloads), [3, 4]);
});

test("읽을 기술만 고른다: 얇은 기술·시뮬레이터·다른 종류·꺼진 출처는 요청하지 않는다", async () => {
  const t = world(
    [tech("t1", "npm:zod"), tech("t2", "npm:thin", { depth: "thin" }), tech("t3", "npm:fake", { is_simulated: true }), tech("t4", "mcp:io.x/y"), tech("t5", "github:o/r"), tech("t6", "pypi:requests")],
    { sources: [{ id: "s-npm", name: "npm_downloads", enabled: true }, { id: "s-pypi", name: "pypi_downloads", enabled: false }] },
  );
  const f = fakes({ "npm:zod": 5, "pypi:requests": 9 });
  const out = await run(t, f);
  assert.deepEqual(f.asked, ["npm:zod"]);
  assert.equal(out.items, 1);
});

test("두 출처가 모두 꺼져 있으면 아무것도 읽지 않고 이유를 요약에 적는다", async () => {
  const t = world([tech("t1", "npm:zod")], { sources: [{ id: "s-npm", name: "npm_downloads", enabled: false }, { id: "s-pypi", name: "pypi_downloads", enabled: false }] });
  const f = fakes({ "npm:zod": 5 });
  const out = await run(t, f);
  assert.deepEqual([out.items, f.asked, t.run_steps], [0, [], []]);
  assert.match(String(out.summary), /모두 꺼져/);
});

test("1000줄이 넘어도 쪽을 나눠 읽어 npm·pypi 기술을 놓치지 않는다", async () => {
  const others = Array.from({ length: 1100 }, (_, i) => tech(`o${i}`, `mcp:io.x/s${i}`));
  const t = world([...others, tech("n1", "npm:late-a"), tech("n2", "pypi:late-b")]);
  const f = fakes({ "npm:late-a": 1, "pypi:late-b": 2 });
  const out = await run(t, f);
  assert.deepEqual([out.items, f.asked.sort()], [2, ["npm:late-a", "pypi:late-b"]]);
});

test("주소에 쓸 수 없는 이름은 요청하지 않고(쉬지도 않고) 수집 오류(parse)로 세며, 시도 시각과 오류 종류를 신호에 남긴다", async () => {
  const t = world([tech("t1", "npm:a?b"), tech("t2", "npm:ok1"), tech("t3", "npm:ok2")]);
  const f = fakes({ "npm:ok1": 1, "npm:ok2": 2 });
  const out = await run(t, f);
  assert.deepEqual(f.asked, ["npm:ok1", "npm:ok2"]);
  assert.equal(f.sleeps.length, 1); // 요청을 한 기술 사이에서만 쉰다
  assert.equal(out.items, 2);
  assert.deepEqual(signalsOf(t)[0], { downloads_tried_at: NOW_ISO, downloads_error: "parse" });
  const err = t.run_steps.find((s) => s.step_name === "collect_error")!;
  assert.deepEqual([err.count_in, err.error_kind], [1, "parse"]);
});

test("일부 실패: 그 기술의 이전 값·확인 시각은 그대로(불변 4)이고 시도 시각·오류 종류만 적힌다. 수집 자료는 안 남고 collect_error 줄에 건수가 남는다", async () => {
  const before = { weekly_downloads: 300, downloads_checked_at: OLD, downloads_tried_at: OLD };
  const t = world([tech("t1", "npm:gone", { signals: { ...before } }), tech("t2", "npm:ok")]);
  const out = await run(t, fakes({ "npm:gone": new CollectError("rate_limited", "npm:gone: 429", 429), "npm:ok": 40 }));
  assert.equal(out.items, 1);
  assert.deepEqual(signalsOf(t)[0], { ...before, downloads_tried_at: NOW_ISO, downloads_error: "rate_limited" });
  assert.deepEqual(t.observations.map((o) => o.tech_id), ["t2"]);
  const err = t.run_steps.find((s) => s.step_name === "collect_error")!;
  assert.deepEqual([err.count_in, err.error_kind], [1, "rate_limited"]);
  assert.match(String(err.output_summary), /npm:gone/);
  assert.deepEqual(steps(t).filter((s) => !s.startsWith("collect_error")), ["normalize:1>1", "compare:1>0"]);
});

test("전부 실패하면 수집 오류로 던지고(0으로 읽지 않음) 수집 자료·단계 줄은 남기지 않는다. 신호에는 시도 흔적만", async () => {
  const t = world([tech("t1", "npm:a"), tech("t2", "pypi:b")]);
  await assert.rejects(
    () => run(t, fakes({ "npm:a": new CollectError("network", "npm:a: down"), "pypi:b": new CollectError("timeout", "pypi:b: slow") })),
    (e) => e instanceof CollectError && e.kind === "network" && /읽지 못했어요/.test(e.message),
  );
  assert.deepEqual([t.observations.length, t.run_steps.length], [0, 0]);
  assert.deepEqual(signalsOf(t), [{ downloads_tried_at: NOW_ISO, downloads_error: "network" }, { downloads_tried_at: NOW_ISO, downloads_error: "timeout" }]);
});

test("한쪽 출처가 통째로 실패하면 던진다(3번 연속 강조·재시도가 보게). 읽은 쪽은 저장하고 단계 줄을 남기며, 한도 초과 뒤에는 그 출처를 더 부르지 않는다", async () => {
  const t = world([tech("t1", "npm:ok"), tech("t2", "pypi:a"), tech("t3", "pypi:b")]);
  const f = fakes({ "npm:ok": 5, "pypi:a": new CollectError("rate_limited", "pypi:a: 429", 429), "pypi:b": 3 });
  await assert.rejects(() => run(t, f), (e) => e instanceof CollectError && e.kind === "rate_limited" && /pypi_downloads/.test(e.message));
  assert.deepEqual(f.asked, ["npm:ok", "pypi:a"]); // pypi:b는 요청하지 않음
  assert.deepEqual(t.observations.map((o) => o.tech_id), ["t1"]);
  assert.deepEqual(steps(t), ["normalize:1>1", "compare:1>0"]); // collect_error는 runBatch가 남긴다
  assert.equal((signalsOf(t)[2] as Row | null), null); // 건너뛴 기술은 건드리지 않음
});

test("요청 사이 1초 이상 쉬고(첫 요청 앞은 안 쉼), 오래 안 시도한 것부터 읽는다", async () => {
  const t = world([
    tech("t1", "npm:recent", { signals: { weekly_downloads: 1, downloads_tried_at: "2026-11-18T00:00:00.000Z" } }),
    tech("t2", "npm:never"),
    tech("t3", "npm:old", { signals: { weekly_downloads: 1, downloads_checked_at: "2026-11-10T00:00:00.000Z" } }),
  ]);
  const f = fakes({ "npm:recent": 1, "npm:never": 1, "npm:old": 1 });
  await run(t, f);
  assert.deepEqual(f.asked, ["npm:never", "npm:old", "npm:recent"]);
  assert.equal(f.sleeps.length, 2);
  assert.ok(f.sleeps.every((ms) => ms >= 1000));
});

test("계속 실패하는 기술도 시도 시각이 적혀 다음 실행에서는 뒤로 간다: 정상 기술이 시간 한도에 굶지 않는다", async () => {
  const t = world([tech("t1", "npm:broken"), tech("t2", "npm:healthy")]);
  let clock = 0;
  const f = fakes({ "npm:healthy": 7 });
  const deps = { ...f.deps, now: () => clock, fetchWeekly: async (ref: Ref) => ((clock += 100_000), f.deps.fetchWeekly(ref)) };
  const go = (deadlineMs: number) => downloadsCollector(deps).run({ db: fakeDb(t), runId: "run-1", deadlineMs });
  await assert.rejects(() => go(50_000), CollectError); // 1회차: 시간 한도로 broken 하나만 시도하고 실패
  assert.deepEqual(f.asked, ["npm:broken"]);
  await go(Number.MAX_SAFE_INTEGER); // 2회차: 아직 시도 안 한 healthy가 먼저
  assert.deepEqual(f.asked, ["npm:broken", "npm:healthy", "npm:broken"]);
});

test("시간 한도(deadline)에 닿으면 남은 기술은 다음 실행으로 넘기고 요약에 적는다", async () => {
  const t = world([tech("t1", "npm:a"), tech("t2", "npm:b"), tech("t3", "npm:c")]);
  let clock = 0;
  const f = fakes({ "npm:a": 1, "npm:b": 1, "npm:c": 1 });
  const slow = { ...f.deps, now: () => clock, fetchWeekly: async (ref: Ref) => ((clock += 100_000), f.deps.fetchWeekly(ref)) };
  const out = await downloadsCollector(slow).run({ db: fakeDb(t), runId: "run-1", deadlineMs: 150_000 });
  assert.deepEqual(f.asked, ["npm:a", "npm:b"]);
  assert.equal(out.items, 2);
  assert.match(String(out.summary), /1개는 다음 실행/);
});

test("수집 자료를 못 쓰면 신호를 원래 값으로 되돌리고 던진다(다음 실행이 깨끗하게 다시 함, 불변 3·4)", async () => {
  const t = world([tech("t1", "npm:zod", { signals: { weekly_downloads: 1 } })]);
  await assert.rejects(() => run(t, fakes({ "npm:zod": 2 }), undefined, { observationAt: 1 }), /수집 자료를 저장하지 못함/);
  assert.deepEqual(signalsOf(t), [{ weekly_downloads: 1 }]);
  assert.equal(t.observations.length, 0);
});

test("신호를 못 쓰면 던지고 수집 자료는 남기지 않는다", async () => {
  const t = world([tech("t1", "npm:zod")]);
  await assert.rejects(() => run(t, fakes({ "npm:zod": 2 }), undefined, { update: true }), /인기 신호를 저장하지 못함/);
  assert.equal(t.observations.length, 0);
});

test("저장 실패로 멈춰도 거기까지 저장한 것은 normalize·compare 줄로 실행 기록에 남는다(기록과 DB가 어긋나지 않게)", async () => {
  const t = world([tech("t1", "npm:a"), tech("t2", "npm:b")]);
  await assert.rejects(() => run(t, fakes({ "npm:a": 1, "npm:b": 2 }), undefined, { observationAt: 2 }), /수집 자료를 저장하지 못함/);
  assert.deepEqual(t.observations.map((o) => o.tech_id), ["t1"]);
  assert.deepEqual(steps(t), ["normalize:1>1", "compare:1>0"]);
});

test("수집 오류가 아닌 오류(코드 버그)는 parse로 바꿔 삼키지 않고 그대로 던진다", async () => {
  const t = world([tech("t1", "npm:a")]);
  await assert.rejects(() => run(t, fakes({ "npm:a": new TypeError("버그") })), TypeError);
  assert.deepEqual([signalsOf(t), t.run_steps], [[null], []]);
});

test("읽을 기술이 없으면 0건으로 끝나고 가짜 단계 줄을 남기지 않는다", async () => {
  const t = world([tech("t1", "mcp:io.x/y")]);
  const out = await run(t, fakes({}));
  assert.equal(out.items, 0);
  assert.deepEqual(t.run_steps, []);
});
