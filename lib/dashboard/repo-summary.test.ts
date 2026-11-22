import { test } from "node:test";
import assert from "node:assert/strict";
import { repoSummary } from "./repo-summary.ts";
import type { StatusProjectRow, StatusTechRow } from "./status-view.ts";

const t = (id: string, o: Partial<StatusTechRow> = {}): StatusTechRow => ({ id, tech_id: id, manual_name: null, hidden_at: null, read_at: null, collect_error_kind: null, grade: "pass", technologies: { display_name: id, type: "mcp" }, ...o });
const repo: StatusProjectRow = { id: "p1", name: "앱", kind: "repo", my_technologies: [
  t("a", { grade: "danger", source_file: "package.json" }), t("b", { grade: "caution", source_file: ".mcp.json" }), t("c", { source_file: "package.json", technologies: { display_name: "c", type: "skill" } }),
  t("d", { grade: "unknown", tech_id: null, technologies: null, manual_name: "내 것" }), t("e", { technologies: { display_name: "e", type: "concept" } }), t("f", { grade: "danger", hidden_at: "2026-11-01" }),
] };

test("레포 요약: 등급 배터리(숨긴 · 개념 빼고), 종류별 수(많은 순), 출처 파일(겹침 없이 이름순)", () => {
  const s = repoSummary(repo, []);
  assert.deepEqual(s.battery, { danger: 1, caution: 1, pass: 1, unknown: 1 });
  assert.equal(s.concepts, 1);
  assert.deepEqual(s.tools, [{ label: "MCP", n: 2 }, { label: "개념", n: 1 }, { label: "스킬", n: 1 }, { label: "직접 넣은 것", n: 1 }]);
  assert.deepEqual(s.files, [".mcp.json", "package.json"]);
});

test("판단 대기 · 모델 종료는 이 레포의 대기 알림만, 알림을 못 읽었으면 null(0과 다르게)", () => {
  const alerts = [{ kind: "model_eol", status: "pending", projectId: "p1" }, { kind: "security", status: "pending", projectId: "p1" }, { kind: "security", status: "done", projectId: "p1" }, { kind: "security", status: "pending", projectId: "p2" }];
  const s = repoSummary(repo, alerts);
  assert.deepEqual([s.pending, s.modelEol], [2, 1]);
  const none = repoSummary(repo, null);
  assert.deepEqual([none.pending, none.modelEol], [null, null]);
});
