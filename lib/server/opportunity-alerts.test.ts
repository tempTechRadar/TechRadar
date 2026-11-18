import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAlertsForChange } from "./alerts.ts";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type Write = { table: string; rows: Row[]; options: { onConflict?: string; ignoreDuplicates?: boolean } };

// 실제 DB 대신 메모리 표로 "무엇을 읽고 무엇을 쓰려 했는지"만 모으는 가짜 클라이언트
function fakeDb(tables: Tables, errors: Record<string, string> = {}) {
  const writes: Write[] = [];
  const inserts: { table: string; row: Row }[] = [];
  const db = {
    from(table: string) {
      const readError = errors[`read:${table}`];
      return {
        insert(row: Row) {
          inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
        select() {
          let result = tables[table] ?? [];
          const q = {
            order() { return q; },
            range(from: number, to: number) { result = result.slice(from, to + 1); return q; },
            eq(col: string, val: unknown) { result = result.filter((r) => r[col] === val); return q; },
            in(col: string, vals: unknown[]) { result = result.filter((r) => vals.includes(r[col])); return q; },
            single: () => Promise.resolve(!readError && result.length === 1 ? { data: result[0], error: null } : { data: null, error: { message: readError ?? "한 줄이 아님" } }),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(readError ? { data: null, error: { message: readError } } : { data: result, error: null }).then(resolve),
          };
          return q;
        },
        upsert(rows: Row[], options: Write["options"]) {
          writes.push({ table, rows, options });
          const keys = (options.onConflict ?? "").split(",");
          const stored = (tables[table] ??= []);
          const inserted = rows.filter((row) => !stored.some((s) => keys.every((k) => s[k] === row[k])));
          stored.push(...inserted.map((row, i) => ({ id: `${table}-${stored.length + i + 1}`, ...row })));
          return { select: () => Promise.resolve({ data: inserted.map((r) => ({ id: r.id })), error: null }) };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, writes, inserts };
}

const tech = (id: string, key: string, overrides: Row = {}): Row => ({
  id, tech_key: key, display_name: `${key} 이름`, created_at: "2026-11-01T00:00:00Z", grade: "pass", grade_reason: "알려진 문제가 없어요", grade_evidence: null,
  one_liner: `${key} 설명`, one_liner_source: `https://registry.example/${key}`, last_activity_at: "2026-11-10T00:00:00Z",
  last_activity_kind: "release", repo_url: `https://github.com/o/${key}`, license: "MIT", signals: null, ...overrides,
});

function baseTables(): Tables {
  return {
    changes: [{ id: "change-1", kind: "same_role_new", dedupe_key: "relation:r1", is_simulated: false }],
    technologies: [tech("mine", "mcp-mine"), tech("new", "mcp-new", { created_at: "2026-11-18T00:00:00Z" })],
    tech_relations: [{ tech_a: "mine", tech_b: "new", status: "confirmed", confirmed_at: "2026-11-18T01:00:00Z" }],
    my_technologies: [
      { id: "mt-a", owner_id: "user-a", tech_id: "mine", project_id: "p-a", hidden_at: null, created_at: "2026-11-05T00:00:00Z" },
      { id: "mt-b", owner_id: "user-b", tech_id: "mine", project_id: "p-b", hidden_at: null, created_at: "2026-11-06T00:00:00Z" },
    ],
    projects: [{ id: "p-a", archived_at: null }, { id: "p-b", archived_at: null }],
    profiles: [{ id: "user-a", is_demo: false }, { id: "user-b", is_demo: false }],
    alerts: [],
  };
}

const input = { changeId: "change-1", techId: "new", kind: "opportunity" as const };

test("확정된 같은 역할의 기술을 쓰는 사람마다 적용 기회 알림을 비교표와 함께 만들고, 만든 개수를 돌려준다", async () => {
  const { db, writes } = fakeDb(baseTables());

  const created = await createAlertsForChange(db, input);

  assert.equal(created, 2);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].options, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
  const [first] = writes[0].rows as { comparison: { myTechName: string; newTechName: string; confirmedAt: string; rows: { item: string }[] } }[];
  assert.deepEqual(
    writes[0].rows.map(({ comparison: _comparison, ...rest }) => rest),
    [
      { user_id: "user-a", change_id: "change-1", my_technology_id: "mt-a", kind: "opportunity", dedupe_key: "user-a|mcp-mine|mcp-new" },
      { user_id: "user-b", change_id: "change-1", my_technology_id: "mt-b", kind: "opportunity", dedupe_key: "user-b|mcp-mine|mcp-new" },
    ],
  );
  // 알림 상세가 "나오게 된 이유"와 표 머리를 그릴 값(내 기술·새 기술 이름, 같은 역할로 확정한 시각)도 같이 저장한다
  assert.equal(first.comparison.myTechName, "mcp-mine 이름");
  assert.equal(first.comparison.newTechName, "mcp-new 이름");
  assert.equal(first.comparison.confirmedAt, "2026-11-18T01:00:00Z");
  assert.deepEqual(first.comparison.rows.map((r) => r.item), ["하는 일", "보안 등급과 이유", "최근 업데이트", "사용량", "라이선스"]);
});

test("같은 변경으로 다시 불러도 0건이고 쓰기 요청을 보내지 않는다", async () => {
  const { db, writes } = fakeDb(baseTables());

  await createAlertsForChange(db, input);
  const again = await createAlertsForChange(db, input);

  assert.equal(again, 0);
  assert.equal(writes.length, 1);
});

test("후보 관계이거나 새 기술이 위험이면 알림을 만들지 않는다", async () => {
  const candidate = baseTables();
  candidate.tech_relations[0].status = "candidate";
  candidate.tech_relations[0].confirmed_at = null;
  const dangerous = baseTables();
  dangerous.technologies[1].grade = "danger";

  assert.equal(await createAlertsForChange(fakeDb(candidate).db, input), 0);
  assert.equal(await createAlertsForChange(fakeDb(dangerous).db, input), 0);
});

test("같은 역할 새 기술(same_role_new)이 아닌 변경에 적용 기회 알림을 만들라고 하면 오류", async () => {
  const tables = baseTables();
  tables.changes[0].kind = "grade_to_danger";
  const { db, writes } = fakeDb(tables);

  await assert.rejects(() => createAlertsForChange(db, input), /적용 기회.*same_role_new.*grade_to_danger/);

  assert.equal(writes.length, 0);
});

test("읽기가 실패하면 삼키지 않고 어디서 실패했는지와 함께 던지며, 아무것도 쓰지 않는다", async () => {
  const readSteps: [string, RegExp][] = [
    ["technologies", /기술 정보를 읽지 못함.*연결 실패/],
    ["tech_relations", /같은 역할을 읽지 못함.*연결 실패/],
  ];
  for (const [table, expected] of readSteps) {
    const { db, writes } = fakeDb(baseTables(), { [`read:${table}`]: "연결 실패" });
    await assert.rejects(() => createAlertsForChange(db, input), expected, table);
    assert.equal(writes.length, 0, table);
  }
});

test("runId가 있으면 notify 단계를 기록한다(들어온 사람 수, 만든 알림 수)", async () => {
  const { db, inserts } = fakeDb(baseTables());

  await createAlertsForChange(db, { ...input, runId: "run-1" });

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].row.step_name, "notify");
  assert.equal(inserts[0].row.count_in, 2);
  assert.equal(inserts[0].row.count_out, 2);
});
