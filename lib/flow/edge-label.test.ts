import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { edgeLabels } from "./counts.ts";
import { LABEL_H, hitsBox, labelWidth, placeLabel, pointAt } from "./edge-label.ts";
import { BOX, layoutFlow } from "./layout.ts";
import type { Flow, StepDetail } from "./types.ts";

const flow = JSON.parse(readFileSync("flow/flow.json", "utf8")) as Flow;
const layout = layoutFlow(flow);
// 실제로 나올 수 있는 가장 긴 꼬리표 쪽(갈래 이름 4글자 + 세 자리 수)
const LONGEST = ["변화 없음 120", "수집 오류 120", "실패 120", "1200건", "사건 120", "성공 120"];

test("모든 화살표에 가장 긴 꼬리표를 붙여도 어떤 상자와도 겹치지 않고 그림 안에 있다", () => {
  for (const text of LONGEST) {
    for (const e of layout.edges) {
      const r = placeLabel(e, text, layout);
      assert.deepEqual(hitsBox(r, layout), [], `${e.from}>${e.to} "${text}"`);
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= layout.width && r.y + r.h <= layout.height, `${e.from}>${e.to} 그림 밖`);
    }
  }
});

test("상자 사이 간격은 가장 긴 꼬리표와 여유(양쪽 3px)를 담는다", () => {
  for (const text of LONGEST) assert.ok(labelWidth(text) + 6 <= BOX.gapX, `${text} ${labelWidth(text)}px`);
});

test("자리가 비어 있으면 곡선 가운데에 둔다(화살표에서 멀어지지 않음)", () => {
  const e = layout.edges.find((x) => x.from === "normalize" && x.to === "compare")!;
  const r = placeLabel(e, "51건", layout);
  const mid = pointAt(e, 0.5);
  assert.equal(r.x + r.w / 2, mid.x);
  assert.equal(r.y + LABEL_H / 2, mid.y);
  assert.equal(mid.x, e.mx);
  assert.equal(mid.y, e.my);
});

test("꼬리표는 언제나 자기 화살표 곡선 위(또는 출발 상자 바로 옆 간격)에 있다", () => {
  for (const e of layout.edges) {
    const r = placeLabel(e, "변화 없음 120", layout);
    const cx = r.x + r.w / 2, cy = r.y + LABEL_H / 2;
    const onCurve = Array.from({ length: 101 }, (_, i) => pointAt(e, i / 100)).some((p) => Math.hypot(p.x - cx, p.y - cy) < 6);
    const besideStart = Math.abs(cx - (e.curve.sx + BOX.gapX / 2)) < 1e-9 && Math.abs(cy - e.curve.sy) < 1e-9;
    assert.ok(onCurve || besideStart, `${e.from}>${e.to}`);
  }
});

test("샘플 건수(⑥ 장면 모양)의 실제 꼬리표도 상자와 겹치지 않는다", () => {
  const steps: StepDetail[] = [
    { step_name: "fetch_osv", status: "failed", count_out: 11, branch_counts: { ok: 11, collect_error: 1 } },
    { step_name: "collect_error", status: "succeeded", count_in: 1 },
    { step_name: "normalize", status: "succeeded", count_out: 51 },
    { step_name: "compare", status: "succeeded", count_out: 12 },
    { step_name: "grade", status: "succeeded", count_out: 12 },
    { step_name: "is_event", status: "succeeded", branch_counts: { event: 3, no_change: 9, collect_error: 0 } },
    { step_name: "no_change", status: "succeeded" },
    { step_name: "save_change", status: "succeeded", count_out: 3 },
    { step_name: "notify", status: "succeeded", count_out: 4 },
    { step_name: "human_judgment", status: "awaiting_judgment" },
  ];
  const labels = edgeLabels(flow, steps);
  assert.ok(labels.size >= 5);
  for (const e of layout.edges) {
    const text = labels.get(`${e.from}>${e.to}`);
    if (text) assert.deepEqual(hitsBox(placeLabel(e, text, layout), layout), [], `${e.from}>${e.to} "${text}"`);
  }
});

test("흐름 샘플 ③ 중복 장면은 flow.md 4절대로: 변경 저장 '이미 있는 변경', 알림 단계 성공·새 알림 0건", () => {
  const page = readFileSync("app/dev/flow-sample/page.tsx", "utf8");
  const flowDoc = readFileSync("docs/flow.md", "utf8");
  assert.match(flowDoc, /\| 중복 \|[^\n]*알림 상자는 초록/);
  assert.doesNotMatch(page, /변경 저장에서 멈춤/);
  const dup = page.match(/const DUPLICATE: StepDetail\[\] = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  assert.match(dup, /step_name: "save_change", status: "succeeded"[^}]*이미 있는 변경/);
  assert.match(dup, /step_name: "notify", status: "succeeded"[^}]*count_out: 0/);
  assert.doesNotMatch(dup, /human_judgment/);
  assert.match(page, /title: "③ 중복[^"]*", run: \{[^}]*\}, steps: DUPLICATE/);
});
