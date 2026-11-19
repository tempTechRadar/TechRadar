// 서버 동작(actions.ts)에서 redirect를 try 안에서 부르면, redirect가 던지는 NEXT_REDIRECT를 아래 catch가 잡아
// 화면에 "error=NEXT_REDIRECT"가 뜨고 진짜 이유가 사라진다(2026-11-19 운영 /admin/simulator 적용 기회).
// 규칙: try 블록 안에서는 redirect()도, redirect를 부르는 도우미(back·go 등)도 부르지 않는다. 갈 곳은 변수에 담아 try 밖에서 redirect.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function files(dir: string, re: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? files(p, re) : re.test(e.name) ? [p] : [];
  });
}

/** 이 파일에서 redirect를 부르는 도우미 이름(직접 또는 다른 도우미를 거쳐). */
export function redirectHelpers(text: string): Set<string> {
  const names = new Set<string>(["redirect"]);
  const decls = [...text.matchAll(/(?:const|function)\s+(\w+)\s*(?:=|\()([\s\S]*?)(?=\n(?:const|function|export|async function|\/\*\*|\/\/)|$)/g)];
  let grew = true;
  while (grew) {
    grew = false;
    for (const [, name, body] of decls) {
      if (names.has(name)) continue;
      if ([...names].some((n) => new RegExp(`\\b${n}\\(`).test(body))) { names.add(name); grew = true; }
    }
  }
  return names;
}

/** try { … } 블록 본문들(catch 앞까지). 중괄호 짝을 센다. */
export function tryBodies(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\btry\s*\{/g)) {
    let depth = 1, i = m.index! + m[0].length;
    const start = i;
    while (i < text.length && depth > 0) { if (text[i] === "{") depth++; else if (text[i] === "}") depth--; i++; }
    out.push(text.slice(start, i - 1));
  }
  return out;
}

export function redirectsInTry(text: string): string[] {
  const helpers = redirectHelpers(text);
  return tryBodies(text).flatMap((body) => [...helpers].filter((h) => new RegExp(`\\b${h}\\(`).test(body)));
}

test("규칙 검사 함수: try 안의 back()·redirect()는 잡고, try 밖은 잡지 않는다", () => {
  const bad = `const back = (t: string) => redirect("/x?e=" + t);\nexport async function a() {\n  try {\n    if (x) return back("e");\n  } catch (e) {\n    return back("e");\n  }\n}\n`;
  assert.deepEqual(redirectsInTry(bad), ["back"]);
  const good = `const back = (t: string) => redirect("/x?e=" + t);\nexport async function a() {\n  let target: string;\n  try {\n    target = "/ok";\n  } catch (e) {\n    return back("e");\n  }\n  redirect(target);\n}\n`;
  assert.deepEqual(redirectsInTry(good), []);
});

test("모든 서버 동작(actions.ts)은 try 안에서 redirect나 redirect 도우미를 부르지 않는다", () => {
  const actionFiles = files("app", /actions\.ts$/).map((p) => ({ path: p.replaceAll("\\", "/"), text: readFileSync(p, "utf8") }));
  assert.ok(actionFiles.length >= 10, `서버 동작 파일이 ${actionFiles.length}개뿐`);
  const bad = actionFiles.flatMap(({ path, text }) => redirectsInTry(text).map((h) => `${path}: ${h}()`));
  assert.deepEqual(bad, []);
});
