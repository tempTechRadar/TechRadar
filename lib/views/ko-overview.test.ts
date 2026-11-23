import assert from "node:assert/strict";
import test from "node:test";
import { koOf } from "../ai/translate-one-liners.ts";
import { koOverview } from "./ko-overview.ts";

const EN = "Web scraping MCP server";
const SRC = "https://github.com/example/scraper";

test("번역 있음: 한국어를 먼저, [원문 보기]용 영어 원문 · 출처를 같이", () => {
  assert.deepEqual(koOverview({ oneLiner: EN, oneLinerKo: " 웹 페이지를 긁어 오는 MCP 서버 ", oneLinerSource: SRC }), { ko: "웹 페이지를 긁어 오는 MCP 서버", original: EN, source: SRC });
  assert.equal(koOverview({ oneLiner: EN, oneLinerKo: "개요", oneLinerSource: "javascript:alert(1)" })?.source, null, "출처 링크는 http(s)만");
});

test("번역 없음: null이라 화면은 지금처럼(describeKo · 원문 · 정해 둔 설명)", () => {
  assert.equal(koOverview({ oneLiner: EN, oneLinerKo: null, oneLinerSource: SRC }), null);
  assert.equal(koOverview({ oneLiner: EN, oneLinerKo: "  " }), null);
  assert.equal(koOverview({ oneLiner: null }), null);
});

test("원문 바뀜: 번역 뒤 원문이 바뀐 줄은 서버(koOf)를 거치면 한국어 없이 원문만", () => {
  const row = { one_liner: "Scrapes and crawls web pages", one_liner_ko: "웹 페이지를 긁어 오는 MCP 서버", one_liner_ko_src: EN, one_liner_source: SRC };
  assert.equal(koOverview({ oneLiner: row.one_liner, ...koOf(row) }), null);
  assert.equal(koOverview({ oneLiner: EN, ...koOf({ ...row, one_liner: EN }) })?.ko, "웹 페이지를 긁어 오는 MCP 서버", "원문이 같으면 그대로 보인다");
});
