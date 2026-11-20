import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readTasteForm, saveTaste } from "./taste-store.ts";

type Answer = { data: unknown; error: { message: string } | null };

// 가짜 DB: upsert 한 번의 요청을 남기고 정해 둔 답을 준다
function fakeDb(answer: Answer) {
  const calls: { table: string; row?: unknown; options?: unknown }[] = [];
  const db = {
    from(table: string) {
      const call: (typeof calls)[number] = { table };
      calls.push(call);
      const builder: Record<string, unknown> = {
        upsert: (row: unknown, options: unknown) => ((call.row = row), (call.options = options), builder),
        select: () => builder,
        then: (resolve: (a: Answer) => unknown) => resolve(answer),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}
const ok: Answer = { data: [{ user_id: "u1" }], error: null };
const taste = (over: Partial<{ build: string | null; tools: string[]; interests: string[] }> = {}) => ({ build: "web", tools: ["claude_code"], interests: ["리서치"], ...over });

test("취향을 본인 줄(user_id)로 한 번에 저장한다", async () => {
  const { db, calls } = fakeDb(ok);
  const r = await saveTaste(db, "u1", taste({ tools: ["cursor", "claude_code"], interests: ["리서치", "검사·보안"] }));
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(calls, [{ table: "user_tastes", row: { user_id: "u1", build: "web", tools: ["cursor", "claude_code"], interests: ["리서치", "검사·보안"] }, options: { onConflict: "user_id" } }]);
});

test("건너뛰기(모두 비움)도 저장한다: 나중에 고칠 수 있는 빈 취향", async () => {
  const { db, calls } = fakeDb(ok);
  assert.deepEqual(await saveTaste(db, "u1", { build: null, tools: [], interests: [] }), { ok: true });
  assert.deepEqual(calls[0].row, { user_id: "u1", build: null, tools: [], interests: [] });
});

test("관심 분야는 3개까지, 겹친 선택은 하나로 센다", async () => {
  const over = fakeDb(ok);
  const r = await saveTaste(over.db, "u1", taste({ interests: ["리서치", "디자인", "프론트엔드", "검사·보안"] }));
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /3개/);
  assert.equal(over.calls.length, 0);
  const dup = fakeDb(ok);
  assert.deepEqual(await saveTaste(dup.db, "u1", taste({ interests: ["리서치", "리서치", "디자인"] })), { ok: true });
  assert.deepEqual((dup.calls[0].row as { interests: string[] }).interests, ["리서치", "디자인"]);
  const tools = fakeDb(ok);
  await saveTaste(tools.db, "u1", taste({ tools: ["cursor", "cursor"] }));
  assert.deepEqual((tools.calls[0].row as { tools: string[] }).tools, ["cursor"]);
});

test("정해진 선택지 밖의 값은 DB를 부르지 않고 막는다", async () => {
  for (const bad of [taste({ build: "evil" }), taste({ tools: ["evil"] }), taste({ interests: ["없는 갈래"] })]) {
    const { db, calls } = fakeDb(ok);
    const r = await saveTaste(db, "u1", bad);
    assert.equal(r.ok, false);
    assert.equal(calls.length, 0);
  }
});

test("저장 실패와 고친 줄 없음은 저장했다고 하지 않는다 (불변 4), 오류 글의 비밀값은 가린다", async () => {
  const failed = await saveTaste(fakeDb({ data: null, error: { message: "boom sk-ant-api03-abcdefghijklmnop" } }).db, "u1", taste());
  assert.equal(failed.ok, false);
  assert.doesNotMatch(failed.ok ? "" : failed.error, /abcdefghijklmnop/);
  const empty = await saveTaste(fakeDb({ data: [], error: null }).db, "u1", taste());
  assert.equal(empty.ok, false);
});

test("폼 읽기: 체크한 값만 모으고 보낸 user_id 칸은 무시한다", () => {
  const form = new FormData();
  form.set("build", "data");
  form.append("tools", "cursor");
  form.append("tools", "none");
  form.append("interests", "디자인");
  form.set("user_id", "someone-else");
  assert.deepEqual(readTasteForm(form), { build: "data", tools: ["cursor", "none"], interests: ["디자인"] });
  assert.deepEqual(readTasteForm(new FormData()), { build: null, tools: [], interests: [] });
});
