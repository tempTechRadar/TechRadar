import { test } from "node:test";
import assert from "node:assert/strict";
import { checkedRatio, weeklyChanges } from "./board-stats.ts";

const NOW = new Date("2026-11-22T12:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

test("바뀐 것 추이: 7일씩 오래된 칸 먼저, 종류별 · 합계, 범위 밖 · 미래 · 모르는 종류 · 깨진 날짜는 안 셈", () => {
  const rows = weeklyChanges([
    { kind: "security", createdAt: ago(1) }, { kind: "opportunity", createdAt: ago(2) }, { kind: "model_eol", createdAt: ago(8) },
    { kind: "security", createdAt: ago(50) }, { kind: "security", createdAt: ago(-1) }, { kind: "other", createdAt: ago(1) }, { kind: "security", createdAt: "x" },
  ], NOW, 3);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.total), [0, 1, 2]);
  assert.deepEqual([rows[2].security, rows[2].opportunity, rows[1].model_eol], [1, 1, 1]);
  assert.ok(Date.parse(rows[0].from) < Date.parse(rows[2].from));
});

test("점검한 비율: 카탈로그 기술만 한 번씩(개념 · 이름만 빼고), 안 본 것은 이름순, 셀 것이 없으면 null", () => {
  const t = (techId: string | null, name: string, concept = false) => ({ techId, myTechId: `m-${name}`, name, concept });
  const r = checkedRatio([t("a", "Bee"), t("a", "Bee 다른 레포"), t("b", "Ant"), t("c", "Cat"), t(null, "내 것"), t("d", "작업 방식", true)], new Set(["a"]));
  assert.deepEqual([r.checked, r.total], [1, 3]);
  assert.equal(r.ratio, 1 / 3);
  assert.deepEqual(r.unchecked.map((u) => u.name), ["Ant", "Cat"]);
  assert.equal(checkedRatio([t(null, "내 것")], new Set()).ratio, null);
});
