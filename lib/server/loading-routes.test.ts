// loading.tsx(읽는 동안 뼈대)는 그 폴더 아래 모든 화면을 감싼다. 아래 화면 중 하나라도 redirect · notFound를 부르면
// 뼈대가 먼저 200으로 나가 404 · 이동이 200이 된다(page-skeleton.tsx 주석, P-12f ④ 리뷰). 그런 폴더는 화면 안에서 Suspense로 감싼다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const walk = (dir: string): string[] => readdirSync(join(root, dir)).flatMap((n) => {
  const rel = `${dir}/${n}`;
  return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
});

test("loading.tsx가 있는 폴더 아래 화면은 redirect · notFound를 부르지 않는다", () => {
  const files = walk("app");
  const loadings = files.filter((f) => f.endsWith("/loading.tsx"));
  assert.ok(loadings.length >= 2, `${loadings.length}개`);
  const bad = loadings.flatMap((l) => {
    const dir = l.slice(0, -"loading.tsx".length);
    return files.filter((f) => f.startsWith(dir) && f.endsWith("/page.tsx") && /\b(redirect|notFound)\(/.test(readFileSync(join(root, f), "utf8"))).map((f) => `${l} → ${f}`);
  });
  assert.deepEqual(bad, []);
});
