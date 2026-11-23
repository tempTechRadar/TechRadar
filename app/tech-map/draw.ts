// 캔버스 그리기(시안 docs/wireframes/radar-draw.js). 색은 tokens.css 값을 읽어 쓴다(테마를 바꾸면 같이 바뀜). 크기·모양 = 단계, 색 = 색 기준 값,
// 보안은 점 색 + 이름 뒤 꼬리표로(위험 = 빨간 원 + "✕ 위험", 주의 = 노란 원 + "! 주의", 찾지 못함 = 점선 테두리, P-12m), 수집 오류 = 바깥 점선 고리, NEW 표. 인기·오래됨·업데이트는 지도에 그리지 않는다.
import { FIRST_RING, isUnder, LEVEL_GAP, type Item, type TechItem } from "@/lib/map/layout";
import { DIM_KO, groupOf } from "@/lib/map/view-config";
import { describeKo } from "@/lib/map/describe";
import type { MapState } from "./controller";
import { ease, grow, introducing, LAND_SEC, litAge, LOCK, LOCK_AFTER, moving, PING, placeTags, recentlyChecked, type Box, ringGrow, rippleR, sweepAlpha, sweepAngle, trackTargets, WAVES } from "@/lib/map/motion";

const TAU = Math.PI * 2;
/** 점 왼쪽 아래 판단 꼬리표(P-12g map-5): 칸반의 "적용 후보"보다 짧게 */
const MARK_TAG = { interest: "관심", candidate: "담은 기술", hold: "보류" } as const;
/** 등급 표시(P-12m 시안, 11-23 사용자): 점은 등급색으로 칠하고 이름 뒤에 꼬리표. 글자로도 말해 색에만 기대지 않는다 */
const GRADE_FILL: Partial<Record<string, string>> = { danger: "--danger", caution: "--caution" };
const GRADE_TAG: Partial<Record<string, string>> = { danger: "✕ 위험", caution: "! 주의" };
// 토큰 값은 한 장 그리는 동안만 기억한다(테마가 바뀌면 다음 장부터 새 색, 첫 장에 비어 있던 값이 굳지 않게)
let css: Record<string, string> = {};
const col = (token: string) => css[token] ?? (css[token] = getComputedStyle(document.documentElement).getPropertyValue(token).trim() || "#888");
/** 토큰 #rrggbb에 투명도(그라디언트 멈춤 색용) */
const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
type Ctx = CanvasRenderingContext2D;
type Pt = readonly [number, number];
/** 한 장 그리는 데 함께 쓰는 것(함수 인자를 줄이려고 묶음) */
type Frame = { c: Ctx; S: MapState; vis: Item[]; P: (it: Item) => Pt; alphaOf: (it: Item) => number; sc: number; now: number; /** 처음 보기 대비 배율(1 = 처음 보기) */ z: number;
  /** 이번 주 새 기술 추적 틀 대상(최근 순) · 이 장에 놓인 이름표 · 꼬리표 상자(추적 꼬리표가 피해 감) */ track: TechItem[]; boxes: Box[] };

const bumpOf = (age: number) => (age >= 0 && age < 0.3 ? Math.sin((Math.PI * age) / 0.3) : 0); // 0 → 1 → 0, 0.3초
export const hubRadius = (it: Item, sc: number) => it.r * Math.min(1.4, Math.max(0.7, sc ** 0.5));
export const dotRadius = (it: Item, sc: number) => Math.max(2.4, it.r * sc ** 0.6);
/** 배율 단계(네이버 지도처럼 가까이 갈수록 자세히, 11-21 사용자). z = 처음 보기 대비 배율(화면 크기 · 접힘과 상관없이 같은 느낌).
 *  멀리(far 아래) 1단계 묶음과 수 · 처음 보기 2단계 이름과 점 · 가까이(names~) 모든 기술 이름 · 아주 가까이(detail~) 한국어 한 줄과 인기 · 보안 */
const TIER = { far: 0.75, level2: 1.3, names: 1.8, detail: 3.5 }; // level2: 2단계 묶음 이름은 조금 확대해야(P-12n 잡음 줄이기)
/** at 앞뒤 20%에서 0 → 1로 스며든다(단계가 툭 바뀌지 않게) */
const ramp = (k: number, at: number) => Math.max(0, Math.min(1, (k - at * 0.8) / (at * 0.4)));

