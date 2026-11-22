import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NEW_TARGET, viewsTarget } from "./moved.ts";

test("옮긴 화면: /views 탭마다 새 자리(모르는 탭 · constructor는 지도), /new는 지도의 이번 주", () => {
  assert.equal(viewsTarget("gallery"), "/dashboard");
  assert.equal(viewsTarget("news"), "/dashboard?tab=news");
  assert.equal(viewsTarget("radar"), "/");
  assert.equal(viewsTarget(undefined), "/");
  assert.equal(viewsTarget("constructor"), "/");
  assert.equal(NEW_TARGET, "/?t=week");
});

test("옛 주소 화면은 DB를 부르지 않고 보내기만 한다(로그인 전에도 개인 데이터 길이 없음, 불변 5)", () => {
  for (const f of ["app/views/page.tsx", "app/new/page.tsx"]) {
    const s = readFileSync(f, "utf8");
    assert.match(s, /redirect\(/, `${f}: 보낸다`);
    assert.doesNotMatch(s, /getServerSupabase|getServiceSupabase/, `${f}: DB를 부르지 않는다`);
  }
});
