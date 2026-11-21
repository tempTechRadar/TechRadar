import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OsvVuln } from "../domain/grade.ts";
import type { NewChange } from "./changes.ts";
import { CollectError } from "./collect-fetch.ts";
import { osvCollector } from "./collect-osv.ts";

type Row = Record<string, unknown>;
type Tables = { my_technologies: Row[]; sources: Row[]; observations: Row[]; changes: Row[]; run_steps: Row[] };
type Fail = { grade?: boolean; observation?: boolean; mark?: boolean };
const NOW = Date.parse("2026-11-19T21:00:00Z");
const NOW_ISO = new Date(NOW).toISOString();
const clone = <T>(v: T): T => structuredClone(v);
const get = (row: Row, path: string) => path.split(".").reduce<unknown>((v, k) => (v as Row | null | undefined)?.[k], row);

// 표를 실제로 들고 있는 가짜 클라이언트: 안쪽 표 조건(technologies.depth 같은)·정렬·쪽 나누기·이어 붙인 update를 따라 한다
function fakeDb(tables: Tables, fail: Fail = {}) {
  let ids = 0;
  return {
    from(table: keyof Tables) {
      const rows = tables[table];
      let found = rows;
      let order: [string, boolean] | null = null;
      let page: [number, number] | null = null;
      let max: number | null = null;
      const list = () => {
        const sorted = order ? [...found].sort((a, b) => (Number(get(a, order![0])) - Number(get(b, order![0]))) * (order![1] ? 1 : -1) || String(get(a, order![0])).localeCompare(String(get(b, order![0])))) : found;
        const paged = page ? sorted.slice(page[0], page[1] + 1) : sorted;
        return clone(max === null ? paged : paged.slice(0, max));
      };
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((found = found.filter((r) => get(r, c) === v)), q),
        in: (c: string, vs: unknown[]) => ((found = found.filter((r) => vs.includes(get(r, c)))), q),
        is: (c: string, v: unknown) => ((found = found.filter((r) => (get(r, c) ?? null) === v)), q),
        order: (c: string, o?: { ascending?: boolean }) => ((order = [c, o?.ascending ?? true]), q),
        range: (a: number, b: number) => ((page = [a, b]), q),
        limit: (n: number) => ((max = n), q),
        single: () => Promise.resolve(list().length === 1 ? { data: list()[0], error: null } : { data: null, error: { message: `줄 ${list().length}개` } }),
        maybeSingle: () => Promise.resolve({ data: list()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: list(), error: null }).then(res, rej),
        insert(row: Row) {
          if (table === "observations" && fail.observation) {
            return Object.assign(Promise.resolve({ error: { message: "쓰기 거부" } }), { select: () => ({ single: () => Promise.resolve({ data: null, error: { message: "쓰기 거부" } }) }) });
          }
          const id = `${table}-${++ids}`;
          rows.push({ id, ...clone(row) });
          return Object.assign(Promise.resolve({ error: null }), { select: () => ({ single: () => Promise.resolve({ data: { id }, error: null }) }) });
        },
        update(patch: Row) {
          let match = rows;
          const u = {
            eq: (c: string, v: unknown) => ((match = match.filter((r) => get(r, c) === v)), u),
            is: (c: string, v: unknown) => ((match = match.filter((r) => (get(r, c) ?? null) === v)), u),
            then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
              const refused = (fail.grade && "grade" in patch) || (fail.mark && typeof patch.collect_error_kind === "string");
              if (refused) return Promise.resolve({ error: { message: "쓰기 거부" } }).then(res, rej);
              match.forEach((r) => Object.assign(r, clone(patch)));
              return Promise.resolve({ error: null }).then(res, rej);
            },
          };
          return u;
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const hi = (id: string, aliases: string[] = []): OsvVuln => ({ id, aliases, database_specific: { severity: "HIGH" } });
const DANGER: OsvVuln[] = [hi("GHSA-aaaa")];
const LOW: OsvVuln[] = [{ id: "GHSA-bbbb", database_specific: { severity: "LOW" } }];
const techId = (key: string) => `T:${key}`;
// 내 기술 한 줄(한 사람의 한 프로젝트). 기본은 두꺼운 진짜 기술·숨기지 않음·보관하지 않은 프로젝트·등급 unknown(등급을 매긴 적 없음)
const my = (id: string, key: string, over: Row = {}): Row => ({
  id, tech_id: techId(key), version: "1.0.0", grade: "unknown", graded_at: null, grade_evidence: null, last_checked_ok_at: null, hidden_at: null, collect_error_kind: null,
  technologies: { tech_key: key, depth: "thick", is_simulated: false }, projects: { archived_at: null }, ...over,
});
const GRADED_AT = "2026-11-18T00:00:00.000Z"; // 마지막으로 등급을 매긴 시각
const graded = (id: string, key: string, grade: string, evidence: unknown[] = [], over: Row = {}) => my(id, key, { grade, graded_at: GRADED_AT, grade_evidence: evidence, ...over });
const world = (rows: Row[], over: Partial<Tables> = {}): Tables => ({
  my_technologies: rows, sources: [{ id: "s-osv", name: "osv", enabled: true }], observations: [], changes: [], run_steps: [], ...over,
});
// 변경 한 줄: 기본은 등급을 매기기 전(11-10)에 만들어진 것. createdAt을 GRADED_AT 뒤로 주면 "위험이 아니라고 매긴 뒤에 생긴" 변경이다
const change = (key: string, round: number, over: Row = {}): Row => ({
  id: `c-${key}-${round}`, tech_id: techId(key), cause_id: "GHSA-aaaa", version: "1.0.0", danger_round: round, created_at: "2026-11-10T00:00:00.000Z", ...over,
});

// OSV·변경 저장·알림 만들기를 흉내 내고 부른 내용을 모은다. 변경 저장은 changes 표에 줄도 쓴다(다음 실행이 그것을 보게)
function fakes(osv: Record<string, OsvVuln[] | Error>, opts: { alerts?: number; saveFails?: number; alertsFail?: boolean; store?: Row[] } = {}) {
  const asked: string[] = [];
  const sleeps: number[] = [];
  const saved: NewChange[] = [];
  const alerted: Record<string, unknown>[] = [];
  let saveFails = opts.saveFails ?? 0;
  return {
    asked, sleeps, saved, alerted,
    deps: {
      now: () => NOW,
      sleep: async (ms: number) => void sleeps.push(ms),
      queryOsv: async (name: string, _eco: string, version: string | null) => {
        const key = `${name}@${version}`;
        asked.push(key);
        const v = osv[key];
        if (v === undefined) throw new CollectError("http_status", `${key}: 404`, 404);
        if (v instanceof Error) throw v;
        return v;
      },
      saveChange: async (_db: SupabaseClient, c: NewChange) => {
        if (saveFails-- > 0) throw new Error("변경 저장 실패");
        saved.push(c);
        const id = `new-${saved.length}`;
        opts.store?.push({ id, tech_id: c.techId, cause_id: c.causeId, version: c.tech.version, danger_round: c.dangerRound, created_at: NOW_ISO });
        return { id, created: true };
      },
      createAlerts: async (_db: SupabaseClient, input: Record<string, unknown>) => {
        if (opts.alertsFail) throw new Error("알림 만들기 실패");
        alerted.push(input);
        return opts.alerts ?? 2;
      },
    },
  };
}
const run = (t: Tables, f: ReturnType<typeof fakes>, deadlineMs = Number.MAX_SAFE_INTEGER, fail: Fail = {}) =>
  osvCollector(f.deps).run({ db: fakeDb(t, fail), runId: "run-1", deadlineMs });
const steps = (t: Tables) => t.run_steps.map((s) => `${s.step_name}:${s.count_in ?? "-"}>${s.count_out ?? "-"}`);
const step = (t: Tables, name: string) => t.run_steps.find((s) => s.step_name === name);
const rowsOf = (t: Tables, key: string) => t.my_technologies.filter((r) => r.tech_id === techId(key));

test("출처 이름은 흐름 상자 fetch_osv", () => {
  assert.equal(osvCollector().source, "fetch_osv");
});

test("같은 기술·같은 버전은 사람이 여럿이어도 OSV에 한 번만 묻고, 그 버전을 쓰는 모든 줄의 등급·확인 시각을 갱신한다", async () => {
  const t = world([my("m1", "npm:zod"), my("m2", "npm:zod"), my("m3", "npm:zod"), my("m4", "npm:zod", { version: "2.0.0" })]);
  const f = fakes({ "zod@1.0.0": LOW, "zod@2.0.0": [] }); // 버전마다 결과가 달라야 등급이 섞이지 않는 것을 볼 수 있다
  const out = await run(t, f);
  assert.deepEqual(f.asked, ["zod@1.0.0", "zod@2.0.0"]);
  assert.equal(out.items, 2);
  assert.ok(t.my_technologies.every((r) => r.last_checked_ok_at === NOW_ISO && r.graded_at === NOW_ISO && r.grade_rule_version === "v1"));
  assert.deepEqual(t.my_technologies.map((r) => [r.id, r.grade]), [["m1", "caution"], ["m2", "caution"], ["m3", "caution"], ["m4", "unknown"]]);
});

test("읽을 줄만 고른다: 숨긴 줄·보관한 프로젝트·얇은 기술·시뮬레이터·npm·pypi가 아닌 종류는 묻지 않는다", async () => {
  const t = world([
    my("m1", "npm:zod"),
    my("m2", "npm:hidden", { hidden_at: "2026-11-18T00:00:00Z" }),
    my("m3", "npm:archived", { projects: { archived_at: "2026-11-18T00:00:00Z" } }),
    my("m4", "npm:thin", { technologies: { tech_key: "npm:thin", depth: "thin", is_simulated: false } }),
    my("m5", "npm:fake", { technologies: { tech_key: "npm:fake", depth: "thick", is_simulated: true } }),
    my("m6", "mcp:io.x/y"),
    my("m7", "pypi:requests"),
  ]);
  const f = fakes({ "zod@1.0.0": [], "requests@1.0.0": [] });
  await run(t, f);
  assert.deepEqual([...f.asked].sort(), ["requests@1.0.0", "zod@1.0.0"]);
});

test("위험이 아니던 것이 위험이 되면: 변경(grade_to_danger, 회차 1)·알림 만들기, 모든 줄 등급 갱신, 수집 자료 1줄, 단계 줄이 실제 건수로 남는다", async () => {
  const t = world([graded("m1", "npm:zod", "unknown"), graded("m2", "npm:zod", "unknown")]);
  const f = fakes({ "zod@1.0.0": DANGER });
  const out = await run(t, f);
  assert.ok(rowsOf(t, "npm:zod").every((r) => r.grade === "danger" && (r.grade_evidence as { id: string }[])[0].id === "GHSA-aaaa"));
  assert.equal(t.observations.length, 1);
  assert.deepEqual([t.observations[0].metric, t.observations[0].run_id, (t.observations[0].prev_value as Row).grade, (t.observations[0].curr_value as Row).grade, t.observations[0].change_size], ["osv_vulns", "run-1", "unknown", "danger", "large"]);
  assert.equal(f.saved.length, 1);
  const c = f.saved[0];
  assert.deepEqual([c.kind, c.techId, c.tech, c.causeId, c.dangerRound, (c.prevValue as Row).grade], ["grade_to_danger", techId("npm:zod"), { key: "npm:zod", version: "1.0.0" }, "GHSA-aaaa", 1, "unknown"]);
  assert.deepEqual(f.alerted, [{ changeId: "new-1", techId: techId("npm:zod"), kind: "security" }]); // runId·originRun 없음: 정기 실행은 전체 사람 기준
  assert.equal(out.items, 1);
  assert.deepEqual(steps(t), ["normalize:1>1", "compare:1>1", "grade:1>1", "is_event:1>-", "save_change:1>1", "notify:1>2"]);
  assert.deepEqual(step(t, "is_event")!.branch_counts, { event: 1, no_change: 0, collect_error: 0 });
  assert.deepEqual(step(t, "grade")!.branch_counts, { danger: 1 });
});

test("이미 모든 줄이 위험이고 변경도 있으면 사건이 아니다: 변경을 새로 만들지 않고, 있는 변경으로 알림만 확인한다(불변 3)", async () => {
  const t = world([graded("m1", "npm:zod", "danger", [{ id: "GHSA-aaaa" }])], { changes: [change("npm:zod", 1)] });
  const f = fakes({ "zod@1.0.0": DANGER }, { alerts: 0 });
  await run(t, f);
  assert.deepEqual([f.saved.length, t.observations.length], [0, 0]); // 그대로: 수집 자료도 안 늘어남
  assert.deepEqual(f.alerted, [{ changeId: "c-npm:zod-1", techId: techId("npm:zod"), kind: "security" }]);
  assert.deepEqual(step(t, "is_event")!.branch_counts, { event: 0, no_change: 1, collect_error: 0 });
  assert.equal(step(t, "notify"), undefined); // 새 알림이 없으면 notify 상자를 켜지 않는다
  assert.equal(rowsOf(t, "npm:zod")[0].last_checked_ok_at, NOW_ISO);
});

test("모든 줄이 위험으로 저장돼 있는데 변경이 없으면(앞 실행의 기록이 빠짐) 이번에 만든다: first_seen_danger 회차 1", async () => {
  const t = world([graded("m1", "npm:zod", "danger", [{ id: "GHSA-aaaa" }])]);
  const f = fakes({ "zod@1.0.0": DANGER });
  await run(t, f);
  assert.deepEqual(f.saved.map((c) => [c.kind, c.dangerRound]), [["first_seen_danger", 1]]);
  assert.equal(f.alerted.length, 1);
});

test("일부 줄만 위험이던 경우(가져오기로 들어와 아직 등급이 없는 줄)는 위험이 이어지는 중이다: 새 변경 없이 있는 변경으로 그 줄의 사람이 알림을 받게 하고, 사건으로는 세지 않는다", async () => {
  const t = world([graded("m1", "npm:zod", "danger", [{ id: "GHSA-aaaa" }]), my("m2", "npm:zod")], { changes: [change("npm:zod", 2)] });
  const f = fakes({ "zod@1.0.0": DANGER });
  await run(t, f);
  assert.deepEqual([f.saved.length, f.alerted.map((a) => a.changeId)], [0, ["c-npm:zod-2"]]);
  assert.ok(rowsOf(t, "npm:zod").every((r) => r.grade === "danger"));
  assert.equal((step(t, "is_event")!.branch_counts as Row).event, 0);
  assert.deepEqual(step(t, "notify") && [step(t, "notify")!.count_in, step(t, "notify")!.count_out], [1, 2]);
});

test("위험 → 고쳐짐 → 다시 위험이면 가장 큰 회차에서 하나 올려 새 변경이 된다(SPEC-3.1)", async () => {
  const t = world([graded("m1", "npm:zod", "unknown")], { changes: [change("npm:zod", 1), change("npm:zod", 2)] });
  const f = fakes({ "zod@1.0.0": DANGER });
  await run(t, f);
  assert.deepEqual(f.saved.map((c) => [c.kind, c.dangerRound]), [["grade_to_danger", 3]]);
});

test("다시 위험이 된 변경(회차 2 이상)을 만든 뒤 등급 저장이 실패해도, 다음 실행은 새 회차를 또 만들지 않고 그 변경을 이어 쓴다", async () => {
  const t = world([graded("m1", "npm:zod", "unknown")], { changes: [change("npm:zod", 1)] });
  const f = fakes({ "zod@1.0.0": DANGER }, { store: t.changes });
  await assert.rejects(() => run(t, f, undefined, { grade: true }), /등급을 저장하지 못함/);
  assert.deepEqual(f.saved.map((c) => c.dangerRound), [2]); // 변경·알림은 이미 만들어졌다
  assert.equal(rowsOf(t, "npm:zod")[0].grade, "unknown");
  await run(t, f); // 다음 날
  assert.deepEqual([f.saved.map((c) => c.dangerRound), f.alerted.map((a) => a.changeId)], [[2], ["new-1", "new-1"]]);
  assert.equal(rowsOf(t, "npm:zod")[0].grade, "danger");
});

test("버전이 다르면 다른 위험이다: 같은 원인의 다른 버전 변경은 회차에 세지 않는다", async () => {
  const t = world([graded("m1", "npm:zod", "unknown", [], { version: "2.0.0" })], { changes: [change("npm:zod", 1, { version: "1.0.0" })] });
  const f = fakes({ "zod@2.0.0": DANGER });
  await run(t, f);
  assert.deepEqual(f.saved.map((c) => [c.kind, c.dangerRound]), [["grade_to_danger", 1]]);
});

test("같은 취약점이 다른 이름(별칭)으로 다시 올라와도 새 위험이 아니다: 이어지는 위험에 알림만 확인한다", async () => {
  const t = world([graded("m1", "npm:zod", "danger", [{ id: "PYSEC-1" }])], { changes: [change("npm:zod", 1, { cause_id: "PYSEC-1" })] });
  const f = fakes({ "zod@1.0.0": [hi("GHSA-new", ["PYSEC-1", "CVE-1"])] }); // 원인 id가 글자 순으로 앞서는 GHSA-new로 바뀌어도
  await run(t, f);
  assert.deepEqual([f.saved.length, f.alerted.map((a) => a.changeId)], [0, ["c-npm:zod-1"]]);
});

test("이미 위험인 버전에 별칭이 이어지지 않는 전혀 다른 새 취약점이 생기면 새 변경이 된다(원인이 다르면 다른 변경, SPEC-3.1)", async () => {
  const t = world([graded("m1", "npm:zod", "danger", [{ id: "GHSA-aaaa" }])], { changes: [change("npm:zod", 1)] });
  const f = fakes({ "zod@1.0.0": [hi("GHSA-zzzz")] });
  await run(t, f);
  assert.deepEqual(f.saved.map((c) => [c.kind, c.causeId, c.dangerRound]), [["first_seen_danger", "GHSA-zzzz", 1]]);
});

test("위험이 아닌 새 등급(주의)은 변경·알림 없이 수집 자료와 등급만 남긴다", async () => {
  const t = world([graded("m1", "npm:zod", "unknown")]);
  const f = fakes({ "zod@1.0.0": LOW });
  await run(t, f);
  assert.equal(rowsOf(t, "npm:zod")[0].grade, "caution");
  assert.deepEqual([t.observations.length, f.saved.length, f.alerted.length], [1, 0, 0]);
  assert.deepEqual(step(t, "is_event")!.branch_counts, { event: 0, no_change: 1, collect_error: 0 });
});

// 기술의 저장소 확인 값(P-9가 technologies에 남김): NOW 기준 확인 1일 전·마지막 푸시 3일 전이면 신선하다
const DAY = 24 * 60 * 60 * 1000;
const repoCols = (over: Row = {}): Row => ({ status: "active", last_activity_at: new Date(NOW - 3 * DAY).toISOString(), last_checked_ok_at: new Date(NOW - DAY).toISOString(), missed_count: 0, license: "MIT", signals: { github_found_repo: "acme/tool" }, ...over });
const withRepo = (key: string, over: Row = {}): Row => ({ technologies: { tech_key: key, depth: "thick", is_simulated: false, ...repoCols(over) } });

test("취약점 0건이고 기술의 저장소 확인이 신선하면 통과: 수집 자료만 남기고 변경·알림은 없다(알림은 위험만)", async () => {
  const t = world([graded("m1", "npm:zod", "unknown", [], withRepo("npm:zod"))]);
  const f = fakes({ "zod@1.0.0": [] });
  await run(t, f);
  assert.deepEqual([rowsOf(t, "npm:zod")[0].grade, rowsOf(t, "npm:zod")[0].grade_reason], ["pass", "알려진 취약점이 없고, 저장소(acme/tool)가 최근 3개월 안에 고쳐지고 있어요."]);
  assert.deepEqual([t.observations.length, f.saved.length, f.alerted.length], [1, 0, 0]);
});

test("저장소 확인이 낡았거나(8일 전)·한 번도 없거나·읽은 저장소 이름이 없으면 취약점 0건이어도 찾지 못함 그대로(불변 2). 사라짐은 주의(SPEC-1 ④)", async () => {
  const t = world([
    graded("m1", "npm:old-check", "unknown", [], withRepo("npm:old-check", { last_checked_ok_at: new Date(NOW - 8 * DAY).toISOString() })),
    graded("m2", "npm:never", "unknown", [], withRepo("npm:never", { last_checked_ok_at: null, last_activity_at: null })),
    graded("m3", "npm:gone", "unknown", [], withRepo("npm:gone", { status: "gone" })),
    graded("m4", "npm:no-repo", "unknown", [], withRepo("npm:no-repo", { signals: {} })), // P-9가 읽은 저장소 이름이 없다
  ]);
  await run(t, fakes({ "old-check@1.0.0": [], "never@1.0.0": [], "gone@1.0.0": [], "no-repo@1.0.0": [] }));
  assert.deepEqual(t.my_technologies.map((r) => r.grade), ["unknown", "unknown", "caution", "unknown"]);
});

test("통과였던 것도 저장소 확인이 낡아지면 찾지 못함으로 돌아간다: 예전 통과가 확인 없이 그대로 보이지 않게(SPEC-1)", async () => {
  const t = world([graded("m1", "npm:zod", "pass", [], withRepo("npm:zod", { last_checked_ok_at: new Date(NOW - 30 * DAY).toISOString() }))]);
  await run(t, fakes({ "zod@1.0.0": [] }));
  assert.equal(rowsOf(t, "npm:zod")[0].grade, "unknown");
});

test("같은 값을 다시 읽으면 수집 자료가 늘지 않는다(불변 3): compare의 나가는 건수 0", async () => {
  const t = world([graded("m1", "npm:zod", "caution", [{ id: "GHSA-bbbb" }])]);
  await run(t, fakes({ "zod@1.0.0": LOW }));
  assert.equal(t.observations.length, 0);
  assert.equal(step(t, "compare")!.count_out, 0);
});

test("일부 실패: 그 기술의 등급은 그대로(불변 4), 오류 종류만 적히고, collect_error 줄에 건수가 남는다. 나머지는 계속", async () => {
  const t = world([graded("m1", "npm:ok", "unknown"), graded("m2", "npm:bad", "caution", [{ id: "GHSA-bbbb" }])]);
  const out = await run(t, fakes({ "ok@1.0.0": [], "bad@1.0.0": new CollectError("http_status", "bad: 503", 503) }));
  assert.equal(out.items, 1);
  assert.deepEqual([rowsOf(t, "npm:bad")[0].grade, rowsOf(t, "npm:bad")[0].collect_error_kind, rowsOf(t, "npm:bad")[0].last_checked_ok_at], ["caution", "http_status", null]);
  assert.equal(rowsOf(t, "npm:ok")[0].collect_error_kind, null);
  const err = step(t, "collect_error")!;
  assert.deepEqual([err.count_in, err.error_kind], [1, "http_status"]);
  assert.deepEqual(step(t, "is_event")!.branch_counts, { event: 0, no_change: 1, collect_error: 1 });
});

test("읽은 것보다 실패가 많으면 수집기 실패로 던진다(재시도·3번 연속 강조가 보게). 읽은 것은 저장하고 단계 줄을 남기며, collect_error는 runBatch에 맡긴다", async () => {
  const t = world([graded("m1", "npm:ok", "unknown"), graded("m2", "npm:bad1", "unknown"), graded("m3", "npm:bad2", "unknown")]);
  const down = (k: string) => new CollectError("http_status", `${k}: 503`, 503);
  await assert.rejects(() => run(t, fakes({ "ok@1.0.0": [], "bad1@1.0.0": down("bad1"), "bad2@1.0.0": down("bad2") })), (e) => e instanceof CollectError && e.kind === "http_status" && /다 읽지 못했/.test(e.message));
  assert.deepEqual(steps(t).filter((s) => s.startsWith("normalize") || s.startsWith("collect_error")), ["normalize:1>1"]);
  assert.deepEqual([rowsOf(t, "npm:bad1")[0].collect_error_kind, rowsOf(t, "npm:bad2")[0].collect_error_kind], ["http_status", "http_status"]);
});

test("전부 실패하면 수집 오류로 던지고(\"취약점 없음\"으로 읽지 않음) 등급은 그대로, 단계 줄은 runBatch에 맡긴다", async () => {
  const t = world([graded("m1", "npm:a", "danger", [{ id: "GHSA-aaaa" }]), graded("m2", "npm:b", "unknown")]);
  await assert.rejects(
    () => run(t, fakes({ "a@1.0.0": new CollectError("network", "a: down"), "b@1.0.0": new CollectError("timeout", "b: slow") })),
    (e) => e instanceof CollectError && e.kind === "network" && /다 읽지 못했/.test(e.message),
  );
  assert.deepEqual(t.run_steps, []);
  assert.deepEqual([rowsOf(t, "npm:a")[0].grade, rowsOf(t, "npm:a")[0].collect_error_kind], ["danger", "network"]);
});

test("성공하면 수집 오류 표시를 지우고 확인 시각을 적는다(일시 실패 표시가 영영 남지 않게)", async () => {
  const t = world([graded("m1", "npm:zod", "unknown", [], { collect_error_kind: "network" })]);
  await run(t, fakes({ "zod@1.0.0": [] }));
  assert.deepEqual([rowsOf(t, "npm:zod")[0].collect_error_kind, rowsOf(t, "npm:zod")[0].last_checked_ok_at], [null, NOW_ISO]);
});

test("한도 초과(429)가 나면 이번 실행에서는 더 묻지 않고 수집기 실패로 던진다. 읽은 것은 저장하고 단계 줄을 남긴다", async () => {
  const t = world([my("m1", "npm:a"), my("m2", "npm:b"), my("m3", "npm:c")]);
  const f = fakes({ "a@1.0.0": [], "b@1.0.0": new CollectError("rate_limited", "b: 429", 429), "c@1.0.0": [] });
  await assert.rejects(() => run(t, f), (e) => e instanceof CollectError && e.kind === "rate_limited" && /한도 초과로 중단/.test(e.message));
  assert.deepEqual(f.asked, ["a@1.0.0", "b@1.0.0"]);
  assert.equal(rowsOf(t, "npm:a")[0].last_checked_ok_at, NOW_ISO);
  assert.ok(steps(t).includes("normalize:1>1"));
});

test("이상한 OSV 응답(null 항목)은 그 기술의 해석 실패(parse)다: 다른 기술은 계속 확인하고 모든 확인이 멈추지 않는다", async () => {
  const t = world([my("m1", "npm:ok"), my("m2", "npm:weird")]);
  const f = fakes({ "ok@1.0.0": [], "weird@1.0.0": [null as unknown as OsvVuln] });
  const out = await run(t, f);
  assert.deepEqual([out.items, f.asked.length], [1, 2]);
  assert.equal(rowsOf(t, "npm:weird")[0].collect_error_kind, "parse");
  const err = step(t, "collect_error")!;
  assert.deepEqual([err.count_in, err.error_kind], [1, "parse"]);
});

test("수집 오류가 아닌 오류(가져오기 코드의 버그)는 삼키지 않고 그대로 던진다", async () => {
  const t = world([my("m1", "npm:a")]);
  await assert.rejects(() => run(t, fakes({ "a@1.0.0": new TypeError("버그") })), TypeError);
  assert.equal(rowsOf(t, "npm:a")[0].collect_error_kind, null);
});

test("요청 사이 1초 이상 쉬고(첫 요청 앞은 안 쉼), 오래 안 본 것부터 묻는다", async () => {
  const t = world([my("m1", "npm:aaa-seen", { last_checked_ok_at: "2026-11-18T00:00:00.000Z" }), my("m2", "npm:zzz-never")]); // 키 이름 순서와 반대
  const f = fakes({ "aaa-seen@1.0.0": [], "zzz-never@1.0.0": [] });
  await run(t, f);
  assert.deepEqual(f.asked, ["zzz-never@1.0.0", "aaa-seen@1.0.0"]);
  assert.equal(f.sleeps.length, 1);
  assert.ok(f.sleeps[0] >= 1000);
});

test("묶음의 시간 한도(deadline)에 닿으면 남은 것은 다음 실행으로 넘기고 요약에 적는다", async () => {
  const t = world([my("m1", "npm:a"), my("m2", "npm:b"), my("m3", "npm:c")]);
  let clock = 0;
  const f = fakes({ "a@1.0.0": [], "b@1.0.0": [], "c@1.0.0": [] });
  const slow = { ...f.deps, now: () => clock, queryOsv: async (n: string, e: string, v: string | null) => ((clock += 100_000), f.deps.queryOsv(n, e, v)) };
  const out = await osvCollector(slow).run({ db: fakeDb(t), runId: "run-1", deadlineMs: 150_000 });
  assert.deepEqual(f.asked, ["a@1.0.0", "b@1.0.0"]);
  assert.match(String(out.summary), /1개는 다음 실행/);
});

test("OSV는 묶음 시간 예산의 일부(150초)만 쓴다: 묶음 한도가 넉넉해도 뒤의 수집기가 굶지 않게 멈춘다", async () => {
  const t = world([my("m1", "npm:a"), my("m2", "npm:b"), my("m3", "npm:c")]);
  let clock = 0;
  const f = fakes({ "a@1.0.0": [], "b@1.0.0": [], "c@1.0.0": [] });
  const slow = { ...f.deps, now: () => clock, queryOsv: async (n: string, e: string, v: string | null) => ((clock += 100_000), f.deps.queryOsv(n, e, v)) };
  const out = await osvCollector(slow).run({ db: fakeDb(t), runId: "run-1", deadlineMs: Number.MAX_SAFE_INTEGER });
  assert.deepEqual(f.asked, ["a@1.0.0", "b@1.0.0"]);
  assert.match(String(out.summary), /1개는 다음 실행/);
});

test("관리자가 OSV 출처를 껐으면 아무것도 묻지 않고 이유를 요약에 적는다", async () => {
  const t = world([my("m1", "npm:zod")], { sources: [{ id: "s-osv", name: "osv", enabled: false }] });
  const f = fakes({});
  const out = await run(t, f);
  assert.deepEqual([out.items, f.asked, t.run_steps], [0, [], []]);
  assert.match(String(out.summary), /꺼져/);
});

test("읽을 줄이 없으면 0건으로 끝나고 가짜 단계 줄을 남기지 않는다", async () => {
  const t = world([my("m1", "mcp:io.x/y")]);
  const out = await run(t, fakes({}));
  assert.deepEqual([out.items, t.run_steps], [0, []]);
});

test("등급 저장이 실패하면 던진다. 변경·알림은 이미 만들어졌고, 다음 실행은 같은 변경을 이어 쓴다(새 변경을 또 만들지 않음)", async () => {
  const t = world([graded("m1", "npm:zod", "unknown")]);
  const f = fakes({ "zod@1.0.0": DANGER }, { store: t.changes });
  await assert.rejects(() => run(t, f, undefined, { grade: true }), /등급을 저장하지 못함/);
  assert.deepEqual([f.saved.length, f.alerted.length], [1, 1]);
  await run(t, f);
  assert.deepEqual([f.saved.length, f.alerted.map((a) => a.changeId)], [1, ["new-1", "new-1"]]);
});

test("변경 저장이 실패하면 등급은 그대로 두고 던진다. 다음 실행이 같은 위험을 새로 만든다", async () => {
  const t = world([graded("m1", "npm:zod", "unknown")]);
  const f = fakes({ "zod@1.0.0": DANGER }, { saveFails: 1, store: t.changes });
  await assert.rejects(() => run(t, f), /변경 저장 실패/);
  assert.deepEqual([rowsOf(t, "npm:zod")[0].grade, f.saved.length, f.alerted.length], ["unknown", 0, 0]);
  await run(t, f); // 다음 날
  assert.deepEqual(f.saved.map((c) => [c.kind, c.dangerRound]), [["grade_to_danger", 1]]);
  assert.equal(f.alerted.length, 1);
});

test("수집 자료를 못 쓰면 던진다. 변경·알림·등급은 이미 저장됐고 그 한 줄만 비며, 다음 실행이 다시 쓰지는 않는다(문서에 적은 한계)", async () => {
  const t = world([graded("m1", "npm:zod", "unknown")]);
  const f = fakes({ "zod@1.0.0": DANGER }, { store: t.changes });
  await assert.rejects(() => run(t, f, undefined, { observation: true }), /수집 자료를 저장하지 못함/);
  assert.deepEqual([rowsOf(t, "npm:zod")[0].grade, f.saved.length, f.alerted.length], ["danger", 1, 1]);
  await run(t, f);
  assert.deepEqual([t.observations.length, f.saved.length], [0, 1]);
});

test("알림 만들기가 실패하면 던지되, 그 전에 끝낸 기술의 단계 줄은 남기고 notify를 성공으로 남기지 않는다", async () => {
  const t = world([my("m1", "npm:aaa"), graded("m2", "npm:zzz", "unknown", [], { last_checked_ok_at: "2026-11-18T00:00:00.000Z" })]); // aaa 먼저
  await assert.rejects(() => run(t, fakes({ "aaa@1.0.0": [], "zzz@1.0.0": DANGER }, { alertsFail: true })), /알림 만들기 실패/);
  assert.deepEqual(steps(t).filter((s) => s.startsWith("notify")), []);
  assert.ok(steps(t).includes("normalize:1>1"));
});

test("수집 오류 표시를 못 쓰면 던진다(오류를 숨기지 않음)", async () => {
  const t = world([my("m1", "npm:a")]);
  await assert.rejects(() => run(t, fakes({}), undefined, { mark: true }), /수집 오류를 저장하지 못함/);
});

test("1000줄이 넘어도 쪽을 나눠 읽어 뒤쪽 기술을 놓치지 않는다", async () => {
  const many = Array.from({ length: 1100 }, (_, i) => my(`m${i}`, "mcp:io.x/s", { tech_id: `T:mcp${i}` })); // 묻지 않는 종류가 앞에 1100줄
  const t = world([...many, my("z-last", "npm:late-one")]); // id가 맨 뒤에 정렬돼 둘째 쪽에 있다
  const f = fakes({ "late-one@1.0.0": [] });
  const out = await run(t, f);
  assert.deepEqual([out.items, f.asked], [1, ["late-one@1.0.0"]]);
});
