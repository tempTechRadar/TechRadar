// 프로젝트 수정·보관(PRD-F4)이 화면과 서버 동작에 제대로 이어져 있는지 소스로 지킨다.
// Next.js 서버 동작·화면은 이 시험에서 못 돌리니, 누가 나중에 줄을 지우거나 순서를 바꾸면 실패하게 하는 배선 시험이다(redirect-in-try 시험과 같은 방식).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(`../../app/projects/${rel}`, import.meta.url), "utf8");
const actions = read("actions.ts");
const projectActions = read("project-actions.ts");
const page = read("page.tsx");

test("프로젝트 등록: 보관한 주소는 읽기 전에 막는다(보관된 채 조용히 다시 읽기만 도는 일이 없게)", () => {
  const check = actions.indexOf("isArchivedRepo(");
  const read1 = actions.indexOf("registerAndRead(user");
  assert.ok(check > 0 && read1 > 0, "둘 다 있어야 한다");
  assert.ok(check < read1, "보관 확인이 읽기보다 앞이어야 한다");
  assert.match(actions, /redirect\("\/projects\?error=archived"\)/);
  assert.match(actions, /archived === null\) redirect\("\/projects\?error=project_failed"\)/, "조회가 실패하면 모르는 채로 읽지 않는다(불변 2)");
});

test("프로젝트 동작 셋은 로그인 확인부터 하고, DB 판단은 lib/server에 맡긴다", () => {
  for (const name of ["editProjectAction", "archiveProjectAction", "restoreProjectAction"]) {
    const start = projectActions.indexOf(`export async function ${name}`);
    assert.ok(start > 0, name);
    const body = projectActions.slice(start, projectActions.indexOf("\n}", start));
    assert.match(body, /const ctx = await context\(\);/, `${name}: 로그인 확인이 먼저`);
  }
  assert.match(projectActions, /if \(!user\) redirect\("\/login"\)/);
  assert.doesNotMatch(projectActions, /\.from\(/, "DB는 직접 부르지 않는다");
  assert.match(projectActions, /redirect\(`\/projects\?error=project_\$\{result\.code\}`\)/, "실패는 이유 코드를 싣고 돌아간다");
});

test("목록 화면: 활성 목록은 보관 안 한 것만, 보관 목록은 저장소 프로젝트의 보관한 것만 읽고, 못 읽으면 불러오지 못했다고 보인다", () => {
  assert.match(page, /\.eq\("owner_id", user\.id\)\s*\.is\("archived_at", null\)/, "활성 목록은 보관한 것을 뺀다");
  assert.match(page, /\.eq\("kind", "repo"\)\.not\("archived_at", "is", null\)/, "보관 목록");
  assert.match(page, /<ArchivedProjects projects=\{archived\} failed=\{Boolean\(archivedRes\.error\)\} \/>/);
});

test("관리 상자는 저장소 프로젝트에만 붙인다(프로젝트 밖은 이름이 코드에서 상수로 쓰여 고치거나 보관할 수 없다)", () => {
  assert.match(page, /p\.kind === "repo" && <ProjectManage/);
  assert.match(page, /\.\.\.PROJECT_NOTICE_TEXT/);
  assert.match(page, /\.\.\.PROJECT_ERROR_TEXT/);
});

test("설치 프롬프트: 보관한 프로젝트의 도구는 빼고, 보관 조회가 실패하면 오류로 알린다(불변 2)", () => {
  const install = read("install/page.tsx");
  assert.match(install, /readArchivedProjectIds\(db, user\.id\)/);
  assert.match(install, /\.filter\(\(r\) => !archived\.has\(r\.project_id\)\)/);
  assert.match(install, /\?\? archivedError/, "조회 실패는 목록 읽기 실패와 같은 오류 안내로");
  assert.match(install, /\.select\("id, project_id,/, "project_id를 읽어야 거를 수 있다");
});

test("목록 화면: 주소에서 온 코드는 자기 키만 문구로 바꾸고(__proto__로 500이 나지 않게), 보관했거나 없는 프로젝트로 걸린 주소는 이유를 말한다", () => {
  assert.match(page, /ownText\(URL_ERROR_TEXT, query\.error\)/);
  assert.match(page, /ownText\(NOTICE_TEXT, query\.notice\)/);
  assert.doesNotMatch(page, /(NOTICE_TEXT|URL_ERROR_TEXT|TECH_ERROR_TEXT)\[query\./, "주소 값으로 객체를 바로 읽지 않는다");
  assert.match(page, /staleProject = Boolean\(query\.project\) && !projects\.some/);
  assert.match(page, /\{staleProject && </);
});
