// 캔버스 그리기(시안 docs/wireframes/radar-draw.js). 색은 tokens.css 값을 읽어 쓴다(테마를 바꾸면 같이 바뀜). 크기·모양 = 단계, 색 = 색 기준 값,
// 보안은 기호로(위험 = 빨간 고리 + 처음 10초 맥박, 주의 = !, 수집 오류 = 점선 고리), NEW 표. 인기·오래됨·업데이트는 지도에 그리지 않는다.
import { FIRST_RING, LEVEL_GAP, type Item, type TechItem } from "@/lib/map/layout";
import type { MapState } from "./controller";

const TAU = Math.PI * 2, PERIOD = 4;
export const PULSE_SEC = 10;
// 토큰 값은 한 장 그리는 동안만 기억한다(테마가 바뀌면 다음 장부터 새 색, 첫 장에 비어 있던 값이 굳지 않게)
let css: Record<string, string> = {};
const col = (token: string) => css[token] ?? (css[token] = getComputedStyle(document.documentElement).getPropertyValue(token).trim() || "#888");
type Ctx = CanvasRenderingContext2D;
type Pt = readonly [number, number];
/** 한 장 그리는 데 함께 쓰는 것(함수 인자를 줄이려고 묶음) */
type Frame = { c: Ctx; S: MapState; vis: Item[]; P: (it: Item) => Pt; alphaOf: (it: Item) => number; sc: number; now: number };

const sweepAngle = (S: MapState, now: number) => -Math.PI / 2 + ((now - S.sweepStart) * TAU) / PERIOD;
/** 훑는 선: 첫 바퀴는 진하게, 그 뒤 점점 옅어져 사라진다(사용자 11-20). 시작 전은 0 */
const sweepAlpha = (S: MapState, now: number) => { const t = now - S.sweepStart; return S.still || !(t >= 0) ? 0 : t < PERIOD ? 1 : Math.exp(-(t - PERIOD) / 3.5); };
const angleOf = (x: number, y: number) => (Math.atan2(y, x) + Math.PI / 2 + TAU) % TAU;
// 점은 처음부터 다 보인다(훑는 선은 꾸밈과 위험·NEW 울림만): 선을 따라 나타나면 다 보이기까지 한 바퀴(4초)가 더 걸려
// 첫 화면 3초(PRD-NF3)를 넘겨서(11-20 사용자 결정)
const bumpOf = (age: number) => (age >= 0 && age < 0.3 ? Math.sin((Math.PI * age) / 0.3) : 0); // 0 → 1 → 0, 0.3초
export const hubRadius = (it: Item, sc: number) => it.r * Math.min(1.4, Math.max(0.7, sc ** 0.5));
export const dotRadius = (it: Item, sc: number) => Math.max(2.4, it.r * sc ** 0.6);

function hubPath(c: Ctx, x: number, y: number, r: number, level: number) {
  c.beginPath();
  if (level === 1) for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * TAU) / 6; if (i) c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  else if (level === 2) { c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); }
  else c.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
  c.closePath();
}
function badge(c: Ctx, x: number, y: number, ch: string, color: string) {
  c.fillStyle = color; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.fill();
  c.fillStyle = col("--on-ink"); c.font = `800 9px ${col("--font")}`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(ch, x, y + 0.5);
}
function label(c: Ctx, text: string, x: number, y: number, fs: number, color: string, align: CanvasTextAlign = "left", weight = 400) {
  c.font = `${weight} ${fs}px ${col("--font")}`; c.textAlign = align; c.textBaseline = "middle";
  c.lineJoin = "round"; c.strokeStyle = col("--surface"); c.lineWidth = 4; c.strokeText(text, x, y);
  c.fillStyle = color; c.fillText(text, x, y);
}