function hubPath(c: Ctx, x: number, y: number, r: number, level: number) {
  c.beginPath();
  if (level === 1) for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * TAU) / 6; if (i) c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  else if (level === 2) { c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); }
  else c.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
  c.closePath();
}
function badge(c: Ctx, x: number, y: number, ch: string, color: string) {
  c.fillStyle = col("--surface"); c.beginPath(); c.arc(x, y, 7.5, 0, TAU); c.fill(); // 등급 배지는 판 위에(P-12m: 점 · 선과 겹쳐도 읽히게)
  c.fillStyle = color; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.fill();
  c.fillStyle = col("--on-ink"); c.font = `800 9px ${col("--font")}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(ch, x, y + 0.5);
}
function label(c: Ctx, text: string, x: number, y: number, fs: number, color: string, align: CanvasTextAlign = "left", weight = 400) {
  c.font = `${weight} ${fs}px ${col("--font")}`; c.textAlign = align; c.textBaseline = "middle";
  c.lineJoin = "round"; c.strokeStyle = col("--paper"); c.lineWidth = 4; c.strokeText(text, x, y); // P-12m: 밝은 글자 둘레를 바탕색으로 끊어 밑의 선이 글자를 지나지 않게
  c.fillStyle = color; c.fillText(text, x, y);
}

export function draw(c: Ctx, S: MapState, now: number) {
  css = {};
  const { W, H, L, phys } = S, sc = S.scale(), toS = (x: number, y: number): Pt => [W / 2 + (x - S.cam.x) * sc, H / 2 + (y - S.cam.y) * sc];
  const home = (it: Item): Pt => { const b = phys.B.get(it.id); return b ? toS(b.x, b.y) : toS(it.x, it.y); };
  c.fillStyle = col("--paper"); c.fillRect(0, 0, W, H);
  const [ox, oy] = toS(0, 0);
  // 펼침(11-21 사용자: 가운데서 튀어나오기보다 레이더가 지나간 자리에서 떠오르게): 자리는 그대로, 크기 · 진하기만 grow로(drawTechs · drawHubs)
  const P = home;
  const vis = L.items.filter((it) => !S.hidden.has(it.id));
  const alphaOf = (it: Item) => Math.min(1, grow(S, now, it) * 1.6) * (S.lit && !S.lit.has(it.id) ? 0.16 : 1) * (S.leaving.has(it.id) ? Math.max(0, (S.leaving.get(it.id)! - now) / 0.35) : 1);
  const F: Frame = { c, S, vis, P, alphaOf, sc, now, z: S.cam.k / S.homeK, track: trackTargets(vis.filter((v): v is TechItem => v.type === "t")), boxes: [] };
  endless(F, [ox, oy]);

  sectorLight(F, [ox, oy]);
  rings(F, [ox, oy]);
  const sa = sweepAlpha(S, now);
  if (moving(S) && S.motion !== "sweep") ripples(F, [ox, oy]);
  if (sa > 0.01) sweep(F, [ox, oy], sa);

  // 선: 위아래 단계(가운데 → 1단계 → … → 기술). 비교군 선은 지도에 없음(P-12m, 사이드 패널에서만)
  for (const it of vis) {
    const [x, y] = P(it), parent = it.parent ? L.byId.get(it.parent) : null, [px, py] = parent ? P(parent) : [ox, oy];
    const on = !!S.lit && S.lit.has(it.id) && (!it.parent || S.lit.has(it.parent));
    c.globalAlpha = alphaOf(it) * (on ? 1 : S.lit ? 0.6 : it.type === "t" ? 0.45 : 0.8);
    c.strokeStyle = col("--on-paper"); c.lineWidth = on ? 1.6 : 1;
    c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke();
  }
  c.globalAlpha = 1;

  c.fillStyle = col("--on-paper"); c.beginPath(); c.arc(ox, oy, 4, 0, TAU); c.fill();
  label(c, S.scopeLabel || (S.login ? "나" : `모은 기술 ${L.total}`), ox, oy + 18, 12, col("--on-paper-2"), "center", S.scopeLabel ? 700 : 400);

  drawTechs(F);
  drawHubs(F);
  pingRing(F);
  leafLabels(F);
  trackFrames(F);
  ringLabels(F, [ox, oy]);
  S.riskRects = introducing(S, now) ? [] : offscreenRisks(F); // 처음 연출(확대 중) 동안은 화면 밖 위험 표시 · 누르기 없음(시안처럼)
  S.homeArrow = homeArrow(F, [ox, oy]);
}

/** 고리 + 윗변 가운데 이름(11-21 사용자): 안쪽부터 "1단계 · 하는 일" …, 맨 바깥 "기술" */
function rings(F: Frame, [ox, oy]: Pt) {
  const { c, S, sc } = F;
  const group = groupOf(S.view), rs = [...group.map((_, l) => FIRST_RING + l * LEVEL_GAP), S.L.leafR];
  c.strokeStyle = col("--on-paper"); c.lineWidth = 1;
  rs.forEach((r, k) => { // 처음 열 때 안쪽부터 차례로 퍼져 나온다
    const g = ringGrow(S, F.now, k + 1); if (g <= 0) return;
    c.globalAlpha = 0.6 * g; c.beginPath(); c.arc(ox, oy, r * sc * g, 0, TAU); c.stroke();
  });
  c.globalAlpha = 1;
}
/** 고리 이름은 맨 마지막에(묶음 모양이 윗변을 가려도 읽히게) */
function ringLabels(F: Frame, [ox, oy]: Pt) {
  const { c, S, sc } = F;
  const group = groupOf(S.view), rs = [...group.map((_, l) => FIRST_RING + l * LEVEL_GAP), S.L.leafR];
  rs.forEach((r, l) => {
    const g = ringGrow(S, F.now, l + 1); // 고리가 다 퍼진 뒤에 이름
    if (g < 0.99) return;
    label(c, l < group.length ? `${l + 1}단계 · ${DIM_KO[group[l]]}` : "기술", ox, oy - r * sc - 2, 10, col("--faint"), "center", 500); // 고리 이름은 배경 정보라 작고 옅게(P-12n)
  });
}

/** 화면 끝까지의 거리(화면 좌표): 선 · 파동은 지도 끝이 아니라 화면 끝까지(경계 없는 판) */
const farOf = (S: MapState, [ox, oy]: Pt) => Math.max(Math.hypot(ox, oy), Math.hypot(S.W - ox, oy), Math.hypot(ox, S.H - oy), Math.hypot(S.W - ox, S.H - oy)) + 40;
/** 퍼지는 파동(P-12m 시안): 가운데에서 WAVES초마다 세 번, 각 고리는 펼침 동안 지도 끝까지 · 그 뒤 화면 끝까지 옅어지며 한 번 */
function ripples({ c, S, sc, now }: Frame, o: Pt) {
  c.strokeStyle = col("--scan"); c.lineWidth = 1.5;
  for (const d of WAVES) {
    const { r, fade } = rippleR(S, now - d, farOf(S, o) / sc);
    if (r <= 0) continue;
    c.globalAlpha = 0.8 * fade; c.beginPath(); c.arc(o[0], o[1], r * sc, 0, TAU); c.stroke();
  }
  c.globalAlpha = 1;
}

/** 도는 선(P-12m 시안의 conic): 뒤로 75°(285° → 358°) 옅어지는 --scan 부채꼴 꼬리 + 끝은 흰 선. TURNS 바퀴 뒤 감속하며 옅어진다 */
function sweep({ c, S, now }: Frame, [ox, oy]: Pt, sa: number) {
  const ang = sweepAngle(S, now), far = farOf(S, [ox, oy]), scan = col("--scan"), tail = c.createConicGradient(ang, ox, oy);
  tail.addColorStop(285 / 360, rgba(scan, 0)); tail.addColorStop(358 / 360, rgba(scan, 0.42)); tail.addColorStop(1, rgba(col("--on-paper"), 0.95));
  c.globalAlpha = sa; c.fillStyle = tail;
  c.beginPath(); c.moveTo(ox, oy); c.arc(ox, oy, far, ang - (75 / 180) * Math.PI, ang); c.closePath(); c.fill();
  c.strokeStyle = col("--on-paper"); c.lineWidth = 1.2; c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + far * Math.cos(ang), oy + far * Math.sin(ang)); c.stroke();
  c.globalAlpha = 1;
}

function drawTechs({ c, S, vis, P, alphaOf, sc, now, z, track }: Frame) {
  const wall = Date.now(); // 최근 확인은 벽시계로(캔버스의 now는 화면이 뜬 뒤 흐른 초)
  for (const it of vis) {
    if (it.type !== "t") continue;
    const n = it.node, keep = n.mine || n.grade === "danger" || it.id === S.sel || it.id === S.focusId;
    const a = alphaOf(it) * (keep ? 1 : 0.35 + 0.65 * ramp(z, TIER.far)); if (a <= 0.01) continue; // 멀리서는 점이 옅어지고 묶음이 앞에
    const [x, y] = P(it);
    if (x < -40 || y < -40 || x > S.W + 40 || y > S.H + 40) continue;
    const b = S.phys.B.get(it.id), k = bumpOf(now - (b ? b.bump : -9));
    const g = grow(S, now, it), rp = dotRadius(it, sc) * (it.id === S.focusId ? 1.3 : 1) * (0.35 + 0.65 * g); // 작게 떠올라 제 크기로
    if (g > 0 && g < 1) { c.strokeStyle = col(it.token); c.globalAlpha = a * (1 - g) * 0.6; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, rp + 3 + g * 9, 0, TAU); c.stroke(); } // 떠오를 때 한 번 번지는 고리(시안의 burst)
    c.globalAlpha = a;
    if (k) { c.strokeStyle = col(it.token); c.globalAlpha = a * (1 - k) * 0.7; c.beginPath(); c.arc(x, y, rp + 4 + k * 10, 0, TAU); c.stroke(); c.globalAlpha = a; }
    if (n.collectErrorKind) { c.setLineDash([2, 2]); c.strokeStyle = col("--err-line"); c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, rp + 3.5, 0, TAU); c.stroke(); c.setLineDash([]); }
    c.beginPath(); c.ellipse(x, y, rp * (1 + 0.28 * k), rp * (1 - 0.18 * k), 0, 0, TAU);
    if (it.hollow) { c.fillStyle = col("--paper"); c.fill(); c.strokeStyle = col(it.token); c.lineWidth = 1.6; c.stroke(); } // 분류 전 = 빈 점
    else { c.fillStyle = col(GRADE_FILL[n.grade] ?? it.token); c.fill(); } // 위험 · 주의는 원 자체를 등급색으로(P-12m 시안), 나머지는 범주색
    if (GRADE_FILL[n.grade] && rp >= 3.5) { c.fillStyle = col("--on-ink"); c.font = `800 ${Math.max(7, Math.round(rp * 1.3))}px ${col("--font")}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(n.grade === "danger" ? "✕" : "!", x, y + 0.5); } // 색에만 기대지 않게 점 안에도 기호(이름표가 안 그려지는 배율에서도)
    if (!it.hollow || n.mine) { c.setLineDash(n.grade === "unknown" && !n.mine ? [2, 2] : []); c.strokeStyle = col("--on-paper"); c.lineWidth = n.mine ? 3 : 1.5; c.stroke(); c.setLineDash([]); } // 찾지 못함은 점선 테두리 // 점은 밝은 고리, 사용 중은 굵게
    if (n.isNew && (z >= TIER.far || S.lit) && !track.includes(it)) label(c, "NEW", x - rp - 2, y - rp - 3, 9, col("--on-paper"), "right", 800); // 추적 틀이 걸린 점은 꼬리표가 같은 뜻이라 NEW 없음
    if (it.id === S.sel) { const sr = rp + (n.collectErrorKind ? 8 : 6); c.strokeStyle = col("--on-paper"); c.lineWidth = 2; c.beginPath(); c.arc(x, y, sr, 0, TAU); c.stroke(); } // 위험 이중 고리 · 오류 점선 바깥에
    // 선 · 파동 중 먼저 닿은 때 한 번만 켜짐(P-12m, litAt): 36시간 안에 실제로 확인한 점만 ping 고리가 퍼지고(ADR 0032), 위험 · NEW는 한 번 울림
    const age = litAge(S, now, it);
    if (age >= 0 && age < PING && recentlyChecked(n, wall)) { c.strokeStyle = col("--scan"); c.globalAlpha = a * 0.9 * (1 - age / PING); c.lineWidth = 2; c.beginPath(); c.arc(x, y, rp + 1 + ease(age / PING) * 16, 0, TAU); c.stroke(); c.globalAlpha = a; }
    if (age >= 0 && age < 0.6 && (n.grade === "danger" || n.isNew)) {
      c.strokeStyle = col(n.grade === "danger" ? "--danger" : "--on-paper"); c.globalAlpha = a * (1 - age / 0.6); c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, rp + 2 + age * 22, 0, TAU); c.stroke();
    }
  }
  c.globalAlpha = 1;
}

