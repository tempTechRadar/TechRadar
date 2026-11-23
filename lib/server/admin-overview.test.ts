import { test } from "node:test";
import assert from "node:assert/strict";
import { overviewTiles, readOverview, summarizeWeek, toMetric, type OverviewData } from "./admin-overview.ts";

const NOW = new Date("2026-11-23T05:30:00Z");
const base: OverviewData = {
  scan: { state: "ok", runId: "r1", at: "2026-11-22T21:07:00Z", sources: 6, errors: 0, otherFailed: 0, runFailed: false, running: false },
  pendingAlerts: { ok: true, value: 0 },
  pendingReports: { ok: true, value: 0 },
  unclassified: { ok: true, value: 0 },
  relationCandidates: { ok: true, value: 0 },
  week: { ok: true, total: 3, failed: 0, partial: 0, capped: false },
};
const tile = (d: OverviewData, key: string) => overviewTiles(d, NOW).flatMap((g) => g.tiles).find((t) => t.key === key)!;

test("toMetric: 오류이거나 건수가 비면 0이 아니라 '읽지 못함'(불변 2), 0은 0", () => {
  assert.deepEqual(toMetric({ count: 0, error: null }, "x"), { ok: true, value: 0 });
  assert.deepEqual(toMetric({ count: 7, error: null }, "x"), { ok: true, value: 7 });
  assert.equal(toMetric({ count: null, error: null }, "x").ok, false);
  const bad = toMetric({ count: null, error: { message: "permission denied" } }, "판단 대기 알림");
  assert.deepEqual(bad, { ok: false, reason: "판단 대기 알림: permission denied" });
});

test("summarizeWeek: 실패 · 일부 실패를 따로 세고, 한도에 닿으면 capped", () => {
  assert.deepEqual(summarizeWeek([{ status: "succeeded" }, { status: "failed" }, { status: "partial" }, { status: "failed" }]), { ok: true, total: 4, failed: 2, partial: 1, capped: false });
  assert.deepEqual(summarizeWeek([{ status: "succeeded" }, { status: "succeeded" }], 2), { ok: true, total: 2, failed: 0, partial: 0, capped: true });
});

test("overviewTiles: 메뉴 묶음과 같은 순서(지켜보기 · 사람 판단 · 운영 관리), 숫자마다 갈 화면 링크", () => {
  const groups = overviewTiles(base, NOW);
  assert.deepEqual(groups.map((g) => g.id), ["watch", "human", "ops"]);
  assert.deepEqual(groups.flatMap((g) => g.tiles.map((t) => t.key)), ["scan-at", "scan-errors", "week", "alerts", "reports", "unclassified", "relations"]);
  assert.equal(tile(base, "scan-at").href, "/admin/flow?run=r1");
  assert.equal(tile(base, "alerts").href, "/admin/alerts?status=pending");
  assert.equal(tile(base, "scan-at").value, "06:07"); // 오늘(한국 시간)이면 hh:mm만
});

test("overviewTiles: 못 읽은 숫자는 '읽지 못함' + 이유, 다른 숫자는 그대로(하나 실패가 전체를 지우지 않음)", () => {
  const d = { ...base, pendingReports: { ok: false as const, reason: "처리 전 신고: 표 없음" }, week: { ok: false as const, reason: "최근 7일 실행: 시간 초과" } };
  assert.deepEqual([tile(d, "reports").value, tile(d, "reports").tone, tile(d, "reports").reason], ["읽지 못함", "unknown", "처리 전 신고: 표 없음"]);
  assert.equal(tile(d, "week").value, "읽지 못함");
  assert.equal(tile(d, "alerts").value, "0");
  for (const t of overviewTiles(d, NOW).flatMap((g) => g.tiles).filter((x) => !x.reason)) assert.notEqual(t.value, "읽지 못함");
});

test("overviewTiles: 정기 실행을 못 읽으면 시각 · 수집 오류 둘 다 '읽지 못함', 아직 없으면 '아직 없음'(0 아님)", () => {
  assert.deepEqual([tile({ ...base, scan: { state: "fail" } }, "scan-at").value, tile({ ...base, scan: { state: "fail" } }, "scan-errors").value], ["읽지 못함", "읽지 못함"]);
  assert.deepEqual([tile({ ...base, scan: { state: "none" } }, "scan-at").value, tile({ ...base, scan: { state: "none" } }, "scan-errors").value], ["아직 없음", "아직 없음"]);
});

