// 프로젝트 이름·메모 고치기 입력 검사(PRD-F4). 화면 글자 수(이모지 하나가 1)로 세고, 보이지 않는 글자·줄바꿈을 막는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProjectEdit, PROJECT_ERROR_TEXT, PROJECT_MEMO_MAX, PROJECT_NAME_MAX, PROJECT_NOTICE_TEXT } from "./project-edit.ts";

const ok = (name: string, memo = "") => checkProjectEdit({ name, memo });

test("앞뒤 공백을 떼고, 메모가 비면 null이다", () => {
  assert.deepEqual(ok("  내 프로젝트  ", "   "), { ok: true, name: "내 프로젝트", memo: null });
  assert.deepEqual(ok("a", "  한 줄 메모 "), { ok: true, name: "a", memo: "한 줄 메모" });
});

test("이름이 비면 막는다(공백뿐이어도)", () => {
  assert.deepEqual(ok(""), { ok: false, code: "name" });
  assert.deepEqual(ok("   　 "), { ok: false, code: "name" });
});

test("이름은 60자까지, 메모는 200자까지: 경계 값이 통과하고 하나 넘으면 막힌다", () => {
  assert.equal(ok("가".repeat(PROJECT_NAME_MAX)).ok, true);
  assert.deepEqual(ok("가".repeat(PROJECT_NAME_MAX + 1)), { ok: false, code: "name_long" });
  assert.equal(ok("a", "나".repeat(PROJECT_MEMO_MAX)).ok, true);
  assert.deepEqual(ok("a", "나".repeat(PROJECT_MEMO_MAX + 1)), { ok: false, code: "memo_long" });
});

test("글자 수는 화면 글자 기준이다: 이모지 하나는 1, 한글 낱자 NFD도 NFC로 맞춘 뒤 센다", () => {
  assert.equal(ok("😀".repeat(PROJECT_NAME_MAX)).ok, true, "UTF-16로는 120이지만 글자로는 60");
  assert.deepEqual(ok("😀".repeat(PROJECT_NAME_MAX + 1)), { ok: false, code: "name_long" });
  const nfd = "한글".normalize("NFD");
  assert.notEqual(nfd, "한글");
  assert.deepEqual(ok(nfd), { ok: true, name: "한글", memo: null }, "NFC로 저장한다");
});

test("줄바꿈·탭·제어 문자·보이지 않는 글자는 이름도 메모도 막는다", () => {
  for (const bad of ["a\nb", "a\tb", "a\u0000b", "a\u007fb", "a\u200bb", "a\u202eb", "a\ufeffb", "a\u2028b", "a\u2060b"]) {
    assert.deepEqual(ok(bad), { ok: false, code: "text" }, `이름 ${JSON.stringify(bad)}`);
    assert.deepEqual(ok("a", bad), { ok: false, code: "text" }, `메모 ${JSON.stringify(bad)}`);
  }
});

test("이모지 이어붙임 글자(ZWJ)와 일반 문장 부호·공백은 통과한다", () => {
  assert.equal(ok("가족 👨\u200d👩\u200d👧", "메모: a-b_c (v1.0), 100% 좋아요!").ok, true);
});

test("검사 순서: 이름이 비면 name, 그다음 보이지 않는 글자 text, 그다음 길이", () => {
  assert.deepEqual(checkProjectEdit({ name: "", memo: "a\nb" }), { ok: false, code: "name" });
  assert.deepEqual(checkProjectEdit({ name: "a\nb", memo: "나".repeat(PROJECT_MEMO_MAX + 1) }), { ok: false, code: "text" });
});

test("서버 함수의 모든 실패 코드와 주소에 싣는 안내 코드에 사용자 문구가 있다(빠지면 화면에 아무 말도 안 나온다)", () => {
  for (const code of ["not_found", "failed", "secret", "name", "name_long", "memo_long", "text"]) {
    assert.ok(PROJECT_ERROR_TEXT[`project_${code}`], code);
  }
  assert.ok(PROJECT_ERROR_TEXT.archived);
  for (const key of ["project_edited", "project_same", "project_archived", "project_restored"]) assert.ok(PROJECT_NOTICE_TEXT[key], key);
  assert.match(PROJECT_ERROR_TEXT.project_name_long, new RegExp(String(PROJECT_NAME_MAX)));
  assert.match(PROJECT_ERROR_TEXT.project_memo_long, new RegExp(String(PROJECT_MEMO_MAX)));
});
