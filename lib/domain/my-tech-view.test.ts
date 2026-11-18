import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceLinks, filterTechs, isUuid, keepView, searchTerm } from "./my-tech-view.ts";

const T = (id: string, grade: string, hidden_at: string | null = null) => ({ id, grade, hidden_at });

test("거르기: 숨긴 기술은 기본으로 빠지고, 켜면 함께 나온다", () => {
  const techs = [T("a", "danger"), T("b", "pass", "2026-11-18T00:00:00Z")];
  assert.deepEqual(filterTechs(techs, {}).map((t) => t.id), ["a"]);
  assert.deepEqual(filterTechs(techs, { showHidden: true }).map((t) => t.id), ["a", "b"]);
});

test("거르기: 등급을 고르면 그 등급만. 숨김과 함께 써도 맞다", () => {
  const techs = [T("a", "danger"), T("b", "pass"), T("c", "pass", "2026-11-18T00:00:00Z")];
  assert.deepEqual(filterTechs(techs, { grade: "pass" }).map((t) => t.id), ["b"]);
  assert.deepEqual(filterTechs(techs, { grade: "pass", showHidden: true }).map((t) => t.id), ["b", "c"]);
});

test("검색어: 거르기 문법 글자와 와일드카드는 지우고, 두 글자 미만이면 검색하지 않는다", () => {
  assert.equal(searchTerm("mcp-remote"), "mcp-remote");
  assert.equal(searchTerm("npm:@scope/pkg"), "npm:@scope/pkg");
  assert.equal(searchTerm("x),id.neq.0,(y"), "xid.neq.0y", "쉼표·괄호가 지워져 다른 조건을 끼울 수 없다");
  assert.equal(searchTerm("%%"), null);
  assert.equal(searchTerm(" a "), null);
  assert.equal(searchTerm("가".repeat(80))?.length, 50);
});

test("근거 링크: OSV 주소만 링크로 남기고, 다른 주소·모양이 다른 줄은 버린다", () => {
  const links = evidenceLinks([
    { id: "GHSA-1", severity: "HIGH", fixed: "1.2.3", url: "https://osv.dev/vulnerability/GHSA-1" },
    { id: "X-2", severity: "LOW", fixed: null, url: "https://evil.example/x" },
    { id: "javascript", url: "javascript:alert(1)" },
    { severity: "HIGH" },
    null,
  ]);
  assert.deepEqual(links, [
    { id: "GHSA-1", severity: "HIGH", fixed: "1.2.3", url: "https://osv.dev/vulnerability/GHSA-1" },
    { id: "X-2", severity: "LOW", fixed: null, url: null },
    { id: "javascript", severity: null, fixed: null, url: null },
  ]);
  assert.deepEqual(evidenceLinks(null), []);
  assert.deepEqual(evidenceLinks({ id: "x" }), []);
});

test("화면 상태 되살리기: 검사를 통과한 값만 남기고, 모르는 글자·거짓 값은 버린다", () => {
  const project = "74bbcf40-4ec4-4f2b-b04f-5b036fb9ae3e";
  assert.equal(keepView({ grade: "danger", project, hidden: "1", q: "mcp" }), `grade=danger&project=${project}&hidden=1&q=mcp`);
  assert.equal(keepView({}), "");
  assert.equal(keepView({ grade: "constructor", project: "x", hidden: "yes", q: "a" }), "", "등급 이름이 아닌 글·uuid 아닌 글·1이 아닌 값·한 글자 검색어는 버린다");
  assert.equal(keepView({ q: "x),id.neq.0" }), "q=xid.neq.0");
});

test("uuid 모양 검사", () => {
  assert.equal(isUuid("74bbcf40-4ec4-4f2b-b04f-5b036fb9ae3e"), true);
  assert.equal(isUuid("local"), false);
  assert.equal(isUuid(""), false);
});
