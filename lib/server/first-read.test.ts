// 불변 2(수집 실패는 "수집 오류", "없음"·"성공"으로 보이지 않음)를 첫 읽기 흐름 전체로 시험한다. 실제 DB·GitHub·OSV는 부르지 않는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "./current-user.ts";
import { RepoNotPublicError } from "./collect-fetch.ts";
import { registerAndRead } from "./first-read.ts";

// 이 흐름은 실제 알림 만들기(대응안 초안 포함)를 거친다: 셸에 키가 있어도 시험이 실제 Claude를 부르지 못하게 비운다(각 시험 파일은 따로 뜬 프로세스)
delete process.env.ANTHROPIC_API_KEY;

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
function fakeDb(existingProject = false, opts: { changeExists?: boolean; latest?: Row; modelRows?: Row[]; changeKind?: string; repoCols?: Row; repoColsError?: boolean } = {}) {
  const calls: Call[] = [];
  let alertsWritten = false; // 알림을 쓴 뒤에는 내 알림 수가 1
  const respond = (c: Call): { data?: unknown; count?: number; error?: { message: string } } => {
    const has = (m: string) => c.chain.some((x) => x.m === m);
    // 이 프로젝트의 모델 줄(코드 파일 전체 오류 때만 읽는다)
    if (c.table === "my_technologies" && first(c) === "select" && String(c.chain[0].args[0]).includes("technologies!inner")) return { data: opts.modelRows ?? [] };
    // 위험 경로(알림 만들기)에서만 쓰는 응답. `in`으로 읽는 것은 알림 만들기가 사람들을 모으는 조회다.
    if (c.table === "my_technologies" && first(c) === "select" && has("in")) {
      const techIds = c.chain.find((x) => x.m === "in")?.args[1] as string[];
      return { data: techIds.map((techId, i) => ({ id: `mt${i + 1}`, owner_id: "u1", tech_id: techId, project_id: "p1", hidden_at: null, created_at: "2026-11-18T00:00:00Z" })) };
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
        // 저장소 확인 값을 읽는 조회(통과 판단): 시험이 정한 값을 돌려준다. 안 정하면 확인한 적 없는 기술
        if (String(c.chain[0].args[0]).includes("missed_count")) return opts.repoColsError ? { error: { message: "읽기 거부" } } : { data: keys.map((k) => ({ id: `t-${k}`, ...opts.repoCols })) };
        return { data: keys.map((k) => ({ id: `t-${k}`, tech_key: k })) };
      }
      case "sources.select": return { data: { id: "s1" } };
      case "my_technologies.select": return { data: { grade: "unknown", grade_evidence: null } };
      case "changes.upsert": return { data: opts.changeExists ? [] : [{ id: "c1" }] }; // 이미 있는 변경이면 새 줄이 안 생긴다(중복 막기 키)
      // 가장 최근 변경 조회(limit): 이어지는 위험이 있으면 그 줄, 없으면 비어 있음. 그 밖의 changes 읽기는 방금 만든·이미 있는 변경 한 줄
      case "changes.select": return has("limit") ? { data: opts.latest ?? null } : { data: { id: "c1", kind: opts.changeKind ?? "first_seen_danger", dedupe_key: "k1", is_simulated: false } };
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
  skills?: Response | Error; // 스킬 폴더 목록(GitHub API, 기본: 폴더 없음 404)
  tree?: Response | Error; // 코드 파일 목록(GitHub API, 기본: 코드 파일 없음)
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
    if (url === "https://api.github.com/repos/o/r/contents/.claude/skills") return give(web.skills ?? status(404));
    if (url === "https://api.github.com/repos/o/r/git/trees/HEAD?recursive=1") return give(web.tree ?? ok('{"tree":[]}'));
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

test("다시 읽을 때도 저장소 확인이 신선하면 통과를 매긴다: 정기 확인이 매긴 통과가 '찾지 못함'으로 되돌아가지 않는다(SPEC-1)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG } });
  const fresh = { status: "active", last_activity_at: new Date().toISOString(), last_checked_ok_at: new Date().toISOString(), missed_count: 0, signals: { github_found_repo: "acme/tool" } };
  const { db, calls } = fakeDb(false, { repoCols: fresh });
  await registerAndRead(USER, REPO, { db });
  const grades = updates(calls).filter((p) => "grade" in p).map((p) => p.grade);
  assert.ok(grades.length > 0 && grades.every((g) => g === "pass"), String(grades));
});

test("저장소 확인 값을 못 읽어도 처음 읽기는 멈추지 않는다: 찾지 못함으로 매기고 이유를 grade 단계 기록에 남긴다(통과로 단정하지 않음, 불변 2)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG } });
  const { db, calls } = fakeDb(false, { repoColsError: true });
  const r = await registerAndRead(USER, REPO, { db });
  assert.notEqual(r.status, "failed");
  const grades = updates(calls).filter((p) => "grade" in p).map((p) => p.grade);
  assert.ok(grades.length > 0 && grades.every((g) => g === "unknown"), String(grades));
  assert.match(String(steps(calls).find((s) => s.step_name === "grade")?.error_message), /저장소 확인 값을 읽지 못해/);
});

