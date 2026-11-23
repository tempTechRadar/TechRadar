import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readGuestMapInput, readListedByIds, readMapInput, STARTER_MAX, TECH_COLUMNS } from "./map-queries.ts";
import { NOT_BULK_FILTER } from "../domain/registry.ts";

type Row = Record<string, unknown>;
// 표마다 정해 둔 줄을 돌려주고, 부른 거르기(eq·is·or·in 등)를 표 이름과 함께 적어 두는 가짜 클라이언트.
// 줄 대신 함수를 주면 그 질의에서 부른 거르기를 보고 줄을 고른다(같은 표를 두 번 다르게 읽을 때)
type Rows = Row[] | ((queryCalls: string[]) => Row[]);
function recordingDb(rows: Record<string, Rows>, errors: Record<string, string> = {}) {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      const q: Record<string, unknown> = {}, mine: string[] = [];
      for (const m of ["select", "eq", "is", "neq", "not", "gt", "or", "in", "order", "limit"]) q[m] = (...args: unknown[]) => { const c = `${table}.${m}(${args.map((a) => (a && typeof a === "object" ? JSON.stringify(a) : String(a))).join(",")})`; calls.push(c); mine.push(c); return q; };
      const data = () => { const r = rows[table] ?? []; return typeof r === "function" ? r(mine) : r; };
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(errors[table] ? { data: null, error: { message: errors[table] } } : { data: data(), error: null }).then(resolve);
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
  assert.deepEqual(input.relations, [{ a: "t1", b: "t2", quote: null }]);
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
  const byId = (qc: string[]) => (qc.some((c) => c.startsWith("technologies.in")) ? techs : []); // 카탈로그 읽기는 비어 있고, id로 읽을 때만
  const plain = recordingDb({ my_technologies: [myRow], tech_relations: rels, technologies: byId });
  assert.deepEqual((await readMapInput(plain.db, "user-a", false)).techs.map((t) => t.id), ["t1", "t2", "t4"]);
  assert.ok(plain.calls.includes("tech_relations.eq(is_simulated,false)"));
  const demo = recordingDb({ my_technologies: [myRow], tech_relations: rels, technologies: byId });
  assert.deepEqual((await readMapInput(demo.db, "demo", true)).techs.map((t) => t.id), ["t1", "t2", "t4", "t5"]);
  assert.ok(!demo.calls.some((c) => c.includes("eq(is_simulated")));
});

test("내 기술 id가 많으면 나눠 읽는다(주소가 너무 길어지지 않게), 이름만 추가한 기술뿐이면 비교군을 읽지 않는다", async () => {
  const many = Array.from({ length: 95 }, (_, i) => ({ ...myRow, id: `m${i}`, tech_id: `t${i}` }));
  const { db, calls } = recordingDb({ my_technologies: many });
  await readMapInput(db, "user-a", false);
  assert.equal(calls.filter((c) => c.startsWith("tech_relations.select")).length, 3);
  assert.equal(calls.filter((c) => c.startsWith("technologies.in")).length, 3);
  const manual = recordingDb({ my_technologies: [{ ...myRow, tech_id: null, manual_name: "내 도구" }] });
  const input = await readMapInput(manual.db, "user-a", false);
  assert.deepEqual([input.mine.length, input.techs.length], [1, 0]);
  assert.ok(!manual.calls.some((c) => c.startsWith("tech_relations")));
});

