// 관리자 묶음 메뉴(11-23 리뉴얼, app/admin/admin-nav.ts)와 리뉴얼 화면의 소스 규칙. 화면을 띄우지 않는 시험이라 소스 글자로 지킨다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADMIN_GROUPS, groupLabelOf, groupTabs, groupTitle } from "../../app/admin/admin-nav.ts";

const shell = readFileSync("app/admin/admin-shell.tsx", "utf8");
const block = shell.slice(shell.indexOf("export const ADMIN_TABS"), shell.indexOf("] as const"));
const realTabs = [...block.matchAll(/\{ id: "([\w-]+)", href: "([^"]+)", label: "([^"]+)" \}/g)].map(([, id, href, label]) => ({ id, href, label }));

test("실제 메뉴: 기존 9개 id · href · label은 그대로, 지금 실행 · 실패 시연이 더해져 11개", () => {
  const before = [
    ["members", "/admin/members", "회원과 권한"], ["observations", "/admin/observations", "수집 자료"], ["alerts", "/admin/alerts", "알림과 처리 현황"],
    ["runs", "/admin/runs", "수집 실행과 오류"], ["flow", "/admin/flow", "흐름 화면"], ["classify", "/admin/classify", "분류 확인"],
    ["reports", "/admin/reports", "사용기 신고"], ["simulator", "/admin/simulator", "시뮬레이터"], ["chat", "/admin/chat", "위키 챗봇"],
  ];
  assert.deepEqual(realTabs.slice(0, 9).map((t) => [t.id, t.href, t.label]), before);
  assert.deepEqual(realTabs.slice(9).map((t) => t.href), ["/admin/run-now", "/admin/demo"]);
});

test("실제 메뉴는 묶음 4개에 하나씩 빠짐없이 들어가고 '그 밖' 묶음이 생기지 않는다", () => {
  const groups = groupTabs(realTabs);
  assert.deepEqual(groups.map((g) => g.id), ["watch", "human", "ops", "demo"]);
  const ids = groups.flatMap((g) => g.items.map((t) => t.id));
  assert.equal(ids.length, realTabs.length);
  assert.deepEqual([...ids].sort(), realTabs.map((t) => t.id).sort());
  assert.deepEqual(groups[0].items.map((t) => t.id), ["runs", "run-now", "observations", "flow"]);
  assert.deepEqual(groups[1].items.map((t) => t.id), ["alerts", "reports"]);
  assert.deepEqual(groups[2].items.map((t) => t.id), ["members", "classify"]);
  assert.deepEqual(groups[3].items.map((t) => t.id), ["simulator", "demo", "chat"]);
});

test("groupTabs: 묶음에 없는 새 탭은 사라지지 않고 '그 밖'으로, 메뉴에 없는 id · 빈 묶음은 건너뜀, 같은 id는 한 번만", () => {
  const tabs = [{ id: "a", href: "/a", label: "A" }, { id: "b", href: "/b", label: "B" }, { id: "new", href: "/n", label: "새 탭" }];
  const groups = groupTabs(tabs, [{ id: "g1", label: "하나", items: ["a", "ghost", "b"] }, { id: "g2", label: "둘", items: ["ghost", "a"] }]);
  assert.deepEqual(groups.map((g) => [g.id, g.items.map((t) => t.id)]), [["g1", ["a", "b"]], ["other", ["new"]]]);
  assert.deepEqual(groupTabs([], ADMIN_GROUPS), []);
});

test("groupLabelOf: 탭의 묶음 이름(메모 포함), 첫 화면 · 모르는 탭은 '관리자'", () => {
  assert.equal(groupLabelOf("classify"), "운영 관리(고치면 기록이 남음)");
  assert.equal(groupLabelOf("run-now"), "지켜보기(자동)");
  assert.equal(groupLabelOf("reports"), "사람 판단 현황");
  assert.equal(groupLabelOf(""), "관리자");
  assert.equal(groupLabelOf("없는탭"), "관리자");
  assert.equal(groupTitle({ label: "x" }), "x");
});