test("저장소 확인 값이 없으면(읽은 적 없는 기술) 취약점이 없어도 찾지 못함: 통과는 처음 읽기에서도 확인이 있어야 한다", async (t) => {
  stubWeb(t, { files: { "package.json": PKG } });
  const { db, calls } = fakeDb();
  await registerAndRead(USER, REPO, { db });
  const grades = updates(calls).filter((p) => "grade" in p).map((p) => p.grade);
  assert.ok(grades.length > 0 && grades.every((g) => g === "unknown"), String(grades));
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
  assert.deepEqual([r.status, r.errors], ["failed", 8]); // 읽는 파일 여섯(package.json·.mcp.json·requirements.txt·다른 도구 설정 셋)과 스킬 폴더 · 코드 파일(모델 찾기)이 모두 실패
  assert.equal(steps(calls).find((s) => s.step_name === "fetch_repo")?.error_kind, "rate_limited");
});

test("다시 읽기: 파일이 하나도 안 열리고 저장소도 안 열리면 성공으로 끝나지 않는다(전에 읽은 등급은 그대로, 스킬 줄도 수집 오류)", async (t) => {
  const urls = stubWeb(t, { repo: status(404) });
  const { db, calls } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });

  assert.equal(r.status, "failed");
  assert.equal(r.found, 0);
  assert.equal(ops(calls, "runs", "insert").map(arg0)[0].trigger, "user_reread");
  const marks = ops(calls, "my_technologies", "update").filter((c) => arg0(c).collect_error_kind === "http_status");
  const target = (c: (typeof marks)[number]) => c.chain.find((x) => (x.m === "eq" || x.m === "like") && x.args[0] === "source_file")?.args[1];
  // 스킬 목록 404를 "스킬 없음"으로 읽지 않는다: 저장소가 닫혔으니 전에 읽은 스킬 줄 모두가 대상이고, 목록은 부르지 않는다(불변 2)
  assert.deepEqual(marks.map(target).sort(), [".claude/skills/%", ".cursor/mcp.json", ".gemini/settings.json", ".mcp.json", ".vscode/mcp.json", "package.json", "requirements.txt"]);
  assert.ok(!urls.includes("https://api.github.com/repos/o/r/contents/.claude/skills"));
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
  assert.deepEqual(updates(calls).map((p) => p.collect_error_kind).sort(), [...Array(6).fill("http_status"), "network"]); // 파일 다섯 + 스킬 폴더는 404, package.json은 연결 오류
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

