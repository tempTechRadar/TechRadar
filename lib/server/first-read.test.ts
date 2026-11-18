// 불변 2(수집 실패는 "수집 오류", "없음"·"성공"으로 보이지 않음)를 첫 읽기 흐름 전체로 시험한다. 실제 DB·GitHub·OSV는 부르지 않는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "./current-user.ts";
import { RepoNotPublicError } from "./collect-fetch.ts";
import { registerAndRead } from "./first-read.ts";

const USER: CurrentUser = { id: "u1", nickname: "n", role: "user", isDemo: false };
const REPO = { owner: "o", repo: "r", url: "https://github.com/o/r" };
const PKG = JSON.stringify({ dependencies: { "mcp-remote": "0.1.15" } });

type Call = { table: string; chain: { m: string; args: unknown[] }[] };
type Row = Record<string, unknown>;
const first = (c: Call) => c.chain[0]?.m;
const ops = (calls: Call[], table: string, m: string) => calls.filter((c) => c.table === table && first(c) === m);
const arg0 = (c: Call) => c.chain[0].args[0] as Row;
const steps = (calls: Call[]) => ops(calls, "run_steps", "insert").map(arg0);
const updates = (calls: Call[]) => ops(calls, "my_technologies", "update").map(arg0);

/** 실제 DB 대신 "무엇을 읽고 쓰려 했는지"를 모으는 가짜 클라이언트. 물음 한 줄(from…끝)이 Call 하나. */
function fakeDb(existingProject = false, opts: { changeExists?: boolean; latest?: Row } = {}) {
  const calls: Call[] = [];
  let alertsWritten = false; // 알림을 쓴 뒤에는 내 알림 수가 1
  const respond = (c: Call): { data?: unknown; count?: number } => {
    const has = (m: string) => c.chain.some((x) => x.m === m);
    // 위험 경로(알림 만들기)에서만 쓰는 응답. `in`으로 읽는 것은 알림 만들기가 사람들을 모으는 조회다.
    if (c.table === "my_technologies" && first(c) === "select" && has("in")) {
      return { data: [{ id: "mt1", owner_id: "u1", tech_id: "t-npm:mcp-remote", project_id: "p1", hidden_at: null, created_at: "2026-11-18T00:00:00Z" }] };
    }
    if (c.table === "projects" && first(c) === "select" && has("in")) return { data: [{ id: "p1", archived_at: null }] };
    if (c.table === "alerts" && first(c) === "select") {
      const countQuery = (c.chain[0].args[1] as { head?: boolean } | undefined)?.head;
      return countQuery ? { count: alertsWritten ? 1 : 0 } : { data: [] };
    }
    switch (`${c.table}.${first(c)}`) {
      case "projects.select": return { data: existingProject ? { id: "p1" } : null };
      case "projects.insert": return { data: { id: "p1" } };
      case "runs.insert": return { data: { id: "run-1" } };
      case "technologies.select": {
        const keys = ops(calls, "technologies", "upsert").flatMap((u) => (u.chain[0].args[0] as Row[]).map((r) => r.tech_key as string));
        return { data: keys.map((k) => ({ id: `t-${k}`, tech_key: k })) };
      }
      case "sources.select": return { data: { id: "s1" } };
      case "my_technologies.select": return { data: { grade: "unknown", grade_evidence: null } };
      case "changes.upsert": return { data: opts.changeExists ? [] : [{ id: "c1" }] }; // 이미 있는 변경이면 새 줄이 안 생긴다(중복 막기 키)
      // 가장 최근 변경 조회(limit): 이어지는 위험이 있으면 그 줄, 없으면 비어 있음. 그 밖의 changes 읽기는 방금 만든·이미 있는 변경 한 줄
      case "changes.select": return has("limit") ? { data: opts.latest ?? null } : { data: { id: "c1", kind: "first_seen_danger", dedupe_key: "k1", is_simulated: false } };
      case "profiles.select": return { data: [{ id: "u1", is_demo: false }] };
      case "alerts.upsert": return (alertsWritten = true), { data: [{ id: "a1" }] };
      default: return {};
    }
  };
  const db = {
    from(table: string) {
      const call: Call = { table, chain: [] };
      calls.push(call);
      const q: unknown = new Proxy({}, {
        get(_t, m) {
          if (typeof m === "symbol") return undefined;
          if (m === "then") return (resolve: (v: unknown) => void) => resolve({ data: null, error: null, ...respond(call) });
          return (...args: unknown[]) => (call.chain.push({ m, args }), q);
        },
      });
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

type Web = {
  files?: Record<string, string | Error>; // 경로 → 본문 또는 연결 오류(없으면 404)
  repo?: Response | Error; // GitHub 저장소 확인(기본: 공개)
  osv?: (name: string) => Response | Error; // OSV(기본: 알려진 문제 없음)
};
const ok = (body: string) => new Response(body, { status: 200 });
const status = (n: number) => new Response("", { status: n });

function stubWeb(t: { mock: { method: (o: object, n: "fetch", f: unknown) => unknown } }, web: Web = {}) {
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    urls.push(url);
    const give = (r: Response | Error) => { if (r instanceof Error) throw r; return r; };
    if (url.startsWith("https://raw.githubusercontent.com/o/r/HEAD/")) {
      const body = web.files?.[url.split("/HEAD/")[1]];
      if (body instanceof Error) throw body;
      return body === undefined ? status(404) : ok(body);
    }
    if (url === "https://api.github.com/repos/o/r") return give(web.repo ?? ok('{"private":false}'));
    if (url === "https://api.osv.dev/v1/query") return give((web.osv ?? (() => ok('{"vulns":[]}')))(JSON.parse(String(init?.body)).package.name));
    throw new Error(`예상하지 못한 호출: ${url}`);
  });
  return urls;
}

test("OSV가 실패하면 그 기술만 수집 오류: 등급은 그대로, 변경·알림 없음, 실행은 일부 성공, 실패 단계에 오류 종류", async (t) => {
  stubWeb(t, { files: { "package.json": PKG }, osv: () => status(500) });
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });

  assert.equal(r.status, "partial");
  assert.equal(r.errors, 1);
  assert.equal(r.danger, 0);
  const marks = updates(calls).filter((p) => p.collect_error_kind === "http_status");
  assert.equal(marks.length, 1, "그 기술 줄에 수집 오류 종류가 남는다");
  assert.ok(updates(calls).every((p) => !("grade" in p)), "등급 칸은 건드리지 않는다(불변 2)");
  assert.equal(ops(calls, "changes", "insert").length + ops(calls, "alerts", "insert").length, 0);
  const osvStep = steps(calls).find((s) => s.step_name === "fetch_osv");
  assert.equal(osvStep?.status, "failed");
  assert.equal(osvStep?.error_kind, "http_status");
  assert.equal(ops(calls, "runs", "update").map(arg0).at(-1)?.status, "partial");
});

