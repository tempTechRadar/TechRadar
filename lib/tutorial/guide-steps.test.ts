// 둘러보기(/guide) 내용이 실제 화면과 어긋나지 않는지: 주소는 실제 page.tsx로, 근거 문구는 그 파일에 글자 그대로 있어야 한다.
// 화면 문구를 바꾸면 이 시험이 깨진다 → 둘러보기 문구도 같이 고친다(튜토리얼이 낡은 채로 남지 않게).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FAQ, GRADE_EVIDENCE, GRADES, INTRO_EVIDENCE, MORE_SCREENS, MOTTO, PROMISES, STEPS,
  moveStep, splitUiNames, stepFromHash, stepHash, uiNames, type Evidence,
} from "./guide-steps.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

/** 주소 → app/ 아래 page.tsx. 쿼리 · 해시는 뗀다. 동적 칸([id])은 폴더 이름 그대로 써 둔 주소만 받는다 */
function pageFile(href: string): string {
  const path = href.split(/[?#]/)[0].replace(/^\/|\/$/g, "");
  return join("app", path, "page.tsx");
}

const allEvidence: Evidence[] = [
  ...INTRO_EVIDENCE, ...STEPS.flatMap((s) => s.evidence), ...GRADE_EVIDENCE,
  ...PROMISES.map((p) => p.evidence), ...FAQ.map((f) => f.evidence), ...MORE_SCREENS.map((m) => m.evidence),
];

test("둘러보기: 단계 · 기준 문장 · 더 있는 화면 · 레포 상세 주소가 모두 실제 화면(page.tsx)이다", () => {
  const hrefs = [...STEPS.map((s) => s.href), ...MOTTO.map((m) => m.href), ...MORE_SCREENS.map((m) => m.href), "/guide", "/projects/[id]", "/blueprint/gallery"];
  for (const href of hrefs) assert.ok(existsSync(join(ROOT, pageFile(href))), `${href} → ${pageFile(href)} 없음`);
});

test("둘러보기: 근거 문구가 그 파일에 글자 그대로 있다(화면 문구가 바뀌면 여기서 깨짐)", () => {
  const missing: string[] = [];
  for (const { file, phrases } of allEvidence) {
    assert.ok(existsSync(join(ROOT, file)), `근거 파일 없음: ${file}`);
    assert.ok(phrases.length > 0, `${file}: 근거 문구가 비었음`);
    const text = read(file);
    for (const p of phrases) if (!text.includes(p)) missing.push(`${file}: "${p}"`);
  }
  assert.deepEqual(missing, []);
});

test("둘러보기: 행동 글의 「화면 이름」은 그 단계 근거 문구 안에 있다(지어낸 단추 이름 금지)", () => {
  for (const s of STEPS) {
    const phrases = s.evidence.flatMap((e) => e.phrases);
    for (const name of s.actions.flatMap(uiNames)) assert.ok(phrases.some((p) => p.includes(name)), `${s.id}: 「${name}」의 근거가 없음`);
  }
});

test("둘러보기: 단계는 6개, id 겹침 없음, 순서 고정, 행동은 2~4개", () => {
  assert.deepEqual(STEPS.map((s) => s.id), ["start", "protect", "choose", "judge", "compose", "export"]);
  assert.equal(new Set(STEPS.map((s) => s.id)).size, STEPS.length);
  for (const s of STEPS) assert.ok(s.actions.length >= 2 && s.actions.length <= 4, `${s.id}: 행동 ${s.actions.length}개`);
  assert.equal(PROMISES.length, 4);
  assert.ok(FAQ.length >= 5 && FAQ.length <= 6);
});

test("둘러보기: 등급 범례 색은 tokens.css에 있는 토큰이다", () => {
  const css = read("app/tokens.css");
  for (const g of GRADES) assert.ok(css.includes(`${g.token}: #`), `${g.name}: ${g.token} 없음`);
});

test("둘러보기: 화면 이름 나누기 · 해시 · 이동", () => {
  assert.deepEqual(uiNames("「복사」를 누르고 「이대로 확정」"), ["복사", "이대로 확정"]);
  assert.deepEqual(splitUiNames("먼저 「복사」를 눌러요"), [{ text: "먼저 ", ui: false }, { text: "복사", ui: true }, { text: "를 눌러요", ui: false }]);
  assert.equal(stepFromHash("#step-4", 6), 3);
  assert.equal(stepFromHash("#step-0", 6), null);
  assert.equal(stepFromHash("#step-7", 6), null);
  assert.equal(stepFromHash("#faq", 6), null);
  assert.equal(stepHash(1), "#step-2");
  assert.equal(moveStep(0, -1, 6), 0);
  assert.equal(moveStep(5, 1, 6), 5);
  assert.equal(moveStep(2, 1, 6), 3);
});