// 배포 주소 실패 시연(docs/관리자-사용설명서.md 5-3, ADR 0024): 실패 시연 스위치 없이 진짜 입력으로 빨간 상자를 만드는 길. 이 모양이 바뀌면 설명서도 고친다.
test("package.json 하나만 깨진 공개 저장소: 가져오기는 성공, 기술 읽기는 해석 실패, 실행은 실패. 다시 등록해도 같은 결과이고 프로젝트·변경·알림은 늘지 않는다", async (t) => {
  stubWeb(t, { files: { "package.json": "{ \"dependencies\": " } });
  for (const existing of [false, true]) {
    const { db, calls } = fakeDb(existing);
    const r = await registerAndRead(USER, REPO, { db });
    const step = (name: string) => steps(calls).find((s) => s.step_name === name);
    assert.deepEqual([r.status, r.found, r.danger], ["failed", 0, 0]);
    assert.equal(ops(calls, "runs", "insert").map(arg0)[0].trigger, existing ? "user_reread" : "first_read");
    assert.equal(step("fetch_repo")?.status, "succeeded");
    assert.deepEqual([step("extract_my_tech")?.status, step("extract_my_tech")?.error_kind], ["failed", "parse"]);
    assert.equal(ops(calls, "runs", "update").map(arg0).at(-1)?.status, "failed");
    assert.equal(ops(calls, "projects", "insert").length, existing ? 0 : 1);
    assert.equal(ops(calls, "changes", "upsert").length + ops(calls, "alerts", "upsert").length, 0);
  }
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

test(".cursor/mcp.json의 서버도 내 기술로 읽는다: 출처 파일이 .cursor/mcp.json으로 남는다(PRD-F39)", async (t) => {
  stubWeb(t, { files: { ".cursor/mcp.json": JSON.stringify({ mcpServers: { r: { command: "npx", args: ["-y", "mcp-remote@0.1.15"] } } }) } });
  const { db, calls } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.found, r.status, r.errors], [1, "succeeded", 0]);
  const rows = ops(calls, "my_technologies", "upsert").flatMap((c) => c.chain[0].args[0] as Row[]);
  assert.deepEqual(rows.map((row) => [row.tech_id, row.version, row.source_file]), [["t-npm:mcp-remote", "0.1.15", ".cursor/mcp.json"]]);
});

test(".mcp.json과 .cursor/mcp.json에 같은 기술이 있으면 한 줄만: 버전을 아는 쪽을 남기고, 모르는 쪽·같은 쪽은 앞 파일을 남긴다", async (t) => {
  stubWeb(t, { files: {
    ".mcp.json": JSON.stringify({ mcpServers: { r: { command: "npx", args: ["-y", "mcp-remote"] }, f: { command: "uvx", args: ["fastmcp"] } } }),
    ".cursor/mcp.json": JSON.stringify({ mcpServers: { r: { command: "npx", args: ["-y", "mcp-remote@0.1.15"] }, f: { command: "uvx", args: ["fastmcp"] } } }),
  } });
  const { db, calls } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.equal(r.found, 2);
  const rows = ops(calls, "my_technologies", "upsert").flatMap((c) => c.chain[0].args[0] as Row[]);
  assert.deepEqual(rows.map((row) => [row.tech_id, row.version, row.source_file]).sort(), [
    ["t-npm:mcp-remote", "0.1.15", ".cursor/mcp.json"], // 버전을 아는 쪽(.cursor)
    ["t-pypi:fastmcp", null, ".mcp.json"], // 둘 다 버전을 몰라 앞 파일(.mcp.json)
  ]);
});

test(".cursor/mcp.json이 깨져 있으면 그 파일만 수집 오류로 남기고 나머지는 계속한다(없음·성공으로 보이지 않게, 불변 2)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG, ".cursor/mcp.json": "{깨진" } });
  const { db, calls } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.found, r.status, r.errors], [1, "partial", 1]);
  const ex = steps(calls).find((s) => s.step_name === "extract_my_tech");
  assert.equal(ex?.status, "failed");
  assert.ok(String(ex?.error_message).includes(".cursor/mcp.json"), "어느 파일이 깨졌는지 오류에 적힌다");
});

test(".cursor/mcp.json을 가져오다 연결이 끊기면 \"파일 없음\"이 아니라 그 파일만 수집 오류다(불변 2)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG, ".cursor/mcp.json": new TypeError("fetch failed") } });
  const { db, calls } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.found, r.status, r.errors], [1, "partial", 1]);
  assert.equal(steps(calls).find((s) => s.step_name === "fetch_repo")?.status, "failed");
});