test("OSV가 404여도 '알려진 취약점 없음'이 아니라 수집 오류다: 등급은 그대로, 실행은 일부 성공(불변 2)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG }, osv: () => status(404) });
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });

  assert.deepEqual([r.status, r.errors, r.danger], ["partial", 1, 0]);
  assert.equal(updates(calls).filter((p) => p.collect_error_kind === "http_status").length, 1, "그 기술 줄에 수집 오류 종류가 남는다");
  assert.ok(updates(calls).every((p) => !("grade" in p)), "등급 칸은 건드리지 않는다");
  const osvStep = steps(calls).find((s) => s.step_name === "fetch_osv");
  assert.deepEqual([osvStep?.status, osvStep?.error_kind, osvStep?.http_status], ["failed", "http_status", 404], "응답 코드도 단계에 남는다");
});

test("한 기술의 OSV가 실패해도 다른 기술은 계속 등급을 매긴다", async (t) => {
  const two = JSON.stringify({ dependencies: { "mcp-remote": "0.1.15", openai: "4.0.0" } });
  stubWeb(t, { files: { "package.json": two }, osv: (name) => (name === "mcp-remote" ? status(500) : ok('{"vulns":[]}')) });
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });

  assert.equal(r.status, "partial");
  const failed = updates(calls).filter((p) => p.collect_error_kind === "http_status");
  const graded = updates(calls).filter((p) => "grade" in p);
  assert.equal(failed.length, 1);
  assert.equal(graded.length, 1, "실패한 기술 말고 한 기술은 등급이 저장된다");
  const failedCall = ops(calls, "my_technologies", "update").find((c) => arg0(c).collect_error_kind === "http_status")!;
  assert.ok(failedCall.chain.some((c) => c.m === "eq" && c.args[0] === "tech_id" && c.args[1] === "t-npm:mcp-remote"));
});

