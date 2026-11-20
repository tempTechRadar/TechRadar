import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readGuestMapInput, readMapInput, TECH_COLUMNS } from "./map-queries.ts";

type Row = Record<string, unknown>;
// 표마다 정해 둔 줄을 돌려주고, 부른 거르기(eq·is·or·in 등)를 표 이름과 함께 적어 두는 가짜 클라이언트
function recordingDb(rows: Record<string, Row[]>, errors: Record<string, string> = {}) {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "neq", "not", "or", "in", "order", "limit"]) q[m] = (...args: unknown[]) => (calls.push(`${table}.${m}(${args.map(String).join(",")})`), q);
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(errors[table] ? { data: null, error: { message: errors[table] } } : { data: rows[table] ?? [], error: null }).then(resolve);
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

const myRow = { id: "m1", tech_id: "t1", manual_name: null, project_id: "p1", grade: "danger", grade_reason: "취약점", collect_error_kind: null, last_checked_ok_at: null, projects: { name: "앱" } };

test("내 기술은 내 것·숨기지 않은 것·보관하지 않은 프로젝트만, 같은 역할은 확정만 읽는다(불변 5)", async () => {
  const { db, calls } = recordingDb({ my_technologies: [myRow], tech_relations: [{ tech_a: "t1", tech_b: "t2" }], technologies: [{ id: "t1", display_name: "a" }, { id: "t2", display_name: "b" }] });
  const input = await readMapInput(db, "user-a", false);
  assert.ok(calls.includes("my_technologies.eq(owner_id,user-a)"));
  assert.ok(calls.includes("my_technologies.is(hidden_at,null)"));
  assert.ok(calls.includes("my_technologies.is(projects.archived_at,null)"));
  assert.ok(calls.includes("tech_relations.eq(status,confirmed)"));
  assert.deepEqual(input.relations, [{ a: "t1", b: "t2" }]);
  assert.deepEqual(input.mine.map((m) => [m.id, m.projectName, m.grade]), [["m1", "앱", "danger"]]);
});

test("둘레의 비교군은 쓸 수 있는 대안만: 사라진 기술, 시연 계정이 아니면 시뮬레이터 기술을 뺀다(얇은 기술·내 기술 자체는 그대로)", async () => {
  const techs = [
    { id: "t1", display_name: "mine", status: "gone", depth: "thin", is_simulated: false },
    { id: "t2", display_name: "ok", status: "active", depth: "thick", is_simulated: false },
    { id: "t3", display_name: "gone", status: "gone", depth: "thick", is_simulated: false },
    { id: "t4", display_name: "thin", status: "active", depth: "thin", is_simulated: false },
    { id: "t5", display_name: "sim", status: "active", depth: "thick", is_simulated: true },
  ];
  const rels = ["t2", "t3", "t4", "t5"].map((b) => ({ tech_a: "t1", tech_b: b }));
  const plain = recordingDb({ my_technologies: [myRow], tech_relations: rels, technologies: techs });
  assert.deepEqual((await readMapInput(plain.db, "user-a", false)).techs.map((t) => t.id), ["t1", "t2", "t4"]);
  assert.ok(plain.calls.includes("tech_relations.eq(is_simulated,false)"));
  const demo = recordingDb({ my_technologies: [myRow], tech_relations: rels, technologies: techs });
  assert.deepEqual((await readMapInput(demo.db, "demo", true)).techs.map((t) => t.id), ["t1", "t2", "t4", "t5"]);
  assert.ok(!demo.calls.some((c) => c.includes("eq(is_simulated")));
});