test("모은 기술은 위험 → 주의 → 입문 세트 → 이번 주 새 기술 → 개발 분야(스킬 · 플러그인 · 개념 · 개발 도구 · 개발 갈래)를 두꺼운 것 · 별 많은 순, 모자랄 때만 나머지(ADR 0030 8항, 겹치면 한 번), 내 판단 표시는 내 것만", async () => {
  const cats = [{ id: "fe", name: "프론트엔드", parent_id: null }, { id: "fe-ui", name: "화면·컴포넌트", parent_id: "fe" }, { id: "life", name: "생활·정보", parent_id: null }];
  const starterCalls: string[] = [];
  const pick = (qc: string[]) => qc.some((c) => c.includes("grade.eq.danger")) ? [{ id: "risk", display_name: "r" }]
    : qc.some((c) => c.includes("eq(signals->>starter_set,true)")) ? (starterCalls.push(...qc), [{ id: "start1", display_name: "s" }])
    : qc.some((c) => c.startsWith("technologies.gt(created_at")) ? [{ id: "new1", display_name: "n" }, { id: "risk", display_name: "r" }]
    : qc.some((c) => c.includes("type.in.(skill,plugin,concept)")) ? [{ id: "dev", display_name: "d" }, { id: "new1", display_name: "n" }, { id: "start1", display_name: "s" }]
    : [{ id: "life1", display_name: "l" }, { id: "dev", display_name: "d" }];
  const { db, calls } = recordingDb({ technologies: pick, categories: cats });
  const input = await readMapInput(db, "user-a", false);
  assert.deepEqual(input.techs.map((t) => t.id), ["risk", "start1", "new1", "dev", "life1"]);
  assert.ok(calls.includes("technologies.or(type.in.(skill,plugin,concept),category_id.in.(fe,fe-ui))"), "개발 갈래와 그 아래 세부 갈래");
  // 입문 세트 질의 하나만 보고: 공개 목록 조건 + 몫(서비스 키로 읽는 로그인 전 지도에 비공개 줄이 나가지 않게, 불변 5)
  for (const c of ["technologies.neq(status,gone)", "technologies.not(one_liner_source,is,null)", "technologies.eq(is_simulated,false)", `technologies.limit(${STARTER_MAX})`]) assert.ok(starterCalls.includes(c), `입문 세트 질의: ${c}`);
  for (const c of ['technologies.order(grade,{"ascending":false})', 'technologies.order(signals->stars,{"ascending":false,"nullsFirst":false})', "technologies.order(depth)", "technologies.eq(is_simulated,false)", "technologies.neq(status,gone)", "technologies.limit(500)", "tech_marks.eq(user_id,user-a)"]) assert.ok(calls.includes(c), c);
  assert.ok(!calls.some((c) => c.startsWith("tech_relations")));
});

test("어느 하나라도 읽기에 실패하면 빈 지도로 삼키지 않고 무엇을 못 읽었는지와 함께 던진다", async () => {
  const { db } = recordingDb({ my_technologies: [myRow] }, { tech_relations: "timeout" });
  await assert.rejects(readMapInput(db, "user-a", false), /같은 역할을 읽지 못함: timeout/);
  const { db: db2 } = recordingDb({}, { my_technologies: "denied" });
  await assert.rejects(readMapInput(db2, "user-a", false), /사용 중인 항목을 읽지 못함/);
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
    "id", "tech_key", "created_at", "display_name", "type", "hosts", "category_id", "grade", "grade_reason", "one_liner", "repo_url", "license",
    "last_activity_at", "last_activity_kind", "last_checked_ok_at", "collect_error_kind", "signals", "status", "depth", "is_simulated", "is_official",
    "one_liner_source", "one_liner_ko", "one_liner_ko_src", "one_liner_ko_at", // P-12r(11-24): 한국어 개요 · 한 줄 설명 출처(원문 보기). ADR 0029 3항
  ]);
});

test("카탈로그는 공개 목록에서 온 기술만 읽고(남의 비공개 저장소에서 생긴 줄 제외), 신호는 지도가 쓰는 두 값만 남긴다(ADR 0029)", async () => {
  const { db, calls } = recordingDb({ technologies: [{ id: "t1", display_name: "a", signals: { stars: 5, weekly_downloads: 9, github_error: "403 rate limit" } }], categories: [] });
  const input = await readGuestMapInput(db);
  assert.ok(calls.includes("technologies.not(one_liner_source,is,null)"));
  assert.deepEqual(input.techs[0].signals, { stars: 5, weekly_downloads: 9 });
});

