import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCaptureLines } from "../capture/parse-capture.ts";
import { lookupCapture } from "./capture.ts";

type Row = Record<string, unknown>;
// 부른 거르기를 적어 두고, 표마다 정해 둔 줄을 돌려주는 가짜 클라이언트(failOn: 이 글이 든 질의는 실패)
function fakeDb(rows: Record<string, Row[]>, failOn = "") {
  const calls: string[] = [];
  const db = {
    from(table: string) {
      const q: Record<string, unknown> = {}, mine: string[] = [];
      for (const m of ["select", "eq", "neq", "not", "ilike", "in", "or", "order", "limit"]) q[m] = (...a: unknown[]) => { const c = `${table}.${m}(${a.map(String).join(",")})`; calls.push(c); mine.push(c); return q; };
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(failOn && mine.some((c) => c.includes(failOn)) ? { data: null, error: { message: "boom" } } : { data: rows[table] ?? [], error: null }).then(resolve);
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}
const tech = (id: string, name: string, key: string, depth = "thin"): Row => ({ id, display_name: name, one_liner: null, grade: "pass", tech_key: key, repo_url: null, depth });

test("키 줄은 한 번에, 저장소는 주소 끝(그대로 · .git · /하위)으로, 이름은 부분으로 찾고 공개 목록 기술만, 내 표시는 본인 것만", async () => {
  const { db, calls } = fakeDb({ technologies: [{ ...tech("t1", "mcp-remote", "npm:mcp-remote"), one_liner: "원격 MCP", grade: "danger" }], tech_marks: [{ tech_id: "t1", status: "interest" }] });
  const out = await lookupCapture(db, "user-a", parseCaptureLines(["npx mcp-remote", "https://github.com/a/b_c", "context7", "https://youtu.be/x"].join("\n")));
  const path = "github.com/a/b\\_c"; // LIKE의 한 글자 자리표(_)는 글자 그대로
  for (const c of [
    "technologies.in(tech_key,npm:mcp-remote)",
    `technologies.or(repo_url.ilike.*${path},repo_url.ilike.*${path}.git,repo_url.ilike.*${path}/*)`,
    "technologies.ilike(display_name,%context7%)", "technologies.not(one_liner_source,is,null)", "technologies.eq(is_simulated,false)", "tech_marks.eq(user_id,user-a)",
  ]) assert.ok(calls.includes(c), c);
  assert.equal(calls.filter((c) => c.startsWith("technologies.in(")).length, 1, "키 줄은 질의 하나");
  assert.deepEqual(out[0].hits, [{ id: "t1", name: "mcp-remote", oneLiner: "원격 MCP", grade: "danger", mark: "interest" }]);
  assert.deepEqual(out[3].hits, [], "영상 링크는 찾지 않는다");
});

test("한 줄 조회가 실패하면 그 줄만 hits = null(없음과 구분, 불변 2), 찾기 글은 허용 글자만 남긴다", async () => {
  const { db, calls } = fakeDb({ technologies: [] }, "boom-name");
  const out = await lookupCapture(db, "user-a", parseCaptureLines("boom-name\nok,(name)*"));
  assert.deepEqual(out.map((r) => r.hits), [null, []]);
  assert.ok(calls.includes("technologies.ilike(display_name,%okname%)"));
});

test("이름 찾기는 이름이 정확히 같은 것을 앞에(두꺼운 것보다 먼저)", async () => {
  const rows = [tech("a", "@x/playwright-mcp", "npm:@x/playwright-mcp", "thick"), tech("b", "playwright", "npm:playwright")];
  const out = await lookupCapture(fakeDb({ technologies: rows }).db, "user-a", parseCaptureLines("Playwright"));
  assert.deepEqual(out[0].hits!.map((h) => h.id), ["b", "a"]);
});