test("카탈로그에는 두꺼운 이유 'used'로 넣는다(erd 값)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG } });
  const { db, calls } = fakeDb();
  await registerAndRead(USER, REPO, { db });
  const rows = arg0(ops(calls, "technologies", "upsert")[0]) as unknown as Row[];
  assert.deepEqual(rows.map((r) => r.thick_reasons), [["used"]]);
});

test("다시 읽어도 직접 숨긴 기술은 되살아나지 않는다(PRD-F7): 내 기술 줄을 덮어쓰는 칸에 hidden_at이 없다", async (t) => {
  stubWeb(t, { files: { "package.json": PKG } });
  const { db, calls } = fakeDb(true);
  await registerAndRead(USER, REPO, { db });
  const rows = arg0(ops(calls, "my_technologies", "upsert")[0]) as unknown as Row[];
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => !("hidden_at" in r)));
});

test("새 등록: 저장소가 안 열리면(404·비공개) 막는다. 프로젝트도 실행도 만들지 않는다", async (t) => {
  stubWeb(t, { repo: status(404) });
  const { db, calls } = fakeDb();
  await assert.rejects(() => registerAndRead(USER, REPO, { db }), RepoNotPublicError);
  assert.equal(ops(calls, "projects", "insert").length + calls.filter((c) => c.table === "runs").length, 0);
});

test("새 등록: 저장소 확인이 안 되면(GitHub 한도 초과) 막지 않는다. 파일은 읽고 성공한다", async (t) => {
  stubWeb(t, { files: { "package.json": PKG }, repo: status(429) });
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.status, r.errors], ["succeeded", 0]);
  assert.equal(ops(calls, "projects", "insert").length, 1);
});

test("새 등록: 확인도 안 되고 파일도 하나도 안 열리면 '없음'이 아니라 수집 오류로 남기고 실패로 닫는다", async (t) => {
  stubWeb(t, { repo: status(429) });
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.status, r.errors], ["failed", 3]); // 읽는 파일 셋(package.json·.mcp.json·requirements.txt)이 모두 실패
  assert.equal(steps(calls).find((s) => s.step_name === "fetch_repo")?.error_kind, "rate_limited");
});

test("다시 읽기: 파일이 하나도 안 열리고 저장소도 안 열리면 성공으로 끝나지 않는다(전에 읽은 등급은 그대로)", async (t) => {
  stubWeb(t, { repo: status(404) });
  const { db, calls } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });

  assert.equal(r.status, "failed");
  assert.equal(r.found, 0);
  assert.equal(ops(calls, "runs", "insert").map(arg0)[0].trigger, "user_reread");
  const marks = ops(calls, "my_technologies", "update").filter((c) => arg0(c).collect_error_kind === "http_status");
  assert.deepEqual(marks.map((c) => c.chain.find((x) => x.m === "eq" && x.args[0] === "source_file")?.args[1]).sort(), [".mcp.json", "package.json", "requirements.txt"]);
  assert.ok(updates(calls).every((p) => !("grade" in p)));
  assert.equal(steps(calls).find((s) => s.step_name === "fetch_repo")?.status, "failed");
  assert.equal(ops(calls, "runs", "update").map(arg0).at(-1)?.status, "failed");
  assert.equal(ops(calls, "projects", "insert").length, 0);
});

