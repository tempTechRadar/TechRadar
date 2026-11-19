import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// QA C6: 개발용 샘플(app/dev/flow-sample)의 ③ 중복 장면은 docs/flow.md 4절과 같아야 한다.
// 두 번째 실행은 "이미 있는 변경", 새 알림 0건이라 알림 상자는 초록(notify 성공).
// 알림 단계의 칸은 실제로 기록하는 곳(lib/server/alerts.ts의 recordStep)과 같은 모양이어야 한다.
const page = readFileSync("app/dev/flow-sample/page.tsx", "utf8");
const alerts = readFileSync("lib/server/alerts.ts", "utf8");
const duplicate = page.match(/const DUPLICATE: StepDetail\[\] = \[([\s\S]*?)\n\];/)?.[1] ?? "";
const notifyLine = duplicate.split("\n").find((line) => /step_name: "notify"/.test(line)) ?? "";

test("③ 중복 장면의 제목은 '새 변경 없음, 알림 0건'이고 '멈춤'이 아니다", () => {
  assert.match(page, /title: "③ 중복\(새 변경 없음, 알림 0건\)"/);
  assert.doesNotMatch(page, /변경 저장에서 멈춤/);
});

test("③ 중복 장면은 변경 저장 뒤 알림 단계를 성공·새 알림 0건으로 남긴다", () => {
  assert.ok(duplicate, "DUPLICATE 장면을 찾지 못함");
  assert.match(duplicate, /step_name: "save_change", status: "succeeded"[^\n]*이미 있는 변경/);
  assert.ok(notifyLine, "③ 장면에 notify 단계가 없음(알림 상자가 안 켜짐)");
  assert.match(notifyLine, /status: "succeeded"/);
  assert.match(notifyLine, /count_out: 0/);
  assert.ok(duplicate.indexOf('"save_change"') < duplicate.indexOf('"notify"'), "notify가 save_change보다 앞에 있음");
  assert.doesNotMatch(duplicate, /human_judgment/, "새 알림 0건이면 사람 판단은 켜지지 않는다");
});

test("③ 장면의 알림 요약 글은 실제 알림 함수가 쓰는 모양('알림 N건 만듦')과 같다", () => {
  assert.match(alerts, /outputSummary: `알림 \$\{created\}건 만듦`/, "실제 기록 모양이 바뀌면 샘플도 같이 고친다");
  assert.match(notifyLine, /output_summary: "알림 0건 만듦"/);
});
