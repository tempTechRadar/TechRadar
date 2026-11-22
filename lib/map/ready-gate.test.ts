import { test } from "node:test";
import assert from "node:assert/strict";
import { closesGate, gateDecision, gateText, introWaits } from "./ready-gate.ts";

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

test("덮개가 떠 있으면 지도 첫 연출을 기다리고, 닫거나 안 띄웠거나 움직임이 꺼져 있으면 바로 시작한다", () => {
  assert.equal(introWaits("open", true), true, "덮개 뒤에서 연출이 혼자 끝나지 않게");
  assert.equal(introWaits("closed", true), false, "닫으면 그때 시작");
  assert.equal(introWaits(undefined, true), false, "이미 봤거나 다른 주소면 덮개가 없다");
  assert.equal(introWaits("open", false), false, "움직임 줄이기 · 끄기면 연출 없이 바로 다 보인다");
});

test("덮개 단추 글은 켜진 이유대로: 준비됨만 '지도 보기', 시간 초과 · 지도 없음은 준비된 것처럼 말하지 않는다", () => {
  assert.deepEqual(gateText("ready"), { go: "지도 보기", hint: "아무 키나 누르거나 화면을 누르세요" });
  assert.equal(gateText("timeout").go, "그래도 들어가기");
  assert.equal(gateText("no-map").go, "들어가기");
  for (const r of ["timeout", "no-map"] as const) {
    const t = gateText(r);
    assert.ok(!`${t.go} ${t.hint}`.includes("지도 보기"), r);
    assert.ok(!t.hint.includes("이어서 보여요"), `${r}: 모르는 일을 약속하지 않음`);
  }
});

test("관문 스크립트에 글로 싣는 함수는 바깥 이름을 쓰지 않는다(브라우저에서 그대로 돌아야 함)", () => {
  for (const f of [gateDecision, closesGate, gateText]) assert.doesNotThrow(() => new Function(`return (${f.toString()})`)(), f.name);
  assert.equal(new Function(`return (${gateText.toString()})`)()("timeout").go, "그래도 들어가기");
});
