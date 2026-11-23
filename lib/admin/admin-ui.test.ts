// 관리자 화면 문법(I-admin-unify, app/admin/admin-ui.tsx): 모든 관리자 화면이 같은 조각 · 같은 순서로 그리는지 소스로 지킨다.
// 화면을 띄우지 않는 시험이라(.tsx는 node --test로 못 불러옴) 소스 글자로 본다. 눈으로 보는 확인은 /dev/admin-sample/<화면> 캡처.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const tsx = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = `${dir}/${n}`;
  return statSync(p).isDirectory() ? tsx(p) : p.endsWith(".tsx") ? [p] : [];
});
const read = (p: string) => readFileSync(p, "utf8");
// 사용기 신고는 다른 팀원(황재웅 · 김영식) 화면이라 이 문법 밖. run-view · flow-diagram은 내 실행 기록(/projects/runs)과 같이 써서 admin.css 밖에서도 그려야 한다
const OUTSIDE = /app\/admin\/reports\/|app\/admin\/flow\/(run-view|flow-diagram)\.tsx$/;
const FILES = tsx("app/admin").filter((f) => !OUTSIDE.test(f));
const SCREENS = ["members", "observations", "alerts", "runs", "flow", "classify", "simulator", "chat", "run-now", "demo"];
const BODIES = [...SCREENS.map((s) => `app/admin/${s}/body.tsx`), "app/admin/overview.tsx"];

test("틀이 순서를 정한다: 머리 → 툴바 → 알림 → 본문(막힘 · 읽기 실패 알림이 먼저)", () => {
  const shell = read("app/admin/admin-shell.tsx");
  const at = (s: string) => { const i = shell.indexOf(s); assert.ok(i > 0, s); return i; };
  assert.ok(at("<header className=\"admin-head\">") < at("<AdminToolbar") && at("<AdminToolbar") < at("<AdminNotes") && at("<AdminNotes") < at("{blocked || error ? null : children}"));
  assert.match(shell, /items=\{\[\.\.\.shellNotes, /);
});

test("화면마다 본문(body)이 있고, 모든 본문이 툴바를 넘긴다", () => {
  for (const f of BODIES) {
    assert.ok(existsSync(f), f);
    const text = read(f);
    assert.match(text, /<AdminShell[^>]*toolbar=\{/, `${f}: 툴바 없음`);
  }
});

test("본문 안 순서: 숫자 띠 → 필터 → 첫 섹션", () => {
  for (const f of BODIES) {
    const text = read(f);
    const sum = text.indexOf("<AdminSummary"), filt = text.indexOf("<FilterForm"), sec = text.search(/<AdminSection|<ChatForm|<AdminOverview|<ProdFailGuide|<Unclassifieds/);
    if (sum >= 0 && filt >= 0) assert.ok(sum < filt, `${f}: 숫자 띠가 필터보다 뒤`);
    if (filt >= 0) assert.ok(filt < sec, `${f}: 필터가 섹션보다 뒤`);
    if (sum >= 0) assert.ok(sum < sec, `${f}: 숫자 띠가 섹션보다 뒤`);
  }
});

test("페이지는 읽기 · 권한만: 표 · 섹션 · 알림 줄을 직접 그리지 않고 본문에 넘긴다", () => {
  for (const s of SCREENS) {
    const text = read(`app/admin/${s}/page.tsx`);
    assert.doesNotMatch(text, /<table|<AdminSection|<AdminTile|className="admin-note/, s);
    assert.match(text, /Body /, `${s}: 본문을 부르지 않음`);
  }
});

test("알림 줄 · h2 · 인라인 style은 공용 조각과 admin.css로만(화면마다 모양이 달라지지 않게)", () => {
  const bad = FILES.filter((f) => !f.endsWith("admin-ui.tsx")).flatMap((f) => {
    const text = read(f);
    const out: string[] = [];
    if (/className=\{?["`]admin-note/.test(text)) out.push(`${f}: admin-note 직접`);
    if (/<h2[\s>]/.test(text) && !f.endsWith("role-dialog.tsx")) out.push(`${f}: h2 직접(AdminSection으로)`);
    if (/style=\{\{/.test(text)) out.push(`${f}: 인라인 style`);
    return out;
  });
  assert.deepEqual(bad, []);
});

test("툴바 링크는 있는 화면으로만 가고, 링크마다 보조 단추 모양 하나(같은 클래스)", () => {
  const ui = read("app/admin/admin-ui.tsx");
  assert.match(ui, /links\.map\(\(l\) => <Link key=\{l\.href\} className="admin-linkbtn" href=\{l\.href\}>\{l\.label\}<\/Link>\)/);
  const hrefs = BODIES.flatMap((f) => [...read(f).matchAll(/\{ href: "([^"]+)", label: "[^"]+" \}/g)].map((m) => [f, m[1]]));
  assert.ok(hrefs.length >= 20, `${hrefs.length}개`);
  const missing = hrefs.filter(([, h]) => !existsSync(join("app", h, "page.tsx")));
  assert.deepEqual(missing, []);
});

test("공용 조각 · 본문 · 견본에는 판단 단추가 없다(불변 1)", () => {
  const files = ["app/admin/admin-ui.tsx", ...BODIES, "app/dev/admin-sample/[view]/page.tsx", "app/dev/admin-sample/[view]/samples.tsx"];
  for (const f of files) {
    const text = read(f);
    assert.doesNotMatch(text, /save_judgment|saveJudgment|from\(\s*["']judgments/, f);
    assert.doesNotMatch(text, /<button[^>]*>[^<]*(적용 후보|보류)/, f);
  }
});

test("화면별 견본은 배포에서 404, 가짜 값이라고 화면에 쓰고, 문법을 따르는 화면을 모두 그린다", () => {
  const page = read("app/dev/admin-sample/[view]/page.tsx");
  assert.match(page, /if \(process\.env\.NODE_ENV === "production"\) notFound\(\);/);
  assert.match(page, /가짜 값 견본/);
  const samples = read("app/dev/admin-sample/[view]/samples.tsx");
  const keys = [...samples.slice(samples.indexOf("export const VIEWS")).matchAll(/^ {2}"?([\w-]+)"?: \(\) =>/gm)].map((m) => m[1]);
  assert.deepEqual([...keys].sort(), [...SCREENS].sort());
});
