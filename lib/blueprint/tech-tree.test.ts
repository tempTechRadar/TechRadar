import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTechTree, secondDims, type TreeItem } from "./tech-tree.ts";

const it = (id: string, o: Partial<TreeItem> = {}): TreeItem => ({ id, judgment: "other", field: null, sub: null, tags: [], projectNames: [], ...o });
const names = (fs: { name: string; count: number }[]) => fs.map((f) => `${f.name} ${f.count}`);

test("내 판단 폴더는 적용 후보 → 관심 → 보류 → 내 기술 → 그 외 순서 고정, 빈 폴더는 없음", () => {
  const items = [it("a", { judgment: "mine" }), it("b", { judgment: "other" }), it("c", { judgment: "candidate" }), it("d", { judgment: "mine" })];
  assert.deepEqual(names(buildTechTree(items, ["judgment"])), ["적용 후보 1", "내 기술 2", "그 외 1"]);
});

test("2단 묶기: 1단 폴더 안에 2단 폴더, 폴더 안 차례는 넘겨받은 그대로, 2단이 1단과 같으면 무시", () => {
  const items = [it("a", { judgment: "candidate", field: "프론트엔드" }), it("b", { judgment: "candidate", field: "검사·보안" }), it("c", { judgment: "mine", field: "프론트엔드" })];
  const tree = buildTechTree(items, ["judgment", "field"]);
  assert.deepEqual(names(tree[0].children), ["검사·보안 1", "프론트엔드 1"]);
  assert.equal(tree[0].children[1].key, "적용 후보/프론트엔드");
  assert.deepEqual(tree[0].items.map((x) => x.id), ["a", "b"]);
  assert.deepEqual(buildTechTree(items, ["field", "field"])[0].children, []);
});

test("내 태그 · 프로젝트가 여럿이면 그 폴더마다 한 번씩, 없으면 '태그 없음' · '프로젝트 없음'이 맨 뒤", () => {
  const items = [it("a", { tags: ["시연", "가벼움"] }), it("b", { tags: ["시연"] }), it("c"), it("d", { projectNames: ["앱", "웹"] })];
  assert.deepEqual(names(buildTechTree(items, ["tag"])), ["가벼움 1", "시연 2", "태그 없음 2"]);
  assert.deepEqual(names(buildTechTree(items, ["project"])), ["앱 1", "웹 1", "프로젝트 없음 3"]);
});

test("하는 일 · 세부 갈래를 모르면 '아직 분류 안 됨'(맨 뒤), 2단 기준 목록은 1단을 뺀 것", () => {
  const items = [it("a", { field: "디자인", sub: "디자인 도구" }), it("b")];
  assert.deepEqual(names(buildTechTree(items, ["sub"])), ["디자인 도구 1", "아직 분류 안 됨 1"]);
  assert.deepEqual(secondDims("tag"), ["judgment", "field", "sub", "project"]);
});
