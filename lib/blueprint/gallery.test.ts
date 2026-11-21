import { test } from "node:test";
import assert from "node:assert/strict";
import { arrangeGallery, galleryFields, parseSort } from "./gallery.ts";

const t = (id: string, uses: number, createdAt: string) => ({ id, uses, createdAt });
const list = [t("a", 1, "2026-11-20"), t("b", 3, "2026-11-19"), t("c", 1, "2026-11-21")];
const facets = new Map([["a", { fields: ["배포·운영"], helpful: 9 }], ["b", { fields: ["리서치"], helpful: 0 }], ["c", { fields: ["배포·운영", "리서치"], helpful: 2 }]]);

test("갤러리 정렬: 많이 쓴 순(같으면 새것 먼저), 도움 순(도움 합 → 쓴 수 → 새것)", () => {
  assert.deepEqual(arrangeGallery(list, facets, { field: null, sort: "uses" }).map((x) => x.id), ["b", "c", "a"]);
  assert.deepEqual(arrangeGallery(list, facets, { field: null, sort: "helpful" }).map((x) => x.id), ["a", "c", "b"]);
});

test("갤러리 거르기: 그 분야 기술이 든 것만, 분야 칩은 많은 순", () => {
  assert.deepEqual(arrangeGallery(list, facets, { field: "배포·운영", sort: "uses" }).map((x) => x.id), ["c", "a"]);
  assert.deepEqual(galleryFields(facets), [["리서치", 2], ["배포·운영", 2]]);
});

test("분야 · 도움을 못 읽으면(null) 거르지 않고 많이 쓴 순(모르는 것을 빼지 않음, 불변 2), 정렬 값은 둘 중 하나", () => {
  assert.deepEqual(arrangeGallery(list, null, { field: "배포·운영", sort: "helpful" }).map((x) => x.id), ["b", "c", "a"]);
  assert.equal(parseSort("helpful"), "helpful");
  assert.equal(parseSort("<script>"), "uses");
});