export function draw(c: Ctx, S: MapState, now: number) {
  css = {};
  const { W, H, L, phys } = S, sc = S.scale(), toS = (x: number, y: number): Pt => [W / 2 + (x - S.cam.x) * sc, H / 2 + (y - S.cam.y) * sc];
  const P = (it: Item): Pt => { const b = phys.B.get(it.id); return b ? toS(b.x, b.y) : toS(it.x, it.y); };
  c.fillStyle = col("--surface"); c.fillRect(0, 0, W, H);
  const [ox, oy] = toS(0, 0);
  const vis = L.items.filter((it) => !S.hidden.has(it.id));
  const alphaOf = (it: Item) => (S.lit && !S.lit.has(it.id) ? 0.16 : 1) * (S.leaving.has(it.id) ? Math.max(0, (S.leaving.get(it.id)! - now) / 0.35) : 1);
  const F: Frame = { c, S, vis, P, alphaOf, sc, now };
  endless(F, [ox, oy]);

  c.strokeStyle = col("--line"); c.lineWidth = 1;
  for (let l = 1; l <= L.depth; l++) { c.beginPath(); c.arc(ox, oy, (FIRST_RING + (l - 1) * LEVEL_GAP) * sc, 0, TAU); c.stroke(); }
  c.beginPath(); c.arc(ox, oy, L.leafR * sc, 0, TAU); c.stroke();

  const sa = sweepAlpha(S, now), ang = sweepAngle(S, now);
  if (sa > 0.01) {
    const R = L.radius * sc;
    if ("createConicGradient" in c) {
      const g = c.createConicGradient(ang - 1.1, ox, oy);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1.1 / TAU, `rgba(26,26,26,${0.12 * sa})`); g.addColorStop(1.1 / TAU + 0.001, "rgba(0,0,0,0)");
      c.fillStyle = g; c.beginPath(); c.moveTo(ox, oy); c.arc(ox, oy, R, ang - 1.1, ang); c.closePath(); c.fill();
    }
    c.strokeStyle = col("--ink"); c.globalAlpha = 0.55 * sa; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + Math.cos(ang) * R, oy + Math.sin(ang) * R); c.stroke(); c.globalAlpha = 1;
  }

  // 선: 위아래 단계(가운데 → 1단계 → … → 기술), 비교군은 점선
  for (const it of vis) {
    const [x, y] = P(it), parent = it.parent ? L.byId.get(it.parent) : null, [px, py] = parent ? P(parent) : [ox, oy];
    const on = !!S.lit && S.lit.has(it.id) && (!it.parent || S.lit.has(it.parent));
    c.globalAlpha = alphaOf(it) * (on ? 1 : S.lit ? 0.6 : it.type === "t" ? 0.45 : 0.8);
    c.strokeStyle = on ? col("--ink-2") : col("--line"); c.lineWidth = on ? 1.6 : 1;
    c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke();
  }
  c.setLineDash([4, 4]);
  for (const [a, b] of L.edges) {
    if (S.hidden.has(a) || S.hidden.has(b)) continue;
    const A = L.byId.get(a)!, Bi = L.byId.get(b)!, on = !!S.lit && S.lit.has(a) && S.lit.has(b), [x1, y1] = P(A), [x2, y2] = P(Bi);
    c.globalAlpha = on ? 1 : S.lit ? 0.08 : 0.35;
    c.strokeStyle = on ? col("--ink") : col("--muted"); c.lineWidth = on ? 1.6 : 1;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    if (on && S.focusId && (a === S.focusId || b === S.focusId)) { c.setLineDash([]); label(c, "비교군", (x1 + x2) / 2, (y1 + y2) / 2 - 6, 11, col("--ink"), "center"); c.setLineDash([4, 4]); }
  }
  c.setLineDash([]); c.globalAlpha = 1;

  c.fillStyle = col("--ink"); c.beginPath(); c.arc(ox, oy, 4, 0, TAU); c.fill();
  label(c, S.scopeLabel || (S.login ? "나" : `모은 기술 ${L.total}`), ox, oy + 18, 12, col("--muted"), "center", S.scopeLabel ? 700 : 400);

  drawTechs(F, sa, ang);
  drawHubs(F);
  leafLabels(F);
  S.riskRects = offscreenRisks(F);
  S.homeArrow = homeArrow(F, [ox, oy]);
}

