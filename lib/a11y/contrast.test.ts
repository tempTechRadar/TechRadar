// PRD-NF5 "글자 대비": 영역 C 화면의 글자색·바탕색 짝이 WCAG AA(보통 글자 4.5:1)를 넘는지 계산한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { contrastRatio } from "./contrast.ts";
import { FLOW_INK, LOOK } from "../flow/look.ts";

test("대비 계산: 검정·흰색은 21, 같은 색은 1", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
  assert.equal(contrastRatio("#777777", "#777777"), 1);
});

test("흐름 그림: 상자 이름·상태 글자가 모든 상태 바탕에서 4.5:1 이상", () => {
  const bad: string[] = [];
  for (const [state, look] of Object.entries(LOOK)) {
    for (const [what, ink] of [["이름", FLOW_INK.name], ["상태", FLOW_INK.state]] as const) {
      const r = contrastRatio(ink, look.fill);
      if (r < 4.5) bad.push(`${state} ${what} ${r.toFixed(2)}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("흐름 그림: 화살표 건수 글자(흰 바탕)·배지(어두운 바탕 흰 글자)·그림 바탕의 상태 글자", () => {
  assert.ok(contrastRatio(FLOW_INK.name, "#ffffff") >= 4.5);
  assert.ok(contrastRatio("#ffffff", FLOW_INK.badgeBg) >= 4.5);
  assert.ok(contrastRatio(FLOW_INK.state, FLOW_INK.canvas) >= 4.5);
});

test("관리자 화면 토큰(admin.css): 본문·흐린 글자·위험·주의·성공 안내가 바탕에서 4.5:1 이상", () => {
  const css = readFileSync(new URL("../../app/admin/admin.css", import.meta.url), "utf8");
  const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))![1];
  const pairs: [string, string, string][] = [
    ["본문", token("color-text"), "#ffffff"],
    ["흐린 글자", token("color-muted"), "#ffffff"],
    ["흐린 글자(옅은 바탕)", token("color-muted"), token("color-surface-subtle")],
    ["위험 안내", token("color-danger"), token("color-danger-bg")],
    ["주의 안내", token("color-warning"), token("color-warning-bg")],
    ["성공 안내", token("color-success"), token("color-success-bg")],
    ["선택된 탭", token("color-on-primary"), token("color-primary")],
  ];
  const bad = pairs.filter(([, fg, bg]) => contrastRatio(fg, bg) < 4.5).map(([n, fg, bg]) => `${n} ${contrastRatio(fg, bg).toFixed(2)}`);
  assert.deepEqual(bad, []);
});

test("영역 C 화면의 글자색(style color)이 흰 바탕과 가장 옅은 회색 바탕(#f6f5f1)에서 4.5:1 이상", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const walk = (dir: string): string[] => readdirSync(join(root, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : rel.endsWith(".tsx") ? [rel] : [];
  });
  const files = ["app/admin", "app/projects/runs", "app/projects/install"].flatMap(walk);
  const colors = new Map<string, string>();
  for (const f of files) for (const m of readFileSync(join(root, f), "utf8").matchAll(/[^-]color:\s*"(#[0-9a-fA-F]{6})"/g)) colors.set(m[1], f);
  assert.ok(colors.size >= 3, `${colors.size}가지`);
  const bad = [...colors].flatMap(([c, f]) => ["#ffffff", "#f6f5f1"].filter((bg) => contrastRatio(c, bg) < 4.5).map((bg) => `${f} ${c} on ${bg}`));
  assert.deepEqual(bad, []);
});
