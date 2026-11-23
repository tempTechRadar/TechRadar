import { test } from "node:test";
import assert from "node:assert/strict";
import { COLS, defaultLayout, MIN_H, MIN_W, parseLayout, pushDown, reveal, snapBox, stackOrder, type Box } from "./board-layout.ts";

const IDS = ["repos", "radar", "add"];

test("기본 배치(K1): 왼쪽 진행 중 프로젝트 · 직접 추가, 오른쪽 지도 · 소식 · 청사진이 27줄 안, 서로 안 겹침, 기본 자리가 없는 판은 맨 아래", () => {
  const all = ["repos", "radar", "blueprint", "add"];
  const d = defaultLayout(all);
  assert.deepEqual(stackOrder(d), ["repos", "radar", "blueprint", "add"]);
  assert.deepEqual(pushDown(d, "repos"), d, "기본 배치는 겹침이 없어 밀 것이 없다");
  assert.ok(Math.max(...d.filter((b) => !b.hidden).map((b) => b.y + b.h)) <= 27, "1440×900 첫 화면");
  assert.ok(d.every((b) => b.x + b.w <= COLS));
  const extra = defaultLayout([...IDS, "zzz"]).find((b) => b.id === "zzz")!;
  assert.ok(extra.y >= 27);
});

test("링크로 온 빠진 판은 다시 걸고 겹치는 판을 밀어낸다, 걸려 있으면 그대로", () => {
  const d = parseLayout(JSON.stringify([{ id: "repos", x: 0, y: 0, w: 30, h: 20 }, { id: "add", x: 0, y: 21, w: 30, h: 6, hidden: true }]), ["repos", "add"]);
  const shown = reveal(d, "add");
  assert.equal(shown.find((b) => b.id === "add")!.hidden, undefined);
  assert.equal(reveal(shown, "add"), shown);
  assert.equal(reveal(d, "nope"), d);
  const over = reveal([{ id: "a", x: 0, y: 0, w: 10, h: 5 }, { id: "b", x: 0, y: 2, w: 10, h: 5, hidden: true }], "b");
  assert.equal(over.find((b) => b.id === "a")!.y, 7, "다시 건 판과 겹치던 판은 아래로");
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
  assert.equal(got.find((b) => b.id === "radar")!.y, 11, "빠진 위젯은 저장된 것 아래");
});

test("좁은 화면 차례: y → x, 뺀 위젯은 없음", () => {
  assert.deepEqual(stackOrder([{ id: "b", x: 20, y: 7, w: 9, h: 9 }, { id: "a", x: 0, y: 7, w: 9, h: 9 }, { id: "c", x: 0, y: 0, w: 9, h: 9, hidden: true }]), ["a", "b"]);
});