// 묶음(1 육각 · 2 마름모 · 3 네모). 누르면 사이드바, 오른쪽 아래 작은 +/− 손잡이 = 펼치기·접기
function drawHubs({ c, S, vis, P, alphaOf, sc, now, z }: Frame) {
  S.hubLabels = []; S.handles = [];
  const jobs: { it: Item & { type: "g" }; x: number; y: number; r: number; a: number; shut: boolean; must: boolean }[] = [];
  for (const it of vis) {
    if (it.type !== "g") continue;
    const a = alphaOf(it) * (it.level === 1 || it.id === S.sel ? 1 : 0.4 + 0.6 * ramp(z, TIER.far)); if (a <= 0.01) continue;
    const [x, y] = P(it), b = S.phys.B.get(it.id), k = bumpOf(now - (b ? b.bump : -9)), r = hubRadius(it, sc) * (1 + 0.2 * k) * (it.id === S.focusId ? 1.12 : 1) * (0.35 + 0.65 * grow(S, now, it));
    const shut = S.collapsed.has(it.id), filled = !!it.token && !it.hollow;
    c.globalAlpha = a;
    hubPath(c, x, y, r, it.level);
    c.fillStyle = filled ? col(it.token!) : col("--panel"); c.fill(); // 빈 묶음은 어두운 판(흰 면이 떠 보이지 않게, P-12m)
    c.strokeStyle = col(filled || !(it.hollow && it.token) ? "--on-paper" : it.token); c.lineWidth = it.token ? 2 : 1.4; c.stroke();
    if (shut) { c.setLineDash([3, 3]); c.strokeStyle = col("--on-paper"); c.lineWidth = 1.2; hubPath(c, x, y, r + 5, it.level); c.stroke(); c.setLineDash([]); }
    if (it.id === S.sel) { c.strokeStyle = col("--on-paper"); c.lineWidth = 2; hubPath(c, x, y, r + 7, it.level); c.stroke(); }
    if (it.danger) badge(c, x + r * 0.8, y - r * 0.8, "✕", col("--danger"));
    c.fillStyle = col(filled ? "--on-ink" : "--on-paper"); c.font = `700 ${it.level === 1 ? 11 : 10}px ${col("--font")}`; c.textAlign = "center"; c.textBaseline = "middle";
    const shown = Math.round(it.count * Math.min(1, grow(S, now, it) ** 2)); // 처음 열 때 수가 0부터 차오름
    if (r >= 9) c.fillText(shut ? `+${shown}` : String(shown), x, y + 0.5);
    if (shut || it.id === S.focusId || it.id === S.sel) { // 접기 ⊖는 올리거나 고른 묶음에만, 펼치기 +는 늘(P-12n: 손잡이가 지도를 덮던 잡음)
      const hx = x + r * 0.9 + 3, hy = y + r * 0.9 + 3;
      c.fillStyle = col("--panel"); c.strokeStyle = col("--on-paper"); c.lineWidth = 1.2; c.beginPath(); c.arc(hx, hy, 7, 0, TAU); c.fill(); c.stroke();
      c.strokeStyle = col("--on-paper"); c.lineWidth = 1.6; c.beginPath(); c.moveTo(hx - 3.5, hy); c.lineTo(hx + 3.5, hy); if (shut) { c.moveTo(hx, hy - 3.5); c.lineTo(hx, hy + 3.5); } c.stroke();
      S.handles.push({ id: it.id, x: hx, y: hy });
    }
    const lit = !!S.lit && S.lit.has(it.id) && (S.lit.size < 80 || it.level < 3);
    if (it.level === 1 || lit || (it.level === 2 && z >= TIER.level2) || z >= TIER.names) jobs.push({ it, x, y, r, a, shut, must: it.level === 1 || lit });
  }
  // 이름표는 바깥 방향에. 1단계는 늘, 2단계 이하는 다른 이름표와 겹치지 않을 때만
  jobs.sort((p, q) => Number(q.must) - Number(p.must) || p.it.level - q.it.level);
  for (const { it, x, y, r, a, shut, must } of jobs) {
    const fs = it.level === 1 ? 13 : 12, ux = Math.cos(Math.atan2(it.y, it.x)), uy = Math.sin(Math.atan2(it.y, it.x));
    const lx = x + ux * (r + 10), ly = y + uy * (r + 10) + (uy > 0.3 ? fs / 2 : uy < -0.3 ? -fs / 2 : 0), align: CanvasTextAlign = ux > 0.3 ? "left" : ux < -0.3 ? "right" : "center";
    c.font = `${it.level === 1 ? 700 : 600} ${fs}px ${col("--font")}`;
    const w = c.measureText(it.value).width, left = align === "left" ? lx : align === "right" ? lx - w : lx - w / 2;
    const box = { id: it.id, x: left - 4, y: ly - fs / 2 - 3, w: w + 8, h: fs + 6 };
    if (!must && S.hubLabels.some((o) => box.x < o.x + o.w && o.x < box.x + box.w && box.y < o.y + o.h && o.y < box.y + box.h)) continue;
    c.globalAlpha = a;
    label(c, it.value, lx, ly, fs, col("--on-paper"), align, it.level === 1 ? 700 : 600);
    S.hubLabels.push(box);
    if (shut && (it.danger || it.caution)) label(c, `접힘 · 위험 ${it.danger} · 주의 ${it.caution}`, lx, ly + fs + 1, 11, col("--on-paper-2"), align);
  }
  c.globalAlpha = 1;
}

