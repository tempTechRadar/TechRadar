import { test } from "node:test";
import assert from "node:assert/strict";
import { RADAR_DEFAULT, RADAR_RANGE, readPrefs } from "./radar-prefs.ts";

test("레이더 ⚙ 값 읽기(P-12p): 없거나 깨진 값은 기본, 옛 키 \"off\"는 처음 연출 끄기, 그 밖 옛 값은 파동", () => {
  assert.deepEqual(readPrefs(null), RADAR_DEFAULT);
  assert.deepEqual(readPrefs("{깨짐"), RADAR_DEFAULT);
  assert.deepEqual(readPrefs("[1,2]"), RADAR_DEFAULT, "배열은 값이 아님");
  assert.deepEqual(readPrefs(null, "off"), { ...RADAR_DEFAULT, intro: "off" });
  for (const old of ["sweep", "both", "ripple"]) assert.equal(readPrefs(null, old).intro, "ripple", old);
  assert.equal(readPrefs(JSON.stringify({ intro: "ripple" }), "off").intro, "ripple", "새 키가 있으면 옛 키는 안 봄");
});

test("레이더 ⚙ 값 읽기: 범위 밖은 끝값으로, 모양이 틀린 칸은 그 칸만 기본", () => {
  const p = readPrefs(JSON.stringify({ intro: "both", idle: "yes", trail: 999, speed: -5, alpha: "0.5", width: 2 }));
  assert.equal(p.intro, "ripple");
  assert.equal(p.idle, RADAR_DEFAULT.idle);
  assert.equal(p.trail, RADAR_RANGE.trail[1]);
  assert.equal(p.speed, RADAR_RANGE.speed[0]);
  assert.equal(p.alpha, RADAR_DEFAULT.alpha);
  assert.equal(p.width, 2);
  assert.equal(readPrefs(JSON.stringify({ ...RADAR_DEFAULT, idle: false, intro: "off" })).idle, false);
});