test("같은 별명의 모르는 서버가 .mcp.json과 .cursor/mcp.json에 둘 다 있어도 별명 줄은 한 줄이다(같은 줄을 한 번에 두 번 저장하면 DB가 거절한다): 앞 파일을 남긴다", async (t) => {
  const mine = JSON.stringify({ mcpServers: { mine: { command: "node", args: ["x.js"] } } });
  stubWeb(t, { files: { ".mcp.json": mine, ".cursor/mcp.json": mine } });
  const { db, calls } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.found, r.status, r.errors], [1, "succeeded", 0]);
  const rows = ops(calls, "my_technologies", "upsert").flatMap((c) => c.chain[0].args[0] as Row[]).filter((row) => "manual_name" in row);
  assert.deepEqual(rows.map((row) => [row.manual_name, row.source_file]), [["mine", ".mcp.json"]]);
});

test("다른 별명의 모르는 서버는 두 파일에서 각각 남는다: 별명이 다르면 서로 다른 서버다", async (t) => {
  const one = JSON.stringify({ mcpServers: { a: { command: "node", args: ["a.js"] } } });
  const two = JSON.stringify({ mcpServers: { b: { command: "node", args: ["b.js"] } } });
  stubWeb(t, { files: { ".mcp.json": one, ".cursor/mcp.json": two } });
  const { db, calls } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.equal(r.found, 2);
  const rows = ops(calls, "my_technologies", "upsert").flatMap((c) => c.chain[0].args[0] as Row[]).filter((row) => "manual_name" in row);
  assert.deepEqual(rows.map((row) => [row.manual_name, row.source_file]).sort(), [["a", ".mcp.json"], ["b", ".cursor/mcp.json"]]);
});

test("다시 읽기에서 .cursor/mcp.json만 깨지면 그 파일에서 읽었던 줄에만 해석 오류 딱지가 붙는다: 다른 파일의 줄은 건드리지 않는다(불변 2)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG, ".cursor/mcp.json": "{깨진" } });
  const { db, calls } = fakeDb(true);
  await registerAndRead(USER, REPO, { db });
  const marks = ops(calls, "my_technologies", "update").filter((c) => arg0(c).collect_error_kind === "parse");
  const target = (c: (typeof marks)[number]) => c.chain.find((x) => x.m === "eq" && x.args[0] === "source_file")?.args[1];
  assert.deepEqual(marks.map(target), [".cursor/mcp.json"]);
});

test(".cursor/mcp.json의 서버 하나가 비어(null) 있으면 그 파일 전체를 해석 오류로 남긴다: 일부만 읽은 것을 전부 읽은 것처럼 두지 않는다(불변 2)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG, ".cursor/mcp.json": '{"mcpServers":{"x":null}}' } });
  const { db, calls } = fakeDb(true);
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.found, r.status, r.errors], [1, "partial", 1]);
  assert.ok(String(steps(calls).find((s) => s.step_name === "extract_my_tech")?.error_message).includes(".cursor/mcp.json"));
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

// ---- 스킬 폴더(P-9e, PRD-F6, SPEC-7.3) ----
const listing = (...names: string[]) => ok(JSON.stringify(names.map((name) => ({ type: "dir", name }))));
const SOURCED = "---\nname: pdf\nsource: https://github.com/anthropics/skills\n---\n본문";
const PLAIN = "---\nname: mine\n---\n본문";

test("스킬 폴더를 읽어 내 기술로 넣는다: 머리에 원본 주소가 있어도 내 저장소 키와 출처 모름(남의 공용 줄에 끼어들지 않게)", async (t) => {
  stubWeb(t, { skills: listing("pdf", "mine"), files: { ".claude/skills/pdf/SKILL.md": SOURCED, ".claude/skills/mine/SKILL.md": PLAIN } });
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });

  assert.deepEqual([r.status, r.errors, r.found], ["succeeded", 0, 2]);
  const catalog = arg0(ops(calls, "technologies", "upsert")[0]) as unknown as Row[];
  assert.deepEqual(catalog.map((c) => [c.tech_key, c.type]).sort(), [["skill:o/r/mine", "skill"], ["skill:o/r/pdf", "skill"]]);
  const mine = ops(calls, "my_technologies", "upsert").flatMap((c) => c.chain[0].args[0] as Row[]);
  assert.deepEqual(mine.map((m) => [m.source_file, m.unknown_origin]).sort(), [[".claude/skills/mine", true], [".claude/skills/pdf", true]]);
  const fetch = steps(calls).find((s) => s.step_name === "fetch_repo");
  assert.match(String(fetch?.output_summary), /스킬 폴더 2개/);
  // 흐름 화면이 앞 단계의 나간 건수와 다음 단계의 들어온 건수를 잇도록(불변 6)
  assert.deepEqual([fetch?.count_out, steps(calls).find((s) => s.step_name === "extract_my_tech")?.count_in], [2, 2]);
});