/** 큰 묶음(1단계)에 올리면 그 부채꼴이 옅게 밝아진다: 어디까지가 그 묶음인지 한눈에(11-21 사용자: 보기 좋은 요소) */
function sectorLight({ c, S, sc }: Frame, [ox, oy]: Pt) {
  const g = S.focusId ? S.L.byId.get(S.focusId) : undefined;
  if (!g || g.type !== "g" || g.level !== 1) return;
  const base = Math.atan2(g.y, g.x);
  let lo = 0, hi = 0;
  for (const it of S.L.items) { // 접혀 숨은 것까지 배치 자리로 잰다(접힌 묶음만 있어도 부채꼴이 실처럼 좁아지지 않게)
    if (!isUnder(S.L, it, g.id)) continue;
    const a = Math.atan2(it.y, it.x) - base, d = Math.atan2(Math.sin(a), Math.cos(a)); // 묶음 방향에서 잰 각(-π~π)
    lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  const pad = 0.04, r0 = (FIRST_RING - 30) * sc, r1 = (S.L.leafR + 60) * sc;
  c.globalAlpha = 0.07; c.fillStyle = col(g.token ?? "--ink");
  c.beginPath(); c.arc(ox, oy, r1, base + lo - pad, base + hi + pad); c.arc(ox, oy, Math.max(0, r0), base + hi + pad, base + lo - pad, true); c.closePath(); c.fill();
  c.globalAlpha = 1;
}

/** 찾아간 기술 · 펼친 묶음 자리에 두 겹 물결(1.2초). 움직임 줄이기 · ⚙ 끄기면 없음 */
function pingRing({ c, S, P, now }: Frame) {
  const p = S.ping, it = p ? S.L.byId.get(p.id) : undefined;
  if (!p || !it || S.hidden.has(it.id) || !moving(S)) return;
  const [x, y] = P(it);
  for (const lag of [0, 0.25]) {
    const age = now - p.t - lag; if (age < 0 || age > 1.2) continue;
    c.globalAlpha = 0.6 * (1 - age / 1.2); c.strokeStyle = col("--on-paper"); c.lineWidth = 1.5;
    c.beginPath(); c.arc(x, y, 8 + (1 - (1 - age / 1.2) ** 3) * 46, 0, TAU); c.stroke();
  }
  c.globalAlpha = 1;
}

/** 새 기술 추적 틀(P-12m 시안): 이번 주 들어온 기술(trackTargets, 최근 TRACK_MAX개)에만 흰 모서리 틀 + 흰 면 꼬리표 "새 기술 · 이번 주".
 *  켜진 뒤 LOCK_AFTER초에 1.9배에서 조여 들고 꼬리표가 뒤따른다. 움직임이 없으면(끄기 · 움직임 줄이기) 처음부터 걸린 모습. 꼬리표가 가려지지 않게 이름표 다음에 그린다 */
function trackFrames({ c, S, P, alphaOf, sc, now, z, track, boxes }: Frame) {
  if (z < TIER.far && !S.lit) return; // 멀리서는 점이 옅어 틀도 없음(NEW 표와 같은 기준)
  const TEXT = "새 기술 · 이번 주";
  c.font = `700 11px ${col("--font")}`;
  const tw = c.measureText(TEXT).width + 12;
  const shown = track.map((it) => {
    const age = litAge(S, now, it), p = age < 0 ? 1 : Math.min(1, Math.max(0, (age - LOCK_AFTER) / LOCK)), [x, y] = P(it), h = (dotRadius(it, sc) + 9) * (1 + 0.9 * (1 - ease(p)));
    return { it, age, a: alphaOf(it) * p, x, y, h, box: [x - h, y - h - 22, tw, 18] as Box, busy: !!it.node.decided || it.node.grade === "danger" || it.node.grade === "caution" };
  }).filter((f) => f.a > 0.01);
  const tagged = new Set(placeTags(shown.map((f) => ({ item: f.it, box: f.box, busy: f.busy })), boxes)); // 꼬리표는 점마다 하나, 겹치면 빼고 틀만
  for (const { it, age, a, x, y, h, box } of shown) {
    c.globalAlpha = a; c.strokeStyle = col("--on-paper"); c.fillStyle = col("--on-paper"); c.lineWidth = 1;
    c.strokeRect(x - h, y - h, h * 2, h * 2);
    c.lineWidth = 2; c.beginPath(); // 모서리는 꺾쇠선 ⌜⌟(P-12n, 지도 오른쪽 아래 뜻 줄과 같은 모양)
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const cx = x + dx * h, cy = y + dy * h; c.moveTo(cx - dx * 7, cy); c.lineTo(cx, cy); c.lineTo(cx, cy - dy * 7); }
    c.stroke(); c.lineWidth = 1;
    const t = age < 0 ? 1 : Math.min(1, Math.max(0, (age - LOCK_AFTER - LOCK) / LOCK));
    if (t <= 0 || !tagged.has(it)) continue;
    c.globalAlpha = a * t; c.font = `700 11px ${col("--font")}`;
    c.fillStyle = col("--surface"); c.fillRect(box[0], box[1], box[2], box[3]);
    c.fillStyle = col("--ink"); c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(TEXT, box[0] + 6, box[1] + 9.5);
  }
  c.globalAlpha = 1;
}

