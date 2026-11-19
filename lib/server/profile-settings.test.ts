import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveProfileSettings } from "./profile-settings.ts";

type Answer = { data: unknown; error: { message: string; code?: string } | null };

// 가짜 DB: profiles 수정 한 번의 요청을 남기고 정해 둔 답을 준다
function fakeDb(answer: Answer) {
  const calls: { table: string; patch?: unknown; filters: [string, unknown][] }[] = [];
  const db = {
    from(table: string) {
      const call: (typeof calls)[number] = { table, filters: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {
        update: (patch: unknown) => ((call.patch = patch), builder),
        eq: (column: string, value: unknown) => (call.filters.push([column, value]), builder),
        select: () => builder,
        then: (resolve: (a: Answer) => unknown) => resolve(answer),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

const saved = (nickname: string, is_public: boolean): Answer => ({ data: [{ id: "u1", nickname, is_public }], error: null });

test("별명과 공개 여부를 본인 줄(id)에만 고친다", async () => {
  const { db, calls } = fakeDb(saved("레이더맨", false));
  const r = await saveProfileSettings(db, "u1", { nickname: "  레이더맨 ", isPublic: false });
  assert.deepEqual(r, { ok: true, nickname: "레이더맨", isPublic: false });
  assert.deepEqual(calls[0], { table: "profiles", patch: { nickname: "레이더맨", is_public: false }, filters: [["id", "u1"]] });
});

test("규칙에 안 맞는 별명은 DB를 부르지 않고 이유를 돌려준다", async () => {
  const { db, calls } = fakeDb(saved("x", true));
  const r = await saveProfileSettings(db, "u1", { nickname: "me@example.com", isPublic: true });
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /@/);
  assert.equal(calls.length, 0);
});

test("이미 쓰는 별명(유니크 위반 23505)은 그렇게 알린다", async () => {
  const { db } = fakeDb({ data: null, error: { message: 'duplicate key value violates unique constraint "profiles_nickname_key"', code: "23505" } });
  const r = await saveProfileSettings(db, "u1", { nickname: "레이더맨", isPublic: true });
  assert.deepEqual(r, { ok: false, error: "이미 쓰는 별명이에요. 다른 별명을 골라 주세요" });
});

test("다른 DB 오류는 저장하지 못했다고 알리고, 비밀값은 가린다", async () => {
  const { db } = fakeDb({ data: null, error: { message: "boom ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD" } });
  const r = await saveProfileSettings(db, "u1", { nickname: "레이더맨", isPublic: true });
  assert.equal(r.ok, false);
  const error = r.ok ? "" : r.error;
  assert.match(error, /^저장하지 못했어요: boom/);
  assert.doesNotMatch(error, /ghp_/);
});

test("고친 줄이 없으면(내 프로필을 못 찾음) 저장했다고 하지 않는다(불변 4)", async () => {
  const { db } = fakeDb({ data: [], error: null });
  const r = await saveProfileSettings(db, "u1", { nickname: "레이더맨", isPublic: true });
  assert.deepEqual(r, { ok: false, error: "저장하지 못했어요: 내 프로필을 찾지 못했어요" });
});

test("빈 응답(data null)도 저장 실패로 본다", async () => {
  const { db } = fakeDb({ data: null, error: null });
  const r = await saveProfileSettings(db, "u1", { nickname: "레이더맨", isPublic: true });
  assert.equal(r.ok, false);
});

// 폼 읽기: 체크 해제는 formData에 아예 없다(null) → 공개 끔으로 저장돼야 한다
import { readSettingsForm } from "./profile-settings.ts";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

test("체크박스가 없으면(해제) 공개 끔, 'on'이면 공개 켬", () => {
  assert.equal(readSettingsForm(form({ nickname: "a1" })).isPublic, false);
  assert.equal(readSettingsForm(form({ nickname: "a1", isPublic: "on" })).isPublic, true);
  assert.equal(readSettingsForm(form({ nickname: "a1", isPublic: "yes" })).isPublic, false);
});

test("별명이 없으면 빈 글, welcome은 '1'일 때만 참, next는 사이트 안 경로만", () => {
  const empty = readSettingsForm(form({}));
  assert.deepEqual(empty, { nickname: "", isPublic: false, welcome: false, next: "/" });
  const full = readSettingsForm(form({ nickname: "x", welcome: "1", next: "/dashboard" }));
  assert.deepEqual(full, { nickname: "x", isPublic: false, welcome: true, next: "/dashboard" });
  assert.equal(readSettingsForm(form({ welcome: "1", next: "https://evil.example" })).next, "/");
  assert.equal(readSettingsForm(form({ welcome: "true" })).welcome, false);
});

test("저장 요청은 id·role 같은 다른 칸을 보내지 않는다(별명·공개 여부 두 칸만)", async () => {
  const { db, calls } = fakeDb(saved("레이더맨", true));
  await saveProfileSettings(db, "u1", { nickname: "레이더맨", isPublic: true });
  assert.deepEqual(Object.keys(calls[0].patch as object).sort(), ["is_public", "nickname"]);
});