test("내 기술 id가 많으면 나눠 읽는다(주소가 너무 길어지지 않게), 이름만 추가한 기술뿐이면 카탈로그를 읽지 않는다", async () => {
  const many = Array.from({ length: 95 }, (_, i) => ({ ...myRow, id: `m${i}`, tech_id: `t${i}` }));
  const { db, calls } = recordingDb({ my_technologies: many });
  await readMapInput(db, "user-a", false);
  assert.equal(calls.filter((c) => c.startsWith("tech_relations.select")).length, 3);
  assert.equal(calls.filter((c) => c.startsWith("technologies.in")).length, 3);
  const manual = recordingDb({ my_technologies: [{ ...myRow, tech_id: null, manual_name: "내 도구" }] });
  const input = await readMapInput(manual.db, "user-a", false);
  assert.deepEqual([input.mine.length, input.techs.length], [1, 0]);
  assert.ok(!manual.calls.some((c) => c.includes("order(depth)")));
});

test("내 기술이 없으면 모은 기술을 두꺼운 것 먼저·최근 순으로 읽는다(시뮬레이터·사라진 기술 제외)", async () => {
  const { db, calls } = recordingDb({ technologies: [{ id: "t9", display_name: "x" }] });
  const input = await readMapInput(db, "user-a", false);
  assert.deepEqual(input.techs.map((t) => t.id), ["t9"]);
  for (const c of ["technologies.order(depth)", "technologies.eq(is_simulated,false)", "technologies.neq(status,gone)", "technologies.limit(300)"]) assert.ok(calls.includes(c), c);
  assert.ok(!calls.some((c) => c.startsWith("tech_relations")));
});

test("어느 하나라도 읽기에 실패하면 빈 지도로 삼키지 않고 무엇을 못 읽었는지와 함께 던진다", async () => {
  const { db } = recordingDb({ my_technologies: [myRow] }, { tech_relations: "timeout" });
  await assert.rejects(readMapInput(db, "user-a", false), /같은 역할을 읽지 못함: timeout/);
  const { db: db2 } = recordingDb({}, { my_technologies: "denied" });
  await assert.rejects(readMapInput(db2, "user-a", false), /내 기술을 읽지 못함/);
});

test("로그인 전 지도는 공용 표(technologies·categories)만, 시뮬레이터·사라진 기술 빼고 읽는다(ADR 0029, 불변 5)", async () => {
  const { db, calls } = recordingDb({ technologies: [{ id: "t1", display_name: "a" }], categories: [{ id: "c1", name: "검사·보안", parent_id: null }] });
  const input = await readGuestMapInput(db);
  assert.deepEqual([...new Set(calls.map((c) => c.split(".")[0]))].sort(), ["categories", "technologies"]);
  assert.ok(calls.includes("technologies.eq(is_simulated,false)"));
  assert.ok(calls.includes("technologies.neq(status,gone)"));
  assert.deepEqual([input.mine, input.relations, input.techs.map((t) => t.id)], [[], [], ["t1"]]);
});

test("공개 칸은 정해 둔 목록 그대로다: 칸을 더하면 이 시험과 ADR 0029를 함께 고친다(로그인 전에도 나가므로)", () => {
  assert.deepEqual(TECH_COLUMNS.split(",").map((c) => c.trim()), [
    "id", "tech_key", "created_at", "display_name", "type", "hosts", "category_id", "grade", "grade_reason", "one_liner", "repo_url",
    "last_activity_at", "last_activity_kind", "last_checked_ok_at", "collect_error_kind", "signals", "status", "depth", "is_simulated",
  ]);
});

test("카탈로그는 공개 목록에서 온 기술만 읽고(남의 비공개 저장소에서 생긴 줄 제외), 신호는 지도가 쓰는 두 값만 남긴다(ADR 0029)", async () => {
  const { db, calls } = recordingDb({ technologies: [{ id: "t1", display_name: "a", signals: { stars: 5, weekly_downloads: 9, github_error: "403 rate limit" } }], categories: [] });
  const input = await readGuestMapInput(db);
  assert.ok(calls.includes("technologies.not(one_liner_source,is,null)"));
  assert.deepEqual(input.techs[0].signals, { stars: 5, weekly_downloads: 9 });
});

test("로그인 전 지도를 못 읽으면 던진다(빈 지도로 보이지 않게, 불변 2)", async () => {
  const { db } = recordingDb({}, { technologies: "boom" });
  await assert.rejects(readGuestMapInput(db));
});
