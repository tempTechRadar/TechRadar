// PRD-NF5 접근성(영역 B 화면): c-screens-scan.test.ts가 영역 C 폴더만 훑어서, 영역 B 화면(알림·대시보드·기록·비교·추천·취향·사용기)은
// 어떤 접근성 시험에도 없었다. 같은 정적 점검을 B 폴더에도 건다. 화면을 띄우지 않으므로 실제 초점 이동·읽어 주기는 사람 확인으로 남는다.
// 누르는 칸 크기(44px)는 CSS·샘플 화면으로 재야 하는 값이라(11-22 측정: 사용기 신고 링크 38×20, 신고 사유 입력칸 높이 21, 관리자 접힘 글 23),
// 여기서는 그 측정에서 잡힌 요소들이 최소 높이 44px 규칙을 가졌는지만 본다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { formControlProblems, interactiveProblems } from "./scan.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const B_DIRS = ["app/alerts", "app/dashboard", "app/history", "app/compare", "app/recommend", "app/taste", "app/projects/tech", "app/admin/reports"];

function tsxFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(ROOT, rel)).isDirectory() ? tsxFiles(rel) : rel.endsWith(".tsx") ? [rel] : [];
  });
}
const FILES = B_DIRS.flatMap(tsxFiles).map((file) => ({ file, src: readFileSync(join(ROOT, file), "utf8") }));

test("점검 대상: 영역 B 화면 파일을 찾았다(사용기·추천·취향 포함)", () => {
  assert.ok(FILES.length >= 20, `${FILES.length}개`);
  for (const name of ["usage-notes.tsx", "usage-note-buttons.tsx", "taste-form.tsx", "draft-card.tsx"]) assert.ok(FILES.some((f) => f.file.endsWith(name)), name);
});

test("입력·고르기·글 칸은 모두 이름이 있다(label로 감싸기, htmlFor·id, aria-label 중 하나)", () => {
  assert.deepEqual(FILES.flatMap(({ file, src }) => formControlProblems(src).map((p) => `${file}: ${p}`)), []);
});

test("누르는 것은 button·a·form 안에서만, 이미지에 alt, 초점 테두리를 지우지 않는다", () => {
  assert.deepEqual(FILES.flatMap(({ file, src }) => interactiveProblems(src).map((p) => `${file}: ${p}`)), []);
});

// 펼치기(<summary>)와 사유 입력칸은 기본 모양이 작아서 크기 규칙을 직접 단다(영역 C 화면도 같은 방식: style={{ minHeight: 44 … }})
test("펼치기(summary)는 최소 높이 44px 규칙이 있다", () => {
  const bad = FILES.flatMap(({ file, src }) => [...src.matchAll(/<summary\b[^>]*>/g)].filter((m) => !/minHeight:\s*44/.test(m[0])).map(() => file));
  assert.deepEqual(bad, []);
});

test("신고 사유 입력칸(name=\"reason\")은 최소 높이 44px 규칙이 있다", () => {
  const bad = FILES.flatMap(({ file, src }) => [...src.matchAll(/<input\b[^>]*name="reason"[^>]*>/g)].filter((m) => !/minHeight:\s*44/.test(m[0])).map(() => file));
  assert.deepEqual(bad, []);
});
