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
  const shared = readFileSync(new URL("../../app/tokens.css", import.meta.url), "utf8");
  // 값이 공용 토큰(var(--ink) 등)이면 app/tokens.css에서 찾아 읽는다
  const token = (name: string): string => {
    const value = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6}|var\\(--[\\w-]+\\))`))![1];
    const ref = value.match(/^var\(--([\w-]+)\)$/);
    return ref ? shared.match(new RegExp(`--${ref[1]}:\\s*(#[0-9a-fA-F]{6})`))![1] : value;
  };
  const pairs: [string, string, string][] = [
    ["본문", token("color-text"), shared.match(/--surface:\s*(#[0-9a-fA-F]{6})/)![1]],
    ["흐린 글자", token("color-muted"), shared.match(/--surface:\s*(#[0-9a-fA-F]{6})/)![1]],
    ["흐린 글자(옅은 바탕)", token("color-muted"), token("color-surface-subtle")],
    ["위험 안내", token("color-danger"), token("color-danger-bg")],
    ["주의 안내", token("color-warning"), token("color-warning-bg")],
    ["성공 안내", token("color-success"), token("color-success-bg")],
    ["선택된 탭", token("color-on-primary"), token("color-primary")],
  ];
  const bad = pairs.filter(([, fg, bg]) => contrastRatio(fg, bg) < 4.5).map(([n, fg, bg]) => `${n} ${contrastRatio(fg, bg).toFixed(2)}`);
  assert.deepEqual(bad, []);
});

test("영역 C 화면의 글자색(style color)이 판 · 카드 · 오목한 바탕(--surface · --card · --sunken, P-12m 관측소)에서 4.5:1 이상", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const walk = (dir: string): string[] => readdirSync(join(root, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : rel.endsWith(".tsx") ? [rel] : [];
  });
  const files = ["app/admin", "app/projects/runs", "app/projects/install"].flatMap(walk);
  // 글자색은 공용 토큰(var(--ink-danger) 등)이면 app/tokens.css의 값으로 읽는다(P-12f ④: 화면에 색을 직접 적지 않음)
  const shared = readFileSync(join(root, "app/tokens.css"), "utf8");
  const hex = (v: string) => {
    if (v.startsWith("#")) return v;
    const m = shared.match(new RegExp(`--${v.slice(6, -1)}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(m, `${v}는 app/tokens.css에 없는 토큰이에요(화면 글자색은 공용 토큰으로)`);
    return m[1];
  };
  const colors = new Map<string, string>();
  for (const f of files) for (const m of readFileSync(join(root, f), "utf8").matchAll(/[^-]color:\s*"(#[0-9a-fA-F]{6}|var\(--[\w-]+\))"/g)) colors.set(hex(m[1]), f);
  assert.ok(colors.size >= 2, `${colors.size}가지`); // 읽는 식이 깨지지 않았는지만(토큰으로 모아 가짓수가 줄었다)
  const bad = [...colors].flatMap(([c, f]) => [hex("var(--surface)"), hex("var(--card)"), hex("var(--sunken)")].filter((bg) => contrastRatio(c, bg) < 4.5).map((bg) => `${f} ${c} on ${bg}`));
  assert.deepEqual(bad, []);
});

test("관측소 테마(P-12m): 바탕 · 판 · 카드 위 글자 4.5 이상, 등급색은 카드 위에서도 글자로 읽힘, 노션 칩 글자 4.5 이상, 레이더 선 3 이상", () => {
  const shared = readFileSync(new URL("../../app/tokens.css", import.meta.url), "utf8");
  const t = (name: string) => shared.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))![1];
  const grounds = ["paper", "paper-2", "panel", "surface", "card", "sunken"];
  const pairs: [string, string, string, number][] = [
    ...["on-paper", "on-paper-2", "ink", "ink-2", "muted", "ink-danger", "ink-caution", "ink-pass", "danger", "caution", "pass", "unknown"]
      .flatMap((fg) => grounds.map((bg): [string, string, string, number] => [`${fg} / ${bg}`, t(fg), t(bg), 4.5])),
    ...(["danger", "caution", "pass"] as const).map((k): [string, string, string, number] => [`ink-${k} / bg-${k}`, t(`ink-${k}`), t(`bg-${k}`), 4.5]),
    ...["blue", "purple", "green", "orange", "pink", "teal", "yellow", "red", "gray"].map((c): [string, string, string, number] => [`chip-${c}`, t(`chip-${c}-ink`), t(`chip-${c}`), 4.5]),
    ["밝은 칠 단추(--ink) 위 --on-ink", t("on-ink"), t("ink"), 4.5],
    ["청록 칠 위 바탕색 글자", t("paper"), t("scan"), 4.5],
    ["주 행동 단추(청록 채움) 글자 --on-ink", t("on-ink"), t("scan"), 4.5],
    ["판단 대기 배지(얼음 파랑) 글자 --on-ink", t("on-ink"), t("pending"), 4.5],
    ["판단 대기 글자 --pending(오목한 바탕, .badge-pending)", t("pending"), t("sunken"), 4.5],
    ["완료 글자 --done(오목한 바탕, .badge-done)", t("done"), t("sunken"), 4.5],
    ["고른 칩 글자(카드 바탕)", t("ink"), t("picked-bg"), 4.5],
    ["고른 칩 테두리(청록, 표시 3 이상)", t("picked-line"), t("picked-bg"), 3],
    ["완료 · 수집 오류 회색(판 위, 표시 3 이상)", t("done"), t("surface"), 3],
    ["개발 도구 종류색(바탕 위, 표시 3 이상)", t("cat-3"), t("paper"), 3],
    ["위험한 일 단추 글자 --ink-danger(판 · 빨강 바탕)", t("ink-danger"), t("bg-danger"), 4.5],
    ["위험한 일 단추 테두리 --danger(판 위, 표시 3 이상)", t("danger"), t("surface"), 3],
    ["레이더 선 · 파동(--scan)", t("scan"), t("paper"), 3],
  ];
  const bad = pairs.filter(([, fg, bg, min]) => contrastRatio(fg, bg) < min).map(([n, fg, bg]) => `${n} ${contrastRatio(fg, bg).toFixed(2)}`);
  assert.deepEqual(bad, []);
});
