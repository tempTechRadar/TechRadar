// Tutorial 시연 장면(guide-scenes.ts) · 레이더 그림(guide-radar.ts) 데이터가 단계 · 화면 그림 · 멀미 기준과 어긋나지 않는지.
// 장면이 가리키는 행동 번호는 그 단계 행동 수 안, 커서가 가는 곳 · 켜는 상태 이름은 그림(app/guide/mocks.tsx)에 실제로 있고, 쳐지는 글자는 실제 화면 글자여야 한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GRADES, MOCK_PLACEHOLDERS, MOCK_SOURCES } from "./guide-sections.ts";
import { MOVE_MS, SCENES, SCENE_W, TYPE_TAIL_MS, actionProgress, cursorFrom, easeInOut, endFrame, firstBeatOf, frameAt, moveMs, sceneMs, typedCount, type Scene } from "./guide-scenes.ts";
import { ALERT_KINDS, STEPS } from "./guide-steps.ts";
import { CAPTION_MS, COOL_MS, RADAR_CAPTION, RADAR_DOTS, RADAR_TOKENS, RING_MS, STILL_MS, SWEEP_MS, captionOn, dotXY, glow, ring, sincePass, sweepTurn } from "./guide-radar.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const raw = (file: string) => readFileSync(join(ROOT, file), "utf8");
const mocks = raw("app/guide/mocks.tsx");
/** 그림 속 단계별 조각: function Start({ … } 부터 다음 function 앞까지 */
const bodyOf = (id: string) => {
  const name = id[0].toUpperCase() + id.slice(1), at = mocks.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `mocks.tsx에 ${name} 그림이 없음`);
  const rest = mocks.slice(at + 10), end = rest.search(/\n(export )?(function|const) /);
  return rest.slice(0, end < 0 ? undefined : end);
};
const names = (src: string, re: RegExp) => new Set([...src.matchAll(re)].map((m) => m[1]));
const each = (fn: (id: string, s: Scene, actions: number) => void) => { for (const step of STEPS) fn(step.id, SCENES[step.id], step.actions.length); };

test("장면: 단계마다 하나, 행동 번호는 그 단계 행동 수 안이고 0부터 빠짐없이 차례로 나온다", () => {
  assert.deepEqual(Object.keys(SCENES).sort(), STEPS.map((s) => s.id).sort());
  each((id, s, actions) => {
    const seq = s.beats.map((b) => b.a);
    for (const a of seq) assert.ok(Number.isInteger(a) && a >= 0 && a < actions, `${id}: 행동 ${a}는 0~${actions - 1} 밖`);
    assert.deepEqual([...new Set(seq)], Array.from({ length: actions }, (_, k) => k), `${id}: 모든 행동이 차례로 한 번씩 시작해야 함`);
    assert.deepEqual(seq, [...seq].sort((x, y) => x - y), `${id}: 행동이 뒤로 돌아감`);
    for (let a = 0; a < actions; a++) assert.ok(firstBeatOf(s, a) >= 0, `${id}: 행동 ${a}에 박자가 없음`);
  });
});

test("장면: 커서가 가는 곳 · 글자 칸 · 상태 이름이 그 단계 그림에 있고, 그림이 쓰는 상태는 모두 박자가 켠다", () => {
  each((id, s) => {
    const src = bodyOf(id);
    const targets = new Set([...names(src, /\bt="(\w+)"/g), ...names(src, /tgt\([^)]*"(\w+)"\)/g)]);
    const shown = new Set([...names(src, /\bon="(\w+)"/g), ...names(src, /v\.on\("(\w+)"\)/g)]);
    const set = new Set(s.beats.flatMap((b) => [...(b.on ?? []), ...(b.off ?? [])]));
    for (const b of s.beats) {
      if (b.to) assert.ok(targets.has(b.to), `${id}: 커서가 갈 곳 "${b.to}"가 그림에 없음`);
      if (b.type) assert.ok(targets.has(b.type.at), `${id}: 글자 칸 "${b.type.at}"가 그림에 없음`);
      if (b.carry) assert.ok(b.to, `${id}: 끌고 가는 박자에 갈 곳이 없음`);
      for (const f of b.off ?? []) assert.ok(s.beats.slice(0, s.beats.indexOf(b)).some((p) => p.on?.includes(f)), `${id}: "${f}"를 켜기 전에 끔`);
    }
    assert.deepEqual([...set].filter((f) => !shown.has(f)), [], `${id}: 그림이 쓰지 않는 상태`);
    assert.deepEqual([...shown].filter((f) => !set.has(f)), [], `${id}: 박자가 켜지 않는 상태(늘 숨겨진 조각)`);
    assert.deepEqual([...targets].filter((t) => !s.beats.some((b) => b.to === t || b.type?.at === t)), [], `${id}: 커서가 가지 않는 자리 이름`);
  });
});