function drawTechs({ c, S, vis, P, alphaOf, sc, now }: Frame, sa: number, ang: number) {
  const sweepAge = (it: Item) => ((((ang - (angleOf(it.x, it.y) - Math.PI / 2)) % TAU) + TAU) % TAU) / (TAU / PERIOD);
  for (const it of vis) {
    if (it.type !== "t") continue;
    const a = alphaOf(it); if (a <= 0.01) continue;
    const [x, y] = P(it);
    if (x < -40 || y < -40 || x > S.W + 40 || y > S.H + 40) continue;
    const n = it.node, b = S.phys.B.get(it.id), k = bumpOf(now - (b ? b.bump : -9));
    const rp = dotRadius(it, sc) * (it.id === S.focusId ? 1.3 : 1);
    c.globalAlpha = a;
    if (k) { c.strokeStyle = col(it.token); c.globalAlpha = a * (1 - k) * 0.7; c.beginPath(); c.arc(x, y, rp + 4 + k * 10, 0, TAU); c.stroke(); c.globalAlpha = a; }
    if (n.grade === "danger") { // 맥박: 처음 10초만(계속 움직이면 거슬리고 접근성 기준에도 걸림), 그 뒤·움직임 줄이기면 멈춘 굵은 고리
      const pulse = S.still || now - S.sweepStart > PULSE_SEC ? 0 : (now % 1.6) / 1.6;
      c.strokeStyle = col("--danger"); c.lineWidth = 2; c.beginPath(); c.arc(x, y, rp + 3, 0, TAU); c.stroke();
      if (pulse) { c.globalAlpha = a * (1 - pulse); c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, rp + 3 + pulse * 9, 0, TAU); c.stroke(); c.globalAlpha = a; }
    }
    if (n.collectErrorKind) { c.setLineDash([2, 2]); c.strokeStyle = col("--muted"); c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, rp + (n.grade === "danger" ? 7 : 3.5), 0, TAU); c.stroke(); c.setLineDash([]); }
    c.beginPath(); c.ellipse(x, y, rp * (1 + 0.28 * k), rp * (1 - 0.18 * k), 0, 0, TAU);
    if (it.hollow) { c.fillStyle = col("--surface"); c.fill(); c.strokeStyle = col(it.token); c.lineWidth = 1.6; c.stroke(); } // 분류 전 = 빈 점
    else { c.fillStyle = col(it.token); c.fill(); }
    if (n.mine) { c.strokeStyle = col("--ink"); c.lineWidth = 2; c.stroke(); }
    if (n.grade === "caution") badge(c, x + rp + 2, y - rp - 2, "!", col("--caution"));
    if (n.grade === "danger") badge(c, x + rp + 2, y - rp - 2, "✕", col("--danger"));
    if (n.isNew && (sc > 0.8 || S.lit)) label(c, "NEW", x - rp - 2, y - rp - 3, 9, col("--ink"), "right", 800);
    if (it.id === S.sel) { c.strokeStyle = col("--ink"); c.lineWidth = 2; c.beginPath(); c.arc(x, y, rp + 6, 0, TAU); c.stroke(); }
    const age = sweepAge(it); // 훑는 선이 위험·NEW를 지나면 한 번 울림
    if (sa > 0.2 && age < 0.6 && (n.grade === "danger" || n.isNew)) {
      c.strokeStyle = col(n.grade === "danger" ? "--danger" : "--ink"); c.globalAlpha = a * sa * (1 - age / 0.6); c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, rp + 2 + age * 22, 0, TAU); c.stroke();
    }
  }
  c.globalAlpha = 1;
}

