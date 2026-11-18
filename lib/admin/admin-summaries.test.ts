import { test } from "node:test";
import assert from "node:assert/strict";
import { alertCounts, errorKindCounts, failureStreaks, filterAlerts, groupRules, summarizeMembers, type AdminAlert, type RunRow } from "./admin-summaries.ts";

const P = (id: string, nickname: string, role = "user") => ({ id, nickname, role, is_demo: false });

test("summarizeMembers: 회원마다 프로젝트·숨기지 않은 기술 수·마지막으로 읽은 시각", () => {
  const out = summarizeMembers(
    {
      profiles: [P("u1", "가나"), P("u2", "다라", "admin")],
      projects: [{ id: "p1", owner_id: "u1", kind: "repo", name: "앱", repo_url: "https://github.com/a/b", archived_at: null, created_at: "2026-11-10T00:00:00Z" }],
      myTechs: [
        { owner_id: "u1", project_id: "p1", hidden_at: null, read_at: "2026-11-17T00:00:00+00:00", created_at: "2026-11-10T00:00:00Z" },
        { owner_id: "u1", project_id: "p1", hidden_at: null, read_at: "2026-11-12T00:00:00Z", created_at: "2026-11-10T00:00:00Z" },
        { owner_id: "u1", project_id: "p1", hidden_at: "2026-11-15T00:00:00Z", read_at: "2026-11-18T00:00:00Z", created_at: "2026-11-10T00:00:00Z" },
      ],
    },
    { memberId: null, from: null },
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].nickname, "가나"); // 활동이 있는 회원이 먼저
  assert.equal(out[0].techCount, 2); // 숨긴 1개 제외
  assert.equal(out[0].lastReadAt, "2026-11-17T00:00:00+00:00"); // 숨긴 기술의 읽은 시각은 쓰지 않음
  assert.deepEqual(out[0].projects, [{ name: "앱", repoUrl: "https://github.com/a/b", kind: "repo", archived: false, techCount: 2 }]);
  assert.equal(out[1].isAdmin, true);
  assert.equal(out[1].lastActivityAt, null);
});

test("summarizeMembers: 회원·기간으로 거른다(활동이 없는 회원은 기간이 있으면 빠짐)", () => {
  const input = {
    profiles: [P("u1", "가나"), P("u2", "다라")],
    projects: [{ id: "p2", owner_id: "u2", kind: "local", name: "로컬", repo_url: null, archived_at: null, created_at: "2026-11-01T00:00:00Z" }],
    myTechs: [],
  };
  assert.deepEqual(summarizeMembers(input, { memberId: "u2", from: null }).map((m) => m.id), ["u2"]);
  assert.deepEqual(summarizeMembers(input, { memberId: null, from: "2026-10-30T00:00:00Z" }).map((m) => m.id), ["u2"]);
  assert.deepEqual(summarizeMembers(input, { memberId: null, from: "2026-11-05T00:00:00Z" }), []);
});

const A = (id: string, status: string, kind: string, createdAt: string, decision: string | null = null): AdminAlert => ({
  id, kind, status, createdAt, member: "가나", techName: "mcp-remote", isSimulated: false,
  judgment: decision ? { decision, judgedBy: "가나", judgedAt: createdAt } : null,
});

test("alertCounts·filterAlerts: 상태·판단 건수와 거르기(최신순)", () => {
  const rows = [A("1", "pending", "security", "2026-11-18T01:00:00Z"), A("2", "done", "security", "2026-11-18T03:00:00Z", "candidate"), A("3", "done", "opportunity", "2026-11-01T00:00:00Z", "hold")];
  assert.deepEqual(alertCounts(rows), { total: 3, pending: 1, done: 2, candidate: 1, hold: 1 });
  assert.deepEqual(filterAlerts(rows, { status: "done", kind: null, from: null }).map((r) => r.id), ["2", "3"]);
  assert.deepEqual(filterAlerts(rows, { status: null, kind: "security", from: "2026-11-10T00:00:00Z" }).map((r) => r.id), ["2", "1"]);
  assert.deepEqual(alertCounts([]), { total: 0, pending: 0, done: 0, candidate: 0, hold: 0 });
});

const R = (id: string, trigger: string, status: string, t: string): RunRow => ({ id, trigger, status, created_at: t, item_count: 0 });

test("failureStreaks: 가장 최근부터 이어진 실패만 세고, 도는 중인 실행은 건너뛴다", () => {
  const runs = [
    R("1", "schedule", "failed", "2026-11-18T03:00:00Z"),
    R("2", "schedule", "partial", "2026-11-18T02:00:00Z"),
    R("3", "schedule", "succeeded", "2026-11-18T01:00:00Z"),
    R("4", "schedule", "failed", "2026-11-18T00:00:00Z"),
    R("5", "manual", "running", "2026-11-18T05:00:00Z"),
    R("6", "manual", "failed", "2026-11-18T04:00:00Z"),
    R("7", "simulator", "succeeded", "2026-11-18T04:00:00Z"),
  ];
  assert.deepEqual(failureStreaks(runs), [
    { trigger: "schedule", streak: 2, lastFailedAt: "2026-11-18T03:00:00Z" },
    { trigger: "manual", streak: 1, lastFailedAt: "2026-11-18T04:00:00Z" },
  ]);
  assert.deepEqual(failureStreaks([]), []);
});

test("errorKindCounts: 오류 종류별 건수(종류 없는 줄은 뺌)", () => {
  const s = (k: string | null) => ({ run_id: "r", step_name: "osv", error_kind: k, error_message: null, created_at: "2026-11-18T00:00:00Z" });
  assert.deepEqual(errorKindCounts([s("timeout"), s("timeout"), s("http_status"), s(null)]), { timeout: 2, http_status: 1 });
});

test("groupRules: 종류 순서 고정, 켜짐·꺼짐 수, 값 순", () => {
  const r = (kind: string, value: string, enabled = true) => ({ id: value, kind, ecosystem: null, value, pattern_id: null, pattern_grade: null, enabled });
  const g = groupRules([r("risk_pattern", "z"), r("allow_package", "b"), r("allow_package", "a", false)]);
  assert.deepEqual(g.map((x) => x.kind), ["allow_package", "github_topic", "hn_keyword", "risk_pattern"]);
  assert.deepEqual(g[0].rows.map((x) => x.value), ["a", "b"]);
  assert.equal(g[0].on, 1);
  assert.equal(g[0].off, 1);
  assert.equal(g[1].rows.length, 0);
});