test("장면: 쳐지는 글자는 실제 화면 글자이거나 자리 글자 목록에 있다", () => {
  const strip = (file: string, text: string) => (file.endsWith(".md") ? text : text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1"));
  const real = MOCK_SOURCES.map((f) => strip(f, raw(f))).join("\n");
  const typed = Object.values(SCENES).flatMap((s) => s.beats.flatMap((b) => (b.type ? [b.type.text] : [])));
  assert.ok(typed.length >= 2);
  assert.deepEqual(typed.filter((t) => !MOCK_PLACEHOLDERS.includes(t) && !real.includes(t)), []);
});

test("장면: 길이 · 속도가 멀미 기준 안(커서 이동 600~900ms, 박자마다 읽을 틈, 장면 5~12초, 여섯 장면 합 60초 안)", () => {
  each((id, s) => {
    assert.ok(s.h >= 240 && s.h <= 420, `${id}: 설계 높이 ${s.h}`);
    s.beats.forEach((b, i) => {
      const mv = moveMs(b), same = b.to !== undefined && cursorFrom(s, i) === b.to;
      if (b.to && !same) assert.ok(mv >= 600 && mv <= 900, `${id} ${i}: 커서 이동 ${mv}ms`);
      if (same) assert.equal(mv, 0, `${id} ${i}: 같은 자리로는 움직이지 않는다`);
      assert.ok(b.ms - mv >= 600, `${id} ${i}: 도착 뒤 읽을 틈이 ${b.ms - mv}ms뿐`);
      assert.ok(b.ms <= 3000, `${id} ${i}: 박자가 ${b.ms}ms로 김(지루함)`);
      if (b.type) {
        const cps = [...b.type.text].length / ((b.ms - mv - TYPE_TAIL_MS) / 1000);
        assert.ok(cps >= 3 && cps <= 24, `${id} ${i}: 글자 치는 속도 ${cps.toFixed(1)}자/초`);
      }
    });
    assert.ok(sceneMs(s) >= 5000 && sceneMs(s) <= 12000, `${id}: 장면 ${sceneMs(s)}ms`);
  });
  const all = Object.values(SCENES).reduce((sum, s) => sum + sceneMs(s), 0);
  assert.ok(all <= 60_000, `여섯 장면 합 ${all}ms`);
  assert.ok(MOVE_MS >= 600 && MOVE_MS <= 900 && SCENE_W === 440);
});

test("장면: 그림 계산 — 처음엔 아무것도 안 켜지고, 도착해야 켜지고, 끝 프레임은 다 켜진 정지 그림", () => {
  const s = SCENES.protect;
  assert.deepEqual(frameAt(s, 0, 0), { flags: [], typed: {}, action: 0 });
  assert.equal(frameAt(s, 0, moveMs(s.beats[0]) - 1).typed.url, undefined); // 도착 전에는 칸이 비어 있다(자리 글)
  assert.equal(frameAt(s, 0, moveMs(s.beats[0])).typed.url, "");
  assert.equal(frameAt(s, 0, s.beats[0].ms).typed.url, "https://github.com/owner/repo");
  assert.deepEqual(frameAt(s, 1, moveMs(s.beats[1]) - 1).flags, []);
  assert.deepEqual(frameAt(s, 1, moveMs(s.beats[1])).flags, ["reading"]);
  assert.deepEqual(frameAt(s, 2, 0).flags, ["check"]); // 읽는 중은 꺼지고 첫 점검이 켜진다
  const end = endFrame(s);
  assert.deepEqual(end.flags, ["band", "check", "detail"]);
  assert.equal(end.typed.url, "https://github.com/owner/repo");
  assert.equal(end.action, 3);
  assert.deepEqual(frameAt(s, 99, 0), end);
  // 행동 3부터 다시 보면 앞 행동의 결과는 이미 켜져 있다(건너뛰어도 같은 그림)
  assert.deepEqual(frameAt(s, firstBeatOf(s, 2), 0).typed, { url: "https://github.com/owner/repo" });
  each((id, sc) => { const on = new Set(sc.beats.flatMap((b) => b.on ?? [])), off = new Set(sc.beats.flatMap((b) => b.off ?? [])); assert.deepEqual(endFrame(sc).flags, [...on].filter((f) => !off.has(f)).sort(), id); });
});

test("장면: 글자 수 · 커서 출발 자리 · 진행 막대 · 부드러운 이동", () => {
  const b = SCENES.start.beats[2];
  assert.equal(typedCount(b, 0), 0);
  assert.equal(typedCount(b, b.ms), 4); // "내 별명" = 빈칸까지 4자
  assert.equal(typedCount(SCENES.start.beats[0], 500), 0);
  for (let t = 0, last = 0; t <= b.ms; t += 50) { const n = typedCount(b, t); assert.ok(n >= last); last = n; }
  assert.equal(cursorFrom(SCENES.start, 0), null);
  assert.equal(cursorFrom(SCENES.start, 1), "login");
  assert.equal(cursorFrom(SCENES.protect, 4), "reg"); // 커서 없는 박자는 건너뛰고 마지막으로 있던 자리
  const s = SCENES.protect;
  assert.equal(actionProgress(s, 2, 0), 0);
  assert.equal(actionProgress(s, 3, 0), s.beats[2].ms / (s.beats[2].ms + s.beats[3].ms));
  assert.equal(actionProgress(s, 3, s.beats[3].ms), 1);
  assert.equal(actionProgress(s, s.beats.length, 0), 1);
  assert.equal(easeInOut(0), 0); assert.equal(easeInOut(1), 1); assert.equal(easeInOut(0.5), 0.5); assert.equal(easeInOut(2), 1);
});

test("레이더: 한 바퀴 12초 이상, 점 색은 등급 토큰 순서, 위험은 적고, 점은 원 안", () => {
  assert.ok(SWEEP_MS >= 12_000);
  assert.deepEqual(RADAR_TOKENS, GRADES.map((g) => g.token));
  assert.deepEqual(RADAR_TOKENS, ["--danger", "--caution", "--pass", "--unknown"]);
  const danger = RADAR_DOTS.filter((d) => d.grade === 0).length;
  assert.ok(danger >= 1 && danger <= 2 && RADAR_DOTS.length >= 10 && RADAR_DOTS.length <= 20);
  for (const g of [0, 1, 2, 3]) assert.ok(RADAR_DOTS.some((d) => d.grade === g), `등급 ${g} 점이 없음`);
  for (const d of RADAR_DOTS) {
    assert.ok(d.turn >= 0 && d.turn < 1 && d.r > 0.2 && d.r <= 0.92);
    const [x, y] = dotXY(d, 100, 100, 100);
    assert.ok(Math.hypot(x - 100, y - 100) <= 92.001);
  }
  assert.deepEqual(dotXY({ turn: 0, r: 1 }, 0, 0, 10).map((v) => Math.round(v)), [0, -10]); // 0 = 위
  assert.deepEqual(dotXY({ turn: 0.25, r: 1 }, 0, 0, 10).map((v) => Math.round(v)), [10, 0]); // 시계 방향
});

test("레이더: 선이 지나간 점만 밝아졌다 식고, 위험 점에서만 고리 · 캡션", () => {
  const dot = RADAR_DOTS.find((d) => d.grade === 0)!, pass = dot.turn * SWEEP_MS;
  assert.equal(sweepTurn(0), 0); assert.equal(sweepTurn(SWEEP_MS * 2.5), 0.5);
  assert.equal(sincePass(dot, pass - 1), Infinity); // 첫 바퀴에서 아직 안 지남
  assert.equal(sincePass(dot, pass + 100), 100);
  assert.ok(Math.abs(sincePass(dot, pass + SWEEP_MS + 100) - 100) < 1e-6);
  assert.equal(glow(dot, pass - 1), 0.28);
  assert.equal(glow(dot, pass), 1);
  assert.ok(glow(dot, pass + COOL_MS / 2) < glow(dot, pass + 10) && glow(dot, pass + COOL_MS / 2) > 0.28);
  assert.equal(glow(dot, pass + COOL_MS), 0.28);
  assert.equal(ring(dot, pass - 1), -1);
  assert.equal(ring(dot, pass + RING_MS / 2), 0.5);
  assert.equal(ring(dot, pass + RING_MS), -1);
  const safe = RADAR_DOTS.find((d) => d.grade === 2)!;
  assert.equal(ring(safe, safe.turn * SWEEP_MS + 10), -1);
  assert.equal(captionOn(pass + 10), true);
  assert.equal(captionOn(pass + CAPTION_MS - 1), true);
  assert.equal(captionOn(pass - 1), false);
  assert.equal(captionOn(STILL_MS), true); // 정지 한 장은 캡션이 뜬 순간
  assert.ok(COOL_MS < SWEEP_MS && CAPTION_MS < SWEEP_MS / 2);
});

test("레이더: 한 줄 캡션은 알림 \"보안 경고\"와 그 조건의 첫 문장 그대로", () => {
  assert.equal(RADAR_CAPTION.tag, ALERT_KINDS[0].name);
  assert.ok(ALERT_KINDS[0].when.startsWith(RADAR_CAPTION.text) && RADAR_CAPTION.text.endsWith("."));
  assert.equal(RADAR_CAPTION.text, "내 레포가 쓰는 패키지의 보안 등급이 위험으로 바뀌었어요.");
});
