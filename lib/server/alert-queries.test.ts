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
      change: {
        kind: "grade_to_danger",
        techName: "mcp-remote",
        detectedAt: "2026-11-18T01:30:00Z",
        prevValue: { grade: "caution" },
        currValue: { grade: "danger" },
      },
      judgment: null,
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