test("틀 · 첫 화면 · 견본에는 판단 단추가 없다(불변 1): 판단 저장 이름 · 적용 후보/보류 단추 글자가 없다", () => {
  const files = ["app/admin/admin-shell.tsx", "app/admin/overview.tsx", "app/admin/page.tsx", "app/dev/admin-sample/page.tsx", "lib/server/admin-overview.ts"];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    assert.doesNotMatch(text, /save_judgment|saveJudgment|judgments/, f);
    assert.doesNotMatch(text, /<button[^>]*>[^<]*(적용 후보|보류)/, f);
  }
});

test("관제 요약 읽기는 관리자 본인 권한(adminGate의 db)으로만: 서비스 키를 쓰지 않고, 쓰기도 없다", () => {
  const lib = readFileSync("lib/server/admin-overview.ts", "utf8");
  assert.doesNotMatch(lib, /getServiceSupabase|SUPABASE_SERVICE_ROLE_KEY|service-supabase/);
  assert.doesNotMatch(lib, /\.\s*(insert|update|upsert|delete)\s*\(/);
  const page = readFileSync("app/admin/page.tsx", "utf8");
  assert.match(page, /adminGate\(\)[\s\S]*"blocked" in gate[\s\S]*readOverview\(gate\.db\)/);
});

test("견본 화면은 배포에서 404(개발에서만), 가짜 값이라고 화면에 쓴다", () => {
  const text = readFileSync("app/dev/admin-sample/page.tsx", "utf8");
  assert.match(text, /if \(process\.env\.NODE_ENV === "production"\) notFound\(\);/);
  assert.match(text, /가짜/);
});

test("틀 밖이던 시뮬레이터 · 지금 실행 · 실패 시연이 관리자 틀 안이고, 역할 검사는 그대로", () => {
  for (const [f, tab] of [["app/admin/simulator/page.tsx", "simulator"], ["app/admin/run-now/page.tsx", "run-now"], ["app/admin/demo/page.tsx", "demo"]]) {
    const text = readFileSync(f, "utf8");
    assert.match(text, new RegExp(`<AdminShell tab="${tab}"`), f);
    assert.match(text, /getCurrentUser\(\)[\s\S]*role !== "admin"[\s\S]*blocked="forbidden"/, f);
    assert.doesNotMatch(text, /style=\{\{/, `${f}: 인라인 style 대신 admin.css 클래스`);
  }
});

test("실패 시연: 스위치가 꺼진 운영에서 대신 쓸 길(깨진 시연 저장소 → 프로젝트 보드 등록 → 흐름 화면)을 안내한다", () => {
  const text = readFileSync("app/admin/demo/page.tsx", "utf8");
  assert.match(text, /https:\/\/github\.com\/csaeil\/techradar-fail-demo/);
  assert.match(text, /\+ 레포 등록/);
  assert.match(text, /\{on \? null : <ProdFailGuide \/>\}/);
});

test("흐름 화면: ?run= 실행이 최근 20개 밖이면 id로 따로 읽고, 없으면 최근 실행으로 대신 그리지 않는다", () => {
  const text = readFileSync("app/admin/flow/page.tsx", "utf8");
  assert.match(text, /\.eq\("id", wanted\)\.maybeSingle\(\)/);
  assert.match(text, /그 실행을 찾지 못했어요/);
  assert.match(text, /const picked = asked \? asked\.run : recent\[0\] \?\? null;/);
});

test("위키 챗봇 예시 칩의 질문은 정답표(docs/wiki-chat.md) Q1–Q5 질문 문장 그대로", () => {
  const form = readFileSync("app/admin/chat/chat-form.tsx", "utf8");
  const sheet = readFileSync("docs/wiki-chat.md", "utf8");
  const chips = [...form.matchAll(/\{ id: "(Q\d)", question: "((?:[^"\\]|\\.)*)" \}/g)].map(([, id, q]) => [id, q.replaceAll('\\"', '"')]);
  assert.equal(chips.length, 5);
  for (const [id, q] of chips) assert.ok(sheet.includes(`| ${id} | `) && sheet.split("\n").some((l) => l.startsWith(`| ${id} |`) && l.includes(`| ${q} |`)), `${id}: ${q}`);
  assert.doesNotMatch(form, /requestSubmit|\.submit\(\)/, "칩은 칸만 채우고 제출은 사람이 누른다");
});