test("다시 읽기: 한 파일은 연결 오류, 나머지는 404여도 저장소가 안 열리면 실패로 닫는다", async (t) => {
  stubWeb(t, { files: { "package.json": new TypeError("fetch failed") }, repo: status(404) });
  const { db, calls } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.equal(r.status, "failed");
  assert.deepEqual(updates(calls).map((p) => p.collect_error_kind).sort(), ["http_status", "http_status", "network"]);
});

test("저장소는 열리는데 읽는 파일이 다 없으면 오류가 아니다: 기술 0개, 성공", async (t) => {
  const urls = stubWeb(t, { files: {} });
  const { db, calls } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.status, r.errors, r.found], ["succeeded", 0, 0]);
  assert.ok(urls.includes("https://api.github.com/repos/o/r"), "파일이 하나도 없을 때만 저장소를 확인한다");
  assert.equal(steps(calls).find((s) => s.step_name === "fetch_repo")?.status, "succeeded");
});

test("파일 하나만 없는 건 오류가 아니다: 저장소 확인도 부르지 않는다", async (t) => {
  const urls = stubWeb(t, { files: { "package.json": PKG } });
  const { db } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.status, r.errors], ["succeeded", 0]);
  assert.ok(!urls.includes("https://api.github.com/repos/o/r"));
});

test("requirements.txt도 읽는다: 허용 목록의 PyPI 패키지만 기술이 되고, OSV는 PyPI 이름으로 묻는다(PRD-F6, SPEC-7)", async (t) => {
  const asked: string[] = [];
  stubWeb(t, { files: { "requirements.txt": "anthropic==0.40.0\nrequests==2.31.0\n" }, osv: (name) => { asked.push(name); return ok('{"vulns":[]}'); } });
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.status, r.errors, r.found], ["succeeded", 0, 1]);
  assert.deepEqual(asked, ["anthropic"]);
  const kept = ops(calls, "technologies", "upsert").flatMap((c) => arg0(c) as unknown as { tech_key: string }[]).map((row) => row.tech_key);
  assert.deepEqual(kept, ["pypi:anthropic"]);
});

test("requirements.txt는 줄 단위로 읽어 통째로 깨지지 않는다: 읽을 수 없는 줄이 섞여도 수집 오류가 아니다", async (t) => {
  stubWeb(t, { files: { "requirements.txt": "??? \n@@@\nmcp==1.2.0\n" } });
  const { db } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.status, r.errors, r.found], ["succeeded", 0, 1]);
});

test("읽은 파일이 하나도 없고 오류뿐이면 실패다: package.json·.mcp.json이 둘 다 연결 오류이고 requirements.txt는 원래 없어도(404) 일부 성공이 아니다(불변 2)", async (t) => {
  stubWeb(t, { files: { "package.json": new TypeError("fetch failed"), ".mcp.json": new TypeError("fetch failed") } });
  const { db } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.status, r.found], ["failed", 0]);
});

test("한 파일은 연결 오류이고 나머지는 원래 없어도(저장소는 열림) 읽은 것이 하나도 없으니 실패다", async (t) => {
  stubWeb(t, { files: { "package.json": new TypeError("fetch failed") } });
  const { db } = fakeDb(true);
  assert.equal((await registerAndRead(USER, REPO, { db })).status, "failed");
});

test("읽은 파일이 있으면 다른 파일이 오류여도 일부 성공이다(읽은 기술은 남긴다)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG, ".mcp.json": new TypeError("fetch failed") } });
  const { db } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.status, r.errors, r.found], ["partial", 1, 1]);
});

test("다른 파일을 포함하는 requirements.txt(-r)는 전부 읽은 것처럼 보이지 않는다: 읽은 기술은 남기고 일부 성공·오류 1건, 기술 줄에는 오류 딱지를 붙이지 않는다(불변 2)", async (t) => {
  stubWeb(t, { files: { "requirements.txt": "-r requirements/base.txt\nmcp==1.2.0\n" } });
  const { db, calls } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.status, r.errors, r.found], ["partial", 1, 1]);
  assert.equal(updates(calls).filter((p) => p.collect_error_kind === "parse").length, 0);
  const extract = steps(calls).find((s) => s.step_name === "extract_my_tech");
  assert.equal(extract?.status, "failed");
  assert.match(String(extract?.error_message), /requirements\/base\.txt/);
});

