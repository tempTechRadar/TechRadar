import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readRecentAlerts } from "./recent-alerts.ts";

function fakeDb(opts: { listError?: boolean; countError?: boolean } = {}) {
  const eqs: [string, unknown][] = [];
  const row = { id: "a1", kind: "security", status: "pending", created_at: "2026-11-21T00:00:00Z", changes: { technologies: { display_name: "zod" } } };
  const db = {
    from() {
      return {
        select(_cols: string, o?: { head?: boolean }) {
          const res = o?.head ? { count: opts.countError ? null : 3, error: opts.countError ? { message: "x" } : null } : { data: opts.listError ? null : [row], error: opts.listError ? { message: "x" } : null };
          const q = { eq: (k: string, v: unknown) => { eqs.push([k, v]); return q; }, order: () => q, limit: () => q, then: (f: (r: unknown) => unknown) => Promise.resolve(res).then(f) };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, eqs };
}

test("종 알림: 본인 것만(user_id 조건) 읽고 판단 대기 수를 함께", async () => {
  const { db, eqs } = fakeDb();
  const r = await readRecentAlerts(db, "u1");
  assert.deepEqual(r, { items: [{ id: "a1", kind: "security", pending: true, name: "zod", at: "2026-11-21T00:00:00Z" }], pending: 3 });
  assert.equal(eqs.filter(([k, v]) => k === "user_id" && v === "u1").length, 2);
});

test("종 알림: 목록이나 수를 못 읽으면 null(빈 목록 · 0으로 보이지 않게)", async () => {
  assert.equal(await readRecentAlerts(fakeDb({ listError: true }).db, "u1"), null);
  assert.equal(await readRecentAlerts(fakeDb({ countError: true }).db, "u1"), null);
});