// 이름표: 올린 무리·고른 것·내 기술·위험·NEW 먼저, 가까이 가면 모든 이름(names), 더 가까이 가면 한국어 한 줄 · 인기 · 보안(detail). 겹치면 건너뛴다
function leafLabels({ c, S, vis, P, sc, now, z, boxes }: Frame) {
  const quiet = introducing(S, now); // 처음 연출 동안은(가까이 본 채라 이름이 한꺼번에 뜸) 고른 것 말고는 이름표 없음
  const names = ramp(z, TIER.names), det = ramp(z, TIER.detail);
  const onScreen = (it: Item) => { const [x, y] = P(it); return x > -20 && y > S.top - 20 && x < S.W - S.right + 20 && y < S.H + 20; };
  // 주변이 빈 점은 한 단계 낮은 배율에서도 이름(묶음만 보는 가장 먼 배율은 빼고) · 이름 단계에서는 설명까지(11-21 사용자 결정 F③)
  const alone = det < 0.4 && z >= TIER.far && !quiet ? aloneOnScreen(vis, P) : null;
  const dated = S.view.filter.period !== ""; // 기간 보기에서는 이름 옆에 들어온 날(F②)
  const justLanded = (it: Item) => now - (S.landed.get(it.id) ?? -99) < LAND_SEC; // "이번 주" 다시 보기로 방금 닿은 점: 이름(들어온 날)을 잠깐 진하게
  const want = vis.filter((it): it is TechItem => it.type === "t" && (it.id === S.focusId || it.id === S.sel || justLanded(it)
    || (!quiet && onScreen(it) && (S.W < 640 ? it.node.grade === "danger" // 좁은 화면은 위험 · 고른 것만(P-12n, 390에서 이름이 겹침)
      : S.lit ? S.lit.has(it.id) && S.lit.size < 60 : names > 0 || alone?.has(it.id) || it.node.mine || it.node.grade === "danger" || (z >= TIER.far && it.node.isNew)))));
  const rank = (it: TechItem) => (it.id === S.focusId || it.id === S.sel ? 0 : it.node.grade === "danger" ? 1 : it.node.mine ? 2 : it.node.isNew ? 3 : 4);
  want.sort((a, b) => rank(a) - rank(b));
  // 판단 꼬리표(점 왼쪽 아래, 칩과 같은 기준 decided): 자리를 먼저 잡아 이름표가 피해 가고, 이름표 테두리에 덮이지 않게 맨 나중에 그린다
  const tags = vis.filter((it): it is TechItem => it.type === "t" && !!it.node.decided && (z >= TIER.far || !!S.lit || it.id === S.sel) && onScreen(it)).map((it) => {
    const [x, y] = P(it), rp = dotRadius(it, sc) * (it.id === S.focusId ? 1.3 : 1) * (0.35 + 0.65 * grow(S, now, it)), text = MARK_TAG[it.node.decided!];
    c.font = `700 9px ${col("--font")}`;
    const w = c.measureText(text).width;
    return { it, text, x: x - rp - 2, y: y + rp + 5, box: [x - rp - 4 - w, y + rp - 2, w + 4, 14] };
  });
  boxes.push(...tags.map((t) => t.box as Box));
  for (const it of want.slice(0, 160)) {
    const solo = alone?.has(it.id) && names > 0.4;
    const [x, y] = P(it), [what, facts] = det > 0.4 || solo ? describeKo(it.node) : ["", ""]; // 상자가 커지는 순간 글도 보이게(안 보이는 글이 이름표를 밀어내지 않게)
    const name = dated && it.node.addedDays !== null ? `${it.node.name} · ${it.node.addedDays ? `${it.node.addedDays}일 전` : "오늘"}` : it.node.name; // 기간 칩과 같은 기준(지금부터 24시간 = 오늘)
    c.font = `12px ${col("--font")}`;
    const gt = GRADE_TAG[it.node.grade], nw = c.measureText(name).width;
    c.font = `700 10px ${col("--font")}`; const tw = gt ? c.measureText(gt).width + 6 : 0; c.font = `12px ${col("--font")}`;
    const w = Math.max(nw + tw, what ? c.measureText(what).width * 0.92 : 0, facts ? c.measureText(facts).width * 0.85 : 0);
    const h = 16 + (what ? 14 : 0) + (facts ? 13 : 0);
    const off = dotRadius(it, sc) + 5; // 가까이 가면 점이 커지니 점 가장자리에서 띄운다
    const right = x > S.W / 2 - 1 ? x + off + w < S.W - S.right - 4 : x - off - w < 4; // 바깥쪽에, 화면 끝에 잘리면 안쪽으로
    const box: Box = right ? [x + off, y - 8, w, h] : [x - off - w, y - 8, w, h];
    if (boxes.some((o) => box[0] < o[0] + o[2] && o[0] < box[0] + box[2] && box[1] < o[1] + o[3] && o[1] < box[1] + box[3])) continue;
    boxes.push(box);
    const a = Math.min(1, grow(S, now, it) * 1.6) * (rank(it) < 4 || S.lit?.has(it.id) || alone?.has(it.id) || justLanded(it) ? 1 : names); // 펼치기 전(0)이면 이름표도 없음, 단계 문턱에서는 스며듦
    if (a < 0.3) continue;
    c.globalAlpha = S.lit && !S.lit.has(it.id) ? 0.2 : a;
    label(c, name, box[0], y, 12, col("--on-paper"), "left", justLanded(it) ? 700 : 400);
    if (gt) label(c, gt, box[0] + nw + 6, y, 10, col(GRADE_FILL[it.node.grade]!), "left", 700);
    if (!what) continue;
    c.globalAlpha *= solo ? 1 : Math.min(1, (det - 0.4) / 0.4 + 0.3);
    label(c, what, box[0], y + 14, 11, col("--on-paper-2"));
    if (facts) label(c, facts, box[0], y + 27, 10, col("--on-paper-2"));
  }
  for (const { it, text, x, y } of tags) { // 저장 성공 순간 0.2초 동안 1.15 → 1로 꾹 찍힘(P-12g map-5), 움직임 줄이기면 바로
    const st = S.stamp?.id === it.id && moving(S) ? Math.max(0, 1 - (now - S.stamp.t) / 0.2) : 0;
    c.globalAlpha = (S.lit && !S.lit.has(it.id) ? 0.2 : 1) * Math.min(1, grow(S, now, it) * 1.6);
    label(c, text, x, y, 9 * (1 + 0.15 * st), col("--on-paper"), "right", 700);
  }
  c.globalAlpha = 1;
}

