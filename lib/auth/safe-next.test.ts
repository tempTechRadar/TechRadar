import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./safe-next.ts";

test("이 사이트 안의 경로는 그대로", () => {
  for (const p of ["/", "/alerts", "/projects?project=1", "/alerts/abc#top"]) assert.equal(safeNext(p), p);
});

test("바깥으로 나가는 주소·이상한 값은 모두 첫 화면으로(열린 리디렉션 막기)", () => {
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "/\\/evil.com", "evil.com", "javascript:alert(1)", "/a\nb", "/a\\b", "", null, undefined]) {
    assert.equal(safeNext(bad as string | null | undefined), "/", String(bad));
  }
});
