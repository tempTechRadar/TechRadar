import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogToPool } from "./catalog-pool.ts";
import type { CatalogTech } from "../map/build-map.ts";

const tech = (id: string, categoryId: string | null, over: Partial<CatalogTech> = {}): CatalogTech => ({
  id, techKey: `npm:${id}`, name: id, type: "mcp", hosts: null, categoryId, createdAt: null, grade: "pass", gradeReason: null, oneLiner: null, repoUrl: null,
  lastActivityAt: null, lastActivityKind: null, lastCheckedOkAt: null, collectErrorKind: null, signals: null, ...over,
});
const cats = [{ id: "be", name: "백엔드·데이터", parentId: null }, { id: "db", name: "DB", parentId: "be" }];

test("지도 전체 → 서랍 카드: 하는 일 · 세부 갈래를 이름으로, 분류 안 됨은 null, 내 서랍에 있는 기술은 빼고, 수집 오류 표시", () => {
  const out = catalogToPool([tech("a", "db"), tech("b", "be", { collectErrorKind: "timeout" }), tech("c", null), tech("mine", "db")], cats, ["mine"]);
  assert.deepEqual(out.map((t) => [t.id, t.field, t.sub, t.collectError]), [["a", "백엔드·데이터", "DB", false], ["b", "백엔드·데이터", null, true], ["c", null, null, false]]);
  assert.ok(out.every((t) => t.projects === 0 && t.mark === null), "프로젝트 · 담기는 없음(지도 공개 목록이라)");
});
