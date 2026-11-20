// 관리자 화면이 주소의 error·info 글을 그대로 보이면, 남이 만든 링크로 관리자 화면에 가짜 안내("비밀번호를 다시 입력하세요")를 띄울 수 있다.
// 서버 동작이 서명을 붙여 보낸 글만 화면에 보이게 한다(불변 5의 화면 쪽 마무리).
import { test } from "node:test";
import assert from "node:assert/strict";
import { flashQuery, readFlash, signFlash, verifyFlash } from "./admin-flash.ts";

const SECRET = "test-secret";
const parse = (q: string) => Object.fromEntries(new URLSearchParams(q));

test("서명한 글은 같은 종류·같은 글일 때만 통과한다", () => {
  const sig = signFlash(SECRET, "error", "관리자만 할 수 있어요.");
  assert.equal(verifyFlash(SECRET, "error", "관리자만 할 수 있어요.", sig), true);
  assert.equal(verifyFlash(SECRET, "error", "관리자만 할 수 있어요!", sig), false, "글이 한 글자 달라지면 막는다");
  assert.equal(verifyFlash(SECRET, "info", "관리자만 할 수 있어요.", sig), false, "error 서명을 info로 옮길 수 없다");
  assert.equal(verifyFlash("other-secret", "error", "관리자만 할 수 있어요.", sig), false, "다른 비밀로 만든 서명은 막는다");
});

test("서명이 없거나 모양이 다르면 통과하지 못하고 예외도 나지 않는다(길이가 달라도, 배열이어도)", () => {
  for (const sig of [undefined, "", "x", "가".repeat(80), "A".repeat(43), ["a", "b"] as unknown as string]) {
    assert.equal(verifyFlash(SECRET, "error", "글", sig), false, String(sig));
  }
  assert.equal(verifyFlash(SECRET, "error", ["글", "글2"] as unknown as string, "x"), false);
});

test("flashQuery로 만든 주소 조각은 readFlash가 그대로 읽고, 글을 바꾸거나 서명을 떼면 읽히지 않는다", () => {
  const q = parse(flashQuery("info", "켰어요. 10분 안에 & 해 보세요?", SECRET));
  assert.equal(readFlash("info", q.info, q.sig, SECRET), "켰어요. 10분 안에 & 해 보세요?");
  assert.equal(readFlash("info", "가짜 안내", q.sig, SECRET), undefined);
  assert.equal(readFlash("info", q.info, undefined, SECRET), undefined);
  assert.equal(readFlash("info", undefined, q.sig, SECRET), undefined);
  assert.equal(readFlash("error", q.info, q.sig, SECRET), undefined, "종류가 다르면 읽히지 않는다");
});

test("flashQuery는 글을 주소에 안전하게 싣는다(&·=·#·한글)", () => {
  const q = flashQuery("error", "a=b&c#d 한글", SECRET);
  assert.deepEqual(Object.keys(parse(q)), ["error", "sig"]);
  assert.equal(parse(q).error, "a=b&c#d 한글");
});

// 배선 시험: 서버 동작·화면은 이 시험에서 못 돌리니, 누가 서명 없이 안내를 보내거나 주소 글을 그대로 보이게 바꾸면 실패하게 소스로 지킨다.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const adminFiles = (name: RegExp): string[] =>
  readdirSync("app/admin", { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? readdirSync(join("app/admin", e.name)).filter((f) => name.test(f)).map((f) => join("app/admin", e.name, f)) : []));

test("관리자 서버 동작은 error·info·cleared 안내를 서명 없이 주소에 싣지 않는다", () => {
  const files = adminFiles(/^actions\.ts$/);
  assert.ok(files.length >= 5, `서버 동작 파일을 찾지 못함(${files.length})`);
  for (const f of files) assert.doesNotMatch(readFileSync(f, "utf8"), /\?(error|info|cleared)=|\?\$\{key\}=|encodeURIComponent/, `${f}: 서명 없는 안내 주소`);
  for (const f of files.filter((x) => /flashQuery\(/.test(readFileSync(x, "utf8")))) assert.match(readFileSync(f, "utf8"), /from "@\/lib\/server\/admin-flash"/, f);
});

test("관리자 화면은 주소의 error·info·cleared를 readFlash로 걸러서만 보인다", () => {
  const pages = adminFiles(/^page\.tsx$/).filter((f) => /searchParams/.test(readFileSync(f, "utf8")) && /\b(error|info|cleared)\b[^;\n]*=\s*await searchParams|await searchParams[^;\n]*\b(error|info|cleared)\b/.test(readFileSync(f, "utf8")));
  assert.ok(pages.length >= 5, `대상 화면 ${pages.length}개: classify·demo·reports·run-now·simulator가 모두 잡혀야 한다`);
  for (const f of pages) {
    const text = readFileSync(f, "utf8");
    for (const key of ["error", "info", "cleared"].filter((k) => new RegExp(`\\b${k}\\?: string`).test(text))) {
      assert.match(text, new RegExp(`readFlash\\("${key}"`), `${f}: ${key}를 걸러야 한다`);
    }
    assert.doesNotMatch(text, /const \{[^}]*\b(error|info|cleared)\b(?!:)[^}]*\} = await searchParams/, `${f}: 주소 값을 걸러 내기 전에 그대로 변수로 받음`);
  }
});