/** 화면에서 주변 칸(40px 격자 3×3)에 다른 기술 점이 없는 점. 격자라 점 수에 비례(매 장면 500개도 가벼움) */
function aloneOnScreen(vis: Item[], P: Frame["P"]): Set<string> {
  const CELL = 40, cells = new Map<string, number>();
  const pts = vis.filter((it) => it.type === "t").map((it) => { const [x, y] = P(it); return { id: it.id, cx: Math.floor(x / CELL), cy: Math.floor(y / CELL) }; });
  for (const p of pts) cells.set(`${p.cx},${p.cy}`, (cells.get(`${p.cx},${p.cy}`) ?? 0) + 1);
  const near = (p: (typeof pts)[number]) => { let n = 0; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) n += cells.get(`${p.cx + dx},${p.cy + dy}`) ?? 0; return n; };
  return new Set(pts.filter((p) => near(p) === 1).map((p) => p.id));
}

// 화면 밖 위험·주의: 방향마다(15°) 가장자리에 삼각형과 개수. 누르면 그쪽 기술을 연다
function offscreenRisks({ c, S, vis, P }: Frame) {
  const pad = 18, buckets = new Map<number, { a: number; list: TechItem[] }>();
  for (const it of vis) {
    if (it.type !== "t" || (it.node.grade !== "danger" && it.node.grade !== "caution")) continue;
    const [x, y] = P(it);
    if (x >= 0 && y >= S.top && x <= S.W - S.right && y <= S.H - S.bottom) continue;
    const a = Math.atan2(y - S.H / 2, x - S.W / 2), k = Math.round(a / (Math.PI / 12));
    const g = buckets.get(k) ?? { a: k * (Math.PI / 12), list: [] };
    g.list.push(it); buckets.set(k, g);
  }
  const rects: MapState["riskRects"] = [];
  for (const g of buckets.values()) {
    const cx = (S.W - S.right) / 2, cy = (S.H + S.top - S.bottom) / 2, dx = Math.cos(g.a), dy = Math.sin(g.a);
    const tx = Math.abs(dx) > 1e-6 ? (cx - pad) / Math.abs(dx) : Infinity, ty = Math.abs(dy) > 1e-6 ? ((S.H - S.top - S.bottom) / 2 - pad) / Math.abs(dy) : Infinity, d = Math.min(tx, ty);
    const x = cx + dx * d, y = cy + dy * d, worst = g.list.some((it) => it.node.grade === "danger");
    c.save(); c.translate(x, y); c.rotate(g.a); c.beginPath(); c.moveTo(9, 0); c.lineTo(-6, -7); c.lineTo(-6, 7); c.closePath();
    c.lineJoin = "round"; c.strokeStyle = col("--surface"); c.lineWidth = 4; c.stroke(); // 등급색은 흰 테두리 위에(P-12m)
    c.fillStyle = col(worst ? "--danger" : "--caution"); c.fill(); c.restore();
    label(c, String(g.list.length), x - dx * 16, y - dy * 16, 11, col("--on-paper"), "center", 700);
    rects.push({ x, y, list: g.list });
  }
  return rects;
}

