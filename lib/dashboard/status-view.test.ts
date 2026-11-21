import { test } from "node:test";
import assert from "node:assert/strict";
import { appliedTechs, repoCards, type StatusProjectRow, type StatusTechRow } from "./status-view.ts";

const tech = (id: string, o: Partial<StatusTechRow> = {}): StatusTechRow => ({
  id, tech_id: `t-${id}`, manual_name: null, hidden_at: null, read_at: "2026-11-20T00:00:00Z", collect_error_kind: null, grade: "pass", technologies: { display_name: id }, ...o,
});
const NOW = new Date("2026-11-22T00:00:00Z");

test("내 레포 카드: 숨긴 기술은 빼고 세고, 수집 오류 수 · 마지막 읽기 · 읽기 실패 안내", () => {
  const rows: StatusProjectRow[] = [
    { id: "p1", name: "앱", kind: "repo", runs: [{ status: "succeeded", created_at: "2026-11-21T00:00:00Z" }],
      my_technologies: [tech("a"), tech("b", { collect_error_kind: "http_5xx", read_at: "2026-11-21T09:00:00Z" }), tech("c", { hidden_at: "2026-11-21T00:00:00Z", read_at: "2026-11-22T00:00:00Z" })] },
    { id: "p2", name: "새 저장소", kind: "repo", runs: [{ status: "failed", created_at: "2026-11-21T00:00:00Z" }], my_technologies: [] },
  ];
  const [a, b] = repoCards(rows, NOW);
  assert.deepEqual([a.techCount, a.errorCount, a.lastReadAt, a.notice], [2, 1, "2026-11-21T09:00:00Z", null]);
  assert.equal(b.techCount, 0);
  assert.match(b.notice!, /실패/); // 기술 0개를 "없음"으로 단정하지 않게 안내가 붙는다
});

test("적용한 기술: 같은 기술은 프로젝트를 합쳐 한 줄(가장 나쁜 등급), 위험 먼저, 태그를 못 읽으면 null", () => {
  const rows: StatusProjectRow[] = [
    { id: "p1", name: "앱", kind: "repo", my_technologies: [tech("zod"), tech("mcp", { grade: "caution" }), tech("mine", { tech_id: null, manual_name: "내 도구", technologies: null })] },
    { id: "p2", name: "웹", kind: "repo", my_technologies: [tech("mcp2", { tech_id: "t-mcp", grade: "danger", technologies: { display_name: "mcp" }, collect_error_kind: "timeout" })] },
  ];
  const list = appliedTechs(rows, new Map([["t-mcp", ["시연"]]]));
  assert.deepEqual(list.map((t) => [t.name, t.grade, t.projects.join(",")]), [["mcp", "danger", "앱,웹"], ["zod", "pass", "앱"], ["내 도구", "pass", "앱"]].sort((x, y) => (x[1] === "danger" ? -1 : y[1] === "danger" ? 1 : x[0].localeCompare(y[0]))));
  const mcp = list[0];
  assert.deepEqual([mcp.myTechId, mcp.collectError, mcp.tags], ["mcp2", true, ["시연"]]);
  assert.equal(list.find((t) => t.name === "내 도구")!.techId, null);
  assert.ok(appliedTechs(rows, null).every((t) => t.tags === null));
});
