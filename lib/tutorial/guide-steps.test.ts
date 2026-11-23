// 둘러보기(/guide) 내용이 실제 화면과 어긋나지 않는지: 주소는 실제 page.tsx로, 근거 문구는 그 파일에 글자 그대로 있어야 한다.
// 화면 문구를 바꾸면 이 시험이 깨진다 → 둘러보기 문구도 같이 고친다(튜토리얼이 낡은 채로 남지 않게).
// 소스(.ts · .tsx · .css · .sql)는 주석을 지운 뒤 찾는다: 주석에만 있는 말은 화면에 그려지지 않으니 근거가 아니다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FAQ, FAQ_EXTRA_EVIDENCE, GRADE_EVIDENCE, GRADES, MARKS, MOCK_FILES, MOCK_PLACEHOLDERS, MOCK_SOURCES, MORE_SCREENS, PROMISES, TERM_EVIDENCE } from "./guide-sections.ts";
import { SCENES } from "./guide-scenes.ts";
import { INTRO_EVIDENCE, MOTTO, REGISTER_HREF, STEPS, moveStep, phaseOf, splitUiNames, stepFromHash, stepHash, uiNames, type Evidence } from "./guide-steps.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const raw = (file: string) => readFileSync(join(ROOT, file), "utf8");

/** 주석 지우기: 블록(/* *\/ · {/* *\/}), 줄 주석(줄 처음이나 빈칸 뒤의 //: "https://"는 남김), SQL의 --. 문서(.md)는 그대로 */
function stripComments(file: string, text: string): string {
  if (file.endsWith(".md")) return text;
  // 블록 주석만 지운다({/* */}도 여기서 안쪽이 지워진다). 옛 식은 "{ /** … */ 이름: …" 꼴에서 다음 "*/}"까지 수백 줄을 통째로 지워 화면 글자를 놓쳤다(I-tutorial-motion)
  let out = text.replace(/\/\*[\s\S]*?\*\//g, "");
  if (/\.(ts|tsx|mts)$/.test(file)) out = out.replace(/(^|\s)\/\/.*$/gm, "$1");
  if (file.endsWith(".sql")) out = out.replace(/(^|\s)--.*$/gm, "$1");
  return out;
}
const cache = new Map<string, string>();
const screen = (file: string) => { if (!cache.has(file)) cache.set(file, stripComments(file, raw(file))); return cache.get(file)!; };

/** 주소 → app/ 아래 page.tsx. 쿼리 · 해시는 뗀다. 동적 칸([id])은 폴더 이름 그대로 써 둔 주소만 받는다 */
const pageFile = (href: string) => join("app", href.split(/[?#]/)[0].replace(/^\/|\/$/g, ""), "page.tsx");

const allEvidence: Evidence[] = [
  ...INTRO_EVIDENCE, ...STEPS.flatMap((s) => s.evidence), ...GRADE_EVIDENCE, ...TERM_EVIDENCE, ...FAQ_EXTRA_EVIDENCE,
  ...PROMISES.map((p) => p.evidence), ...FAQ.map((f) => f.evidence), ...MORE_SCREENS.map((m) => m.evidence),
];

test("주석 지우기: 블록 · 줄 · JSX 주석은 지우고 주소 속 //와 글은 남긴다", () => {
  const src = 'a // 줄 주석\n{/* JSX 주석 */}<b>보임</b> /* 블록 */ "https://x.y"';
  const out = stripComments("x.tsx", src);
  assert.ok(!out.includes("줄 주석") && !out.includes("JSX 주석") && !out.includes("블록"));
  assert.ok(out.includes("<b>보임</b>") && out.includes('"https://x.y"'));
});

test("둘러보기: 단계 · 기준 문장 · 더 있는 화면 · 레포 상세 주소가 모두 실제 화면(page.tsx)이다", () => {
  const hrefs = [...STEPS.map((s) => s.href), ...MOTTO.map((m) => m.href), ...MORE_SCREENS.map((m) => m.href), REGISTER_HREF, "/guide", "/projects/[id]", "/blueprint/gallery"];
  for (const href of hrefs) assert.ok(existsSync(join(ROOT, pageFile(href))), `${href} → ${pageFile(href)} 없음`);
});

test("둘러보기: 근거 문구가 그 파일의 화면 글자(주석 빼고)에 그대로 있다, 4글자 이상", () => {
  const missing: string[] = [];
  for (const { file, phrases } of allEvidence) {
    assert.ok(existsSync(join(ROOT, file)), `근거 파일 없음: ${file}`);
    assert.ok(phrases.length > 0, `${file}: 근거 문구가 비었음`);
    for (const p of phrases) {
      assert.ok([...p].length >= 4, `${file}: "${p}"는 너무 짧아 어디에나 있을 수 있음`);
      if (!screen(file).includes(p)) missing.push(`${file}: "${p}"`);
    }
  }
  assert.deepEqual(missing, []);
});

test("둘러보기: 「화면 이름」은 근거 문구 안에 있다(단계는 그 단계 근거, 질문은 전체 근거)", () => {
  for (const s of STEPS) {
    const phrases = s.evidence.flatMap((e) => e.phrases);
    for (const name of s.actions.flatMap(uiNames)) assert.ok(phrases.some((p) => p.includes(name)), `${s.id}: 「${name}」의 근거가 없음`);
  }
  const all = allEvidence.flatMap((e) => e.phrases);
  for (const name of FAQ.flatMap((f) => uiNames(f.a))) assert.ok(all.some((p) => p.includes(name)), `질문: 「${name}」의 근거가 없음`);
});

/** 장면 그림 파일들의 화면 글자(태그 사이 글) */
const mockTexts = () => MOCK_FILES.flatMap((f) => [...screen(f).matchAll(/>([^<>{}]+)</g)].map((m) => m[1].trim())).filter((t) => /[\p{L}\p{N}]/u.test(t));

test("둘러보기: 장면 그림(mocks.tsx · scene-stage.tsx)의 글자는 실제 화면 글자이거나 자리 글자 목록에 있다", () => {
  const texts = mockTexts();
  assert.ok(texts.length > 40, `장면 그림 글자를 거의 못 찾음(${texts.length}) — 정규식 확인`);
  const real = MOCK_SOURCES.map(screen).join("\n");
  const odd = texts.filter((t) => !MOCK_PLACEHOLDERS.includes(t) && !real.includes(t));
  assert.deepEqual(odd, []);
});

test("둘러보기: 자리 글자 목록에 안 쓰는 글자가 남아 있지 않다(목록이 느슨해지지 않게)", () => {
  const used = new Set([...mockTexts(), ...Object.values(SCENES).flatMap((s) => s.beats.flatMap((b) => (b.type ? [b.type.text] : [])))]);
  assert.deepEqual(MOCK_PLACEHOLDERS.filter((p) => !used.has(p)), []);
});

test("둘러보기: 기준 문장 셋이 6단계를 순서대로 둘씩 나눠 갖는다(여정 레일)", () => {
  assert.deepEqual(MOTTO.flatMap((m) => m.steps), STEPS.map((s) => s.id));
  for (const m of MOTTO) assert.equal(m.steps.length, 2, `${m.verb}: 단계 ${m.steps.length}개`);
  assert.deepEqual(STEPS.map((s) => phaseOf(s.id)), [0, 0, 1, 1, 2, 2]);
});

test("둘러보기: 단계는 6개, id 겹침 없음, 순서 고정, 행동은 2~4개, 약속 4 · 질문 5~6", () => {
  assert.deepEqual(STEPS.map((s) => s.id), ["start", "protect", "choose", "judge", "compose", "export"]);
  assert.equal(new Set(STEPS.map((s) => s.id)).size, STEPS.length);
  for (const s of STEPS) assert.ok(s.actions.length >= 2 && s.actions.length <= 4, `${s.id}: 행동 ${s.actions.length}개`);
  assert.equal(PROMISES.length, 4);
  assert.ok(FAQ.length >= 5 && FAQ.length <= 6);
});

test("둘러보기: 등급 · 표시 색은 tokens.css 토큰, 등급은 spec 1절의 네 가지", () => {
  const css = screen("app/tokens.css");
  for (const g of [...GRADES, ...MARKS]) assert.ok(css.includes(`${g.token}: #`), `${g.name}: ${g.token} 없음`);
  const spec = raw("docs/spec.md");
  for (const g of GRADES) assert.ok(spec.includes(`| **${g.name}** |`), `spec 1절 표에 등급 "${g.name}" 줄이 없음`);
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
