import { test } from "node:test";
import assert from "node:assert/strict";
import { afterFound, afterMissing, desiredStatus, readRepoInfo, repoApiUrl, repoKey, repoRefOf, type MissContext, type RepoInfo } from "./github-repo.ts";
import { parseGithubRepo } from "./manifest.ts";

const NOW = Date.parse("2026-11-18T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const body = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ full_name: "o/r", private: false, archived: false, pushed_at: "2026-11-01T00:00:00Z", stargazers_count: 12, license: { spdx_id: "MIT" }, ...over });
const info = (over: Partial<RepoInfo> = {}): RepoInfo => ({ fullName: "o/r", isPrivate: false, archived: false, pushedAt: ago(3), stars: 12, license: "MIT", ...over });

test("repoRefOf: github: 키가 있으면 그것, 없으면 repo_url(GitHub 주소)에서 소유자/저장소를 읽는다", () => {
  assert.deepEqual(repoRefOf({ tech_key: "github:acme/tool", repo_url: null }), { owner: "acme", repo: "tool" });
  assert.deepEqual(repoRefOf({ tech_key: "github:acme/tool", repo_url: "https://github.com/other/x" }), { owner: "acme", repo: "tool" }); // 키가 먼저
  assert.deepEqual(repoRefOf({ tech_key: "npm:@acme/tool", repo_url: "https://github.com/acme/tool.git" }), { owner: "acme", repo: "tool" });
  assert.deepEqual(repoRefOf({ tech_key: "mcp:io.x/y", repo_url: "https://github.com/Acme/Tool/tree/main/pkg" }), { owner: "Acme", repo: "Tool" });
});

test("repoRefOf: GitHub 저장소가 아니거나 주소에 쓸 수 없는 이름이면 null — 입력 경계에서 거른다(`..`·`.`·https 아님·다른 호스트)", () => {
  for (const repo_url of [null, "", "https://gitlab.com/o/r", "http://github.com/o/r", "https://github.com/o", "https://github.com/../r", "https://github.com/o/..", "https://github.com/./r"]) {
    assert.equal(repoRefOf({ tech_key: "npm:x", repo_url }), null, String(repo_url));
  }
  for (const tech_key of ["github:o", "github:o/..", "github:../r", "github:o/r/extra", "github:o r/x"]) assert.equal(repoRefOf({ tech_key, repo_url: null }), null, tech_key);
});

test("repoRefOf: skill:<소유자>/<저장소>/<이름> 키는 앞의 두 칸이 읽은 저장소(tech-key.ts). repo_url이 없어도 읽는다", () => {
  assert.deepEqual(repoRefOf({ tech_key: "skill:temptechradar/techradar/abbs-log", repo_url: null }), { owner: "temptechradar", repo: "techradar" });
  assert.deepEqual(repoRefOf({ tech_key: "skill:o/r/a/b", repo_url: null }), { owner: "o", repo: "r" }); // 이름에 /가 있어도 저장소는 앞 두 칸
  for (const tech_key of ["skill:o/r", "skill:o/r/", "skill:../r/s", "skill:o/../s", "skill:o r/x/s"]) assert.equal(repoRefOf({ tech_key, repo_url: null }), null, tech_key);
});

test("repoRefOf: github: 키 끝의 .git은 주소 쪽과 같게 뗀다(같은 저장소의 두 표기가 갈라지지 않게). repoKey는 대소문자를 합친다", () => {
  assert.deepEqual(repoRefOf({ tech_key: "github:o/r.git", repo_url: null }), { owner: "o", repo: "r" });
  assert.deepEqual(repoRefOf({ tech_key: "github:o/r.git", repo_url: null }), repoRefOf({ tech_key: "npm:x", repo_url: "https://github.com/o/r.git" }));
  assert.deepEqual(repoRefOf({ tech_key: "github:o/my.git.js", repo_url: null }), { owner: "o", repo: "my.git.js" }); // 이름 중간의 .git은 그대로
  assert.equal(repoKey({ owner: "Acme", repo: "Mono" }), "acme/mono");
});

test("repoApiUrl: 소유자·저장소를 인코딩한 저장소 정보 주소", () => {
  assert.equal(repoApiUrl({ owner: "acme", repo: "tool.js" }), "https://api.github.com/repos/acme/tool.js");
});

test("readRepoInfo: 이름·공개 여부·보관·마지막 푸시·별·라이선스를 읽는다", () => {
  assert.deepEqual(readRepoInfo(body()), { fullName: "o/r", isPrivate: false, archived: false, pushedAt: "2026-11-01T00:00:00Z", stars: 12, license: "MIT" });
});

test("readRepoInfo: 라이선스 — 없으면 none, 파일은 있는데 못 알아보면 other, 알아보면 그 이름(SPDX)", () => {
  assert.equal(readRepoInfo(body({ license: null }))!.license, "none");
  assert.equal(readRepoInfo(body({ license: { spdx_id: "NOASSERTION" } }))!.license, "other");
  assert.equal(readRepoInfo(body({ license: { spdx_id: null, name: "Other" } }))!.license, "other");
  assert.equal(readRepoInfo(body({ license: { spdx_id: "Apache-2.0" } }))!.license, "Apache-2.0");
});

test("readRepoInfo: 푸시가 한 번도 없는 빈 저장소(pushed_at null)는 null 그대로", () => {
  assert.equal(readRepoInfo(body({ pushed_at: null }))!.pushedAt, null);
});

test("readRepoInfo: 모양이 다르면 null(0으로 읽지 않음, 불변 2) — 깨진 글·배열·필드 빠짐·자료형 다름·날짜 아님·음수 별", () => {
  for (const text of ["", "<html>", "[]", "null", "{}"]) assert.equal(readRepoInfo(text), null, text);
  for (const over of [{ full_name: 3 }, { private: "no" }, { archived: undefined }, { stargazers_count: "12" }, { stargazers_count: -1 }, { stargazers_count: 1.5 }, { pushed_at: "어제" }, { pushed_at: 5 }, { license: "MIT" }, { license: { spdx_id: 7 } }]) {
    assert.equal(readRepoInfo(body(over)), null, JSON.stringify(over));
  }
});

test("desiredStatus: 보관은 중단(deprecated), 365일 넘게 푸시가 없으면 쉬는 중(dormant), 아니면 활동 중. 푸시가 없는 빈 저장소는 쉬는 중으로 단정하지 않는다", () => {
  assert.equal(desiredStatus(info({ archived: true }), NOW), "deprecated");
  assert.equal(desiredStatus(info({ archived: true, pushedAt: ago(900) }), NOW), "deprecated"); // 보관이 먼저
  assert.equal(desiredStatus(info({ pushedAt: ago(366) }), NOW), "dormant");
  assert.equal(desiredStatus(info({ pushedAt: ago(365) }), NOW), "active"); // 정확히 365일은 아직
  assert.equal(desiredStatus(info({ pushedAt: ago(1) }), NOW), "active");
  assert.equal(desiredStatus(info({ pushedAt: null }), NOW), "active");
});

const cur = (status: string, statusBy: string | null = null, missed = 0) => ({ status, statusBy, missed });

test("afterFound: 활동 중인 기술은 읽은 값에 맞춰 더 나쁜 상태로 올리고 우리가 정했다고 적는다(`github:<상태>`). 같으면 그대로, 못 찾은 횟수는 0으로", () => {
  assert.deepEqual(afterFound(cur("active"), "dormant"), { status: "dormant", statusBy: "github:dormant", missed: 0 });
  assert.deepEqual(afterFound(cur("active"), "deprecated"), { status: "deprecated", statusBy: "github:deprecated", missed: 0 });
  assert.deepEqual(afterFound(cur("dormant", "github:dormant"), "deprecated"), { status: "deprecated", statusBy: "github:deprecated", missed: 0 });
  assert.deepEqual(afterFound(cur("active", null, 1), "active"), { status: "active", statusBy: null, missed: 0 });
  assert.deepEqual(afterFound(cur("active", "github:dormant"), "dormant"), { status: "dormant", statusBy: "github:dormant", missed: 0 }); // 되돌려진 채 남은 옛 표시는 무시
});

test("afterFound: 되돌리는 것은 우리가 정한 상태만 — github가 정한 쉬는 중·중단·사라짐은 되돌리거나 낮추고, 활동 중으로 돌아가면 정한 출처를 비운다", () => {
  assert.deepEqual(afterFound(cur("dormant", "github:dormant"), "active"), { status: "active", statusBy: null, missed: 0 });
  assert.deepEqual(afterFound(cur("gone", "github:gone", 2), "active"), { status: "active", statusBy: null, missed: 0 });
  assert.deepEqual(afterFound(cur("deprecated", "github:deprecated"), "dormant"), { status: "dormant", statusBy: "github:dormant", missed: 0 });
});

test("afterFound: 다른 쪽이 status만 active로 고쳐 낡은 정한 출처가 남은 활동 중 줄은 표시를 비운다 — 남겨 두면 나중에 다른 쪽이 같은 상태를 정했을 때 우리가 정한 것으로 읽힌다", () => {
  assert.deepEqual(afterFound(cur("active", "github:dormant", 2), "active"), { status: "active", statusBy: null, missed: 0 });
  assert.deepEqual(afterFound(cur("active", "mcp_registry:deprecated"), "active"), { status: "active", statusBy: null, missed: 0 });
  // 낡은 표시를 비운 뒤에는 다른 쪽이 같은 상태(dormant)를 정해도 우리가 정한 것으로 안 읽혀 되돌려지지 않는다
  const cleared = afterFound(cur("active", "github:dormant"), "active");
  assert.deepEqual(afterFound({ ...cleared, status: "dormant" }, "active"), { status: "dormant", statusBy: null, missed: 0 });
});

test("afterFound: 우리가 정한 게 아닌 중단·쉬는 중·사라짐은 올리지도 되돌리지도 않는다 — 레지스트리·관리자·모르는 출처(표시 없음)가 정한 값이 사라지지 않게(ADR 0021)", () => {
  const foreign: [string, string | null][] = [["deprecated", null], ["gone", null], ["dormant", null], ["deprecated", "mcp_registry:deprecated"], ["gone", "mcp_registry:gone"], ["deprecated", "github:dormant"]]; // 마지막: 우리가 쓴 뒤 다른 쪽이 status만 고침
  for (const [status, by] of foreign) {
    for (const desired of ["active", "dormant", "deprecated"] as const) assert.deepEqual(afterFound(cur(status, by, 1), desired), { status, statusBy: by, missed: 0 }, `${status}/${by}/${desired}`);
  }
});

const ctx = (over: Partial<MissContext> = {}): MissContext => ({ everFound: true, firstMissAt: NOW - 13 * 60 * 60 * 1000, nowMs: NOW, ...over });

test("afterMissing: 첫 번째 404는 못 찾은 횟수만 올리고 상태는 그대로. 찾은 적 있고 두 번 연속이며 첫 못 찾음에서 12시간이 지났으면 출처에서 사라짐(github:gone)", () => {
  assert.deepEqual(afterMissing(cur("active"), ctx({ firstMissAt: null })), { status: "active", statusBy: null, missed: 1 });
  assert.deepEqual(afterMissing(cur("active"), ctx()), { status: "active", statusBy: null, missed: 1 }); // 두 번째가 아니면 다른 조건이 다 맞아도 사라짐이 아니다
  assert.deepEqual(afterMissing(cur("active", null, 1), ctx()), { status: "gone", statusBy: "github:gone", missed: 2 });
  assert.deepEqual(afterMissing(cur("dormant", "github:dormant", 1), ctx()), { status: "gone", statusBy: "github:gone", missed: 2 });
});

test("afterMissing: 사라짐으로 단정하지 않는 경우 — 12시간이 안 지남(지금 한 번 실행을 두 번 누름), 한 번도 찾은 적 없는 주소(잘못 적은 repo_url), 첫 못 찾음 시각을 모름", () => {
  assert.deepEqual(afterMissing(cur("active", null, 1), ctx({ firstMissAt: NOW - 11 * 60 * 60 * 1000 })), { status: "active", statusBy: null, missed: 2 });
  assert.deepEqual(afterMissing(cur("active", null, 5), ctx({ everFound: false })), { status: "active", statusBy: null, missed: 6 });
  assert.deepEqual(afterMissing(cur("active", null, 1), ctx({ firstMissAt: null })), { status: "active", statusBy: null, missed: 2 });
});

test("afterMissing: 우리가 정한 게 아닌 중단·사라짐은 덮지 않고 횟수만 올린다. 이미 gone이면 정한 출처도 그대로", () => {
  assert.deepEqual(afterMissing(cur("deprecated", null, 1), ctx()), { status: "deprecated", statusBy: null, missed: 2 });
  assert.deepEqual(afterMissing(cur("deprecated", "mcp_registry:deprecated", 1), ctx()), { status: "deprecated", statusBy: "mcp_registry:deprecated", missed: 2 });
  assert.deepEqual(afterMissing(cur("gone", "mcp_registry:gone", 1), ctx()), { status: "gone", statusBy: "mcp_registry:gone", missed: 2 });
  assert.deepEqual(afterMissing(cur("gone", "github:gone", 2), ctx()), { status: "gone", statusBy: "github:gone", missed: 3 });
});

test("repoApiUrl: 점 조각 이름은 주소로 만들지 않는다(같은 호스트의 다른 경로로 접힘)", () => {
  for (const ref of [{ owner: "..", repo: "rate_limit" }, { owner: "o", repo: ".." }, { owner: ".", repo: "r" }]) assert.throws(() => repoApiUrl(ref), RangeError, JSON.stringify(ref));
});

test("parseGithubRepo: 점 조각 이름의 주소는 입력 경계에서 거른다(https://github.com/../rate_limit)", () => {
  for (const url of ["https://github.com/../rate_limit", "https://github.com/o/..", "https://github.com/./r"]) assert.equal(parseGithubRepo(url), null, url);
  assert.deepEqual(parseGithubRepo("https://github.com/o/r.git"), { owner: "o", repo: "r", url: "https://github.com/o/r" });
});

test("readRepoInfo: 마지막 푸시는 ISO 시각 글만(DB가 받아 주지 않는 `2026` 같은 글은 모양이 다른 것으로 본다)", () => {
  for (const pushed_at of ["2026", "2026-11-01", "11/01/2026", "Tue, 3 Nov 2026"]) assert.equal(readRepoInfo(body({ pushed_at })), null, pushed_at);
  assert.equal(readRepoInfo(body({ pushed_at: "2026-11-01T00:00:00+09:00" }))!.pushedAt, "2026-11-01T00:00:00+09:00");
});
