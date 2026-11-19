import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORY_SEED, classify, type ClassifyCategory } from "./classify.ts";

const smalls: ClassifyCategory[] = CATEGORY_SEED.flatMap((b) => b.smalls.map((s) => ({ id: `${b.name}/${s.name}`, parentId: b.name, keywords: s.keywords })));
const pick = (name: string, desc: string | null = null) => classify(name, desc, smalls).categoryId;

test("운영 표본에서 본 예: 이름·설명의 낱말로 세부 갈래를 고른다", () => {
  assert.equal(pick("Optibot", "AI code review for your AI assistant — review local changes, branch diffs, and patch files."), "검사·보안/코드 검사·테스트");
  assert.equal(pick("Serbia Invoices (SEF eFaktura national API)", "Serbia SEF eFaktura invoices for AI agents: build UBL 2.1"), "업무·서비스 연동/결제·금융");
  assert.equal(pick("PostFlow", "Schedule, publish and manage social media posts across platforms."), "업무·서비스 연동/마케팅·소셜");
  assert.equal(pick("@modelcontextprotocol/server-puppeteer", ""), "프론트엔드/브라우저 자동화");
});

test("이름에서 맞으면 2점이라 설명보다 우선, 낱말 경계로만(pay ≠ display·paypal)", () => {
  assert.equal(pick("Postgres Explorer", "send email reports"), "백엔드·데이터/데이터베이스");
  assert.notEqual(pick("Display Studio", "display a paypal button"), "업무·서비스 연동/결제·금융");
});

test("비기거나 아무것도 안 맞으면 비움(관리자 확인 목록에 남아 세부 갈래를 받을 수 있게)", () => {
  assert.equal(pick("x", "notes and tasks"), null); // 문서·노트 1 = 작업·일정 1, 같은 큰 갈래여도 비움
  assert.equal(pick("x", "notes, tasks and a notion wiki"), "기획·문서/문서·노트"); // 혼자 가장 높으면 정함
  assert.equal(pick("x", "weather and figma"), null); // 여행·장소 1 = 디자인 도구 1, 다른 큰 갈래
  assert.equal(pick("Babá Certa", "Encontre babás por cidade"), null);
});

test("너무 흔한 낱말(agents, hosted, model context protocol)로는 정하지 않는다", () => {
  assert.equal(pick("SSearch", "Free web search for AI agents. Hosted MCP in active development."), "리서치/웹 검색·수집");
  assert.equal(pick("Thing", "A Model Context Protocol server for AI agents"), null);
});

test("갈래 시드 마이그레이션이 CATEGORY_SEED와 같은 목록이다(한쪽만 고치면 여기서 걸린다)", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync("supabase/migrations/202611192300_P-12c_categories_seed.sql", "utf8");
  for (const b of CATEGORY_SEED) {
    assert.ok(sql.includes(`('${b.name}')`), b.name);
    for (const s of b.smalls) assert.ok(sql.includes(`('${s.name}', '${b.name}', array[${s.keywords.map((k) => `'${k}'`).join(", ")}])`), s.name);
  }
});
