import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCatalogTechDetail } from "./catalog-tech.ts";

type Row = Record<string, unknown>;
const pick = (r: Row, col: string): unknown => col.split(".").reduce<unknown>((o, k) => (o as Row | null | undefined)?.[k], r);

// 표마다 줄을 들고 eq · is · in · neq를 지켜 주는 가짜 클라이언트. errors[표]면 그 표 읽기가 실패한다
function fakeDb(tables: Record<string, Row[]>, errors: Record<string, string> = {}) {
  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      const q: Record<string, unknown> = {};
      const done = (single: boolean) => Promise.resolve(errors[table] ? { data: null, error: { message: errors[table] } } : { data: single ? rows[0] ?? null : rows, error: null });
      Object.assign(q, {
        select: () => q, order: () => q, limit: () => q,
        eq: (c: string, v: unknown) => ((rows = rows.filter((r) => pick(r, c) === v)), q),
        is: (c: string, v: unknown) => ((rows = rows.filter((r) => (pick(r, c) ?? null) === v)), q),
        neq: (c: string, v: unknown) => ((rows = rows.filter((r) => pick(r, c) !== v)), q),
        in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(pick(r, c)))), q),
        not: (c: string, op: string, v: unknown) => ((rows = rows.filter((r) => !(op === "is" && (pick(r, c) ?? null) === v))), q),
        maybeSingle: () => done(true),
        then: (res: (v: unknown) => unknown) => done(false).then(res),
      });
      return q;
    },
  } as unknown as SupabaseClient;
}

const tech = (id: string, over: Row = {}): Row => ({ id, tech_key: `mcp:${id}`, display_name: id, type: "mcp", status: "active", grade: "pass", one_liner_source: "https://registry.example/x", is_simulated: false, ...over });
const USER = { id: "u1", isDemo: false };

test("공개 목록 기술은 누구나 열고, 비교군(확정 · 공개만)과 내 지도 판단 기록 · 내 기술 줄을 함께 읽는다", async () => {
  const db = fakeDb({
    technologies: [tech("a"), tech("b"), tech("sim", { is_simulated: true }), tech("gone", { status: "gone" })],
    my_technologies: [{ id: "m1", owner_id: "u1", tech_id: "a", projects: { name: "앱", archived_at: null } }, { id: "m2", owner_id: "u1", tech_id: "a", projects: { name: "옛", archived_at: "2026-11-01" } }, { id: "m3", owner_id: "u2", tech_id: "a", projects: { name: "남", archived_at: null } }],
    tech_relations: [
      { tech_a: "a", tech_b: "b", kind: "same_role", status: "confirmed", quote: "둘 다 저장소 일", confirmed_at: "2026-11-12" },
      { tech_a: "a", tech_b: "sim", kind: "same_role", status: "confirmed", quote: null, confirmed_at: null },
      { tech_a: "gone", tech_b: "a", kind: "same_role", status: "confirmed", quote: null, confirmed_at: null },
      { tech_a: "a", tech_b: "b", kind: "same_role", status: "candidate", quote: "후보", confirmed_at: null },
    ],
    tech_mark_events: [{ user_id: "u1", tech_id: "a", created_at: "2026-11-20", new_status: "hold", reason: "다음 달에 보기" }, { user_id: "u2", tech_id: "a", created_at: "2026-11-20", new_status: "interest", reason: null }],
  });
  const d = (await getCatalogTechDetail(db, USER, "a"))!;
  assert.equal(d.tech.name, "a");
  assert.deepEqual(d.mine, [{ id: "m1", projectName: "앱" }], "내 것 · 보관 안 한 프로젝트만");
  assert.deepEqual(d.peers.map((p) => [p.id, p.quote]), [["b", "둘 다 저장소 일"]], "확정만, 시뮬레이터 · 사라진 기술 제외");
  assert.deepEqual(d.events, [{ at: "2026-11-20", status: "hold", reason: "다음 달에 보기" }]);
});

test("공개 목록 밖(누군가의 저장소에서만 생긴 줄 · 사라진 · 시뮬레이터)은 내가 쓰지 않으면 없는 것처럼(null)", async () => {
  const tables = { technologies: [tech("p", { one_liner_source: null }), tech("g", { status: "gone" }), tech("s", { is_simulated: true })], my_technologies: [{ id: "m1", owner_id: "u1", tech_id: "p", projects: { name: "앱", archived_at: null } }] };
  for (const id of ["g", "s", "없음"]) assert.equal(await getCatalogTechDetail(fakeDb(tables), USER, id), null, id);
  assert.equal(await getCatalogTechDetail(fakeDb({ ...tables, my_technologies: [] }), USER, "p"), null);
  assert.equal((await getCatalogTechDetail(fakeDb(tables), USER, "p"))?.tech.id, "p", "내가 쓰는 기술은 공개 목록 밖이어도 열린다");
  assert.equal((await getCatalogTechDetail(fakeDb(tables), { id: "u1", isDemo: true }, "s"))?.tech.id, "s", "시뮬레이터 기술은 시연 계정에");
});

test("하나라도 못 읽으면 null이 아니라 던진다(없음과 읽지 못함은 다르다)", async () => {
  for (const table of ["technologies", "my_technologies", "tech_relations", "tech_mark_events"]) {
    await assert.rejects(getCatalogTechDetail(fakeDb({ technologies: [tech("a")] }, { [table]: "연결 실패" }), USER, "a"), /연결 실패/, table);
  }
});

test("숨긴 내 기술은 '내 것'이 아니고, 공개 목록 밖 비교군 이름은 나오지 않으며, 내가 판단을 남긴 기술은 사라져도 열린다", async () => {
  const d = (await getCatalogTechDetail(fakeDb({
    technologies: [tech("a"), tech("priv", { one_liner_source: null })],
    my_technologies: [{ id: "h", owner_id: "u1", tech_id: "a", hidden_at: "2026-11-19", projects: { name: "앱", archived_at: null } }],
    tech_relations: [{ tech_a: "a", tech_b: "priv", kind: "same_role", status: "confirmed", quote: "내부 패키지", confirmed_at: null }],
  }), USER, "a"))!;
  assert.deepEqual([d.mine, d.peers], [[], []]);
  const gone = { technologies: [tech("g", { status: "gone" })], tech_mark_events: [{ user_id: "u1", tech_id: "g", created_at: "2026-11-20", new_status: "hold", reason: "다음 달" }] };
  assert.equal((await getCatalogTechDetail(fakeDb(gone), USER, "g"))?.events.length, 1);
  assert.equal(await getCatalogTechDetail(fakeDb(gone), { id: "u2", isDemo: false }, "g"), null, "남의 판단 기록으로는 열리지 않는다");
});
