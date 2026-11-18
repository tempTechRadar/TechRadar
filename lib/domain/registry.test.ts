import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { draftOf, isOfficialOrg, onlyLatest, patchFor, readRegistryPage, registryLink, rowFor, techFromEntry, type ExistingTech, type RegistryEntry } from "./registry.ts";

const entry = (over: Partial<RegistryEntry> = {}): RegistryEntry => ({
  name: "io.github.someone/tool", title: null, description: null, packages: [], repoUrl: null, status: "active", isLatest: true, ...over,
});
const META = (status: string, isLatest = true) => ({ "io.modelcontextprotocol.registry/official": { status, updatedAt: "2026-11-17T00:00:00Z", isLatest } });
const page = (servers: unknown[], nextCursor?: unknown) => JSON.stringify({ servers, metadata: { nextCursor, count: servers.length } });

test("readRegistryPage: 저장소에 있는 실제 레지스트리 샘플(100건)을 그대로 읽는다 — 상태 분포와 다음 쪽 커서", () => {
  const p = readRegistryPage(readFileSync("watch/samples/mcp-registry-updated-since-prev_2026-11-17T0052Z.json", "utf8"))!;
  assert.equal(p.entries.length, 100);
  assert.equal(p.invalid, 0);
  assert.equal(p.nextCursor, "app.misento/imessage:1.0.1");
  const by = (s: string) => p.entries.filter((e) => e.status === s).length;
  assert.deepEqual([by("active"), by("deprecated"), by("deleted")], [85, 7, 8]);
  const kinds = p.entries.map((e) => e.packages[0]?.registryType ?? "remote");
  assert.deepEqual([kinds.filter((k) => k === "npm").length, kinds.filter((k) => k === "pypi").length], [8, 8]);
  assert.ok(p.entries.every((e) => e.name.length > 0));
});

test("readRegistryPage: 서버 이름·제목·설명·패키지·저장소·상태·최신 여부를 읽는다. 마지막 쪽은 커서가 없다", () => {
  const text = page([
    { server: { name: "a/b", title: "T", description: "D", version: "2.0.0", packages: [{ registryType: "npm", identifier: "@a/b" }, { registryType: 3 }, null], repository: { url: "https://github.com/a/b" }, websiteUrl: "https://a.example" }, _meta: META("deprecated", false) },
  ]);
  const p = readRegistryPage(text)!;
  assert.deepEqual(p.entries[0], { name: "a/b", title: "T", description: "D", packages: [{ registryType: "npm", identifier: "@a/b" }], repoUrl: "https://github.com/a/b", status: "deprecated", isLatest: false });
  assert.equal(p.nextCursor, null);
});

test("readRegistryPage: isLatest가 없거나 참·거짓이 아니면 \"최신 아님\"이 아니라 못 읽은 항목으로 센다 — 필드 모양이 바뀌어도 서버가 조용히 0개가 되지 않는다(불변 2)", () => {
  const meta = (isLatest: unknown) => ({ "io.modelcontextprotocol.registry/official": { status: "active", ...(isLatest === undefined ? {} : { isLatest }) } });
  const p = readRegistryPage(page([{ server: { name: "a/1" }, _meta: meta(undefined) }, { server: { name: "a/2" }, _meta: meta("true") }, { server: { name: "a/3" }, _meta: meta(true) }]))!;
  assert.deepEqual([p.entries.map((e) => e.name), p.invalid], [["a/3"], 2]);
});

test("readRegistryPage: 응답 모양이 다르면 null(0건으로 읽지 않음, 불변 2) — 깨진 글·배열·servers 없음·servers가 배열이 아님", () => {
  for (const text of ["", "<html>", "[]", "null", "{}", '{"servers":"x"}', '{"servers":{}}']) assert.equal(readRegistryPage(text), null, text);
});

test("readRegistryPage: 모양이 이상한 항목은 건너뛰고 세어 둔다(이름 없음·_meta 없음·모르는 상태). 나머지는 읽는다", () => {
  const good = { server: { name: "ok/x" }, _meta: META("active") };
  const p = readRegistryPage(page([good, { server: {} , _meta: META("active") }, { server: { name: "n/_meta없음" } }, { server: { name: "n/상태모름" }, _meta: META("weird") }, null, 3]))!;
  assert.deepEqual([p.entries.map((e) => e.name), p.invalid], [["ok/x"], 5]);
});

