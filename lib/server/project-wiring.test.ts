// 프로젝트 수정·보관(PRD-F4)이 화면과 서버 동작에 제대로 이어져 있는지 소스로 지킨다.
// Next.js 서버 동작·화면은 이 시험에서 못 돌리니, 누가 나중에 줄을 지우거나 순서를 바꾸면 실패하게 하는 배선 시험이다(redirect-in-try 시험과 같은 방식).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(`../../app/projects/${rel}`, import.meta.url), "utf8");
const actions = read("actions.ts");
const projectActions = read("project-actions.ts");
const techActions = read("tech-actions.ts");
// 레포 하나는 레포 상세 /projects/[id](P-12k K2), 결과 알림은 repo-manage의 ManageNotices(보드 · 레포 상세 맨 위)
const page = read("[id]/page.tsx");
const notices = readFileSync(new URL("../../app/dashboard/repo-manage.tsx", import.meta.url), "utf8");
const repoDetail = readFileSync(new URL("./repo-detail.ts", import.meta.url), "utf8");

test("프로젝트 등록: 보관한 주소는 읽기 전에 막는다(보관된 채 조용히 다시 읽기만 도는 일이 없게)", () => {
  const check = actions.indexOf("isArchivedRepo(");
  const read1 = actions.indexOf("registerAndRead(user");
  assert.ok(check > 0 && read1 > 0, "둘 다 있어야 한다");
  assert.ok(check < read1, "보관 확인이 읽기보다 앞이어야 한다");
  assert.match(actions, /redirect\(`\$\{base\}\?error=archived`\)/);
  assert.match(actions, /archived === null\) redirect\(`\$\{base\}\?error=project_failed`\)/, "조회가 실패하면 모르는 채로 읽지 않는다(불변 2)");
});

test("동작 뒤 돌아가기(K2): 다시 읽기 · 숨기기 · 이름 고치기는 폼의 from(레포 id → backPath)으로, 보관 · 되살리기는 보드로", () => {
  assert.match(actions, /const base = backPath\(formData\.get\("from"\)\)/);
  assert.match(actions, /redirect\(base\);/);
  assert.match(techActions, /backPath\(formData\.get\("from"\)\)\);/);
  assert.match(projectActions, /"project_edited", backPath\(formData\.get\("from"\)\)\)/);
  assert.match(projectActions, /archiveProject\(ctx, idOf\(formData\)\), "project_archived"\);/, "보관한 레포는 상세가 없어 보드로");
  for (const f of ["tech-table.tsx", "project-manage.tsx"]) assert.match(read(f), /name="from"/, `${f}: 폼에 from`);
  assert.match(page, /name="from" value=\{p\.id\}/, "레포 상세의 [다시 읽기]");
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
  assert.match(projectActions, /redirect\(`\$\{base\}\?error=project_\$\{result\.code\}`\)/, "실패는 이유 코드를 싣고 돌아간다");
});

test("레포 상세 · 보관함 읽기: 내 것만(owner_id), 상세는 보관 안 한 것만, 보관함은 저장소 프로젝트의 보관한 것만", () => {
  assert.match(repoDetail, /\.eq\("id", id\)\.eq\("owner_id", userId\)\.is\("archived_at", null\)/);
  assert.match(repoDetail, /\.eq\("owner_id", userId\)\.eq\("kind", "repo"\)\.not\("archived_at", "is", null\)/);
});

test("레포 상세 화면: uuid가 아니거나 없거나 남의 것이면 404, 못 읽으면 읽지 못함, 관리 상자는 저장소 프로젝트에만", () => {
  assert.match(page, /if \(!isUuid\(id\)\) notFound\(\);/);
  assert.match(page, /if \(!repo\) notFound\(\);/);
  assert.match(page, /readRepoDetail\(db, user\.id, id\)\.catch/);
  assert.match(page, /repo === "failed"/);
  assert.match(page, /p\.kind === "repo" \? <ProjectManage/, "프로젝트 밖은 이름이 코드에서 상수로 쓰여 고치거나 보관할 수 없다");
  assert.match(notices, /\.\.\.PROJECT_NOTICE_TEXT/);
  assert.match(notices, /\.\.\.PROJECT_ERROR_TEXT/);
});

test("설치 프롬프트: 보관한 프로젝트의 도구는 빼고, 보관 조회가 실패하면 오류로 알린다(불변 2)", () => {
  const install = read("install/page.tsx");
  assert.match(install, /readArchivedProjectIds\(db, user\.id\)/);
  assert.match(install, /\.filter\(\(r\) => !archived\.has\(r\.project_id\)\)/);
  assert.match(install, /\?\? archivedError/, "조회 실패는 목록 읽기 실패와 같은 오류 안내로");
  assert.match(install, /\.select\("id, project_id,/, "project_id를 읽어야 거를 수 있다");
});

test("결과 알림: 주소에서 온 코드는 자기 키만 문구로 바꾼다(__proto__로 500이 나지 않게)", () => {
  assert.match(notices, /ownText\(URL_ERROR_TEXT, query\.error\)/);
  assert.match(notices, /ownText\(NOTICE_TEXT, query\.notice\)/);
  assert.doesNotMatch(notices, /(NOTICE_TEXT|URL_ERROR_TEXT|TECH_ERROR_TEXT)\[query\./, "주소 값으로 객체를 바로 읽지 않는다");
});

test("옛 /projects 목록: ?project=<레포 id>면 레포 상세로, 아니면 결과 코드를 싣고 보드 진행 중 프로젝트 판(#w-repos)으로", () => {
  const old = read("page.tsx");
  assert.match(old, /isUuid\(query\.project\)\) redirect\(`\/projects\/\$\{query\.project\}`\)/);
  assert.match(old, /redirect\(`\/dashboard\$\{next\.size \? `\?\$\{next\}` : ""\}#w-repos`\)/);
  assert.doesNotMatch(old, /getServerSupabase/, "보내기만 하고 DB는 안 부른다");
});
