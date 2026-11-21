// 코드 속 지원 종료 모델 찾기(PRD-F38). 실제 GitHub는 부르지 않는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CODE_FILES, readModels } from "./read-models.ts";

const REPO = { owner: "o", repo: "r" };
const TREE_URL = "https://api.github.com/repos/o/r/git/trees/HEAD?recursive=1";
const TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
const tree = (...paths: string[]) => JSON.stringify({ tree: paths.map((path) => ({ path, type: "blob", size: 10 })) });

type Reply = Response | Error;
function stub(t: { mock: { method: (o: object, n: "fetch", f: unknown) => unknown } }, replies: (url: string, auth: string | null) => Reply) {
  const seen: { url: string; auth: string | null }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    const auth = (init?.headers as Record<string, string> | undefined)?.authorization ?? null;
    seen.push({ url, auth });
    const r = replies(url, auth);
    if (r instanceof Error) throw r;
    return r;
  });
  return seen;
}

test("빈 저장소(트리 409)는 오류가 아니라 코드 파일이 없을 뿐이다", async (t) => {
  stub(t, () => new Response("", { status: 409 }));
  assert.deepEqual(await readModels(REPO, { token: "" }), { found: [], errors: [], scanned: 0, treePaths: [], treeComplete: false, treeLinks: [] });
});

test("서버 토큰을 붙이고, 토큰이 거절되면(401) 토큰 없이 한 번 더 읽는다. 모양이 이상한 토큰은 붙이지 않는다", async (t) => {
  const seen = stub(t, (url, auth) => (url === TREE_URL ? (auth ? new Response("", { status: 401 }) : new Response(tree("ai.py"))) : new Response(`m = "gpt-4"`)));
  const r = await readModels(REPO, { token: `${TOKEN}\n` });
  assert.deepEqual(seen.filter((s) => s.url === TREE_URL).map((s) => s.auth), [`Bearer ${TOKEN}`, null]);
  assert.deepEqual([r.found.map((f) => f.name), r.errors], [["gpt-4"], []]);

  const seen2 = stub(t, (url) => (url === TREE_URL ? new Response(tree()) : new Response("")));
  await readModels(REPO, { token: "토큰 아님" });
  assert.equal(seen2[0].auth, null);
});

test("열지 못한 코드 파일은 하나의 '코드 파일' 수집 오류로 모은다(이번에 못 본 모델 줄만, 불변 2)", async (t) => {
  stub(t, (url) => (url === TREE_URL ? new Response(tree("a.ts", "b.ts", "c.ts")) : url.endsWith("/a.ts") ? new Response(`"o1"`) : new TypeError("fetch failed")));
  const r = await readModels(REPO, { token: "" });
  assert.deepEqual(r.found.map((f) => [f.name, f.sourceFile]), [["o1", "a.ts"]]);
  assert.equal(r.errors.length, 1);
  assert.deepEqual([r.errors[0].path, r.errors[0].kind, r.errors[0].onlyUnread], [CODE_FILES, "network", true]);
  assert.match(r.errors[0].message, /코드 파일 2개를 열지 못함/);
});

test("시간 예산을 넘기면 남은 파일은 읽지 않고 '못 본 수'로 남긴다", async (t) => {
  const paths = Array.from({ length: 25 }, (_, i) => `f${i}.ts`);
  stub(t, (url) => (url === TREE_URL ? new Response(tree(...paths)) : new Response("")));
  let clock = 0;
  const r = await readModels(REPO, { token: "", now: () => (clock += 10_000) });
  assert.ok(r.scanned < 25);
  assert.match(r.errors[0]?.message ?? "", /한도\(수 · 크기 · 시간\) 때문에 보지 못함/);
});