test("글자가 아닌 requirements.txt(UTF-16 등)는 '기술 없음'이 아니라 해석 오류다: 다른 파일에서 읽은 기술은 남고 그 파일의 줄에 오류 딱지가 붙는다(불변 2)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG, "requirements.txt": "o\u0000p\u0000e\u0000n\u0000a\u0000i\u0000" } });
  const { db, calls } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.status, r.errors, r.found], ["partial", 1, 1]);
  const marks = ops(calls, "my_technologies", "update").filter((c) => arg0(c).collect_error_kind === "parse");
  assert.deepEqual(marks.map((c) => c.chain.find((x) => x.m === "eq" && x.args[0] === "source_file")?.args[1]), ["requirements.txt"]);
});

test("가져온 파일이 모두 해석에 실패하면(읽은 기술 0) 일부 성공이 아니라 실패다: 가져왔다는 것과 읽었다는 것은 다르다(불변 2)", async (t) => {
  stubWeb(t, { files: { "package.json": "{bad", ".mcp.json": "{bad" } });
  const r = await registerAndRead(USER, REPO, { db: fakeDb(true).db });
  assert.deepEqual([r.status, r.errors, r.found], ["failed", 2, 0]);
});

test("package.json은 깨졌고 requirements.txt는 글자 파일이 아니어도 읽은 것이 하나도 없으니 실패다", async (t) => {
  stubWeb(t, { files: { "package.json": "{bad", "requirements.txt": "o\u0000p\u0000" } });
  const r = await registerAndRead(USER, REPO, { db: fakeDb(true).db });
  assert.deepEqual([r.status, r.errors, r.found], ["failed", 2, 0]);
});

test("-r 경로는 믿을 수 없는 글이라 오류 메시지에 길게 싣지 않고, 기록 저장도 오래 걸리지 않는다(앞 3개·80자까지)", async (t) => {
  const huge = "KEY".repeat(30_000);
  stubWeb(t, { files: { "requirements.txt": `-r ${huge}\n-r a.txt\n-r b.txt\n-r c.txt\nmcp==1.2.0\n` } });
  const { db, calls } = fakeDb(true);
  const started = performance.now();
  const r = await registerAndRead(USER, REPO, { db });
  assert.ok(performance.now() - started < 3_000, `너무 오래 걸림: ${(performance.now() - started).toFixed(0)}ms`);
  assert.deepEqual([r.status, r.errors, r.found], ["partial", 1, 1]);
  const message = String(steps(calls).find((s) => s.step_name === "extract_my_tech")?.error_message);
  assert.ok(message.length < 400, `메시지 ${message.length}자`);
  assert.match(message, /외 1개/);
  assert.doesNotMatch(message, /c\.txt/, "4번째 경로는 싣지 않는다");
});

test("같은 기술이 두 파일에 있으면 버전을 아는 쪽을 남긴다: .mcp.json의 `uvx fastmcp`(버전 모름)보다 requirements.txt의 ==2.0.0", async (t) => {
  stubWeb(t, { files: { ".mcp.json": JSON.stringify({ mcpServers: { f: { command: "uvx", args: ["fastmcp"] } } }), "requirements.txt": "fastmcp==2.0.0\n" } });
  const { db, calls } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.equal(r.found, 1);
  const rows = ops(calls, "my_technologies", "upsert").flatMap((c) => c.chain[0].args[0] as Row[]);
  assert.deepEqual(rows.map((row) => [row.tech_id, row.version]), [["t-pypi:fastmcp", "2.0.0"]]);
});

const G1_OSV = readFileSync(new URL("../domain/fixtures/osv-mcp-remote-0.1.15.json", import.meta.url), "utf8");

