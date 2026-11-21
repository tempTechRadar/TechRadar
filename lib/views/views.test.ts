import { test } from "node:test";
import assert from "node:assert/strict";
import { galleryCards, type GalleryRow } from "./gallery.ts";
import { newsBoard, type NewsItem } from "./news.ts";
import { usingNow } from "./using-now.ts";

// ── 내 레이더

test("쓰고 있어요: 공개한 사람의 별명과 수만, 숨김(is_public=false)·숨긴 기술은 이름과 수 모두에서 빠진다", () => {
  const rows = [
    { ownerId: "u1", techId: "T", hidden: false },
    { ownerId: "u1", techId: "T", hidden: false }, // 같은 사람 두 프로젝트
    { ownerId: "u2", techId: "T", hidden: false },
    { ownerId: "u3", techId: "T", hidden: false },
    { ownerId: "u4", techId: "T", hidden: true },
    { ownerId: "u5", techId: "OTHER", hidden: false },
  ];
  const profiles = [
    { id: "u1", nickname: "나비", isPublic: true },
    { id: "u2", nickname: "가람", isPublic: true },
    { id: "u3", nickname: "숨은이", isPublic: false },
    { id: "u4", nickname: "다솜", isPublic: true },
    { id: "u5", nickname: "라온", isPublic: true },
  ];
  assert.deepEqual(usingNow("T", rows, profiles), { count: 2, nicknames: ["가람", "나비"] });
});

test("쓰고 있어요: 결과에는 별명과 수만 있다(남의 목록 원본·아이디는 내려보내지 않음)", () => {
  const r = usingNow("T", [{ ownerId: "u1", techId: "T", hidden: false }], [{ id: "u1", nickname: "나비", isPublic: true }]);
  assert.deepEqual(Object.keys(r).sort(), ["count", "nicknames"]);
  assert.equal(JSON.stringify(r).includes("u1"), false);
});

// ── 소식판
const NOW = Date.parse("2026-11-18T00:00:00Z");
const n = (id: string, publishedAt: string, extra: Partial<NewsItem> = {}): NewsItem => ({ id, title: id, url: `https://x.dev/${id}`, publishedAt, source: "공식", official: true, kind: "external", tools: ["Claude Code"], ...extra });

test("소식판: 공식 출처·https만, 최근 30일, 새것부터", () => {
  const r = newsBoard([
    n("old", "2026-10-01T00:00:00Z"),
    n("a", "2026-11-10T00:00:00Z"),
    n("b", "2026-11-17T00:00:00Z"),
    n("rumor", "2026-11-17T00:00:00Z", { official: false }),
    n("http", "2026-11-17T00:00:00Z", { url: "http://x.dev/a" }),
    n("future", "2026-12-01T00:00:00Z"),
  ], NOW);
  assert.deepEqual(r.map((x) => x.id), ["b", "a"]);
});

test("소식판: 내가 쓰는 곳으로 거르기(대소문자 무시), 비우면 전부", () => {
  const items = [n("cc", "2026-11-17T00:00:00Z"), n("cur", "2026-11-16T00:00:00Z", { tools: ["Cursor"] })];
  assert.deepEqual(newsBoard(items, NOW, ["cursor"]).map((x) => x.id), ["cur"]);
  assert.equal(newsBoard(items, NOW).length, 2);
});

// ── 갤러리
const g = (id: string, name: string, grade: GalleryRow["grade"], extra: Partial<GalleryRow> = {}): GalleryRow => ({
  id, name, version: "1.0.0", grade, gradeReason: null, collectErrorKind: null, lastCheckedOkAt: null, projectName: "p", ...extra,
});

test("갤러리: 위험부터, 같은 등급은 이름순, 등급으로 거르기", () => {
  const rows = [g("1", "zod", "pass"), g("2", "mcp-remote", "danger"), g("3", "axios", "pass"), g("4", "x", "caution")];
  assert.deepEqual(galleryCards(rows).map((c) => c.name), ["mcp-remote", "x", "axios", "zod"]);
  assert.deepEqual(galleryCards(rows, ["pass"]).map((c) => c.gradeKo), ["통과", "통과"]);
});

test("갤러리: 수집 오류는 '통과'처럼 보이지 않게 따로 적는다(불변 2)", () => {
  const [c] = galleryCards([g("1", "a", "pass", { collectErrorKind: "network" })]);
  assert.match(c.note, /수집 오류/);
});
