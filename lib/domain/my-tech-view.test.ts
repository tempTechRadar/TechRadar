import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceLinks, filesOf, filterTechs, isUuid, keepView, readStatusNotice, searchTerm } from "./my-tech-view.ts";

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

// 프로젝트 머리 안내(불변 2: 읽기가 끝까지 되지 않았으면 목록이 전부라고, 비어 있으면 "없음"이라고 하지 않는다)
const NOW = new Date("2026-11-18T12:00:00Z");
const run = (status: string, created_at = "2026-11-18T11:59:00Z") => ({ status, created_at });

test("읽기 안내: 잘 읽은 저장소와 저장소가 없는 칸은 안내가 없다", () => {
  assert.equal(readStatusNotice("repo", [run("succeeded")], NOW), null);
  for (const runs of [undefined, [], [run("failed")]]) assert.equal(readStatusNotice("local", runs, NOW), null);
});

test("읽기 안내: 실패·일부 실패·읽은 기록 없음·모르는 상태는 모두 '다시 읽기'를 권하고, 없다고 하지 않는다", () => {
  for (const runs of [[run("failed")], [run("partial")], [run("running")], [run("queued")], [], undefined, [run("모르는 값")], [run("")]]) {
    const text = readStatusNotice("repo", runs, NOW);
    assert.ok(text, `안내가 있어야 한다: ${JSON.stringify(runs)}`);
    assert.match(text, /다시 읽기/);
    assert.doesNotMatch(text, /AI 코딩 도구가 없어요/);
  }
  assert.match(readStatusNotice("repo", [run("failed")], NOW)!, /없다는 뜻이 아니에요/);
  assert.match(readStatusNotice("repo", [run("partial")], NOW)!, /전부가 아닐 수/);
  assert.match(readStatusNotice("repo", [], NOW)!, /읽은 기록이 없어요/);
  assert.match(readStatusNotice("repo", [run("모르는 값")], NOW)!, /알 수 없어요/);
});

test("읽기 안내: 실패 원인은 단정하지 않는다(저장소가 안 열린 것 말고 DB 저장 실패로도 failed가 된다)", () => {
  assert.doesNotMatch(readStatusNotice("repo", [run("failed")], NOW)!, /열지 못|저장소를 못/);
});

test("읽기 안내: 진행 중은 기다리라고 하고, 10분 넘게 끝나지 않으면 멈춘 것으로 본다", () => {
  assert.match(readStatusNotice("repo", [run("running", "2026-11-18T11:55:00Z")], NOW)!, /아직 끝나지 않았어요/);
  assert.match(readStatusNotice("repo", [run("running", "2026-11-18T11:50:00Z")], NOW)!, /아직 끝나지 않았어요/);
  assert.match(readStatusNotice("repo", [run("running", "2026-11-18T11:49:00Z")], NOW)!, /멈춘 것/);
  assert.match(readStatusNotice("repo", [run("queued", "2026-11-17T00:00:00Z")], NOW)!, /멈춘 것/);
  assert.match(readStatusNotice("repo", [run("running", "날짜 아님")], NOW)!, /멈춘 것/);
});

test("읽기 안내: 마지막 읽기는 서버가 정렬해 주는 순서가 아니라 created_at으로 고른다", () => {
  const oldFail = run("failed", "2026-11-18T10:00:00Z");
  const newOk = run("succeeded", "2026-11-18T11:00:00Z");
  assert.equal(readStatusNotice("repo", [oldFail, newOk], NOW), null);
  assert.equal(readStatusNotice("repo", [newOk, oldFail], NOW), null);
  const newFail = run("failed", "2026-11-18T11:30:00Z");
  assert.match(readStatusNotice("repo", [newFail, newOk], NOW)!, /실패/);
  assert.match(readStatusNotice("repo", [newOk, newFail], NOW)!, /실패/);
});

test("읽은 결과를 파일마다: 저장소 줄만 파일로 묶고, 한 줄이라도 수집 오류면 그 파일은 수집 오류, 스킬은 폴더 하나로, 오류 먼저", () => {
  const row = (source_file: string | null, collect_error_kind: string | null = null, origin = "repo") => ({ origin, source_file, collect_error_kind });
  assert.deepEqual(filesOf([
    row("package.json"), row("package.json"), row("requirements.txt", "timeout"), row("requirements.txt"),
    row(".claude/skills/a/SKILL.md"), row(".claude/skills/b/SKILL.md"), row(null, null, "manual"), row("x.json", null, "import"),
  ]), [
    { path: "requirements.txt", count: 2, errorKind: "timeout" },
    { path: ".claude/skills/", count: 2, errorKind: null },
    { path: "package.json", count: 2, errorKind: null },
  ]);
});
