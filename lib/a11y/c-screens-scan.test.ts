// PRD-NF5 접근성(영역 C 화면): 소스를 훑어 키보드·이름·대체 텍스트 규칙을 지키는지 본다. 화면을 띄우지 않는 정적 점검이라
// 실제 초점 이동·읽어 주기는 사람(또는 Playwright) 확인 목록으로 남긴다(qa-c NF5 행).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { formControlProblems, interactiveProblems } from "./scan.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const C_DIRS = ["app/admin", "app/projects/runs", "app/projects/install"];

function tsxFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(ROOT, rel)).isDirectory() ? tsxFiles(rel) : rel.endsWith(".tsx") ? [rel] : [];
  });
}
const FILES = C_DIRS.flatMap(tsxFiles).map((f) => ({ file: f, src: readFileSync(join(ROOT, f), "utf8") }));

test("점검 대상: 영역 C 화면 파일을 찾았다", () => {
  assert.ok(FILES.length >= 15, `${FILES.length}개`);
  assert.ok(FILES.some((f) => f.file.endsWith("flow-diagram.tsx")));
});

test("입력·고르기·글 칸은 모두 이름이 있다(label로 감싸기, htmlFor·id, aria-label 중 하나)", () => {
  const problems = FILES.flatMap(({ file, src }) => formControlProblems(src).map((p) => `${relative(".", file)}: ${p}`));
  assert.deepEqual(problems, []);
});

test("누르는 것은 button·a·form 안에서만(div·span·li·g에 onClick 없음), 이미지에 alt, 링크를 품은 SVG는 role=img가 아님, 초점 테두리를 지우지 않음", () => {
  const problems = FILES.flatMap(({ file, src }) => interactiveProblems(src).map((p) => `${file}: ${p}`));
  const css = readFileSync(join(ROOT, "app/admin/admin.css"), "utf8");
  if (/outline\s*:\s*(none|0)\b/.test(css)) problems.push("admin.css: outline 없앰");
  assert.deepEqual(problems, []);
});
