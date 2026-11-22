import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_TAG_KINDS, MAX_TAG_ROWS, MAX_TAGS_PER_TECH } from "../domain/my-tech-tag.ts";
import { addTag, readMyTechTagMap, readTagPanel, readTechTags, removeTag } from "./my-tech-tags.ts";

const ME = "u1";
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const MISSING = "99999999-9999-4999-8999-999999999999";
type Row = { id: string; user_id: string; tech_id: string; tag: string; created_at: string };
/** cap = PostgREST 한 번 최대 줄 수(그보다 많으면 잘라서 주고 count는 실제 수) */
type Fail = { read?: boolean; insert?: { code?: string; message: string }; del?: boolean; cap?: number; race?: Row };

/**
 * 메모리 속 my_tech_tags. RLS처럼 늘 본인(ME) 줄만 보이고, eq 조건을 지키며, 넣을 때 user_id는 기본값(ME)·유일 색인(대소문자 무시)·외래 키(있는 기술만)를 흉내 낸다.
 * calls = 넣은 값·지운 조건(화면이 보낸 값을 그대로 쓰지 않는지 본다)
 */
function fakeDb(rows: Row[] = [], fail: Fail = {}) {
  const calls: { op: string; value: unknown }[] = [];
  let n = rows.length;
  const query = (op: "select" | "delete", eqs: [string, unknown][] = []) => {
    const hit = () => rows.filter((r) => r.user_id === ME && eqs.every(([c, v]) => r[c as keyof Row] === v));
    const run = () => {
      if (op === "select" && fail.read) return { data: null, error: { message: "boom" } };
      if (op === "delete" && fail.del) return { data: null, error: { message: "boom" } };
      const found = hit();
      if (op === "delete") { calls.push({ op, value: eqs }); for (const r of found) rows.splice(rows.indexOf(r), 1); return { data: found.map((r) => ({ id: r.id })), error: null }; }
      return { data: found.slice(0, fail.cap ?? found.length).map((r) => ({ tech_id: r.tech_id, tag: r.tag })), error: null, count: found.length };
    };
    const b: Record<string, unknown> = {
      eq: (c: string, v: unknown) => query(op, [...eqs, [c, v]]),
      order: () => b, range: () => b, select: () => b,
      then: (resolve: (x: unknown) => unknown) => resolve(run()),
    };
    return b;
  };
  const db = {
    from: () => ({
      select: () => query("select"),
      delete: () => query("delete"),
      insert: (value: { tech_id: string; tag: string }) => {
        calls.push({ op: "insert", value });
        const result = () => {
          if (fail.insert) return { data: null, error: fail.insert };
          if (fail.race) rows.push(fail.race); // 서버가 읽은 뒤 다른 요청이 먼저 넣음 → 아래 유일 색인에 걸린다
          if (value.tech_id === MISSING) return { data: null, error: { code: "23503", message: 'insert or update on table "my_tech_tags" violates foreign key constraint "my_tech_tags_tech_id_fkey"' } };
          if (rows.some((r) => r.user_id === ME && r.tech_id === value.tech_id && r.tag.toLowerCase() === value.tag.toLowerCase())) return { data: null, error: { code: "23505", message: "dup" } };
          const row = { id: `r${++n}`, user_id: ME, created_at: String(n), ...value };
          rows.push(row);
          return { data: [{ id: row.id }], error: null };
        };
        return { select: () => ({ then: (resolve: (x: unknown) => unknown) => resolve(result()) }) };
      },
    }),
  } as unknown as SupabaseClient;
  return { db, rows, calls };
}
const row = (tech_id: string, tag: string, user_id = ME): Row => ({ id: `${user_id}-${tech_id}-${tag}`, user_id, tech_id, tag, created_at: tag });

test("붙이기: 정리한 태그를 tech_id·tag만 넣는다(user_id는 DB 기본값). 다시 붙이면(대소문자만 달라도) 줄이 늘지 않는다(불변 3)", async () => {
  const { db, rows, calls } = fakeDb();
  assert.deepEqual(await addTag(db, ME, { techId: T1, tag: "  사이드   프로젝트 " }), { ok: true, tag: "사이드 프로젝트", changed: true });
  assert.deepEqual(calls, [{ op: "insert", value: { tech_id: T1, tag: "사이드 프로젝트" } }]);
  assert.deepEqual(await addTag(db, ME, { techId: T1, tag: "사이드 프로젝트" }), { ok: true, tag: "사이드 프로젝트", changed: false });
  await addTag(db, ME, { techId: T1, tag: "React" });
  assert.deepEqual(await addTag(db, ME, { techId: T1, tag: "react" }), { ok: true, tag: "React", changed: false });
  assert.equal(rows.length, 2);
});

