import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTechTree, judgeTechs, pathTo, secondDims, type TreeItem } from "./tech-tree.ts";

const it = (id: string, o: Partial<TreeItem> = {}): TreeItem => ({ id, judgment: "other", field: null, sub: null, tags: [], projectNames: [], ...o });
const names = (fs: { name: string; count: number }[]) => fs.map((f) => `${f.name} ${f.count}`);

test("내 판단 폴더는 담은 기술(적용 후보) → ★ 관심 → 보류 → 내 기술 → 그 외 순서 고정, 빈 폴더는 없음", () => {
  const items = [it("a", { judgment: "mine" }), it("b", { judgment: "other" }), it("c", { judgment: "candidate" }), it("d", { judgment: "mine" })];
  assert.deepEqual(names(buildTechTree(items, ["judgment"])), ["담은 기술 1", "사용 중 2", "그 외 1"]);
});

test("2단 묶기: 1단 폴더 안에 2단 폴더, 폴더 안 차례는 넘겨받은 그대로, 2단이 1단과 같으면 무시", () => {
  const items = [it("a", { judgment: "candidate", field: "프론트엔드" }), it("b", { judgment: "candidate", field: "검사·보안" }), it("c", { judgment: "mine", field: "프론트엔드" })];
  const tree = buildTechTree(items, ["judgment", "field"]);
  assert.deepEqual(names(tree[0].children), ["검사·보안 1", "프론트엔드 1"]);
  assert.deepEqual(tree[0].children[1].path, ["담은 기술", "프론트엔드"]);
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

test("폴더 key는 이름에 '/'가 있어도 겹치지 않고, pathTo는 기술이 든 폴더를 위에서부터", () => {
  const items = [it("a", { tags: ["CI/CD"] }), it("b", { tags: ["CI"], field: "CD" })];
  const keys = buildTechTree(items, ["tag", "field"]).flatMap((f) => [f.key, ...f.children.map((c) => c.key)]);
  assert.equal(new Set(keys).size, keys.length);
  const tree = buildTechTree(items, ["tag", "field"]);
  assert.deepEqual(pathTo(tree, "b"), [tree[0].key, tree[0].children[0].key]);
  assert.deepEqual(pathTo(tree, "없는 것"), []);
});

test("판단: 관심 · 보류가 서랍의 내 기술 · 그 외보다 앞서고 이유를 지님, 넣을 수 있는지는 서랍에 있는지로만(불변 1)", () => {
  const t = (id: string, o: { mark?: "candidate" | null; projects?: number; note?: string | null } = {}) => ({ id, mark: o.mark ?? null, projects: o.projects ?? 0, note: o.note });
  const got = judgeTechs({
    pool: [t("c", { mark: "candidate" }), t("h"), t("m", { projects: 2 })],
    interest: [t("i", { note: "써 보고 싶음" }), t("c")],
    hold: [t("h", { note: "아직 이름" })],
    found: [t("i"), t("f"), t("m")],
    guest: false,
  });
  const by = new Map(got.map((x) => [x.id, x]));
  assert.deepEqual(got.map((x) => `${x.id}:${x.judgment}:${x.droppable}`), ["c:candidate:true", "i:interest:false", "h:hold:true", "m:mine:true", "f:other:false"]);
  assert.equal(by.get("h")?.note, "아직 이름");
  assert.equal(by.get("i")?.note, "써 보고 싶음");
  assert.equal(judgeTechs({ pool: [], interest: [], hold: [], found: [t("f")], guest: true })[0].droppable, true);
});
