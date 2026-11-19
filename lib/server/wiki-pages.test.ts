import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWikiPages } from "./wiki-pages.ts";

test("wiki/ 아래 .md만 읽고, 제목은 첫 '# ' 줄(없으면 파일 이름)", () => {
  const root = mkdtempSync(join(tmpdir(), "wiki-"));
  mkdirSync(join(root, "wiki", "sub"), { recursive: true });
  writeFileSync(join(root, "wiki", "정기-실행.md"), "# 정기 실행\n본문");
  writeFileSync(join(root, "wiki", "sub", "제목없음.md"), "본문만");
  writeFileSync(join(root, "wiki", "그림.png"), "x");
  const pages = readWikiPages(root);
  assert.deepEqual(pages.map((p) => [p.path, p.title]), [["wiki/sub/제목없음.md", "제목없음"], ["wiki/정기-실행.md", "정기 실행"]]);
});

test("wiki/ 폴더가 없으면 빈 목록(던지지 않음)", () => {
  assert.deepEqual(readWikiPages(mkdtempSync(join(tmpdir(), "nowiki-"))), []);
});
