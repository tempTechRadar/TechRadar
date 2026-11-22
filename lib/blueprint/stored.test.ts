import { test } from "node:test";
import assert from "node:assert/strict";
import { fromNames, putTech } from "./board.ts";
import { exportText } from "./export-text.ts";
import { parseBoard, readStored, toBoard, toStored, usageOf, type BlueprintRecord } from "./stored.ts";

const T1 = "11111111-1111-4111-8111-111111111111", T2 = "22222222-2222-4222-8222-222222222222";

test("확정 판 검사: 모양 · 개수 · 이름 · 기술 id를 다시 본다(화면 값을 믿지 않음)", () => {
  assert.deepEqual(parseBoard([[{ name: " 기획 ", techs: [{ id: T1 }, { id: T1 }] }]]), { ok: true, cols: [[{ name: "기획", techIds: [T1] }]] });
  assert.equal(parseBoard([]).ok, false);
  assert.equal(parseBoard("x").ok, false);
  assert.equal(parseBoard([[]]).ok, false);
  assert.equal(parseBoard([[{ name: "   " }]]).ok, false);
  assert.equal(parseBoard([[{ name: "a", techs: [{ id: "drop table" }] }]]).ok, false);
  assert.equal(parseBoard(Array.from({ length: 13 }, () => [{ name: "a" }])).ok, false);
  assert.equal(parseBoard([Array.from({ length: 5 }, () => ({ name: "a" }))]).ok, false);
});

test("DB에서 읽은 판: 모양이 틀리거나 기술 이름이 없으면 null(화면 전체가 깨지지 않게)", () => {
  assert.deepEqual(readStored([[{ name: "기획", techs: [{ id: T1, name: "zod" }] }]]), [[{ name: "기획", techs: [{ id: T1, name: "zod" }] }]]);
  assert.deepEqual(readStored([[{ name: "기획" }]]), [[{ name: "기획", techs: [] }]]);
  assert.equal(readStored([{ x: 1 }]), null);
  assert.equal(readStored([[{ name: "a", techs: [{ id: T1 }] }]]), null);
});

test("확정 판 ↔ 판: 단계 이름 · 기술이 그대로 오간다", () => {
  let b = fromNames([["기획"], ["개발", "디자인"]]);
  b = putTech(b, b[1][0].id, { id: T1, name: "zod" });
  const back = toBoard(toStored(b));
  assert.deepEqual(toStored(back), toStored(b));
});

test("내 이력: 기술별 쓴 횟수 · 프로젝트 수(프로젝트 없는 확정은 안 셈) · 단계", () => {
  const rec = (projectId: string | null, board: BlueprintRecord["board"]): BlueprintRecord => ({ id: "x", name: "n", projectId, projectName: null, createdAt: "", board });
  const u = usageOf([
    rec("p1", [[{ name: "개발", techs: [{ id: T1, name: "zod" }] }], [{ name: "테스트", techs: [{ id: T1, name: "zod" }, { id: T2, name: "vitest" }] }]]),
    rec(null, [[{ name: "개발", techs: [{ id: T1, name: "zod" }] }]]),
  ]);
  assert.deepEqual(u.get(T1), { n: 3, projects: 1, stages: ["개발", "테스트"] });
  assert.deepEqual(u.get(T2), { n: 1, projects: 1, stages: ["테스트"] });
});

test("내보내기: 프롬프트 · CLAUDE.md 표 · 메타프롬프트(같은 열 = 동시에, 표 칸 · 이름 속성이 깨지지 않게)", () => {
  let b = fromNames([["기획"], ["디자인", "백|엔드"]]);
  b = putTech(b, b[0][0].id, { id: T1, name: "notion" });
  assert.match(exportText("prompt", "x", b), /1\. 기획\(notion\)\n2\. 디자인 \+ 백\|엔드 — 동시에 진행/);
  assert.match(exportText("md", "x", b), /\| 2 \| 백\/엔드 \| - \|/);
  const meta = exportText("meta", 'a"><b', b);
  assert.match(meta, /<청사진 이름="ab">/);
  assert.match(meta, /끝났다고 볼 기준/);
});

test("이력의 graph 칸: v2 겉모양이면 그대로, 옛 확정본(null)·모양이 다르면 null(board로 연다)", async () => {
  const { readStoredGraph } = await import("./stored.ts");
  const g = { v: 2, stages: [{ id: "s1", name: "a", x: 0, y: 0, techs: [] }], edges: [] };
  assert.deepEqual(readStoredGraph(g), g);
  for (const bad of [null, undefined, { v: 1, stages: [], edges: [] }, { v: 2, stages: {} }, "x"]) assert.equal(readStoredGraph(bad), null);
});

test("내보내기에 단계 메모(T2): 프롬프트 · 메타는 번호 줄 아래 '메모:', 같은 순서 여럿이면 이름, CLAUDE.md는 메모 칸", () => {
  const b = fromNames([["기획"], ["디자인", "개발"]]);
  b[0][0].note = "인터뷰\n먼저";
  b[1][1].note = "타입 먼저";
  const p = exportText("prompt", "x", b);
  assert.match(p, /1\. 기획\n   메모: 인터뷰 먼저\n2\./);
  assert.match(p, /동시에 진행\n   메모\(개발\): 타입 먼저/);
  assert.match(exportText("meta", "x", b), /메모: 인터뷰 먼저/);
  const md = exportText("md", "x", b);
  assert.match(md, /\| 순서 \| 단계 \| 쓸 도구 \| 메모 \|/);
  assert.match(md, /\| 1 \| 기획 \| - \| 메모: 인터뷰 먼저 \|/);
  assert.match(md, /\| 2 \| 디자인 \| - \| - \|/);
});
