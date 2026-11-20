import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTechMap } from "../map/build-map.ts";
import { NOW, tech } from "../map/test-fixtures.ts";
import { groupByField } from "./new-techs.ts";

test("새 기술: 많이 들어온 갈래 먼저, 분류 전은 맨 뒤, 갈래 안은 위험·주의 먼저", () => {
  const categories = [{ id: "a", name: "리서치", parentId: null }, { id: "b", name: "디자인", parentId: null }];
  const m = buildTechMap({ mine: [], relations: [], categories, techs: [
    tech("x", { categoryId: null }), tech("r1", { categoryId: "a" }), tech("r2", { categoryId: "a", grade: "danger" }), tech("d1", { categoryId: "b" }),
  ] }, NOW);
  assert.deepEqual(groupByField(m.nodes).map((g) => [g.field, g.nodes.map((n) => n.name)]), [["리서치", ["r2", "r1"]], ["디자인", ["d1"]], ["분류 전", ["x"]]]);
});
