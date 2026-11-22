import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// 누르는 칸 최소 크기(WCAG 2.2 2.5.8, 터치 44px): 11-19 운영 측정에서 메뉴 링크 20px·프로젝트 주소 입력칸 17px·표 안 링크 16~19px이었다(I-a11y-tap-targets).
// CSS는 시험할 도구가 없어 규칙이 지워지지 않았는지만 본다(실제 크기는 내장 브라우저로 잰다: docs/qa.md).
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const rule = (css: string, selector: string): string => {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `${selector} 규칙이 없다`);
  return css.slice(start, css.indexOf("}", start));
};

test("주 메뉴의 링크와 로그아웃 버튼은 최소 높이 44px", () => {
  const css = read("app/site-nav.css");
  assert.match(rule(css, ".site-nav a, .site-nav button"), /min-height:\s*44px/);
  assert.match(rule(css, ".site-nav {"), /flex-wrap:\s*wrap/); // 좁은 화면에서 줄이 넘치지 않게
});

test("레이아웃의 메뉴는 이 스타일(site-nav)을 쓰고 인라인 높이를 다시 정하지 않는다", () => {
  const layout = read("app/layout.tsx");
  assert.match(layout, /className="site-nav"/);
  assert.match(layout, /import "\.\/site-nav\.css"/);
});

test("거르기·등록 폼의 입력칸은 44px, 체크박스는 라벨이 44px로 감싸고, 표 안 링크는 24px 이상", () => {
  const css = read("app/page.css");
  assert.match(rule(css, '.page .filters input:not([type="checkbox"]):not([type="hidden"])'), /min-height:\s*44px/);
  assert.match(rule(css, '.page .filters label:has(> input[type="checkbox"])'), /min-height:\s*44px/);
  assert.match(rule(css, '.page .filters input[type="checkbox"]'), /width:\s*20px/);
  assert.match(rule(css, ".page table a"), /min-height:\s*24px/);
});
