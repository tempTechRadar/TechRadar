import { test } from "node:test";
import assert from "node:assert/strict";
import { describeChange, downloadsUrl, packageOf, packagePageUrl, readNpmWeekly, readPypiWeekly } from "./downloads.ts";

test("packageOf: npm·pypi 키만 패키지로 읽고, pypi 이름은 PEP 503 모양(소문자·-)으로 맞춘다", () => {
  assert.deepEqual(packageOf("npm:zod"), { ecosystem: "npm", name: "zod" });
  assert.deepEqual(packageOf("npm:@modelcontextprotocol/sdk"), { ecosystem: "npm", name: "@modelcontextprotocol/sdk" });
  assert.deepEqual(packageOf("pypi:anthropic"), { ecosystem: "pypi", name: "anthropic" });
  assert.deepEqual(packageOf("pypi:Some_Pkg.X"), { ecosystem: "pypi", name: "some-pkg-x" });
});

test("packageOf: 다운로드 수가 없는 종류와 주소에 쓸 수 없는 이름은 null", () => {
  for (const key of ["mcp:io.github.x/y", "github:o/r", "skill:o/r/s", "url:example.com", "npm:", "npm:@scope", "npm:..", "npm:.", "npm:a b", "npm:a?x=1", "npm:a#b", "npm:../etc", "pypi:-x", "pypi:x/y", "pypi:"]) {
    assert.equal(packageOf(key), null, key);
  }
});

test("downloadsUrl: npm은 @와 /를 살리고 pypistats는 recent 주소", () => {
  assert.equal(downloadsUrl({ ecosystem: "npm", name: "zod" }), "https://api.npmjs.org/downloads/point/last-week/zod");
  assert.equal(downloadsUrl({ ecosystem: "npm", name: "@modelcontextprotocol/sdk" }), "https://api.npmjs.org/downloads/point/last-week/@modelcontextprotocol/sdk");
  assert.equal(downloadsUrl({ ecosystem: "pypi", name: "anthropic" }), "https://pypistats.org/api/packages/anthropic/recent");
});

test("downloadsUrl: 거짓 이름이 들어와도 주소 경로를 벗어나지 못한다(인코딩)", () => {
  assert.equal(downloadsUrl({ ecosystem: "npm", name: "a?b#c" }), "https://api.npmjs.org/downloads/point/last-week/a%3Fb%23c");
  assert.equal(downloadsUrl({ ecosystem: "pypi", name: "a/b" }), "https://pypistats.org/api/packages/a%2Fb/recent");
});

test("downloadsUrl: .·.. 조각은 주소가 다른 경로로 접히므로 던진다(packageOf를 거치지 않은 값도 막는다)", () => {
  for (const ref of [{ ecosystem: "pypi", name: ".." }, { ecosystem: "npm", name: ".." }, { ecosystem: "npm", name: "a/../b" }, { ecosystem: "npm", name: "./x" }] as const) {
    assert.throws(() => downloadsUrl(ref), RangeError, ref.name);
  }
});

test("readNpmWeekly: 실제 응답 모양은 숫자, 진짜 0도 0이다", () => {
  assert.equal(readNpmWeekly('{"downloads":90522817,"start":"2026-11-10","end":"2026-11-16","package":"@modelcontextprotocol/sdk"}'), 90522817);
  assert.equal(readNpmWeekly('{"downloads":0,"package":"x"}'), 0);
});

test("readNpmWeekly: 모양이 다르면 0이 아니라 null(불변 2) — 오류 본문·없음·음수·소수·문자·배열·깨진 글", () => {
  for (const text of ['{"error":"package x not found"}', "{}", '{"downloads":-1}', '{"downloads":1.5}', '{"downloads":"12"}', '{"downloads":null}', "[]", "12", "null", "<html>", ""]) {
    assert.equal(readNpmWeekly(text), null, text);
  }
});

test("readPypiWeekly: data.last_week를 읽고, 모양이 다르면 null", () => {
  assert.equal(readPypiWeekly('{"data":{"last_day":8543618,"last_month":208406138,"last_week":49905196},"package":"anthropic","type":"recent_downloads"}'), 49905196);
  for (const text of ['{"data":{"last_day":1}}', '{"data":null}', '{"last_week":5}', '{"data":{"last_week":"5"}}', '{"data":[]}', "[]", "", "<html>"]) {
    assert.equal(readPypiWeekly(text), null, text);
  }
});

test("describeChange: 처음 읽음·0에서 시작·늘고 줄어든 폭을 쉬운 글로(천 단위 쉼표, 1% 미만은 소수 한 자리)", () => {
  assert.equal(describeChange(null, 1234567), "처음 읽음: 주간 1,234,567회");
  assert.equal(describeChange(0, 800), "주간 0 → 800회");
  assert.equal(describeChange(1000, 1123), "주간 다운로드 +12.3%");
  assert.equal(describeChange(1000, 970), "주간 다운로드 -3%");
  assert.equal(describeChange(100000, 100400), "주간 다운로드 +0.4%");
  // 값은 달라졌는데 비율로는 0.0%면 "0%"로 쓰면 안 바뀐 것처럼 읽힌다: 값을 그대로 보인다
  assert.equal(describeChange(100000, 99999), "주간 100,000 → 99,999회");
  assert.equal(describeChange(1000000, 1000001), "주간 1,000,000 → 1,000,001회");
});

test("packagePageUrl: 비교표 사용량의 출처 — npm은 @와 /를 살린 소개 페이지, pypi는 소문자·- 모양의 프로젝트 페이지", () => {
  assert.equal(packagePageUrl("npm:mcp-proxy"), "https://www.npmjs.com/package/mcp-proxy");
  assert.equal(packagePageUrl("npm:@modelcontextprotocol/server-filesystem"), "https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem");
  assert.equal(packagePageUrl("pypi:Some_Pkg"), "https://pypi.org/project/some-pkg/");
});

test("packagePageUrl: 다운로드 수가 없는 종류와 주소에 쓸 수 없는 이름은 null (출처를 지어내지 않는다)", () => {
  for (const key of ["mcp:foo", "github:o/r", "skill:x", "npm:../etc", "npm:a b", "pypi:", "", "npm:"]) assert.equal(packagePageUrl(key), null, key);
});