test("다른 기술에 이미 쓴 태그는 그 표기를 따른다(대소문자로 종류가 갈라지지 않게)", async () => {
  const { db } = fakeDb([row(T1, "React")]);
  assert.deepEqual(await addTag(db, ME, { techId: T2, tag: "REACT" }), { ok: true, tag: "React", changed: true });
});

test("동시에 같은 태그를 붙여 DB 유일 색인에 걸리면 실패가 아니라 이미 붙어 있음(불변 3)", async () => {
  const { db } = fakeDb([], { insert: { code: "23505", message: "duplicate key" } });
  assert.deepEqual(await addTag(db, ME, { techId: T1, tag: "a" }), { ok: true, tag: "a", changed: false });
});

test("저장하지 못하면 실패로 알리고 줄은 그대로(불변 4): 넣기 실패·읽기 실패·없는 기술·잘못된 id", async () => {
  const failed = fakeDb([], { insert: { message: "boom sk-ant-api03-abcdefghijklmnop" } });
  const r = await addTag(failed.db, ME, { techId: T1, tag: "a" });
  assert.equal(r.ok, false);
  assert.doesNotMatch((r as { message: string }).message, /sk-ant/);
  assert.equal(failed.rows.length, 0);
  assert.equal((await addTag(fakeDb([], { read: true }).db, ME, { techId: T1, tag: "a" })).ok, false);
  assert.deepEqual(await addTag(fakeDb().db, ME, { techId: MISSING, tag: "a" }), { ok: false, message: "기술을 찾지 못했어요." });
  assert.deepEqual(await addTag(fakeDb().db, ME, { techId: "not-a-uuid", tag: "a" }), { ok: false, message: "기술을 찾지 못했어요." });
});