/** 지도(가운데 원반)가 화면 밖으로 다 나가면 가장자리에 가운데 쪽 화살표 + "지도로 돌아가기" */
function homeArrow({ c, S, sc }: Frame, [ox, oy]: Pt) {
  const { W, H, top, right } = S, vw = W - right, R = S.L.radius * sc;
  if (ox + R > 0 && ox - R < vw && oy + R > top && oy - R < H) return null;
  const cx = vw / 2, cy = (H + top) / 2, a = Math.atan2(oy - cy, ox - cx), dx = Math.cos(a), dy = Math.sin(a), pad = 40;
  const d = Math.min(Math.abs(dx) > 1e-6 ? (cx - pad) / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? ((H - top) / 2 - pad) / Math.abs(dy) : Infinity);
  const x = cx + dx * d, y = cy + dy * d;
  c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.moveTo(14, 0); c.lineTo(-8, -10); c.lineTo(-8, 10); c.closePath();
  c.fillStyle = col("--on-paper"); c.fill(); c.restore();
  label(c, "지도로 돌아가기", x - dx * 26, y - dy * 26, 13, col("--on-paper"), dx > 0.5 ? "right" : dx < -0.5 ? "left" : "center", 700);
  return { x, y };
}

// ---- 끝없는 판(사용자 11-20): 깊이감 별가루 2겹(시차) · 세상에 붙은 점 모눈 · 지도 밖으로도 이어지는 고리와 십자선
const STAR_TILE = 480;
const STARS = (() => {
  let s = 11; const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); // 고정 씨앗: 늘 같은 별자리
  return [0.3, 0.6].map((f) => ({ f, pts: Array.from({ length: 46 }, () => [r() * STAR_TILE, r() * STAR_TILE, r()] as const) }));
})();
const mod = (a: number, n: number) => ((a % n) + n) % n;
function endless(F: Frame, [ox, oy]: Pt) {
  const { c, S, sc } = F;
  const { W, H } = S;
  c.fillStyle = col("--on-paper");
  for (const { f, pts } of STARS) { // 움직임 줄이기면 시차 없이 고정
    const dx = S.still ? 0 : mod(-S.cam.x * sc * f, STAR_TILE), dy = S.still ? 0 : mod(-S.cam.y * sc * f, STAR_TILE);
    c.globalAlpha = f === 0.3 ? 0.25 : 0.4;
    for (let tx = -STAR_TILE; tx < W + STAR_TILE; tx += STAR_TILE) for (let ty = -STAR_TILE; ty < H + STAR_TILE; ty += STAR_TILE)
      for (const [x, y, s] of pts) { const px = tx + x + dx, py = ty + y + dy; if (px > -2 && py > -2 && px < W + 2 && py < H + 2) c.fillRect(px, py, f === 0.3 ? 1 : 1 + s, f === 0.3 ? 1 : 1 + s); }
  }
  // 점 모눈: 화면 간격 20~40px가 되게 세상 간격을 두 배씩 바꾸고, 잘게 나뉘는 단계는 옅게 들어온다
  const g = 40 * 2 ** Math.ceil(Math.log2(20 / (40 * sc))), gs = g * sc, fine = Math.min(1, (gs - 20) / 20);
  c.fillStyle = col("--line-d");
  for (const [step, a] of [[g, 0.6 * fine], [g * 2, 0.6]]) {
    if (a < 0.01) continue;
    c.globalAlpha = a;
    const s = step * sc, x0 = mod(ox, s), y0 = mod(oy, s);
    for (let x = x0; x < W; x += s) for (let y = y0; y < H; y += s) c.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
  }
  // 고리·십자선은 지도 밖으로도 화면 끝까지, 멀수록 옅게(고리가 너무 촘촘하면 건너뜀)
  const far = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy));
  const step = LEVEL_GAP * 2 ** Math.max(0, Math.ceil(Math.log2(10 / (LEVEL_GAP * sc))));
  c.strokeStyle = col("--on-paper"); c.lineWidth = 1;
  const near = Math.hypot(Math.max(0, -ox, ox - W), Math.max(0, -oy, oy - H));
  let n = 0;
  const inner = groupOf(S.view).length + 1;
  for (let r = S.L.leafR + step; r * sc < far && n < 300; r += step, n++) {
    if (r * sc < near) continue;
    const g = ringGrow(S, F.now, inner + 1 + n); // 처음 열 때 안쪽 고리 다음 차례로 퍼짐
    if (g <= 0) continue;
    c.globalAlpha = Math.max(0.06, 0.35 - n * 0.025) * g;
    c.beginPath(); c.arc(ox, oy, r * sc * g, 0, TAU); c.stroke();
  }
  c.globalAlpha = 0.35; c.beginPath(); c.moveTo(0, oy); c.lineTo(W, oy); c.moveTo(ox, 0); c.lineTo(ox, H); c.stroke(); c.globalAlpha = 1;
}