test("스킬 폴더가 없으면 오류가 아니다: 읽은 스킬이 없을 뿐(일부 실패로 보이지 않음)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG } });
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.status, r.errors, r.found], ["succeeded", 0, 1]);
  assert.doesNotMatch(String(steps(calls).find((s) => s.step_name === "fetch_repo")?.output_summary), /스킬/);
});

test("SKILL.md가 없는 폴더는 스킬이 아니다", async (t) => {
  stubWeb(t, { skills: listing("docs-only"), files: {} });
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });
  assert.deepEqual([r.status, r.errors, r.found], ["succeeded", 0, 0]);
  assert.equal(ops(calls, "technologies", "upsert").length, 0);
});

test("스킬 폴더 목록이 한도에 걸리면 '스킬 없음'이 아니라 수집 오류: 일부 성공, 스킬 줄 전체에 오류 종류, 다른 기술은 그대로(불변 2)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG }, skills: new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0" } }) });
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });

  assert.deepEqual([r.status, r.errors, r.found], ["partial", 1, 1]);
  const mark = ops(calls, "my_technologies", "update").find((c) => arg0(c).collect_error_kind === "rate_limited")!;
  assert.ok(mark.chain.some((c) => c.m === "like" && c.args[0] === "source_file" && c.args[1] === ".claude/skills/%"), "스킬 줄 전체가 대상");
  const fetchStep = steps(calls).find((s) => s.step_name === "fetch_repo");
  assert.deepEqual([fetchStep?.status, fetchStep?.error_kind], ["failed", "rate_limited"]);
});

test("스킬 하나의 SKILL.md를 못 읽으면 그 스킬만 수집 오류, 다른 스킬은 계속", async (t) => {
  stubWeb(t, { skills: listing("good", "broken"), files: { ".claude/skills/good/SKILL.md": PLAIN, ".claude/skills/broken/SKILL.md": new Error("연결 끊김") } });
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });

  assert.deepEqual([r.status, r.errors, r.found], ["partial", 1, 1]);
  const marks = ops(calls, "my_technologies", "update").filter((c) => "collect_error_kind" in arg0(c));
  assert.equal(marks.length, 1);
  assert.ok(marks[0].chain.some((c) => c.m === "eq" && c.args[0] === "source_file" && c.args[1] === ".claude/skills/broken"), "그 스킬 줄만 대상");
});

test("스킬이 30개를 넘으면 이번에 못 읽은 스킬 줄만 한 번에 수집 오류(읽은 30개는 덮지 않음)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG }, skills: listing(...Array.from({ length: 31 }, (_, i) => `s${String(i).padStart(2, "0")}`)) });
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });
  assert.equal(r.status, "partial");
  const marks = ops(calls, "my_technologies", "update").filter((c) => arg0(c).collect_error_kind);
  assert.equal(marks.length, 1, "DB 갱신은 한 번");
  assert.ok(marks[0].chain.some((c) => c.m === "like" && c.args[1] === ".claude/skills/%"));
  assert.ok(marks[0].chain.some((c) => c.m === "or" && /read_at\.lt\./.test(String(c.args[0]))), "이번에 읽지 않은 줄만");
});

test("스킬 오류만으로는 '실패'가 아니다: 저장소 파일을 읽었으면 일부 성공", async (t) => {
  stubWeb(t, { files: { "package.json": PKG }, skills: status(500) });
  const r = await registerAndRead(USER, REPO, { db: fakeDb().db });
  assert.equal(r.status, "partial");
});

