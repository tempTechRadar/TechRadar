import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCAL_PROJECT_NAME, planRows, saveLocalImport, techKeyOf } from "./local-import.ts";

type Op = { table: string; op: string; row?: unknown; filters: [string, unknown][] };

// 메모리 표 + 호출 기록. failInsert에 표 이름을 주면 그 표 insert가 실패한다
function fakeDb(tables: { projects?: Record<string, unknown>[]; technologies?: Record<string, unknown>[]; my_technologies?: Record<string, unknown>[] } = {}, failInsert?: string) {
  const ops: Op[] = [];
  const db = {
    from(table: string) {
      const op: Op = { table, op: "select", filters: [] };
      const q: Record<string, unknown> = {};
      const rows = () => ((tables as Record<string, Record<string, unknown>[]>)[table] ?? []).filter((r) => op.filters.every(([c, v]) => (Array.isArray(v) ? v.includes(r[c]) : r[c] === v)));
      q.select = () => q;
      q.eq = (c: string, v: unknown) => (op.filters.push([c, v]), q);
      q.in = (c: string, v: unknown) => (op.filters.push([c, v]), q);
      q.insert = (row: unknown) => ((op.op = "insert"), (op.row = row), q);
      q.maybeSingle = () => ((op.op = op.op === "select" ? "maybeSingle" : op.op), q);
      q.single = () => q;
      q.then = (res: (v: unknown) => unknown) => {
        ops.push(op);
        if (op.op === "insert") {
          const error = failInsert === table ? { message: "중복 키" } : null;
          return Promise.resolve({ data: error ? null : { id: `${table}-new` }, error }).then(res);
        }
        const found = rows();
        return Promise.resolve({ data: op.op === "maybeSingle" ? found[0] ?? null : found, error: null }).then(res);
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, ops };
}

const TEXT = "mcp|mcp-remote|npm:mcp-remote|0.1.16\nskill|demo|github.com/o/r/skills/demo|-\nmcp|bad|nope|1.0.0";

test("기술 키: npm·PyPI는 카탈로그 키로, 스킬은 키 없음(이름만)", () => {
  assert.equal(techKeyOf({ kind: "mcp", name: "a", source: "import", ecosystem: "npm", pkg: "Mcp-Remote" }), "npm:mcp-remote");
  assert.equal(techKeyOf({ kind: "mcp", name: "a", source: "import", ecosystem: "pypi", pkg: "mcp_server.time" }), "pypi:mcp-server-time");
  assert.equal(techKeyOf({ kind: "skill", name: "demo", source: "import", pkg: "github.com/o/r/x" }), null);
});

test("저장할 줄 고르기: 카탈로그에 있으면 기술로, 없으면 이름만. 이미 있는 것은 빼고 센다", () => {
  const items = [
    { kind: "mcp" as const, name: "mcp-remote", source: "import" as const, ecosystem: "npm" as const, pkg: "mcp-remote", version: "0.1.16" },
    { kind: "skill" as const, name: "demo", source: "import" as const, pkg: "github.com/o/r/skills/demo", version: null },
    { kind: "mcp" as const, name: "time", source: "import" as const, ecosystem: "pypi" as const, pkg: "mcp-server-time", version: "1.0.0" },
  ];
  const { rows, alreadyThere } = planRows(items, new Map([["npm:mcp-remote", "t1"]]), [{ tech_id: null, manual_name: "demo" }], { userId: "u1", projectId: "p1" });
  assert.equal(alreadyThere, 1);
  assert.deepEqual(rows, [
    { owner_id: "u1", added_by: "u1", project_id: "p1", tech_id: "t1", manual_name: null, origin: "import", version: "0.1.16" },
    { owner_id: "u1", added_by: "u1", project_id: "p1", tech_id: null, manual_name: "time", origin: "import", version: "1.0.0" },
  ]);
});

test("처음 가져오기: 프로젝트 밖 칸을 본인 것으로 만들고, 형식 맞는 줄만 한 번에 저장, 기록(exports)을 남긴다", async () => {
  const { db, ops } = fakeDb({ technologies: [{ id: "t1", tech_key: "npm:mcp-remote" }] });
  const r = await saveLocalImport(db, "u1", TEXT);
  assert.ok(r.ok);
  assert.equal(r.ok && r.saved, 2);
  assert.deepEqual(r.skipped.map((s) => s.line), [3]);
  const project = ops.find((o) => o.table === "projects" && o.op === "insert")!.row;
  assert.deepEqual(project, { owner_id: "u1", kind: "local", name: LOCAL_PROJECT_NAME });
  const inserts = ops.filter((o) => o.table === "my_technologies" && o.op === "insert");
  assert.equal(inserts.length, 1, "한 번의 insert(실패하면 아무것도 바뀌지 않음)");
  assert.ok((inserts[0].row as Record<string, unknown>[]).every((x) => x.owner_id === "u1" && x.added_by === "u1" && x.origin === "import"));
  assert.deepEqual(ops.find((o) => o.table === "exports")!.row, { user_id: "u1", kind: "local_import", tech_count: 2, imported_lines: 2, rejected_lines: 1 });
});

test("이미 프로젝트 밖 칸이 있으면 새로 만들지 않는다", async () => {
  const { db, ops } = fakeDb({ projects: [{ id: "p-local", owner_id: "u1", kind: "local" }] });
  await saveLocalImport(db, "u1", TEXT);
  assert.equal(ops.some((o) => o.table === "projects" && o.op === "insert"), false);
  assert.equal(((ops.find((o) => o.table === "my_technologies" && o.op === "insert")!.row as Record<string, unknown>[])[0]).project_id, "p-local");
});

test("저장이 실패하면 이유를 돌려주고 성공으로 보이지 않는다(기록도 남기지 않음, 불변 4)", async () => {
  const { db, ops } = fakeDb({}, "my_technologies");
  const r = await saveLocalImport(db, "u1", TEXT);
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.message : "", /저장하지 못했어요\(아무것도 바뀌지 않음\): 중복 키/);
  assert.equal(ops.some((o) => o.table === "exports"), false);
});

test("형식 맞는 줄이 없거나 비밀값 줄뿐이면 DB를 부르지 않는다", async () => {
  const { db, ops } = fakeDb();
  const r = await saveLocalImport(db, "u1", `mcp|x|npm:x|${"ghp_" + "a1B2c3D4e5F6g7H8i9J0"}`);
  assert.equal(r.ok, false);
  assert.deepEqual(r.secretLines, [1]);
  assert.equal(ops.length, 0);
});

test("가져오기 기록(exports) 저장이 실패해도 목록 저장 결과는 그대로이고, 실패는 로그로 남긴다(삼키지 않음)", async (t) => {
  const logged: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => void logged.push(args));
  const { db } = fakeDb({ technologies: [{ id: "t1", tech_key: "npm:mcp-remote" }] }, "exports");
  const r = await saveLocalImport(db, "u1", TEXT);
  assert.equal(r.ok, true, "목록은 저장됐으니 성공");
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], "가져오기 기록(exports)을 남기지 못함");
});

