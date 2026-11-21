import { test } from "node:test";
import assert from "node:assert/strict";
import { buildKanban, groupCards, NO_TAG, type Card } from "./kanban.ts";

const names = (cards: { name: string }[]) => cards.map((c) => c.name);

test("쓰는 중 = 저장소에서 읽은 내 기술, 관심·적용 후보·보류 = 내 표시", () => {
  const k = buildKanban({
    mine: [{ id: "m1", techId: "t1", name: "zod", grade: "pass", projectName: "앱" }],
    marks: [
      { techId: "t2", name: "valibot", grade: "pass", status: "interest", reason: null, updatedAt: "2026-11-20" },
      { techId: "t3", name: "yup", grade: "caution", status: "hold", reason: "다음 달에 보기", updatedAt: "2026-11-20" },
    ],
    judged: [],
  });
  assert.deepEqual([names(k.using), names(k.interest), names(k.candidate), names(k.hold)], [["zod"], ["valibot"], [], ["yup"]]);
  assert.equal(k.hold[0].note, "다음 달에 보기");
});

test("표시와 알림 판단 중 더 최근 것: 표시가 새로우면 표시, 표시 뒤에 알림에서 판단하면 판단", () => {
  const k = buildKanban({
    mine: [],
    marks: [{ techId: "t1", name: "a", grade: "pass", status: "interest", reason: null, updatedAt: "2026-11-20" }],
    judged: [
      { techId: "t1", name: "a", grade: "pass", decision: "hold", reason: "옛 판단입니다", judgedAt: "2026-11-19" },
      { techId: "t2", name: "b", grade: "danger", decision: "hold", reason: "고친 버전 없음", judgedAt: "2026-11-18" },
      { techId: "t2", name: "b", grade: "danger", decision: "candidate", reason: null, judgedAt: "2026-11-19" },
    ],
  });
  assert.deepEqual([names(k.interest), names(k.candidate), names(k.hold)], [["a"], ["b"], []]);
  assert.equal(k.candidate[0].from, "alert");
  const later = buildKanban({
    mine: [],
    marks: [{ techId: "t1", name: "a", grade: "pass", status: "interest", reason: null, updatedAt: "2026-11-18T00:00:00Z" }],
    judged: [{ techId: "t1", name: "a", grade: "pass", decision: "hold", reason: "보안 경고 뒤 보류", judgedAt: "2026-11-20T00:00:00+00:00" }],
  });
  assert.deepEqual([names(later.interest), names(later.hold)], [[], ["a"]]);
});

test("내 기술이면서 표시도 있으면 두 칸에 한 번씩(쓰는 중 + 적용 후보), 칸 안은 이름순", () => {
  const k = buildKanban({
    mine: [{ id: "m2", techId: "t9", name: "b-tool", grade: "pass", projectName: "" }, { id: "m1", techId: "t1", name: "a-tool", grade: "pass", projectName: "" }],
    marks: [{ techId: "t1", name: "a-tool", grade: "pass", status: "candidate", reason: null, updatedAt: "2026-11-20" }],
    judged: [],
  });
  assert.deepEqual([names(k.using), names(k.candidate)], [["a-tool", "b-tool"], ["a-tool"]]);
});

test("칸 안 묶기: 갈래는 모르면 '아직 분류 안 됨', 내 태그는 여럿이면 묶음마다, 없음 묶음은 맨 뒤", () => {
  const card = (key: string, techId: string | null, field: string | null): Card => ({ key, techId, name: key, grade: "pass", note: null, from: "mark", myTechId: null, field });
  const cards = [card("a", "t1", "프론트엔드"), card("b", "t2", null), card("c", "t3", "검사·보안"), card("d", null, "프론트엔드")];
  const byField = groupCards(cards, "field", {});
  assert.deepEqual(byField.map((g) => [g.name, names(g.cards)]), [["검사·보안", ["c"]], ["프론트엔드", ["a", "d"]], ["아직 분류 안 됨", ["b"]]]);
  const byTag = groupCards(cards, "tag", { t1: ["시연", "가벼움"], t3: ["시연"] });
  assert.deepEqual(byTag.map((g) => [g.name, names(g.cards)]), [["가벼움", ["a"]], ["시연", ["a", "c"]], [NO_TAG, ["b", "d"]]]);
});