test("저장소 파일을 둘 다 못 읽으면 스킬 오류가 겹쳐도 실패(저장소가 안 열린 것을 일부 성공처럼 보이지 않게)", async (t) => {
  stubWeb(t, { files: { "package.json": new Error("끊김"), ".mcp.json": new Error("끊김") }, skills: status(500) });
  const r = await registerAndRead(USER, REPO, { db: fakeDb().db });
  assert.equal(r.status, "failed");
});

test("읽은 저장소 파일·스킬이 하나도 없고 오류뿐이면 실패(없는 파일은 오류가 아니어서, 못 읽은 것만 남는다)", async (t) => {
  stubWeb(t, { files: { "package.json": new Error("끊김") }, skills: status(500) });
  const r = await registerAndRead(USER, REPO, { db: fakeDb().db });
  assert.deepEqual([r.status, r.errors], ["failed", 2]);
});

test("다른 AI 도구 설정(PRD-F39): 같은 별명 · 같은 서버가 두 파일에 있어도 한 줄씩만 저장한다(별명 줄 UK가 깨지지 않게)", async (t) => {
  const same = JSON.stringify({ mcpServers: { "my-db": { command: "node", args: ["server.js"] }, r: { command: "npx", args: ["mcp-remote"] } } });
  stubWeb(t, { files: { ".mcp.json": same, ".cursor/mcp.json": same } });
  const { db, calls } = fakeDb();
  await registerAndRead(USER, REPO, { db });
  const rows = ops(calls, "my_technologies", "upsert").flatMap((c) => c.chain[0].args[0] as Row[]);
  assert.deepEqual(rows.map((r) => [r.manual_name ?? r.tech_id ?? null, r.source_file]).filter(([n]) => n === "my-db").length, 1);
  assert.deepEqual(rows.filter((r) => r.manual_name === "my-db").map((r) => r.source_file), [".mcp.json"], "앞 파일(.mcp.json) 줄이 남는다");
  assert.equal(rows.filter((r) => !("manual_name" in r)).length, 1, "같은 서버(npm:mcp-remote)도 한 줄");
});

const AI_TREE = JSON.stringify({ tree: [{ path: "src/ai.ts", type: "blob", size: 60 }, { path: "node_modules/x/index.js", type: "blob", size: 10 }] });
const AI_CODE = `client.messages.create({ model: "claude-3-opus-20240229", max_tokens: 10 })`;

test("코드 속 지원 종료 모델(PRD-F38): 모델 줄(종류 model)을 남기고 변경 model_eol 하나, 알림은 '모델 종료'로. 초안(Claude)은 부르지 않는다", async (t) => {
  const urls = stubWeb(t, { files: { "src/ai.ts": AI_CODE }, tree: ok(AI_TREE) });
  const { db, calls } = fakeDb(false, { changeKind: "model_eol" });
  const r = await registerAndRead(USER, REPO, { db });

  assert.equal(r.status, "succeeded");
  assert.ok(!urls.some((u) => u.includes("node_modules")), "의존성 폴더는 읽지 않는다");
  const tech = ops(calls, "technologies", "upsert").flatMap((u) => u.chain[0].args[0] as Row[]).find((x) => x.tech_key === "model:claude-3-opus-20240229");
  assert.equal(tech?.type, "model");
  const mine = ops(calls, "my_technologies", "upsert").flatMap((u) => u.chain[0].args[0] as Row[]).find((x) => x.tech_id === "t-model:claude-3-opus-20240229");
  assert.equal(mine?.source_file, "src/ai.ts");
  const change = ops(calls, "changes", "upsert").map(arg0)[0];
  assert.deepEqual([change.kind, change.cause_id, (change.curr_value as Row).retire_on, (change.curr_value as Row).replacement], ["model_eol", "eol:2026-01-05", "2026-01-05", "claude-opus-4-8"]);
  const alert = (ops(calls, "alerts", "upsert")[0].chain[0].args[0] as Row[])[0];
  assert.deepEqual([alert.kind, alert.my_technology_id], ["model_eol", "mt1"]);
  assert.ok(!urls.some((u) => u.includes("anthropic.com")), "대응안 초안은 보안 경고에만");
});

