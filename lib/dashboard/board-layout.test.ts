import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, MIN_H, MIN_W, parseLayout, pushDown, snapBox, stackOrder, type Box } from "./board-layout.ts";

const IDS = ["numbers", "inbox", "repos"];

test("기본 배치는 발표 순서(숫자 → 레포 · 판단함 → 바뀐 것 · 옮기기 · 점검 → 소식 · 뜨는 대안 · 기록), 서로 안 겹침, 기본 자리가 없는 위젯은 맨 아래", () => {
  const all = ["numbers", "inbox", "repos", "changes", "move", "checked", "news", "trending", "history"];
  const d = defaultLayout(all);
  assert.deepEqual(stackOrder(d), ["numbers", "repos", "inbox", "changes", "move", "checked", "news", "trending", "history"]);
  assert.deepEqual(pushDown(d, "numbers"), d, "기본 배치는 겹침이 없어 밀 것이 없다");
  const extra = defaultLayout([...IDS, "zzz"]).find((b) => b.id === "zzz")!;
  assert.ok(extra.y >= 31);
});

test("칸 맞추기: 반올림 · 최소 크기 · 음수 막기 · 숫자가 아니면 최소", () => {
  assert.deepEqual(snapBox({ id: "a", x: 2.6, y: -3, w: 1, h: Number.NaN }), { id: "a", x: 3, y: 0, w: MIN_W, h: MIN_H });
});

test("겹침 밀어내기: 옮긴 위젯과 겹치는 것은 그 아래로, 밀린 것끼리도 겹치지 않게", () => {
  const boxes: Box[] = [{ id: "a", x: 0, y: 0, w: 10, h: 5 }, { id: "b", x: 0, y: 6, w: 10, h: 5 }, { id: "c", x: 0, y: 12, w: 10, h: 5 }];
  const moved = pushDown([{ ...boxes[0], y: 4 }, boxes[1], boxes[2]], "a");
  const y = Object.fromEntries(moved.map((b) => [b.id, b.y]));
  assert.deepEqual(y, { a: 4, b: 9, c: 14 });
  assert.equal(pushDown(boxes, "a")[1].y, 6, "안 겹치면 그대로");
});

test("저장된 배치 읽기: 깨진 글 · 모양 다름 → 기본, 모르는 위젯은 버림, 빠진 위젯은 아래에 더함, 뺀 표시는 지킴", () => {
  assert.deepEqual(parseLayout("{깨짐", IDS), defaultLayout(IDS));
  assert.deepEqual(parseLayout('{"a":1}', IDS), defaultLayout(IDS));
  const got = parseLayout(JSON.stringify([{ id: "repos", x: 0, y: 0, w: 20, h: 10, hidden: true }, { id: "nope", x: 0, y: 0, w: 9, h: 9 }]), IDS);
  assert.deepEqual(got.map((b) => b.id), IDS);
  assert.equal(got.find((b) => b.id === "repos")!.hidden, true);
  assert.equal(got.find((b) => b.id === "numbers")!.y, 11, "빠진 위젯은 저장된 것 아래");
});

test("좁은 화면 차례: y → x, 뺀 위젯은 없음", () => {
  assert.deepEqual(stackOrder([{ id: "b", x: 20, y: 7, w: 9, h: 9 }, { id: "a", x: 0, y: 7, w: 9, h: 9 }, { id: "c", x: 0, y: 0, w: 9, h: 9, hidden: true }]), ["a", "b"]);
});
