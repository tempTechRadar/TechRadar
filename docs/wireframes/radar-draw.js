// 캔버스 그리기. 색은 tokens.css 값을 읽어 쓴다(테마를 바꾸면 같이 바뀜). 크기·모양 = 단계, 색 = 색 기준 값,
// 보안은 기호로(위험 = 빨간 고리 + 맥박, 주의 = !, 수집 오류 = 점선 고리), NEW 표. 인기·오래됨·업데이트는 지도에 그리지 않는다.
(() => {
  const { FIRST_RING, LEVEL_GAP } = TR.radarLayout;
  const TAU = Math.PI * 2, PERIOD = 4;
  const css = {};
  const col = (token) => css[token] || (css[token] = getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#888');
  const resetColors = () => { for (const k in css) delete css[k]; };

  const sweepAngle = (S, now) => -Math.PI / 2 + ((now - S.sweep.start) * TAU) / PERIOD;
  /** 훑는 선 진하기: 첫 바퀴는 진하게, 그 뒤 점점 옅어져 사라진다(사용자 11-20) */
  const sweepAlpha = (S, now) => { const t = now - S.sweep.start; return S.still || !(t >= 0) ? 0 : t < PERIOD ? 1 : Math.exp(-(t - PERIOD) / 3.5); }; // 불러오는 동안(시작 전)은 0
  const angleOf = (x, y) => (Math.atan2(y, x) + Math.PI / 2 + TAU) % TAU;
  /** 처음 들어올 때: 훑는 선이 지나간 자리부터 나타난다 */
  const reveal = (S, it, now) => { if (S.still) return 1; const at = S.sweep.start + (angleOf(it.x, it.y) / TAU) * PERIOD; return Math.max(0, Math.min(1, (now - at) / 0.3)); };

  function hubPath(c, x, y, r, level) {
    c.beginPath();
    if (level === 1) for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * TAU) / 6; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); }
    else if (level === 2) { c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); }
    else c.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
    c.closePath();
  }
  const bumpOf = (age) => (age >= 0 && age < 0.3 ? Math.sin((Math.PI * age) / 0.3) : 0); // 0 → 1 → 0, 0.3초

  function draw(c, S, now) {
    const { W, H, L, phys } = S, sc = S.scale(), toS = (x, y) => [W / 2 + (x - S.cam.x) * sc, H / 2 + (y - S.cam.y) * sc];
    const P = (it) => { const b = phys.B.get(it.id); return b ? toS(b.x, b.y) : toS(it.x, it.y); };
    c.fillStyle = col('--surface'); c.fillRect(0, 0, W, H);
    const [ox, oy] = toS(0, 0);

    // 고리와 십자선(배경)
    c.strokeStyle = col('--line'); c.lineWidth = 1;
    for (let l = 1; l <= L.depth; l++) { c.beginPath(); c.arc(ox, oy, (FIRST_RING + (l - 1) * LEVEL_GAP) * sc, 0, TAU); c.stroke(); }
    c.beginPath(); c.arc(ox, oy, L.leafR * sc, 0, TAU); c.stroke();
    c.globalAlpha = 0.5; c.beginPath(); c.moveTo(ox - L.radius * sc, oy); c.lineTo(ox + L.radius * sc, oy); c.moveTo(ox, oy - L.radius * sc); c.lineTo(ox, oy + L.radius * sc); c.stroke(); c.globalAlpha = 1;

    // 훑는 선(처음만 진하게)
    const sa = sweepAlpha(S, now), ang = sweepAngle(S, now);
    if (sa > 0.01) {
      const R = L.radius * sc;
      if (c.createConicGradient) {
        const g = c.createConicGradient(ang - 1.1, ox, oy);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1.1 / TAU, `rgba(26,26,26,${0.12 * sa})`); g.addColorStop(1.1 / TAU + 0.001, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(ox, oy); c.arc(ox, oy, R, ang - 1.1, ang); c.closePath(); c.fill();
      }
      c.strokeStyle = col('--ink'); c.globalAlpha = 0.55 * sa; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + Math.cos(ang) * R, oy + Math.sin(ang) * R); c.stroke(); c.globalAlpha = 1;
    }

    const vis = L.items.filter((it) => !S.hidden.has(it.id));
    const alphaOf = (it) => reveal(S, it, now) * (S.lit && !S.lit.has(it.id) ? 0.16 : 1) * (S.leaving.has(it.id) ? Math.max(0, (S.leaving.get(it.id) - now) / 0.35) : 1);

    // 선: 위아래 단계(가운데 → 1단계 → … → 기술), 비교군은 점선
    c.lineWidth = 1;
    for (const it of vis) {
      const [x, y] = P(it), [px, py] = it.parent ? P(L.byId.get(it.parent)) : [ox, oy], on = S.lit && S.lit.has(it.id) && (!it.parent || S.lit.has(it.parent));
      c.globalAlpha = alphaOf(it) * (on ? 1 : S.lit ? 0.6 : it.type === 't' ? 0.45 : 0.8);
      c.strokeStyle = on ? col('--ink-2') : col('--line'); c.lineWidth = on ? 1.6 : 1;
      c.beginPath(); c.moveTo(px, py); c.lineTo(x, y); c.stroke();
    }
    c.setLineDash([4, 4]);
    for (const [a, b] of L.edges) {
      if (S.hidden.has(a) || S.hidden.has(b)) continue;
      const A = L.byId.get(a), Bi = L.byId.get(b), on = S.lit && S.lit.has(a) && S.lit.has(b), [x1, y1] = P(A), [x2, y2] = P(Bi);
      c.globalAlpha = Math.min(reveal(S, A, now), reveal(S, Bi, now)) * (on ? 1 : S.lit ? 0.08 : 0.35);
      c.strokeStyle = on ? col('--ink') : col('--muted'); c.lineWidth = on ? 1.6 : 1;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      if (on && S.focusId && (a === S.focusId || b === S.focusId)) label(c, '비교군', (x1 + x2) / 2, (y1 + y2) / 2 - 6, 11, col('--ink'), 'center');
    }
    c.setLineDash([]); c.globalAlpha = 1;

    // 가운데
    c.fillStyle = col('--ink'); c.beginPath(); c.arc(ox, oy, 4, 0, TAU); c.fill();
    label(c, S.login ? '나' : `모은 기술 ${L.total}`, ox, oy + 18, 12, col('--muted'), 'center');

    // 기술 점
    const sweepAge = (it) => (((ang - (angleOf(it.x, it.y) - Math.PI / 2)) % TAU + TAU) % TAU) / (TAU / PERIOD);
    for (const it of vis) {
      if (it.type !== 't') continue;
      const a = alphaOf(it); if (a <= 0.01) continue;
      const [x, y] = P(it), t = it.t, b = phys.B.get(it.id), k = bumpOf(now - (b ? b.bump : -9));
      const rp = Math.max(2.4, it.r * sc ** 0.6) * (it.id === S.focusId ? 1.3 : 1);
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
      c.globalAlpha = a;
      if (k) { c.strokeStyle = col(it.token); c.globalAlpha = a * (1 - k) * 0.7; c.beginPath(); c.arc(x, y, rp + 4 + k * 10, 0, TAU); c.stroke(); c.globalAlpha = a; }
      if (t.grade === '위험') { // 맥박: 움직임 줄이기면 멈춘 굵은 고리
        const pulse = S.still ? 0 : (now % 1.6) / 1.6;
        c.strokeStyle = col('--danger'); c.lineWidth = 2; c.beginPath(); c.arc(x, y, rp + 3, 0, TAU); c.stroke();
        if (pulse) { c.globalAlpha = a * (1 - pulse); c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, rp + 3 + pulse * 9, 0, TAU); c.stroke(); c.globalAlpha = a; }
      }
      if (t.err) { c.setLineDash([2, 2]); c.strokeStyle = col('--muted'); c.lineWidth = 1.4; c.beginPath(); c.arc(x, y, rp + (t.grade === '위험' ? 7 : 3.5), 0, TAU); c.stroke(); c.setLineDash([]); }
      c.fillStyle = col(it.token); c.beginPath(); c.ellipse(x, y, rp * (1 + 0.28 * k), rp * (1 - 0.18 * k), 0, 0, TAU); c.fill();
      if (S.login && t.mine) { c.strokeStyle = col('--ink'); c.lineWidth = 2; c.stroke(); }
      if (t.grade === '주의') badge(c, x + rp + 2, y - rp - 2, '!', col('--caution'));
      if (t.grade === '위험') badge(c, x + rp + 2, y - rp - 2, '✕', col('--danger'));
      if (t.nw && (sc > 0.8 || S.lit)) label(c, 'NEW', x - rp - 2, y - rp - 3, 9, col('--ink'), 'right', 800);
      if (it.id === S.sel) { c.strokeStyle = col('--ink'); c.lineWidth = 2; c.beginPath(); c.arc(x, y, rp + 6, 0, TAU); c.stroke(); }
      const age = sweepAge(it); // 훑는 선이 위험·NEW를 지나면 한 번 울림
      if (sa > 0.2 && age < 0.6 && (t.grade === '위험' || t.nw)) { c.strokeStyle = col(t.grade === '위험' ? '--danger' : '--ink'); c.globalAlpha = a * sa * (1 - age / 0.6); c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, rp + 2 + age * 22, 0, TAU); c.stroke(); }
    }
    c.globalAlpha = 1;

    // 묶음(1 육각 · 2 마름모 · 3 네모)
    S.hubLabels = [];
    for (const it of vis) {
      if (it.type !== 'g') continue;
      const a = alphaOf(it); if (a <= 0.01) continue;
      const [x, y] = P(it), b = phys.B.get(it.id), k = bumpOf(now - (b ? b.bump : -9)), r = it.r * Math.min(1.4, Math.max(0.7, sc ** 0.5)) * (1 + 0.2 * k) * (it.id === S.focusId ? 1.12 : 1);
      const shut = S.collapsed.has(it.id);
      c.globalAlpha = a;
      hubPath(c, x, y, r, it.level);
      c.fillStyle = it.token ? col(it.token) : col('--surface'); c.fill();
      c.strokeStyle = col(it.token ? '--surface' : '--ink-2'); c.lineWidth = it.token ? 2 : 1.4; c.stroke();
      if (shut) { c.setLineDash([3, 3]); c.strokeStyle = col('--ink-2'); c.lineWidth = 1.2; hubPath(c, x, y, r + 5, it.level); c.stroke(); c.setLineDash([]); }
      if (it.id === S.sel) { c.strokeStyle = col('--ink'); c.lineWidth = 2; hubPath(c, x, y, r + 7, it.level); c.stroke(); }
      if (it.danger) badge(c, x + r * 0.8, y - r * 0.8, '✕', col('--danger'));
      c.fillStyle = it.token ? col('--on-ink') : col('--ink'); c.font = `700 ${it.level === 1 ? 11 : 10}px ${col('--font')}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      if (r >= 9) c.fillText(shut ? `+${it.count}` : String(it.count), x, y + 0.5);
      // 이름표는 바깥 방향(가운데에서 멀어지는 쪽)에: 안쪽 고리는 좁아서 아래에 달면 서로 겹친다
      const show = it.level === 1 || (it.level === 2 && sc > 1.3) || sc > 2 || (S.lit && S.lit.has(it.id) && (S.lit.size < 80 || it.level < 3));
      if (show) {
        const fs = it.level === 1 ? 13 : 12, ux = Math.cos(Math.atan2(it.y, it.x)), uy = Math.sin(Math.atan2(it.y, it.x));
        const lx = x + ux * (r + 6), ly = y + uy * (r + 6) + (uy > 0.3 ? fs / 2 : uy < -0.3 ? -fs / 2 : 0), align = ux > 0.3 ? 'left' : ux < -0.3 ? 'right' : 'center';
        label(c, it.value, lx, ly, fs, col('--ink'), align, it.level === 1 ? 700 : 600);
        const w = c.measureText(it.value).width, left = align === 'left' ? lx : align === 'right' ? lx - w : lx - w / 2;
        S.hubLabels.push({ id: it.id, x: left - 4, y: ly - fs / 2 - 3, w: w + 8, h: fs + 6 });
        if (shut && (it.danger || it.caution)) label(c, `접힘 · 위험 ${it.danger} · 주의 ${it.caution}`, lx, ly + fs + 1, 11, col('--muted'), align);
      }
    }
    c.globalAlpha = 1;
    leafLabels(c, S, vis, P, sc);
    S.riskRects = offscreenRisks(c, S, vis, P);
  }

  function badge(c, x, y, ch, color) {
    c.fillStyle = color; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.fill();
    c.fillStyle = col('--on-ink'); c.font = `800 9px ${col('--font')}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, x, y + 0.5);
  }
  function label(c, text, x, y, fs, color, align = 'left', weight = 400) {
    c.font = `${weight} ${fs}px ${col('--font')}`; c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.strokeStyle = col('--surface'); c.lineWidth = 4; c.strokeText(text, x, y);
    c.fillStyle = color; c.fillText(text, x, y);
  }
  // 이름표: 올린 무리·고른 것·내 기술·위험·NEW 먼저, 확대하면 더. 겹치면 건너뛴다(옛 placeLabels를 줄임)
  function leafLabels(c, S, vis, P, sc) {
    const want = vis.filter((it) => it.type === 't' && reveal(S, it, S.now) > 0.9 && (it.id === S.focusId || it.id === S.sel || (S.lit ? S.lit.has(it.id) && S.lit.size < 60 : sc > 1.6 || (S.login && it.t.mine) || it.t.grade === '위험' || (sc > 1 && it.t.nw))));
    const rank = (it) => (it.id === S.focusId || it.id === S.sel ? 0 : it.t.grade === '위험' ? 1 : it.t.mine ? 2 : 3);
    want.sort((a, b) => rank(a) - rank(b));
    const boxes = [];
    c.font = `12px ${col('--font')}`;
    for (const it of want.slice(0, 160)) {
      const [x, y] = P(it), w = c.measureText(it.id).width;
      const box = x > S.W / 2 - 1 ? [x + 9, y - 8, w, 16] : [x - 9 - w, y - 8, w, 16];
      if (boxes.some((o) => box[0] < o[0] + o[2] && o[0] < box[0] + box[2] && box[1] < o[1] + o[3] && o[1] < box[1] + box[3])) continue;
      boxes.push(box);
      c.globalAlpha = S.lit && !S.lit.has(it.id) ? 0.2 : 1;
      label(c, it.id, box[0], y, 12, col('--ink'));
    }
    c.globalAlpha = 1;
  }
  // 화면 밖 위험·주의: 방향마다(15°) 가장자리에 삼각형과 개수. 누르면 그쪽으로 간다
  function offscreenRisks(c, S, vis, P) {
    const pad = 18, buckets = new Map();
    for (const it of vis) {
      if (it.type !== 't' || (it.t.grade !== '위험' && it.t.grade !== '주의')) continue;
      const [x, y] = P(it);
      if (x >= 0 && y >= S.top && x <= S.W - S.right && y <= S.H) continue;
      const a = Math.atan2(y - S.H / 2, x - S.W / 2), k = Math.round(a / (Math.PI / 12));
      const g = buckets.get(k) || { a: k * (Math.PI / 12), list: [] };
      g.list.push(it); buckets.set(k, g);
    }
    const rects = [];
    for (const g of buckets.values()) {
      const cx = (S.W - S.right) / 2, cy = (S.H + S.top) / 2, dx = Math.cos(g.a), dy = Math.sin(g.a);
      const tx = Math.abs(dx) > 1e-6 ? (cx - pad) / Math.abs(dx) : Infinity, ty = Math.abs(dy) > 1e-6 ? ((S.H - S.top) / 2 - pad) / Math.abs(dy) : Infinity, d = Math.min(tx, ty);
      const x = cx + dx * d, y = cy + dy * d, worst = g.list.some((it) => it.t.grade === '위험');
      c.save(); c.translate(x, y); c.rotate(g.a); c.beginPath(); c.moveTo(9, 0); c.lineTo(-6, -7); c.lineTo(-6, 7); c.closePath();
      c.fillStyle = col(worst ? '--danger' : '--caution'); c.fill(); c.restore();
      label(c, String(g.list.length), x - dx * 16, y - dy * 16, 11, col('--ink'), 'center', 700);
      rects.push({ x, y, list: g.list });
    }
    return rects;
  }

  TR.radarDraw = { draw, resetColors, col };
})();
