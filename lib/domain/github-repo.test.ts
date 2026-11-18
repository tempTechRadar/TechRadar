import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGithubRepo } from "./manifest.ts";

test("저장소 주소: 정상 모양은 owner/repo로 풀린다(.git·끝 슬래시·뒤 경로는 떼고 소문자 주소)", () => {
  assert.deepEqual(parseGithubRepo("https://github.com/Geelen/mcp-remote"), { owner: "Geelen", repo: "mcp-remote", url: "https://github.com/geelen/mcp-remote" });
  assert.equal(parseGithubRepo("https://github.com/o/r.git/")?.repo, "r");
  assert.equal(parseGithubRepo("https://github.com/o/r/tree/main/x")?.url, "https://github.com/o/r");
  assert.equal(parseGithubRepo("  https://github.com/o/r  ")?.owner, "o");
});

test("저장소 주소: 점만 있는 이름(..·.)은 주소 경로를 바꾸므로 거른다", () => {
  for (const bad of ["https://github.com/../x", "https://github.com/o/..", "https://github.com/./r", "https://github.com/o/.", "https://github.com/.../r"]) {
    assert.equal(parseGithubRepo(bad), null, bad);
  }
});

test("저장소 주소: 점이 들어 있어도 정상 이름은 통과한다(.github, a.b, ..x)", () => {
  assert.equal(parseGithubRepo("https://github.com/o/.github")?.repo, ".github");
  assert.equal(parseGithubRepo("https://github.com/o/a.b")?.repo, "a.b");
  assert.equal(parseGithubRepo("https://github.com/..x/y")?.owner, "..x"); // 점으로만 이루어지지 않았으니 경로를 바꾸지 않는다
});

test("저장소 주소: 다른 사이트·http·owner만 있는 주소는 모두 null", () => {
  for (const bad of ["https://gitlab.com/o/r", "http://github.com/o/r", "https://github.com/o", "https://github.com.evil.com/o/r", "github.com/o/r", ""]) {
    assert.equal(parseGithubRepo(bad), null, bad);
  }
});
