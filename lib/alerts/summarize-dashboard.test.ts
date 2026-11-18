import { test } from "node:test";
import assert from "node:assert/strict";
import type { AlertRow } from "./filter-alerts.ts";
import { filterAlerts } from "./filter-alerts.ts";
import { parseAlertFilter } from "./parse-alert-filter.ts";
import { summarizeDashboard } from "./summarize-dashboard.ts";

const now = new Date("2026-11-18T03:00:00Z");

function alert(id: string, createdAt: string, overrides: Partial<AlertRow> = {}): AlertRow {
  return { id, kind: "security", status: "pending", createdAt, projectId: "proj-a", ...overrides };
}

const alerts: AlertRow[] = [
  alert("a1", "2026-11-18T01:00:00Z"), // 오늘, 대기
  alert("a2", "2026-11-17T01:00:00Z", { status: "done" }), // 어제, 완료
  alert("a3", "2026-11-10T01:00:00Z", { projectId: "proj-b" }), // 8일 전, 대기, 다른 프로젝트
  alert("a4", "2026-10-01T01:00:00Z", { status: "done", projectId: null }), // 오래전, 완료, 프로젝트 밖
];
const techs = [{ projectId: "proj-a" }, { projectId: "proj-a" }, { projectId: "proj-b" }, { projectId: null }];

test("변경·판단 대기·완료 수와 내 기술 수를 센다(기본은 전체 기간·모든 프로젝트)", () => {
  const summary = summarizeDashboard({ alerts, techs, params: {}, now });

  assert.equal(summary.techCount, 4);
  assert.equal(summary.changeCount, 4);
  assert.equal(summary.pendingCount, 2);
  assert.equal(summary.doneCount, 2);
});

test("기간과 프로젝트로 거르면 숫자가 따라 바뀐다(내 기술 수는 프로젝트만 따른다)", () => {
  const week = summarizeDashboard({ alerts, techs, params: { period: "7d" }, now });
  const projectA = summarizeDashboard({ alerts, techs, params: { project: "proj-a" }, now });

  assert.deepEqual([week.changeCount, week.pendingCount, week.doneCount, week.techCount], [2, 1, 1, 4]);
  assert.deepEqual([projectA.changeCount, projectA.pendingCount, projectA.doneCount, projectA.techCount], [2, 1, 1, 2]);
});

test("숫자를 눌러 가는 목록의 건수와 숫자가 같다(PRD-F22 끝 기준)", () => {
  for (const params of [{}, { period: "7d" }, { project: "proj-a" }, { period: "30d", project: "proj-b", kind: "security" }]) {
    const summary = summarizeDashboard({ alerts, techs, params, now });
    const sizeOf = (link: string) => {
      const query = Object.fromEntries(new URL(link, "http://x").searchParams);
      return filterAlerts(alerts, parseAlertFilter(query, now)).length;
    };

    assert.equal(sizeOf(summary.links.changes), summary.changeCount, JSON.stringify(params));
    assert.equal(sizeOf(summary.links.pending), summary.pendingCount, JSON.stringify(params));
    assert.equal(sizeOf(summary.links.done), summary.doneCount, JSON.stringify(params));
  }
});

test("내 기술 카드는 프로젝트로 거르면 그 프로젝트만 거는 주소로 가고, 같은 규칙으로 센 목록 수가 숫자와 같다", () => {
  for (const params of [{}, { project: "proj-a" }, { project: "proj-b" }, { project: "없는-프로젝트" }]) {
    const summary = summarizeDashboard({ alerts, techs, params, now });
    const shownProject = new URL(summary.links.techs, "http://x").searchParams.get("project");
    const listed = techs.filter((tech) => shownProject === null || tech.projectId === shownProject).length; // /projects 화면의 프로젝트 거르기를 시험 안에서 흉내 낸 것

    assert.equal(listed, summary.techCount, JSON.stringify(params));
  }
  assert.equal(summarizeDashboard({ alerts, techs, params: {}, now }).links.techs, "/projects");
});

test("내 기술 카드 주소에는 프로젝트만 싣고(기간·상태·종류는 안 싣고), 주소에 쓰는 글자가 섞여도 값이 그대로 간다", () => {
  const manyFilters = summarizeDashboard({ alerts, techs, params: { project: "proj-a", period: "7d", kind: "security", status: "done" }, now });
  const odd = "a&b#c d%e+f";
  const oddProject = summarizeDashboard({ alerts, techs, params: { project: odd }, now });

  assert.equal(manyFilters.links.techs, "/projects?project=proj-a");
  assert.equal(new URL(oddProject.links.techs, "http://x").searchParams.get("project"), odd);
});

test("모르는 거르기 값은 링크에도 싣지 않고, 최근 변경은 최신순 5건까지", () => {
  const many = Array.from({ length: 7 }, (_, i) => alert(`m${i}`, `2026-11-1${i}T00:00:00Z`));

  const summary = summarizeDashboard({ alerts: many, techs: [], params: { period: "아무거나", status: "x" }, now });

  assert.equal(summary.links.changes, "/alerts");
  assert.deepEqual(summary.recent.map((a) => a.id), ["m6", "m5", "m4", "m3", "m2"]);
});