test("코드 파일 목록을 못 읽으면 '모델 없음'이 아니라 수집 오류: 전에 찾은 모델 줄에 오류 딱지, 실행은 일부 성공(불변 2)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG }, tree: status(500) });
  const { db, calls } = fakeDb(true, { modelRows: [{ id: "mt-model" }] });
  const r = await registerAndRead(USER, REPO, { db });

  assert.equal(r.status, "partial");
  const mark = ops(calls, "my_technologies", "update").find((c) => arg0(c).collect_error_kind === "http_status");
  assert.ok(mark?.chain.some((x) => x.m === "in" && x.args[0] === "id" && (x.args[1] as string[])[0] === "mt-model"), "이 프로젝트의 모델 줄만");
  assert.equal(ops(calls, "changes", "upsert").length, 0);
});

test("연동 서비스 · 개념(PRD-F40): SDK와 파일 목록으로 찾아 내 기술로 남기고(공개 목록에는 안 나감), OSV는 부르지 않는다", async (t) => {
  const pkg = JSON.stringify({ dependencies: { "@supabase/supabase-js": "2.0.0" } });
  const tree = JSON.stringify({ tree: [{ path: "package.json", type: "blob", size: 10 }, { path: "AGENTS.md", type: "blob", size: 10 }] });
  const urls = stubWeb(t, { files: { "package.json": pkg }, tree: ok(tree) });
  const { db, calls } = fakeDb();
  const r = await registerAndRead(USER, REPO, { db });

  assert.equal(r.status, "succeeded");
  const rows = ops(calls, "technologies", "upsert").flatMap((u) => u.chain[0].args[0] as Row[]);
  const service = rows.find((x) => x.tech_key === "service:supabase");
  assert.deepEqual([service?.type, "one_liner_source" in (service ?? {})], ["service", false], "설명 · 근거는 카탈로그에 쓰지 않는다(공개 목록에 나가지 않게, ADR 0029 4항)");
  assert.equal(rows.find((x) => x.tech_key === "concept:harness")?.type, "concept");
  assert.ok(!urls.some((u) => u.includes("osv.dev")), "허용 목록 밖 SDK · 서비스 · 개념은 OSV 대상이 아니다");
  assert.equal(ops(calls, "changes", "upsert").length, 0);
});

const typesAsked = (calls: Call[]) => calls.filter((c) => c.table === "my_technologies" && String(c.chain[0].args[0]).includes("technologies!inner"))
  .map((c) => c.chain.find((x) => x.m === "in" && x.args[0] === "technologies.type")?.args[1]);

test("파일 목록을 못 읽으면 목록으로 찾는 모델 · 연동 서비스 · 개념 줄 중 이번에 다시 보지 못한 것만 수집 오류(package.json으로 다시 찾은 줄은 덮지 않음)", async (t) => {
  stubWeb(t, { files: { "package.json": PKG }, tree: status(500) });
  const { db, calls } = fakeDb(true, { modelRows: [{ id: "mt-x" }] });
  await registerAndRead(USER, REPO, { db });
  assert.deepEqual(typesAsked(calls), [["model", "service", "concept"]]);
  const mark = ops(calls, "my_technologies", "update").find((c) => c.chain.some((x) => x.m === "in" && x.args[0] === "id"))!;
  assert.ok(mark.chain.some((x) => x.m === "or" && String(x.args[0]).startsWith("read_at.is.null")), "이번에 다시 읽은 줄은 빼는 조건");
});

test("목록은 읽었고 코드 파일 일부만 못 봤으면(한도) 모델 줄만: 서비스 · 개념은 목록과 package.json으로 이미 다시 확인했다", async (t) => {
  const many = JSON.stringify({ tree: Array.from({ length: 105 }, (_, i) => ({ path: `src/f${i}.ts`, type: "blob", size: 1 })) });
  stubWeb(t, { files: { "package.json": PKG }, tree: ok(many) });
  const { db, calls } = fakeDb(true, { modelRows: [{ id: "mt-x" }] });
  await registerAndRead(USER, REPO, { db });
  assert.deepEqual(typesAsked(calls), [["model"]]);
});