test("overviewTiles: 수집 오류 · 실행 실패는 빨강, 판단 대기는 주황, 0은 초록, 한도에 닿은 7일 수는 '+'", () => {
  const d: OverviewData = { ...base, scan: { state: "ok", runId: "r1", at: "2026-11-22T21:07:00Z", sources: 6, errors: 2, otherFailed: 0, runFailed: true, running: false }, pendingAlerts: { ok: true, value: 3 }, week: { ok: true, total: 1000, failed: 1, partial: 0, capped: true } };
  assert.equal(tile(d, "scan-errors").tone, "danger");
  assert.equal(tile(d, "scan-at").tone, "danger");
  assert.match(tile(d, "scan-at").sub ?? "", /실행 실패/);
  assert.equal(tile(d, "alerts").tone, "warn");
  assert.equal(tile(base, "alerts").tone, "ok");
  assert.equal(tile(d, "week").value, "1000+");
  assert.equal(tile(d, "week").tone, "danger");
});

/* 가짜 DB: 표마다 건수 · 오류를 정해 둔다. 거르는 조건을 기록해 화면과 같은 조건으로 세는지 본다 */
type Ans = { count?: number | null; data?: unknown; error?: { message: string; code?: string } | null };
function fakeDb(answers: Record<string, Ans>, seen: string[]) {
  return {
    from(table: string) {
      const filters: string[] = [];
      const q = {
        select: (_c: string, _o?: unknown) => q,
        eq: (k: string, v: unknown) => (filters.push(`${k}=${v}`), q),
        is: (k: string, v: unknown) => (filters.push(`${k} is ${v}`), q),
        gte: (k: string) => (filters.push(`${k}>=`), q),
        order: () => q,
        limit: () => q,
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
          seen.push(`${table}:${filters.join(",")}`);
          const a = answers[table] ?? {};
          return Promise.resolve({ count: a.count ?? null, data: a.data ?? null, error: a.error ?? null }).then(ok, bad);
        },
      };
      return q;
    },
  };
}

test("readOverview: 표마다 따로 읽고 따로 실패한다 — 신고 표가 없거나 알림을 못 읽어도 나머지 숫자는 나온다", async () => {
  const seen: string[] = [];
  const db = fakeDb({
    alerts: { error: { message: "permission denied for table alerts" } },
    reports: { error: { message: "relation \"public.reports\" does not exist", code: "42P01" } },
    technologies: { count: 4 },
    tech_relations: { count: 0 },
    runs: { data: [{ status: "failed" }, { status: "succeeded" }] },
    run_steps: { data: [] },
  }, seen);
  const d = await readOverview(db as never, NOW);
  assert.equal(d.pendingAlerts.ok, false);
  assert.deepEqual(d.pendingReports, { ok: false, reason: "사용기 신고 표가 아직 DB에 없음(마이그레이션 적용 대기)" });
  assert.deepEqual(d.unclassified, { ok: true, value: 4 });
  assert.deepEqual(d.relationCandidates, { ok: true, value: 0 });
  assert.deepEqual(d.week, { ok: true, total: 2, failed: 1, partial: 0, capped: false });
  assert.ok(seen.includes("alerts:status=pending"));
  assert.ok(seen.includes("reports:handled_at is null"));
  assert.ok(seen.includes("technologies:category_id is null,depth=thick"));
  assert.ok(seen.includes("tech_relations:status=candidate"));
});

test("readOverview: 질의가 던져도(네트워크) 그 숫자만 '읽지 못함'", async () => {
  const db = { from: () => { throw new Error("fetch failed"); } };
  const d = await readOverview(db as never, NOW);
  assert.equal(d.scan.state, "fail");
  for (const m of [d.pendingAlerts, d.pendingReports, d.unclassified, d.relationCandidates, d.week]) assert.equal(m.ok, false);
});