// 묶음(1 육각 · 2 마름모 · 3 네모). 누르면 사이드바, 오른쪽 아래 작은 +/− 손잡이 = 펼치기·접기
function drawHubs({ c, S, vis, P, alphaOf, sc, now }: Frame) {
  S.hubLabels = []; S.handles = [];
  const jobs: { it: Item & { type: "g" }; x: number; y: number; r: number; a: number; shut: boolean; must: boolean }[] = [];
  for (const it of vis) {
    if (it.type !== "g") continue;
    const a = alphaOf(it); if (a <= 0.01) continue;
    const [x, y] = P(it), b = S.phys.B.get(it.id), k = bumpOf(now - (b ? b.bump : -9)), r = hubRadius(it, sc) * (1 + 0.2 * k) * (it.id === S.focusId ? 1.12 : 1);
    const shut = S.collapsed.has(it.id), filled = !!it.token && !it.hollow;
    c.globalAlpha = a;
    hubPath(c, x, y, r, it.level);
    c.fillStyle = filled ? col(it.token!) : col("--surface"); c.fill();
    c.strokeStyle = col(filled ? "--surface" : it.hollow && it.token ? it.token : "--ink-2"); c.lineWidth = it.token ? 2 : 1.4; c.stroke();
    if (shut) { c.setLineDash([3, 3]); c.strokeStyle = col("--ink-2"); c.lineWidth = 1.2; hubPath(c, x, y, r + 5, it.level); c.stroke(); c.setLineDash([]); }
    if (it.id === S.sel) { c.strokeStyle = col("--ink"); c.lineWidth = 2; hubPath(c, x, y, r + 7, it.level); c.stroke(); }
    if (it.danger) badge(c, x + r * 0.8, y - r * 0.8, "✕", col("--danger"));
    c.fillStyle = filled ? col("--on-ink") : col("--ink"); c.font = `700 ${it.level === 1 ? 11 : 10}px ${col("--font")}`; c.textAlign = "center"; c.textBaseline = "middle";
    if (r >= 9) c.fillText(shut ? `+${it.count}` : String(it.count), x, y + 0.5);
    const hx = x + r * 0.9 + 3, hy = y + r * 0.9 + 3;
    c.fillStyle = col("--surface"); c.strokeStyle = col("--ink-2"); c.lineWidth = 1.2; c.beginPath(); c.arc(hx, hy, 7, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = col("--ink"); c.lineWidth = 1.6; c.beginPath(); c.moveTo(hx - 3.5, hy); c.lineTo(hx + 3.5, hy); if (shut) { c.moveTo(hx, hy - 3.5); c.lineTo(hx, hy + 3.5); } c.stroke();
    S.handles.push({ id: it.id, x: hx, y: hy });
    const lit = !!S.lit && S.lit.has(it.id) && (S.lit.size < 80 || it.level < 3);
    if (it.level <= 2 || lit || sc > 2) jobs.push({ it, x, y, r, a, shut, must: it.level === 1 || lit });
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
    label(c, it.value, lx, ly, fs, col("--ink"), align, it.level === 1 ? 700 : 600);
    S.hubLabels.push(box);
    if (shut && (it.danger || it.caution)) label(c, `접힘 · 위험 ${it.danger} · 주의 ${it.caution}`, lx, ly + fs + 1, 11, col("--muted"), align);
  }
  c.globalAlpha = 1;
}

// 이름표: 올린 무리·고른 것·내 기술·위험·NEW 먼저, 확대하면 더. 겹치면 건너뛴다
function leafLabels({ c, S, vis, P, sc }: Frame) {
  const want = vis.filter((it): it is TechItem => it.type === "t" && (it.id === S.focusId || it.id === S.sel
    || (S.lit ? S.lit.has(it.id) && S.lit.size < 60 : sc > 1.6 || it.node.mine || it.node.grade === "danger" || (sc > 1 && it.node.isNew))));
  const rank = (it: TechItem) => (it.id === S.focusId || it.id === S.sel ? 0 : it.node.grade === "danger" ? 1 : it.node.mine ? 2 : 3);
  want.sort((a, b) => rank(a) - rank(b));
  const boxes: number[][] = [];
  c.font = `12px ${col("--font")}`;
  for (const it of want.slice(0, 160)) {
    const [x, y] = P(it), w = c.measureText(it.node.name).width;
    const box = x > S.W / 2 - 1 ? [x + 9, y - 8, w, 16] : [x - 9 - w, y - 8, w, 16];
    if (boxes.some((o) => box[0] < o[0] + o[2] && o[0] < box[0] + box[2] && box[1] < o[1] + o[3] && o[1] < box[1] + box[3])) continue;
    boxes.push(box);
    c.globalAlpha = S.lit && !S.lit.has(it.id) ? 0.2 : 1;
    label(c, it.node.name, box[0], y, 12, col("--ink"));
  }
  c.globalAlpha = 1;
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
    c.fillStyle = col(worst ? "--danger" : "--caution"); c.fill(); c.restore();
    label(c, String(g.list.length), x - dx * 16, y - dy * 16, 11, col("--ink"), "center", 700);
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
  c.fillStyle = col("--ink"); c.fill(); c.restore();
  label(c, "지도로 돌아가기", x - dx * 26, y - dy * 26, 13, col("--ink"), dx > 0.5 ? "right" : dx < -0.5 ? "left" : "center", 700);
  return { x, y };
}

// ---- 끝없는 판(사용자 11-20): 깊이감 별가루 2겹(시차) · 세상에 붙은 점 모눈 · 지도 밖으로도 이어지는 고리와 십자선
const STAR_TILE = 480;
const STARS = (() => {
  let s = 11; const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); // 고정 씨앗: 늘 같은 별자리
  return [0.3, 0.6].map((f) => ({ f, pts: Array.from({ length: 46 }, () => [r() * STAR_TILE, r() * STAR_TILE, r()] as const) }));
})();
const mod = (a: number, n: number) => ((a % n) + n) % n;
function endless({ c, S, sc }: Frame, [ox, oy]: Pt) {
  const { W, H } = S;
  c.fillStyle = col("--faint");
  for (const { f, pts } of STARS) { // 움직임 줄이기면 시차 없이 고정
    const dx = S.still ? 0 : mod(-S.cam.x * sc * f, STAR_TILE), dy = S.still ? 0 : mod(-S.cam.y * sc * f, STAR_TILE);
    c.globalAlpha = f === 0.3 ? 0.5 : 0.75;
    for (let tx = -STAR_TILE; tx < W + STAR_TILE; tx += STAR_TILE) for (let ty = -STAR_TILE; ty < H + STAR_TILE; ty += STAR_TILE)
      for (const [x, y, s] of pts) { const px = tx + x + dx, py = ty + y + dy; if (px > -2 && py > -2 && px < W + 2 && py < H + 2) c.fillRect(px, py, f === 0.3 ? 1 : 1 + s, f === 0.3 ? 1 : 1 + s); }
  }
  // 점 모눈: 화면 간격 20~40px가 되게 세상 간격을 두 배씩 바꾸고, 잘게 나뉘는 단계는 옅게 들어온다
  const g = 40 * 2 ** Math.ceil(Math.log2(20 / (40 * sc))), gs = g * sc, fine = Math.min(1, (gs - 20) / 20);
  c.fillStyle = col("--ink-2");
  for (const [step, a] of [[g, 0.3 * fine], [g * 2, 0.3]]) {
    if (a < 0.01) continue;
    c.globalAlpha = a;
    const s = step * sc, x0 = mod(ox, s), y0 = mod(oy, s);
    for (let x = x0; x < W; x += s) for (let y = y0; y < H; y += s) c.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
  }
  // 고리·십자선은 지도 밖으로도 화면 끝까지, 멀수록 옅게(고리가 너무 촘촘하면 건너뜀)
  const far = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy));
  const step = LEVEL_GAP * 2 ** Math.max(0, Math.ceil(Math.log2(10 / (LEVEL_GAP * sc))));
  c.strokeStyle = col("--line"); c.lineWidth = 1;
  const near = Math.hypot(Math.max(0, -ox, ox - W), Math.max(0, -oy, oy - H));
  let n = 0;
  for (let r = S.L.leafR + step; r * sc < far && n < 300; r += step, n++) {
    if (r * sc < near) continue;
    c.globalAlpha = Math.max(0.12, 0.7 - n * 0.05);
    c.beginPath(); c.arc(ox, oy, r * sc, 0, TAU); c.stroke();
  }
  c.globalAlpha = 0.45; c.beginPath(); c.moveTo(0, oy); c.lineTo(W, oy); c.moveTo(ox, 0); c.lineTo(ox, H); c.stroke(); c.globalAlpha = 1;
}
