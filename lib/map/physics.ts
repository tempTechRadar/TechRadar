// 끌기 물리(옵시디언처럼, 시안 docs/wireframes/radar-physics.js와 같은 규칙): 끌 때·펼칠 때·되돌릴 때만 켜지고 1초쯤 뒤 식는다.
// ① 줄 스프링 + 모양 스프링(처음 방향을 기억해 이웃이 대형을 유지한 채 따라옴), ② 묶음을 끌면 그 아래 전체가 단단히 따라옴,
// ③ 부딪힌 점은 밀려나며 잠깐 튕김(bump), ④ 제자리(anchor)로 돌아가는 힘. 움직임 줄이기면 흔들림 없이 바로 자리 잡는다(still).
const K = { spring: 0.04, shape: 0.03, anchor: 0.006, repel: 0.25, damp: 0.85, gap: 4, vmax: 34, pushR: 40, push: 1.1, carry: 0.6, cell: 40 };
const TIGHT = { spring: 0.1, shape: 0.22 }; // 끄는 묶음의 아래쪽: 대형 유지

export type Body = { x: number; y: number; vx: number; vy: number; ax: number; ay: number; ak: number; rest: [number, number]; bump: number; r: number; ghost: boolean };
type Link = { a: Body; b: Body; rx: number; ry: number; len: number; spring: number; shape: number };
type Sim = { pin: Body | null; held: boolean; alpha: number; last: [number, number] | null };
export type PhysItem = { id: string; x: number; y: number; r: number };

