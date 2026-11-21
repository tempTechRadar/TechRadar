import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMyAlert, listMyAlerts } from "./alert-queries.ts";

type Row = Record<string, unknown>;

// 실제 DB 대신, 요청한 표·거르기·정렬을 모으고 미리 정한 줄을 돌려주는 가짜 클라이언트
function fakeDb(rows: Row[], error?: string) {
  const calls: { table?: string; select?: string; eq: [string, unknown][]; order?: [string, unknown] } = { eq: [] };
  const db = {
    from(table: string) {
      calls.table = table;
      return {
        select(columns: string) {
          calls.select = columns;
          let result = rows;
          const q = {
            eq(col: string, val: unknown) { calls.eq.push([col, val]); result = result.filter((r) => r[col] === val); return q; },
            order(col: string, options: unknown) { calls.order = [col, options]; return q; },
            maybeSingle: () => Promise.resolve(error ? { data: null, error: { message: error } } : { data: result[0] ?? null, error: null }),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(error ? { data: null, error: { message: error } } : { data: result, error: null }).then(resolve),
          };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

const alertRow = (id: string, userId: string, createdAt: string): Row => ({
  id,
  user_id: userId,
  kind: "security",
  status: "pending",
  created_at: createdAt,
  changes: {
    kind: "grade_to_danger",
    detected_at: "2026-11-18T01:30:00Z",
    prev_value: { grade: "caution" },
    curr_value: { grade: "danger" },
    technologies: { display_name: "mcp-remote" },
  },
  my_technologies: { source_file: "package.json", project_id: "proj-1", projects: { name: "TechRadar" } },
});

test("내 알림만 최신순으로 읽어 화면용 줄(AlertRecord)로 바꾼다", async () => {
  const { db, calls } = fakeDb([alertRow("a1", "user-a", "2026-11-18T01:30:00Z"), alertRow("b1", "user-b", "2026-11-18T02:00:00Z")]);

  const alerts = await listMyAlerts(db, "user-a");

  assert.equal(calls.table, "alerts");
  assert.deepEqual(calls.eq, [["user_id", "user-a"]]);
  assert.deepEqual(calls.order, ["created_at", { ascending: false }]);
  assert.deepEqual(alerts, [
    {
      id: "a1",
      kind: "security",
      status: "pending",
      createdAt: "2026-11-18T01:30:00Z",
      projectId: "proj-1",
      projectName: "TechRadar",
      sourceFile: "package.json",
      myTechnologyId: null,
      tech: null,
      change: {
        kind: "grade_to_danger",
        techName: "mcp-remote",
        detectedAt: "2026-11-18T01:30:00Z",
        prevValue: { grade: "caution" },
        currValue: { grade: "danger" },
        draft: null,
      },
      judgment: null,
      comparison: null,
    },
  ]);
});

test("알림이 없으면 빈 목록, 읽기에 실패하면 빈 목록이 아니라 오류(없음과 불러오지 못함은 다르다)", async () => {
  assert.deepEqual(await listMyAlerts(fakeDb([]).db, "user-a"), []);

  await assert.rejects(() => listMyAlerts(fakeDb([], "연결 실패").db, "user-a"), /알림을 읽지 못함.*연결 실패/);
});

test("프로젝트 밖 기술(내 기술 줄이 없음)이어도 읽는다", async () => {
  const row = { ...alertRow("a1", "user-a", "2026-11-18T01:30:00Z"), my_technologies: null };

  const [alert] = await listMyAlerts(fakeDb([row]).db, "user-a");

  assert.equal(alert.projectId, null);
  assert.equal(alert.projectName, null);
  assert.equal(alert.sourceFile, null);
});

test("알림 한 건은 내 것일 때만 읽고, 남의 알림 id나 없는 id는 null(없음), 읽기 실패는 오류", async () => {
  const rows = [alertRow("a1", "user-a", "2026-11-18T01:30:00Z"), alertRow("b1", "user-b", "2026-11-18T02:00:00Z")];

  const mine = await getMyAlert(fakeDb(rows).db, "user-a", "a1");
  const theirs = await getMyAlert(fakeDb(rows).db, "user-a", "b1");
  const missing = await getMyAlert(fakeDb(rows).db, "user-a", "없는-id");

  assert.equal(mine?.id, "a1");
  assert.equal(theirs, null);
  assert.equal(missing, null);
  await assert.rejects(() => getMyAlert(fakeDb(rows, "연결 실패").db, "user-a", "a1"), /알림을 읽지 못함.*연결 실패/);
});

test("판단한 알림은 판단 결과(적용 후보·보류, 이유, 고친 버전)도 함께 읽는다. 한 줄 객체든 한 줄짜리 배열이든 같다", async () => {
  const judgment = { decision: "hold", reason: "지금은 바꿀 시간이 없어요", fixed_version: null, judged_at: "2026-11-18T05:00:00Z" };
  const asObject = { ...alertRow("a1", "user-a", "2026-11-18T01:30:00Z"), status: "done", judgments: judgment };
  const asArray = { ...asObject, judgments: [judgment] };

  const [fromObject] = await listMyAlerts(fakeDb([asObject]).db, "user-a");
  const [fromArray] = await listMyAlerts(fakeDb([asArray]).db, "user-a");

  const expected = { decision: "hold", reason: "지금은 바꿀 시간이 없어요", fixedVersion: null, judgedAt: "2026-11-18T05:00:00Z" };
  assert.deepEqual(fromObject.judgment, expected);
  assert.deepEqual(fromArray.judgment, expected);
});

test("적용 기회 알림은 저장해 둔 비교표(두 기술 이름·확정한 시각·5항목)도 읽고, 모양이 맞지 않으면 null로 둔다", async () => {
  const stored = {
    myTechName: "mcp-mine",
    newTechName: "mcp-new",
    confirmedAt: "2026-11-18T01:00:00Z",
    rows: [{ item: "라이선스", mine: { value: "MIT", source: null }, theirs: { value: "Apache-2.0", source: "https://github.com/o/new" } }],
  };
  const withComparison = { ...alertRow("a1", "user-a", "2026-11-18T01:30:00Z"), kind: "opportunity", comparison: stored };
  const oldShape = { ...withComparison, comparison: [{ item: "예전 모양(표 5줄만)" }] };
  const broken = { ...withComparison, comparison: "깨진 값" };

  const [ok] = await listMyAlerts(fakeDb([withComparison]).db, "user-a");
  const [old] = await listMyAlerts(fakeDb([oldShape]).db, "user-a");
  const [bad] = await listMyAlerts(fakeDb([broken]).db, "user-a");

  assert.deepEqual(ok.comparison, stored);
  assert.equal(old.comparison, null);
  assert.equal(bad.comparison, null);
});

test("변경에 저장된 대응안 초안(글과 출처)도 읽는다. 비었거나 모양이 맞지 않으면 null이고, 출처가 깨졌으면 빈 목록", async () => {
  const withDraft = alertRow("a1", "user-a", "2026-11-18T01:30:00Z");
  Object.assign(withDraft.changes as object, { draft_response: "고친 버전으로 올리세요", draft_sources: ["https://osv.dev/CVE-1"] });
  const emptyDraft = alertRow("a2", "user-a", "2026-11-18T01:31:00Z");
  Object.assign(emptyDraft.changes as object, { draft_response: null, draft_sources: null });
  const brokenSources = alertRow("a3", "user-a", "2026-11-18T01:32:00Z");
  Object.assign(brokenSources.changes as object, { draft_response: "초안", draft_sources: "깨진 값" });

  const [a, b, c] = await listMyAlerts(fakeDb([withDraft, emptyDraft, brokenSources]).db, "user-a");

  assert.deepEqual(a.change.draft, { text: "고친 버전으로 올리세요", sources: ["https://osv.dev/CVE-1"] });
  assert.equal(b.change.draft, null);
  assert.deepEqual(c.change.draft, { text: "초안", sources: [] });
});

test("변경의 기술에서 행 태그용 하는 일 갈래(세부 갈래면 그 위)와 종류, 지도 · 상세 링크용 id를 읽는다", async () => {
  const row = alertRow("a1", "user-a", "2026-11-18T01:30:00Z");
  row.my_technology_id = "mt-1";
  (row.changes as Row).technologies = { id: "t-1", display_name: "mcp-remote", type: "mcp", categories: { name: "서버·인프라", parent: { name: "배포·운영" } } };
  const [r] = await listMyAlerts(fakeDb([row]).db, "user-a");
  assert.deepEqual([r.myTechnologyId, r.tech], ["mt-1", { id: "t-1", type: "mcp", field: "배포·운영" }]);
  const top = alertRow("a1", "user-a", "2026-11-18T01:30:00Z");
  (top.changes as Row).technologies = { id: "t-2", display_name: "x", type: "skill", categories: { name: "검사·보안", parent: null } };
  assert.deepEqual((await listMyAlerts(fakeDb([top]).db, "user-a"))[0].tech, { id: "t-2", type: "skill", field: "검사·보안" });
  assert.equal((await listMyAlerts(fakeDb([alertRow("a1", "user-a", "2026-11-18T01:30:00Z")]).db, "user-a"))[0].tech, null, "기술 id를 못 읽으면 태그 · 링크 없음");
});