test("onlyLatest: isLatest인 항목만(서버마다 모든 버전이 나온다). 같은 이름이 둘이면 먼저 나온 것", () => {
  const list = [entry({ name: "a", description: "1", isLatest: false }), entry({ name: "a", description: "2", isLatest: true }), entry({ name: "a", description: "3", isLatest: true }), entry({ name: "b", isLatest: false })];
  assert.deepEqual(onlyLatest(list).map((e) => [e.name, e.description]), [["a", "2"]]);
});

test("techFromEntry: 패키지가 npm이면 npm: 키(소문자), PyPI면 pypi: 키(PEP 503 이름) — 사용자 저장소가 만드는 키와 같아 한 줄로 합쳐진다(ADR 0019)", () => {
  assert.equal(techFromEntry(entry({ packages: [{ registryType: "npm", identifier: "@Modelcontextprotocol/Server-Filesystem" }] })).techKey, "npm:@modelcontextprotocol/server-filesystem");
  assert.equal(techFromEntry(entry({ packages: [{ registryType: "pypi", identifier: "Some_Pkg.X" }] })).techKey, "pypi:some-pkg-x");
  assert.equal(techFromEntry(entry({ packages: [{ registryType: "pypi", identifier: "p" }, { registryType: "npm", identifier: "n" }] })).techKey, "npm:n"); // npm을 먼저
});

test("techFromEntry: 패키지가 없거나(원격 주소만) npm·PyPI가 아니면(mcpb·nuget·oci) mcp:<레지스트리 이름>. 이름은 소문자", () => {
  assert.equal(techFromEntry(entry({ name: "AI.Zerowidth/Remote" })).techKey, "mcp:ai.zerowidth/remote");
  assert.equal(techFromEntry(entry({ packages: [{ registryType: "mcpb", identifier: "https://x/y.mcpb" }, { registryType: "oci", identifier: "ghcr.io/x" }] })).techKey, "mcp:io.github.someone/tool");
  assert.equal(techFromEntry(entry({ packages: [{ registryType: "npm", identifier: "has space" }] })).techKey, "mcp:io.github.someone/tool"); // 키로 쓸 수 없는 이름
});

test("techFromEntry: 보이는 이름은 제목이 있으면 제목, 없으면 레지스트리 이름. 상태는 deleted가 gone", () => {
  assert.equal(techFromEntry(entry({ title: "My Tool" })).displayName, "My Tool");
  assert.equal(techFromEntry(entry()).displayName, "io.github.someone/tool");
  assert.deepEqual(["active", "deprecated", "deleted"].map((s) => techFromEntry(entry({ status: s as RegistryEntry["status"] })).status), ["active", "deprecated", "gone"]);
});

test("techFromEntry: 보이는 이름은 게시자가 적는 글이라 공백을 정리하고 100자에서 자른다(길게 늘어놓은 문장이 화면·AI 입력에 그대로 들어가지 않게)", () => {
  assert.equal(techFromEntry(entry({ title: "  My \n Tool  " })).displayName, "My Tool");
  const cut = techFromEntry(entry({ title: "가".repeat(300) })).displayName;
  assert.deepEqual([cut.length, cut.endsWith("…")], [100, true]);
});

test("techFromEntry: 저장소 주소는 https만 저장한다(javascript:·http:·깨진 주소·비어 있음은 null)", () => {
  for (const url of ["javascript:alert(1)", "http://github.com/o/r", "not a url", "ftp://x/y", "//github.com/o/r"]) assert.equal(techFromEntry(entry({ repoUrl: url })).repoUrl, null, url);
  assert.equal(techFromEntry(entry({ repoUrl: "https://gitlab.com/o/r" })).repoUrl, "https://gitlab.com/o/r"); // GitHub가 아니어도 https면 저장
  assert.equal(techFromEntry(entry({ repoUrl: null })).repoUrl, null);
});

test("techFromEntry: 한 줄 설명은 공백을 정리하고 200자에서 자른다. 비면 null. 저장소 주소는 그대로", () => {
  assert.equal(techFromEntry(entry({ description: "  a\n  b\t c  " })).oneLiner, "a b c");
  const long = "가".repeat(300);
  const cut = techFromEntry(entry({ description: long })).oneLiner!;
  assert.deepEqual([cut.length, cut.endsWith("…")], [200, true]);
  assert.equal(techFromEntry(entry({ description: "   " })).oneLiner, null);
  assert.equal(techFromEntry(entry({ repoUrl: "https://github.com/o/r" })).repoUrl, "https://github.com/o/r");
});

