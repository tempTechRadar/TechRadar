import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readInspectorTech } from "./inspector-tech.ts";

type Row = Record<string, unknown>;
const TECH: Row = { id: "a", tech_key: "mcp:a", display_name: "a", type: "mcp", status: "active", grade: "caution", grade_reason: "오래 멈춤", one_liner_source: "https://registry.example/x", is_simulated: false, collect_error_kind: "timeout", last_checked_ok_at: null };
/** technologies만 줄이 있고 나머지 표는 빈 목록. rpc는 관문 목록(null이면 실패) */
function fakeDb(gate: string[] | null, calls: string[] = []) {
  return {
    from(table: string) {
      calls.push(table);
      const rows = table === "technologies" ? [TECH] : [];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "not", "neq", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res);
      return q;
    },
    rpc: (fn: string) => { calls.push(`rpc:${fn}`); return Promise.resolve(gate ? { data: gate, error: null } : { data: null, error: { message: "연결 실패" } }); },
  } as unknown as SupabaseClient;
}
const USER = { id: "u1", isDemo: false };

test("Inspector 기술: 상세와 같은 칸(등급 · 이유 · 수집 오류) + 관문 안 · 밖", async () => {
  const d = (await readInspectorTech(fakeDb(["a"]), USER, "a"))!;
  assert.deepEqual([d.tech.grade, d.tech.gradeReason, d.tech.collectErrorKind, d.tech.lastCheckedOkAt, d.gate], ["caution", "오래 멈춤", "timeout", null, "in"]);
  assert.equal((await readInspectorTech(fakeDb(["b"]), USER, "a"))!.gate, "out");
});

test("Inspector 기술: 손님은 관문을 읽지 않고(null), 관문을 못 읽으면 던진다(없음으로 단정하지 않음)", async () => {
  const calls: string[] = [];
  assert.equal((await readInspectorTech(fakeDb(["a"], calls), null, "a"))!.gate, null);
  assert.ok(!calls.some((c) => c.startsWith("rpc:")));
  await assert.rejects(readInspectorTech(fakeDb(null), USER, "a"), /연결 실패/);
});