export function createPhysics() {
  const B = new Map<string, Body>();
  let sim: Sim | null = null, links: Link[] = [];

  /** 보이는 것들을 몸으로 맞춘다. 처음 보는 것은 from 자리(펼친 묶음 등)에서 나온다 */
  function sync(items: PhysItem[], from?: (it: PhysItem) => [number, number] | null) {
    const keep = new Set(items.map((it) => it.id));
    for (const id of B.keys()) if (!keep.has(id)) B.delete(id);
    for (const it of items) {
      const b = B.get(it.id);
      if (b) { b.r = it.r; continue; }
      const o = from?.(it);
      B.set(it.id, { x: o ? o[0] : it.x, y: o ? o[1] : it.y, vx: 0, vy: 0, ax: it.x, ay: it.y, ak: 0, rest: [it.x, it.y], bump: -9, r: it.r, ghost: false });
    }
  }
  /** 물리를 켠다. pin = 끄는 것, team = 함께 단단히 움직일 것(묶음 아래), pairs = 줄로 이은 짝 */
  function kick(pin: string | null, team: Set<string> | null, pairs: [string, string][]) {
    links = pairs.filter(([a, b]) => B.has(a) && B.has(b)).map(([a, b]) => {
      const p = B.get(a)!, q = B.get(b)!, rx = q.x - p.x, ry = q.y - p.y;
      const tight = !!team && (team.has(a) || a === pin) && (team.has(b) || b === pin);
      return { a: p, b: q, rx, ry, len: Math.hypot(rx, ry) || 1, ...(tight ? TIGHT : { spring: K.spring, shape: K.shape }) };
    });
    for (const [id, b] of B) if (b.ak <= K.anchor) { b.ax = b.x; b.ay = b.y; b.ak = team?.has(id) ? 0 : K.anchor; }
    const p = pin ? B.get(pin) ?? null : null;
    sim = { pin: p, held: !!p, alpha: 1, last: p ? [p.x, p.y] : null };
  }
  /** 펼치기·되돌리기: 정해진 자리로 스프링처럼 넘쳤다가 자리 잡는다. 자리 찾아가는 동안은 부딪히지 않음(묶음이 밀려나지 않게) */
  function settleTo(targets: [string, [number, number]][], strength = 0.09) {
    for (const [id, [x, y]] of targets) { const b = B.get(id); if (b) { b.ax = x; b.ay = y; b.ak = strength; b.ghost = true; } }
    if (!sim) kick(null, null, []);
    sim!.alpha = 1;
  }
  const drag = (x: number, y: number) => { if (sim?.pin) { sim.pin.x = x; sim.pin.y = y; } };
  const release = () => { if (sim) sim.held = false; };

  /** 한 장 나아간다. 아직 움직이면 true */
  function step(dt: number, now: number, still: boolean): boolean {
    if (!sim) return false;
    const t = still ? 1 : Math.min(2, dt * 60), a = sim.alpha, pin = sim.pin;
    for (const l of links) {
      const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.hypot(dx, dy) || 1, s = ((d - l.len) / d) * l.spring * a * t;
      const fx = dx * s + (dx - l.rx) * l.shape * a * t, fy = dy * s + (dy - l.ry) * l.shape * a * t;
      l.a.vx += fx; l.a.vy += fy; l.b.vx -= fx; l.b.vy -= fy;
    }
    collide(t, now, still);
    if (pin && sim.held) push(pin, t, now, still);
    for (const b of B.values()) {
      if (b === pin && sim.held) { b.vx = b.vy = 0; continue; }
      const k = b.ak * Math.max(a, b.ak > K.anchor ? 1 : 0) * t;
      b.vx += (b.ax - b.x) * k; b.vy += (b.ay - b.y) * k;
      const damp = (still ? 0.5 : K.damp) ** t;
      b.vx = Math.max(-K.vmax, Math.min(K.vmax, b.vx * damp)); b.vy = Math.max(-K.vmax, Math.min(K.vmax, b.vy * damp));
      b.x += b.vx * t; b.y += b.vy * t;
    }
    if (pin) sim.last = [pin.x, pin.y];
    if (!sim.held) sim.alpha *= 0.94 ** t;
    const travelling = [...B.values()].some((b) => b.ak > K.anchor && Math.hypot(b.ax - b.x, b.ay - b.y) > 0.5);
    if (!sim.held && sim.alpha < 0.02 && !travelling) { end(); return false; }
    return true;
  }
  function end() {
    for (const b of B.values()) { if (b.ak > K.anchor) { b.x = b.ax; b.y = b.ay; } b.rest = [b.x, b.y]; b.vx = b.vy = 0; b.ak = 0; b.ghost = false; }
    sim = null;
  }
  // 겹치면 서로 밀어낸다(공간 해시). 움직이던 것에 부딪혀 밀린 쪽은 튕김 표시
  function collide(t: number, now: number, still: boolean) {
    const grid = new Map<string, Body[]>(), key = (x: number, y: number) => `${Math.floor(x / K.cell)},${Math.floor(y / K.cell)}`;
    for (const b of B.values()) { if (b.ghost) continue; const k = key(b.x, b.y); grid.set(k, [...(grid.get(k) ?? []), b]); }
    for (const b of B.values()) {
      if (b.ghost) continue;
      const cx = Math.floor(b.x / K.cell), cy = Math.floor(b.y / K.cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of grid.get(`${cx + i},${cy + j}`) ?? []) {
        if (o === b) continue;
        const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy) || 0.01, min = b.r + o.r + K.gap;
        if (d >= min) continue;
        const f = ((min - d) / d) * K.repel * t * 0.5;
        b.vx += dx * f; b.vy += dy * f;
        if (!still && Math.hypot(o.vx, o.vy) > 2 && now - b.bump > 0.45) b.bump = now;
      }
    }
  }
  // 끄는 것 둘레의 이웃 아닌 것은 밀려나고, 끄는 방향으로 조금 휩쓸린다(물살)
  function push(pin: Body, t: number, now: number, still: boolean) {
    const near = new Set(links.filter((l) => l.a === pin || l.b === pin).flatMap((l) => [l.a, l.b]));
    const [lx, ly] = sim!.last ?? [pin.x, pin.y], mx = pin.x - lx, my = pin.y - ly;
    for (const o of B.values()) {
      if (o === pin || near.has(o) || o.ak === 0 || o.ghost) continue;
      const dx = o.x - pin.x, dy = o.y - pin.y, d = Math.hypot(dx, dy) || 0.01, R = pin.r + o.r + K.pushR;
      if (d >= R) continue;
      const f = ((1 - d / R) ** 2 * K.push * R * 0.12 * t) / d;
      o.vx += dx * f + mx * K.carry * 0.1; o.vy += dy * f + my * K.carry * 0.1;
      if (!still && now - o.bump > 0.45) o.bump = now;
    }
  }
  return { B, sync, kick, settleTo, drag, release, step, busy: () => !!sim };
}
export type Physics = ReturnType<typeof createPhysics>;
