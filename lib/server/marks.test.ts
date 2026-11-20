import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_FIXED_VERSION_MESSAGE } from "../alerts/validate-judgment.ts";
import { DANGER_CANDIDATE_MESSAGE, saveMark } from "./marks.ts";

type Row = Record<string, unknown>;

// set_tech_mark 호출만 모으는 가짜 클라이언트. 알림 판단·위험 규칙은 DB 함수가 하므로 여기서는 돌려줄 값·오류만 정한다
function fakeDb(reply: { data?: unknown; error?: string } = {}) {
  const calls: { name: string; args: Row }[] = [];
  const db = {
    rpc(name: string, args: Row) {
      calls.push({ name, args });
      return Promise.resolve({ data: reply.data ?? null, error: reply.error ? { message: reply.error } : null });
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

test("관심은 set_tech_mark 한 번으로 저장하고 이유는 보내지 않는다", async () => {
  const { db, calls } = fakeDb({ data: [] });
  assert.deepEqual(await saveMark(db, { techId: "tech-1", status: "interest", reason: "무시됨" }), { ok: true, judgedAlerts: [] });
  assert.deepEqual(calls, [{ name: "set_tech_mark", args: { p_tech_id: "tech-1", p_status: "interest", p_reason: null } }]);
});

test("보류는 이유를 다듬어 보내고, 함께 판단된 알림 id를 돌려준다", async () => {
  const { db, calls } = fakeDb({ data: ["alert-1"] });
  assert.deepEqual(await saveMark(db, { techId: "tech-1", status: "hold", reason: "  다음 달에 다시 보기 " }), { ok: true, judgedAlerts: ["alert-1"] });
  assert.equal(calls[0].args.p_reason, "다음 달에 다시 보기");
});

test("보류 이유는 코드 포인트로 센다: 5자 미만이면 DB를 부르지 않는다(이모지 3개는 3자)", async () => {
  const { db, calls } = fakeDb();
  assert.equal((await saveMark(db, { techId: "tech-1", status: "hold", reason: "👍👍👍" })).ok, false);
  assert.equal((await saveMark(db, { techId: "tech-1", status: "hold", reason: " 짧음 " })).ok, false);
  assert.equal(calls.length, 0);
});

test("모르는 상태 값은 거절한다", async () => {
  const { db, calls } = fakeDb();
  assert.equal((await saveMark(db, { techId: "tech-1", status: "using" as never, reason: "" })).ok, false);
  assert.equal(calls.length, 0);
});

test("지우기(null)는 set_tech_mark에 null을 보낸다", async () => {
  const { db, calls } = fakeDb({ data: [] });
  assert.deepEqual(await saveMark(db, { techId: "tech-1", status: null, reason: "" }), { ok: true, judgedAlerts: [] });
  assert.deepEqual(calls[0].args, { p_tech_id: "tech-1", p_status: null, p_reason: null });
});

test("DB가 거절한 이유를 쉬운 말로: 위험 등급 · 고친 버전 없음 · 기술 없음, 그 밖은 저장 실패(전 상태 그대로)", async () => {
  const cases: [string, string | RegExp][] = [
    ["위험 등급 기술은 적용 후보가 될 수 없다(ADR 0012)", DANGER_CANDIDATE_MESSAGE],
    ["보안 경고의 적용 후보에는 고친 버전이 필요하다(ADR 0012)", NO_FIXED_VERSION_MESSAGE],
    ["기술을 찾지 못했다", "기술을 찾지 못했어요."],
    ["connection reset", /전 상태 그대로/],
  ];
  for (const [dbMessage, expected] of cases) {
    const result = await saveMark(fakeDb({ error: dbMessage }).db, { techId: "tech-1", status: "candidate", reason: "" });
    assert.equal(result.ok, false);
    if (!result.ok) typeof expected === "string" ? assert.equal(result.message, expected) : assert.match(result.message, expected);
  }
});
