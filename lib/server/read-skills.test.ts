import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readSkills } from "./read-skills.ts";

const REPO = { owner: "o", repo: "r" };
const dirs = (...names: string[]) => JSON.stringify(names.map((name) => ({ type: "dir", name })));
const LIST_URL = "https://api.github.com/repos/o/r/contents/.claude/skills";

/** 요청 주소를 모으고, 주소마다 응답(또는 연결 오류)을 돌려주는 가짜 fetch */
function stub(t: TestContext, answer: (url: string) => Response | Error) {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    urls.push(url);
    const r = answer(url);
    if (r instanceof Error) throw r;
    return r;
  });
  return urls;
}
const ok = (body: string) => new Response(body, { status: 200 });

test("폴더 목록이 404면 스킬이 없을 뿐: 오류 없음, 요청은 목록 1번", async (t) => {
  const urls = stub(t, () => new Response("", { status: 404 }));
  assert.deepEqual(await readSkills(REPO), { found: [], errors: [], folders: 0 });
  assert.deepEqual(urls, [LIST_URL]);
});

test("목록의 모양이 달라도(오류 객체) '스킬 없음'이 아니라 해석 오류", async (t) => {
  stub(t, () => ok('{"message":"Bad credentials"}'));
  const r = await readSkills(REPO);
  assert.deepEqual(r.found, []);
  assert.deepEqual(r.errors.map((e) => [e.path, e.kind]), [[".claude/skills", "parse"]]);
});

test("한도(429)는 수집 오류 종류 rate_limited로, 스킬 폴더 전체를 가리킨다", async (t) => {
  stub(t, () => new Response("", { status: 429 }));
  const r = await readSkills(REPO);
  assert.deepEqual(r.errors.map((e) => [e.path, e.kind]), [[".claude/skills", "rate_limited"]]);
});

test("폴더 이름은 주소에 인코딩해서 읽는다", async (t) => {
  const urls = stub(t, (u) => (u === LIST_URL ? ok(dirs("my skill")) : ok("---\nname: x\n---")));
  const r = await readSkills(REPO);
  assert.ok(urls.includes("https://raw.githubusercontent.com/o/r/HEAD/.claude/skills/my%20skill/SKILL.md"));
  assert.equal(r.found[0]?.name, "my skill");
});

test("스킬이 30개를 넘으면 앞의 30개만 읽고, 못 읽은 스킬만 오류로 남긴다(요청도 목록 1 + 30번)", async (t) => {
  const names = Array.from({ length: 31 }, (_, i) => `s${String(i).padStart(2, "0")}`);
  const urls = stub(t, (u) => (u === LIST_URL ? ok(dirs(...names)) : ok("---\nname: x\n---")));
  const r = await readSkills(REPO);
  assert.equal(r.found.length, 30);
  assert.equal(r.folders, 31);
  assert.equal(urls.length, 31);
  assert.deepEqual(r.errors.map((e) => [e.path, e.kind]), [[".claude/skills/s30", "parse"]]);
  assert.match(r.errors[0].message, /31개라 앞의 30개만/);
});

test("한 스킬의 SKILL.md가 500이면 그 스킬만 오류, 나머지는 계속", async (t) => {
  stub(t, (u) => (u === LIST_URL ? ok(dirs("a", "b", "c")) : u.includes("/b/") ? new Response("", { status: 500 }) : ok("---\nname: x\n---")));
  const r = await readSkills(REPO);
  assert.deepEqual(r.found.map((f) => f.name), ["a", "c"]);
  assert.deepEqual(r.errors.map((e) => [e.path, e.kind]), [[".claude/skills/b", "http_status"]]);
});
