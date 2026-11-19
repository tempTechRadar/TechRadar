import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryOptions } from "./category-options.ts";

test("큰 갈래마다 작은 갈래를 묶고, 이름순으로 둔다. 작은 갈래가 없는 큰 갈래는 뺀다", () => {
  const rows = [
    { id: "b2", name: "코드", parent_id: null },
    { id: "b1", name: "검색", parent_id: null },
    { id: "b3", name: "빈 갈래", parent_id: null },
    { id: "s2", name: "웹 검색", parent_id: "b1" },
    { id: "s1", name: "문서 검색", parent_id: "b1" },
    { id: "s3", name: "코드 리뷰", parent_id: "b2" },
  ];
  assert.deepEqual(categoryOptions(rows), [
    { big: "검색", smalls: [{ id: "s1", name: "문서 검색" }, { id: "s2", name: "웹 검색" }] },
    { big: "코드", smalls: [{ id: "s3", name: "코드 리뷰" }] },
  ]);
});

test("갈래가 하나도 없으면 빈 목록(화면은 '갈래 목록은 팀 결정' 안내)", () => {
  assert.deepEqual(categoryOptions([]), []);
});

test("부모가 목록에 없는 작은 갈래는 버린다(2단계가 아닌 줄)", () => {
  assert.deepEqual(categoryOptions([{ id: "s", name: "고아", parent_id: "없음" }]), []);
});
