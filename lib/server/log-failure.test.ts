import { test } from "node:test";
import assert from "node:assert/strict";
import { logFailure, logIfError } from "./log-failure.ts";

/** console.error 호출 인자를 모으는 가짜 */
function spy(t: { mock: { method: (o: object, n: "error", f: unknown) => unknown } }) {
  const calls: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => void calls.push(args));
  return calls;
}
const KEY = "sk-" + "a".repeat(40);

test("logFailure: 던지지 않고 이유를 로그로 남긴다(Error와 글 모두)", async (t) => {
  const calls = spy(t);
  await Promise.reject(new Error("끊김")).catch(logFailure("실행을 닫지 못함"));
  await Promise.reject("그냥 글").catch(logFailure("단계를 남기지 못함"));
  assert.deepEqual(calls, [["실행을 닫지 못함", "끊김"], ["단계를 남기지 못함", "그냥 글"]]);
});

test("logFailure: 키 같은 값은 가려서 남긴다", async (t) => {
  const calls = spy(t);
  await Promise.reject(new Error(`호출 실패 ${KEY}`)).catch(logFailure("x"));
  assert.equal(calls.length, 1);
  assert.ok(!String(calls[0][1]).includes(KEY), "로그에 키가 그대로 있으면 안 된다");
});

test("logIfError: { error }가 있을 때만 남기고, 없으면 조용하다", (t) => {
  const calls = spy(t);
  logIfError("기록 실패", { error: null });
  assert.equal(calls.length, 0);
  logIfError("기록 실패", { error: { message: `권한 없음 ${KEY}` } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "기록 실패");
  assert.ok(!String(calls[0][1]).includes(KEY));
  assert.match(String(calls[0][1]), /권한 없음/);
});