test("글자 규칙에 걸리면 DB를 부르지 않는다(빈 글자·비밀값 모양)", async () => {
  const { db, calls } = fakeDb();
  assert.equal((await addTag(db, ME, { techId: T1, tag: "  " })).ok, false);
  assert.equal((await addTag(db, ME, { techId: T1, tag: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" })).ok, false);
  assert.equal(calls.length, 0);
});

test("한도: 기술 하나에 10개, 태그 종류 50개, 붙임 합 1,000개. 이미 붙은 태그는 한도와 상관없이 그대로 성공", async () => {
  const perTech = fakeDb(Array.from({ length: MAX_TAGS_PER_TECH }, (_, i) => row(T1, `t${i}`)));
  assert.match(String((await addTag(perTech.db, ME, { techId: T1, tag: "new" }) as { message: string }).message), /10개까지/);
  assert.deepEqual(await addTag(perTech.db, ME, { techId: T1, tag: "T0" }), { ok: true, tag: "t0", changed: false });
  const kinds = fakeDb(Array.from({ length: MAX_TAG_KINDS }, (_, i) => row(`tech-${i}`, `k${i}`)));
  assert.match(String((await addTag(kinds.db, ME, { techId: T1, tag: "brand-new" }) as { message: string }).message), /종류는 50개까지/);
  assert.deepEqual(await addTag(kinds.db, ME, { techId: T1, tag: "k3" }), { ok: true, tag: "k3", changed: true }, "있는 종류는 다른 기술에 붙일 수 있다");
  const total = fakeDb(Array.from({ length: MAX_TAG_ROWS }, (_, i) => row(`tech-${i}`, "same")));
  assert.match(String((await addTag(total.db, ME, { techId: T1, tag: "same" }) as { message: string }).message), /1000번까지/);
});

test("떼기: 대소문자를 가리지 않고 찾아 그 줄만 지운다. 없으면 이미 뗀 것(changed: false), 남의 같은 태그는 건드리지 않는다", async () => {
  const { db, rows, calls } = fakeDb([row(T1, "React"), row(T2, "React"), row(T1, "React", "u2")]);
  assert.deepEqual(await removeTag(db, ME, { techId: T1, tag: "react" }), { ok: true, tag: "React", changed: true });
  assert.deepEqual(calls.at(-1)?.value, [["user_id", ME], ["tech_id", T1], ["tag", "React"]]);
  assert.deepEqual(rows.map((r) => `${r.user_id}:${r.tech_id === T1 ? "T1" : "T2"}`), ["u1:T2", "u2:T1"]);
  assert.deepEqual(await removeTag(db, ME, { techId: T1, tag: "react" }), { ok: true, tag: "react", changed: false });
});

test("떼기를 저장하지 못하면 실패(불변 4), 빈 태그·잘못된 id는 DB를 부르지 않는다", async () => {
  const failed = fakeDb([row(T1, "a")], { del: true });
  assert.equal((await removeTag(failed.db, ME, { techId: T1, tag: "a" })).ok, false);
  assert.equal(failed.rows.length, 1);
  assert.equal((await removeTag(fakeDb().db, ME, { techId: T1, tag: " " })).ok, false);
  assert.equal((await removeTag(fakeDb().db, ME, { techId: "x", tag: "a" })).ok, false);
});

test("읽기: 내 태그 종류와 붙인 기술 수(많은 순), 기술별 태그(이름순), 기술 id → 태그 맵. 본인 줄만", async () => {
  const { db } = fakeDb([row(T1, "web"), row(T2, "Web"), row(T1, "ai"), row(T2, "secret", "u2")]);
  assert.deepEqual((await readTagPanel(db, ME, T1)).mine, [{ tag: "web", count: 2 }, { tag: "ai", count: 1 }]);
  assert.deepEqual(await readTechTags(db, ME, T1), ["ai", "web"]);
  assert.deepEqual([...(await readMyTechTagMap(db, ME))].map(([k, v]) => [k === T1 ? "T1" : "T2", v]), [["T1", ["ai", "web"]], ["T2", ["Web"]]]);
});

test("읽지 못하면 던진다(빈 목록·'태그 없음'으로 보이지 않게, 불변 2)", async () => {
  const { db } = fakeDb([], { read: true });
  await assert.rejects(readTagPanel(db, ME, T1), /내 태그를 읽지 못함/);
  await assert.rejects(readMyTechTagMap(db, ME), /내 태그를 읽지 못함/);
  await assert.rejects(readTechTags(db, ME, T1), /읽지 못함/);
});

test("DB 트리거가 한도로 막으면(동시 요청·서버를 건너뛴 경우) 쉬운 말로 실패, 사람 쪽 외래 키 오류는 '없는 기술'이 아니라 저장 실패", async () => {
  const perTech = await addTag(fakeDb([], { insert: { code: "P0001", message: "태그 한도: 기술당 10개" } }).db, ME, { techId: T1, tag: "a" });
  assert.deepEqual(perTech, { ok: false, message: `기술 하나에 태그는 ${MAX_TAGS_PER_TECH}개까지예요.` });
  const kinds = await addTag(fakeDb([], { insert: { code: "P0001", message: "태그 한도: 종류 50개" } }).db, ME, { techId: T1, tag: "a" });
  assert.match(String((kinds as { message: string }).message), /종류는 50개까지/);
  const profile = await addTag(fakeDb([], { insert: { code: "23503", message: 'violates foreign key constraint "my_tech_tags_user_id_fkey"' } }).db, ME, { techId: T1, tag: "a" });
  assert.match(String((profile as { message: string }).message), /저장하지 못했어요/);
});

test("붙이기 칸: 한 번 읽어 이 기술의 태그(이름순)와 내 태그 종류를 함께 낸다", async () => {
  const { db } = fakeDb([row(T1, "web"), row(T2, "web"), row(T1, "ai")]);
  assert.deepEqual(await readTagPanel(db, ME, T1), { tags: ["ai", "web"], mine: [{ tag: "web", count: 2 }, { tag: "ai", count: 1 }] });
});

test("한도보다 많은 줄이 오면 잘린 목록일 수 있어 던진다(최신 태그가 조용히 빠지지 않게, 불변 2)", async () => {
  const { db } = fakeDb(Array.from({ length: MAX_TAG_ROWS + 1 }, (_, i) => row(`tech-${i}`, "t")));
  await assert.rejects(readMyTechTagMap(db, ME), /한도 1000줄/);
});

test("PostgREST가 줄을 잘라 주면(받은 줄 < 실제 수) 던진다: 한 번 최대 줄 수가 줄어도 최신 태그가 조용히 빠지지 않게", async () => {
  const { db } = fakeDb(Array.from({ length: 600 }, (_, i) => row(`tech-${i}`, "t")), { cap: 500 });
  await assert.rejects(readMyTechTagMap(db, ME), /600줄 중 500줄만 받음/);
});

test("동시에 대소문자만 다른 같은 태그를 붙여 23505면 저장된 표기를 돌려준다(다른 요청이 먼저 넣은 'React')", async () => {
  const { db, rows } = fakeDb([], { race: row(T1, "React") });
  assert.deepEqual(await addTag(db, ME, { techId: T1, tag: "react" }), { ok: true, tag: "React", changed: false });
  assert.equal(rows.length, 1);
});

test("떼기: 저장된 글자 그대로(겹빈칸·특수 빈칸 포함) 먼저 찾아 지운다(화면이 보여 준 태그가 남지 않게, 불변 4)", async () => {
  const { db, rows } = fakeDb([row(T1, "a  b"), row(T1, "\u00a0nb")]);
  assert.deepEqual(await removeTag(db, ME, { techId: T1, tag: "a  b" }), { ok: true, tag: "a  b", changed: true });
  assert.deepEqual(await removeTag(db, ME, { techId: T1, tag: "\u00a0nb" }), { ok: true, tag: "\u00a0nb", changed: true });
  assert.equal(rows.length, 0);
});
