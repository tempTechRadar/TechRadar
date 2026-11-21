import { test } from "node:test";
import assert from "node:assert/strict";
import { closesGate, gateDecision } from "./ready-gate.ts";

test("관문은 지도(/)에 주소 값 없이 처음 들어올 때만, 세션당 한 번", () => {
  assert.equal(gateDecision("/", "", false), "show");
  assert.equal(gateDecision("/", "?", false), "show", "빈 물음표는 값이 없는 것");
  assert.equal(gateDecision("/", "", true), "skip", "이미 봤으면 다시 안 뜬다");
});

test("링크로 들어오거나 다른 화면으로 먼저 들어온 세션은 관문 없이 '이미 들어옴'으로 남긴다", () => {
  assert.equal(gateDecision("/", "?sel=tech:abc", false), "mark-seen", "지도에서 보기 · 보기 공유는 목적지가 분명");
  assert.equal(gateDecision("/alerts", "", false), "mark-seen", "알림부터 들어와도 나중에 지도를 새로 고칠 때 갑자기 뜨지 않게");
});

test("단축키 조합은 관문을 닫지 않고, 그 밖의 키는 닫는다", () => {
  assert.equal(closesGate({ ctrlKey: false, metaKey: false, altKey: false }), true);
  for (const k of ["ctrlKey", "metaKey", "altKey"] as const) assert.equal(closesGate({ ctrlKey: false, metaKey: false, altKey: false, [k]: true }), false, k);
});
