import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDraftResponse } from "./parse-draft-response.ts";

const allowed = ["https://osv.dev/CVE-2025-6514", "https://example.com/readme"];

test("정해진 JSON이면 초안(앞뒤 공백 뺌)과 출처를 돌려준다. 코드 블록(```json)으로 감싸 와도 읽는다", () => {
  const raw = JSON.stringify({ draft: "  고친 버전 0.1.16으로 올리는 것을 권해요.  ", sources: ["https://osv.dev/CVE-2025-6514"] });

  assert.deepEqual(parseDraftResponse(raw, allowed), { ok: true, draft: "고친 버전 0.1.16으로 올리는 것을 권해요.", sources: ["https://osv.dev/CVE-2025-6514"] });
  assert.equal(parseDraftResponse("```json\n" + raw + "\n```", allowed).ok, true);
});

test("출처는 우리가 넘긴 것만 인정한다: Claude가 지어낸 주소는 버리고, 하나도 안 남으면 빈 목록(화면은 '출처 찾지 못함')", () => {
  const invented = JSON.stringify({ draft: "초안", sources: ["https://osv.dev/CVE-2025-6514", "https://evil.example/fake"] });
  const none = JSON.stringify({ draft: "초안", sources: ["https://evil.example/fake"] });

  assert.deepEqual(parseDraftResponse(invented, allowed), { ok: true, draft: "초안", sources: ["https://osv.dev/CVE-2025-6514"] });
  assert.deepEqual(parseDraftResponse(none, allowed), { ok: true, draft: "초안", sources: [] });
});

test("형식이 어긋나면 실패로 본다: JSON이 아님, 객체가 아님, 초안이 없거나 비었거나 1000자 초과, 출처가 목록이 아님", () => {
  const bad = [
    "그냥 글이에요",
    "[1, 2]",
    JSON.stringify({ sources: [] }),
    JSON.stringify({ draft: "   ", sources: [] }),
    JSON.stringify({ draft: 123, sources: [] }),
    JSON.stringify({ draft: "가".repeat(1001), sources: [] }),
    JSON.stringify({ draft: "초안", sources: "https://osv.dev/CVE-2025-6514" }),
    JSON.stringify({ draft: "초안", sources: [1, 2] }),
  ];

  for (const raw of bad) {
    const result = parseDraftResponse(raw, allowed);
    assert.equal(result.ok, false, raw.slice(0, 30));
  }
  assert.equal(parseDraftResponse(JSON.stringify({ draft: "가".repeat(1000), sources: [] }), allowed).ok, true); // 1000자는 된다
});