test("isOfficialOrg: 레지스트리가 검증하는 이름공간 전체만 증거다 — io.github.<소유자> 또는 <tld>.<조직>이 목록(이름공간 전체)과 맞으면 공식(대소문자 무시). 목록이 비면 아니다", () => {
  const orgs = ["io.github.modelcontextprotocol", "io.github.openai", "com.openai"];
  assert.equal(isOfficialOrg(entry({ name: "io.github.openai/codex" }), orgs), true);
  assert.equal(isOfficialOrg(entry({ name: "IO.GitHub.ModelContextProtocol/servers" }), orgs), true);
  assert.equal(isOfficialOrg(entry({ name: "com.openai/tools" }), orgs), true);
  assert.equal(isOfficialOrg(entry({ name: "io.github.someone/tool" }), orgs), false);
  assert.equal(isOfficialOrg(entry({ name: "io.github.openai/codex" }), []), false);
});

test("isOfficialOrg: 최상위 도메인이 달라도 조직 낱말만 같은 이름은 공식이 아니다(dev.openai·net.modelcontextprotocol) — 낱말이 아니라 이름공간 전체를 맞춘다", () => {
  const orgs = ["io.github.modelcontextprotocol", "com.openai"];
  for (const name of ["dev.openai/x", "ai.openai/x", "net.modelcontextprotocol/x", "io.openai/x", "com.modelcontextprotocol/x"]) assert.equal(isOfficialOrg(entry({ name }), orgs), false, name);
  assert.equal(isOfficialOrg(entry({ name: "io.github.openai/x" }), orgs), false); // GitHub 소유자 이름과 도메인 이름은 목록에 따로 적는다
});

test("isOfficialOrg: 속일 수 있는 것은 증거가 아니다 — 게시자가 적는 저장소 주소, 이름공간의 다른 자리나 더 긴 이름, 서버 이름(/ 뒤쪽)", () => {
  const orgs = ["io.github.modelcontextprotocol", "io.github.openai", "com.openai"];
  // 게시자가 적는 저장소 주소는 레지스트리가 이름공간과 맞는지 검증하지 않는다: 남의 조직 저장소를 적어도 공식이 아니다
  assert.equal(isOfficialOrg(entry({ name: "io.github.attacker/x", repoUrl: "https://github.com/openai/codex" }), orgs), false);
  assert.equal(isOfficialOrg(entry({ name: "io.github.attacker/x", repoUrl: "https://github.com/ModelContextProtocol/servers" }), orgs), false);
  // 이름공간의 고정된 자리만 본다: 내가 가진 도메인의 하위 이름(com.example.openai)이나 더 긴 이름은 아니다
  for (const name of ["com.example.openai/x", "com.openai.evil/x", "io.github.someone.openai/x", "io.github.openai.evil/x", "openai.example/x", "ai.exceedloop/openai", "ai.exceedloop/openai-helper", "io.github.attacker/openai", "evil.com.openai/x", "x.io.github.openai/y"]) {
    assert.equal(isOfficialOrg(entry({ name }), orgs), false, name);
  }
});

test("registryLink: 설명의 출처 링크(레지스트리 검색 주소). 이름의 특수문자는 인코딩한다", () => {
  assert.equal(registryLink("io.github.a/b c"), "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.a%2Fb%20c");
});

// ───────── 기존 줄과 합치기(draftOf·rowFor·patchFor)
const draft = (over: Partial<RegistryEntry> = {}, orgs: string[] = []) => draftOf(entry(over), orgs);
const ex = (over: Partial<ExistingTech> = {}): ExistingTech => ({ depth: "thin", status: "active", thick_reasons: null, one_liner: null, one_liner_source: null, repo_url: null, is_official: false, ...over });

test("rowFor: 새 줄은 얇게(type mcp, 설명이 있으면 출처 링크와 함께). 공식 조직이면 두껍게(official)", () => {
  assert.deepEqual(rowFor(draft({ title: "T", description: "설명", repoUrl: "https://github.com/a/b" })), {
    tech_key: "mcp:io.github.someone/tool", display_name: "T", type: "mcp", depth: "thin", thick_reasons: null, status: "active",
    one_liner: "설명", one_liner_source: "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.someone%2Ftool", repo_url: "https://github.com/a/b", is_official: false,
  });
  const official = rowFor(draft({ name: "io.github.openai/codex" }, ["io.github.openai"]));
  assert.deepEqual([official.depth, official.thick_reasons, official.is_official, official.one_liner_source], ["thick", ["official"], true, null]); // 설명이 없으면 출처 링크도 없다
});