test("위험이면 notify를 이 실행에 '내 건수'로 남긴다: 내 알림만 세고, 알림 만들기에는 runId를 넘기지 않는다(불변 5·6)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG }, osv: () => ok(G1_OSV) });
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });

  assert.deepEqual([r.danger, r.changesCreated], [1, 1]);
  const notify = steps(calls).filter((s) => s.step_name === "notify");
  // 알림 만들기가 runId를 받으면 자기 notify 줄(그 기술을 쓰는 모든 사람 기준)을 또 남긴다 → 정확히 1줄이어야 한다
  assert.equal(notify.length, 1);
  assert.deepEqual([notify[0].status, notify[0].count_in, notify[0].count_out, notify[0].output_summary], ["succeeded", 1, 1, "내 알림 1건 만듦"]);
  // 건수는 실행을 시작한 사람의 알림만, 이 실행의 변경만 센다
  const counts = calls.filter((c) => c.table === "alerts" && first(c) === "select" && (c.chain[0].args[1] as { head?: boolean } | undefined)?.head);
  assert.equal(counts.length, 2, "알림 만들기 전과 후에 한 번씩");
  for (const c of counts) {
    assert.ok(c.chain.some((x) => x.m === "eq" && x.args[0] === "user_id" && x.args[1] === USER.id), "user_id로 거른다");
    assert.ok(c.chain.some((x) => x.m === "in" && x.args[0] === "change_id" && JSON.stringify(x.args[1]) === '["c1"]'), "이 실행의 변경으로 거른다");
  }
});

test("두 번째 사용자(같은 변경이 이미 있음)도 save_change가 '내가 만난 변경 수'로 남는다: 다른 사람이 먼저 읽었다는 사실이 기록에 안 드러난다(불변 5)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG }, osv: () => ok(G1_OSV) });
  const firstUser = fakeDb();
  const secondUser = fakeDb(false, { changeExists: true });
  const r1 = await registerAndRead(USER, REPO, { db: firstUser.db });
  const r2 = await registerAndRead(USER, REPO, { db: secondUser.db });

  // 호출한 쪽에 돌려주는 값은 그대로: 새로 만든 변경은 첫 사용자만
  assert.deepEqual([r1.changesCreated, r2.changesCreated], [1, 0]);
  // 사용자가 읽는 단계 기록은 둘 다 같다: 1→1이고, 새로 만들었는지 요약에도 적지 않는다
  for (const { calls } of [firstUser, secondUser]) {
    const save = steps(calls).find((s) => s.step_name === "save_change");
    assert.deepEqual([save?.status, save?.count_in, save?.count_out, save?.output_summary], ["succeeded", 1, 1, null]);
    // notify도 내 건수라 두 사람이 같다(둘째 사용자도 자기 알림을 새로 받는다)
    const notify = steps(calls).filter((s) => s.step_name === "notify");
    assert.deepEqual(notify.map((s) => [s.status, s.count_in, s.count_out]), [["succeeded", 1, 1]]);
  }
});

test("위험이 이미 이어지는 중이면(정기 확인이 만든 회차 2) 새 변경을 만들지 않고 그 변경에 이어 쓴다: 회차를 늘 1로 두어 오래된 변경에 붙이지 않는다", async (t) => {
  stubWeb(t, { files: { "package.json": PKG }, osv: () => ok(G1_OSV) });
  const { db, calls } = fakeDb(false, { latest: { id: "c9", danger_round: 2, created_at: "2026-11-18T00:00:00Z" } });
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.danger, r.changesCreated], [1, 0]);
  assert.equal(ops(calls, "changes", "upsert").length, 0, "새 변경(첫 읽기는 회차 1)을 또 만들지 않는다");
  const save = steps(calls).find((s) => s.step_name === "save_change");
  assert.deepEqual([save?.count_in, save?.count_out], [1, 1]);
});

test("위험이 없는 읽기는 변경이 없다: save_change는 0→0으로 남고 notify는 부르지 않는다(상자가 안 켜지는 것은 의도한 동작)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG } }); // OSV 기본 응답: 알려진 취약점 없음
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });

  assert.deepEqual([r.status, r.danger, r.changesCreated], ["succeeded", 0, 0]);
  const save = steps(calls).find((s) => s.step_name === "save_change");
  assert.deepEqual([save?.count_in, save?.count_out], [0, 0]);
  assert.equal(steps(calls).filter((s) => s.step_name === "notify").length, 0);
});
