// technologies.signals에서 별 수와 의심 표시를 읽는 규칙(SPEC-3.2 조건 4, ADR 0030). 못 읽은 값은 "낮다"로 단정하지 않는다(불변 2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isFlaggedSignals, starsOfSignals } from "./star-signals.ts";

test("별 수는 유한한 0 이상의 수일 때만 그 수, 나머지(없음·문자열·NaN·음수·무한·배열)는 null이다", () => {
  assert.equal(starsOfSignals({ stars: 1234 }), 1234);
  assert.equal(starsOfSignals({ stars: 0 }), 0, "0은 알려진 값이다(모름이 아니다)");
  for (const signals of [null, undefined, {}, [], "stars", 5, { stars: "100" }, { stars: NaN }, { stars: -1 }, { stars: Infinity }, { stars: null }, { stars: [100] }, { stars: {} }, [{ stars: 100 }]]) {
    assert.equal(starsOfSignals(signals), null, JSON.stringify(signals));
  }
});

test("의심 표시는 candidate_flags가 비어 있지 않은 배열일 때만 true이다", () => {
  assert.equal(isFlaggedSignals({ candidate_flags: ["new_spike"] }), true);
  assert.equal(isFlaggedSignals({ candidate_flags: ["new_spike", "clone_cluster"] }), true);
  for (const signals of [null, undefined, {}, [], { candidate_flags: [] }, { candidate_flags: null }, { candidate_flags: "new_spike" }, { candidate_flags: {} }, { stars: 5 }]) {
    assert.equal(isFlaggedSignals(signals), false, JSON.stringify(signals));
  }
});