test("patchFor: 그대로면 빈 값(고칠 것 없음) — 같은 걸 다시 읽어도 쓰지 않는다", () => {
  const d = draft({ description: "설명", repoUrl: "https://github.com/a/b" });
  assert.deepEqual(patchFor(ex({ one_liner: "설명", one_liner_source: "x", repo_url: "https://github.com/a/b" }), d), {});
});

test("patchFor: 비어 있는 설명·출처 링크·저장소 주소만 채운다. 이미 있는 값(사용자 저장소가 만든 줄 등)은 덮어쓰지 않는다", () => {
  const d = draft({ description: "새 설명", repoUrl: "https://github.com/new/r" });
  assert.deepEqual(patchFor(ex(), d), { one_liner: "새 설명", one_liner_source: "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.someone%2Ftool", repo_url: "https://github.com/new/r" });
  assert.deepEqual(patchFor(ex({ one_liner: "원래", one_liner_source: "원래 링크", repo_url: "https://github.com/old/r" }), d), {});
});

test("patchFor: 이 서버가 직접 적은 설명(출처 링크가 같음)은 바뀐 값으로 새로 고친다. 다른 출처가 채운 설명·사용자 값은 덮지 않는다", () => {
  const d = draft({ description: "바뀐 설명" });
  const mine = d.source;
  assert.deepEqual(patchFor(ex({ one_liner: "옛 설명", one_liner_source: mine }), d), { one_liner: "바뀐 설명", one_liner_source: mine });
  assert.deepEqual(patchFor(ex({ one_liner: "바뀐 설명", one_liner_source: mine }), d), {}); // 같으면 쓰지 않는다
  assert.deepEqual(patchFor(ex({ one_liner: "옛 설명", one_liner_source: "https://github.com/x/y" }), d), {}); // 다른 출처
  assert.deepEqual(patchFor(ex({ one_liner: "옛 설명", one_liner_source: null }), d), {}); // 출처 없는 값(사람이 쓴 것)
  assert.deepEqual(patchFor(ex({ one_liner: "옛 설명", one_liner_source: mine }), draft({ description: null })), {}); // 설명이 사라져도 지우지 않는다
});

test("patchFor: 상태는 레지스트리가 정한 것만 바꾼다 — 중단·삭제는 늘 반영, active는 중단·사라짐을 되돌릴 때만(다른 출처가 정한 dormant는 안 건드림)", () => {
  assert.deepEqual(patchFor(ex({ status: "active" }), draft({ status: "deprecated" })), { status: "deprecated" });
  assert.deepEqual(patchFor(ex({ status: "dormant" }), draft({ status: "deleted" })), { status: "gone" });
  assert.deepEqual(patchFor(ex({ status: "gone" }), draft({ status: "active" })), { status: "active" });
  assert.deepEqual(patchFor(ex({ status: "deprecated" }), draft({ status: "active" })), { status: "active" });
  assert.deepEqual(patchFor(ex({ status: "dormant" }), draft({ status: "active" })), {});
});

test("patchFor: 공식 조직이면 두껍게 올린다(이미 두꺼우면 이유에 official만 더함, 이유가 이미 있으면 그대로). 공식이 아니면 두께를 건드리지 않는다", () => {
  const official = (e: Partial<ExistingTech>) => patchFor(ex(e), draft({ name: "io.github.openai/codex" }, ["io.github.openai"]));
  assert.deepEqual(official({ depth: "thin" }), { depth: "thick", thick_reasons: ["official"], is_official: true });
  assert.deepEqual(official({ depth: "thick", thick_reasons: ["used"] }), { thick_reasons: ["used", "official"], is_official: true });
  assert.deepEqual(official({ depth: "thick", thick_reasons: ["official"], is_official: true }), {});
  assert.deepEqual(patchFor(ex({ depth: "thick", thick_reasons: ["used"] }), draft()), {}); // 사용자가 쓰는 두꺼운 줄은 그대로
});