test("공식 표시는 DB 칸이 true일 때만 true다(빈 칸 · 다른 값은 공식 아님)", async () => {
  const { db } = recordingDb({ technologies: [{ id: "t1", display_name: "a", is_official: true }, { id: "t2", display_name: "b", is_official: null }, { id: "t3", display_name: "c" }], categories: [] });
  const input = await readGuestMapInput(db);
  assert.deepEqual(input.techs.map((x) => [x.id, x.official]), [["t1", true], ["t2", false], ["t3", false]]);
});

test("로그인 전 지도를 못 읽으면 던진다(빈 지도로 보이지 않게, 불변 2)", async () => {
  const { db } = recordingDb({}, { technologies: "boom" });
  await assert.rejects(readGuestMapInput(db));
});

test("레지스트리 대량 채우기로 들어온 줄은 NEW 기준 시각이 없다(표시가 있거나, 표시 전의 레지스트리 줄). 표시가 false거나 다른 출처면 들어온 시각", async () => {
  const reg = "https://registry.modelcontextprotocol.io/v0.1/servers?search=x";
  const at = "2026-11-21T00:00:00Z";
  const rows = [
    { id: "bulk", created_at: at, one_liner_source: reg, signals: { registry_backfill: true } },
    { id: "old", created_at: at, one_liner_source: reg, signals: { stars: 3 } },
    { id: "after", created_at: at, one_liner_source: reg, signals: { registry_backfill: false } },
    { id: "other", created_at: at, one_liner_source: "https://example.com/list", signals: null },
  ];
  const { db } = recordingDb({ technologies: rows, categories: [] });
  const input = await readGuestMapInput(db);
  assert.deepEqual(input.techs.map((t) => [t.id, t.createdAt]), [["bulk", null], ["old", null], ["after", at], ["other", at]]);
  assert.ok(input.techs.every((t) => !("one_liner_source" in t) && !("registry_backfill" in (t.signals ?? {}))), "판단에 쓴 칸은 화면 · 캐시로 내보내지 않는다(ADR 0029)");
});

test("지도의 이번 주 새 기술 몫은 DB에서 대량 채우기분을 빼고 읽는다(최근 순으로 잘라 읽으니 읽은 뒤 거르면 자리를 다 차지한다)", async () => {
  const { db, calls } = recordingDb({ categories: [] });
  await readGuestMapInput(db);
  assert.ok(calls.includes(`technologies.or(${NOT_BULK_FILTER})`));
});

test("연동 서비스 · 개념은 카탈로그 설명이 없으면 정해 둔 설명을 보인다(카탈로그에는 쓰지 않음)", async () => {
  const { db } = recordingDb({ technologies: [{ id: "s", tech_key: "service:supabase", one_liner: null }, { id: "n", tech_key: "npm:x", one_liner: null }], categories: [] });
  const input = await readGuestMapInput(db);
  assert.deepEqual(input.techs.map((t) => t.oneLiner), ["공식 MCP 서버(com.supabase/mcp)가 있어 AI 도구와 연결할 수 있어요", null]);
});

test("로그인 전 지도에 고른 기술 더하기(sel=)도 공개 목록 조건 그대로, 고른 게 없으면 읽지 않는다", async () => {
  const { db, calls } = recordingDb({ technologies: [{ id: "x", tech_key: "mcp:x", display_name: "x" }] });
  assert.deepEqual(await readListedByIds(db, []), []);
  assert.equal(calls.length, 0);
  assert.deepEqual((await readListedByIds(db, ["x"])).map((t) => t.id), ["x"]);
  for (const c of ["technologies.not(one_liner_source,is,null)", "technologies.eq(is_simulated,false)", "technologies.neq(status,gone)"]) assert.ok(calls.includes(c), c);
});
