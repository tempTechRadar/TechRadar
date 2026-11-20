import assert from "node:assert/strict";
import test from "node:test";
import { groupReports, type NoteRow, type ReportRow, type TechRow } from "./report-groups.ts";

const note = (id: string, over: Partial<NoteRow> = {}): NoteRow => ({
  id, techId: "t1", usedFor: "검색", result: "잘 됨", tip: "팁", helpfulCount: 0, hiddenAt: null, createdAt: "2026-11-20T01:00:00Z", ...over,
});
const report = (id: string, noteId: string, over: Partial<ReportRow> = {}): ReportRow => ({
  id, noteId, reason: "광고", createdAt: "2026-11-20T02:00:00Z", handledAt: null, handleReason: null, ...over,
});
const techs: TechRow[] = [{ id: "t1", name: "mcp-proxy" }, { id: "t2", name: "supergateway" }];

test("신고를 글별로 묶고 처리 전 수와 사유를 모은다", () => {
  const r = groupReports({
    reports: [report("r1", "n1"), report("r2", "n1", { reason: "링크", createdAt: "2026-11-20T03:00:00Z" })],
    notes: [note("n1")], techs, filter: "all",
  });
  assert.equal(r.groups.length, 1);
  const g = r.groups[0];
  assert.equal(g.noteId, "n1");
  assert.equal(g.techName, "mcp-proxy");
  assert.equal(g.pendingCount, 2);
  assert.equal(g.handledCount, 0);
  assert.deepEqual(g.reasons.map((x) => x.reason), ["링크", "광고"]); // 최근 신고 먼저
});

test("처리 전·처리함 거르기와 숫자(거르기와 상관없이 전체 기준)", () => {
  const input = {
    reports: [report("r1", "n1"), report("r2", "n2", { handledAt: "2026-11-20T04:00:00Z", handleReason: "문제 없음" })],
    notes: [note("n1"), note("n2")], techs,
  };
  const pending = groupReports({ ...input, filter: "pending" });
  const handled = groupReports({ ...input, filter: "handled" });
  assert.deepEqual(pending.groups.map((g) => g.noteId), ["n1"]);
  assert.deepEqual(handled.groups.map((g) => g.noteId), ["n2"]);
  assert.deepEqual(pending.counts, { pending: 1, handled: 1, all: 2 });
  assert.deepEqual(handled.counts, { pending: 1, handled: 1, all: 2 });
  assert.equal(handled.groups[0].handleReason, "문제 없음");
});

test("처리 전 신고가 하나라도 있으면 그 글은 처리 전이다 (일부만 처리돼도)", () => {
  const r = groupReports({
    reports: [report("r1", "n1", { handledAt: "2026-11-20T04:00:00Z" }), report("r2", "n1")],
    notes: [note("n1")], techs, filter: "pending",
  });
  assert.equal(r.groups.length, 1);
  assert.equal(r.groups[0].pendingCount, 1);
  assert.equal(r.groups[0].handledCount, 1);
});

test("정렬: 처리 전 신고가 많은 글, 같으면 최근 신고가 있는 글이 먼저", () => {
  const r = groupReports({
    reports: [
      report("r1", "n1", { createdAt: "2026-11-20T01:00:00Z" }),
      report("r2", "n2", { createdAt: "2026-11-20T05:00:00Z" }), report("r3", "n2", { createdAt: "2026-11-20T06:00:00Z" }),
      report("r4", "n3", { createdAt: "2026-11-20T09:00:00Z" }),
    ],
    notes: [note("n1"), note("n2"), note("n3")], techs, filter: "all",
  });
  assert.deepEqual(r.groups.map((g) => g.noteId), ["n2", "n3", "n1"]);
});

test("숨김 여부와 도움이 됐어요 수를 그대로 싣는다", () => {
  const r = groupReports({ reports: [report("r1", "n1")], notes: [note("n1", { hiddenAt: "2026-11-20T07:00:00Z", helpfulCount: 4 })], techs, filter: "all" });
  assert.equal(r.groups[0].hidden, true);
  assert.equal(r.groups[0].helpfulCount, 4);
});

test("글이나 기술 이름을 못 찾아도 신고를 버리지 않는다 (없는 것으로 단정하지 않음)", () => {
  const r = groupReports({ reports: [report("r1", "nX"), report("r2", "n1")], notes: [note("n1", { techId: "tX" })], techs, filter: "all" });
  assert.equal(r.groups.length, 2);
  const missing = r.groups.find((g) => g.noteId === "nX");
  assert.equal(missing?.note, null);
  assert.equal(missing?.techName, null);
  assert.equal(r.groups.find((g) => g.noteId === "n1")?.techName, null);
});

test("신고가 없으면 빈 목록과 0", () => {
  assert.deepEqual(groupReports({ reports: [], notes: [], techs, filter: "pending" }), { groups: [], counts: { pending: 0, handled: 0, all: 0 } });
});
