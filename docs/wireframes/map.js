  (() => {
    const $ = (id) => document.getElementById(id);
    const cv = $('cv'), ctx = cv.getContext('2d');
    const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const rand = lcg(7);
    const KIND = { mcp: 'MCP', skill: '스킬', pkg: '패키지' }, KINDS = ['mcp', 'skill', 'pkg'];
    // 등급은 위험·주의·통과·찾지 못함 넷이다(+ 아직 안 읽은 "검사 전", 제안). **수집 오류는 등급이 아니다**: 읽기에 실패해도 등급은 마지막으로 매긴 그대로이고
    // 등급 옆에 "수집 오류(종류)"가 덧붙는다(spec 1절, erd `collect_error_kind`). 그래서 위험이던 점이 오류가 나도 위험으로 보이고 센다.
    const GRADE = { d: '위험', w: '주의', p: '통과', u: '찾지 못함', n: '검사 전' };
    // "확인 못 함"은 이유와 함께 따로 보여 준다. 어느 것도 "문제 없음"으로 읽히지 않게 쓴다(불변 2). 문구는 모두 예시다.
    const WHY = ['시간 초과', '네트워크', '한도 초과', '상태 코드', '해석 실패'];
    const gradeText = (n) => GRADE[n.g] + (n.err ? ' · 수집 오류' : '');
    const gradeWhy = (n) => ({
      d: '알려진 취약점이 있어요(심각도 높음). 고친 버전은 알림에서 확인해요',
      w: '12개월 넘게 활동이 없거나 주의할 패턴이 있어요',
      p: '알려진 문제를 찾지 못했어요. 안전하다는 보증은 아니에요',
      u: '출처에서 이 기술을 찾지 못했어요. 문제가 없다는 뜻은 아니에요',
      n: '아직 한 번도 읽지 않았어요. 읽은 뒤에 등급이 정해져요',
    }[n.g]) + (n.err ? `. 지금은 읽기에 실패했어요(${n.err}). 등급은 마지막으로 읽은 결과이고, 문제가 없다고 보지 않아요` : '');
    const QUAD = ['코드 작성', '보안 점검', '데이터', '화면 디자인'];
    const WIN = 36, PERIOD = 18, TAIL = 150, TRAIL = 70, RAD = Math.PI / 180, RING = 110, MAXN = 1200, DUR = 0.6;
    const C = { bg: '#0a0e14', green: '#2ed573', ring: '#1e8f55', dim: '#5a7890', lit: '#5ec8ff', danger: '#f87171', warn: '#fbbf24', ink: '#e6edf3', muted: '#8fa3b0', edge: '143,163,176' };
    const count = { mcp: 0, skill: 0, pkg: 0 }, nodes = [], edges = [];

    function add(o) {
      let g = o.g, h = o.h, err = null;
      if (g === 'e') { // 읽기 실패를 만드는 약속: 마지막으로 매긴 등급(통과였거나, 한 번도 못 읽었으면 찾지 못함)을 남기고 오류만 덧붙인다
        err = WHY[o.seed % 5]; g = o.seed % 2 ? 'u' : 'p'; h = g === 'u' ? null : 40 + (o.seed % 60);
      }
      const n = { i: nodes.length, name: `sample-${o.kind}-${++count[o.kind]}`, kind: o.kind, g, h, err, pop: o.pop, chg: !!o.chg, mine: !!o.mine, tier: o.tier,
        x: o.x, y: o.y, tx: o.x, ty: o.y, px: o.x, py: o.y, hx: o.x, hy: o.y, parent: o.parent ?? -1, seed: o.seed, kidsN: o.kidsN, expanded: false, born: 0, nb: new Set(), spot: null, hv: '', k: 0 };
      n.rad = Math.hypot(n.x, n.y); n.deg = ((Math.atan2(n.x, -n.y) / RAD) + 360) % 360; n.q = Math.floor(n.deg / 90);
      n.fresh = !n.err && n.h != null && n.h <= WIN; n.always = n.g === 'd' || n.g === 'w'; n.r = n.always ? Math.max(7, 3.2 + n.pop * 1.1) : 3.2 + n.pop * 1.1;
      nodes.push(n); return n;
    }
    const markPending = (n) => { n.g = 'n'; n.h = null; n.fresh = false; n.err = null; }; // 아직 한 번도 읽지 않은 점
    function link(a, b) { if (a === b || a.nb.has(b.i)) return; a.nb.add(b.i); b.nb.add(a.i); edges.push({ a: a.i, b: b.i }); }

    // 처음 36개: 내 기술 8개(안쪽)와 같은 역할 28개(바깥). 각도는 갈래, 거리는 나와의 거리.
    const mkSpec = (kind, g, h, o = {}) => ({ kind, g, h, pop: o.pop ?? 1 + Math.floor(rand() * 5), mine: !!o.mine, chg: !!o.chg });
    const center = [
      mkSpec('mcp', 'd', 3, { mine: 1, pop: 4, chg: 1 }), mkSpec('mcp', 'w', 6, { mine: 1, pop: 3 }),
      mkSpec('skill', 'p', 9, { mine: 1, pop: 5, chg: 1 }), mkSpec('skill', 'p', 20, { mine: 1, pop: 2 }),
      mkSpec('skill', 'p', 55, { mine: 1, pop: 3 }), mkSpec('pkg', 'p', 12, { mine: 1, pop: 4 }),
      mkSpec('pkg', 'e', null, { mine: 1, pop: 2 }), mkSpec('pkg', 'u', null, { mine: 1, pop: 1 }),
    ];
    const outer = [...'ppwpppdppwppupppdpwppeppuppp'].map((g, i) =>
      mkSpec(KINDS[i % 3], g, g === 'u' || g === 'e' ? null : 2 + Math.floor(rand() * 78), { chg: [4, 17].includes(i) }));
    const HUBS = [{ a: 30, r: 175 }, { a: 128, r: 185 }, { a: 72, r: 140 }, { a: 212, r: 180 }, { a: 248, r: 150 }, { a: 305, r: 180 }, { a: 160, r: 135 }, { a: 345, r: 140 }];
    const GROUPS = [5, 4, 6, 3, 4, 6], clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const polar = (deg, r) => ({ x: r * Math.sin(deg * RAD), y: -r * Math.cos(deg * RAD) });
    center.forEach((s, i) => add({ ...s, ...polar(HUBS[i].a, HUBS[i].r), tier: 0, seed: 100 + i, kidsN: 0 }));
    let oi = 0;
    GROUPS.forEach((cnt, h) => {
      const q = Math.floor(HUBS[h].a / 90), first = nodes.length;
      for (let j = 0; j < cnt; j++, oi++) {
        const deg = clamp(HUBS[h].a + (j - (cnt - 1) / 2) * Math.min(9, 40 / cnt) + (rand() - 0.5) * 5, q * 90 + 6, q * 90 + 84);
        const n = add({ ...outer[oi], ...polar(deg, 250 + (j % 3) * 55 + rand() * 25), tier: 1, parent: h, seed: 1000 + oi * 7919, kidsN: 2 + Math.floor(rand() * 3) });
        link(nodes[h], n);
        if (j > 0 && rand() < 0.7) link(nodes[first + j - 1], n); // 같은 역할끼리는 서로도 이어진다
      }
    });
    nodes.filter((n) => n.tier === 1 && n.g === 'p' && !n.fresh && !n.err).slice(0, 2).forEach(markPending); // "검사 전" 예시 2개(난수는 건드리지 않는다)
    const dErr = nodes.filter((n) => n.g === 'd' && !n.mine)[1]; // 위험이던 점의 읽기가 지금 실패한 예: 위험은 그대로 보이고 오류가 덧붙는다
    if (dErr) { dErr.err = WHY[dErr.seed % 5]; dErr.fresh = false; }

    // 눌러서 펼치기: 숨은 같은 역할 기술을 부모 바깥쪽에 놓는다. 같은 갈래(각도) 안에서만, 겹치면 밀어낸다. 같은 씨앗이면 같은 결과다.
    const pickGrade = (r) => { const v = r(); return v < 0.012 ? 'd' : v < 0.042 ? 'w' : v < 0.09 ? 'u' : v < 0.11 ? 'e' : 'p'; }; // 위험은 드물어야 눈에 띈다
    function expand(p) {
      if (p.expanded || !p.kidsN || nodes.length + p.kidsN > MAXN) return [];
      p.expanded = true;
      // 부모를 옮겼다면 지금 있는 자리(p.deg)의 갈래 안에 펼친다. 갈래 데이터(q)는 부모를 따른다.
      const r = lcg(p.seed), m = p.kidsN, tier = p.tier + 1, born = performance.now() / 1000, kids = [], sec = Math.floor(p.deg / 90);
      const spread = Math.min(30, 10 + m * 6);
      for (let j = 0; j < m; j++) {
        const g = pickGrade(r), kind = KINDS[Math.floor(r() * 3)];
        const h = g === 'u' || g === 'e' ? null : r() < (tier === 2 ? 0.25 : 0.08) ? 2 + Math.floor(r() * 30) : 40 + Math.floor(r() * 80);
        const deg = clamp(p.deg + (m === 1 ? 0 : (j - (m - 1) / 2) * (spread / (m - 1))) + (r() - 0.5) * 4, sec * 90 + 9, sec * 90 + 81);
        const n = add({ kind, g, h, pop: 1 + Math.floor(r() * 5), chg: r() < 0.05, tier, ...polar(deg, p.rad + 85 + r() * 45), parent: p.i, seed: (p.seed * 31 + j + 1) >>> 0, kidsN: Math.floor(r() * 4) });
        if (n.g === 'p' && !n.err && n.seed % 33 === 0) markPending(n); // 약 3%는 검사 전(씨앗으로 정해서 난수 순서는 그대로)
        n.born = born; kids.push(n);
      }
      for (let it = 0; it < 30; it++) kids.forEach((a) => {
        nodes.forEach((o) => {
          if (o === a) return;
          const dx = a.tx - o.tx, dy = a.ty - o.ty, d = Math.hypot(dx, dy) || 0.01, min = a.r + o.r + 16;
          if (d < min) { const f = ((min - d) * 0.6) / d; a.tx += dx * f; a.ty += dy * f; }
        });
        const deg = ((Math.atan2(a.tx, -a.ty) / RAD) + 360) % 360, c = clamp(deg, sec * 90 + 9, sec * 90 + 81), rr = Math.hypot(a.tx, a.ty);
        a.tx = rr * Math.sin(c * RAD); a.ty = -rr * Math.cos(c * RAD);
      });
      // 갈래 경계에 막혀 아직 겹친 점은 같은 각도로 바깥으로 민다(각도가 갈래 안에 남는다).
      kids.forEach((a) => { for (let t = 0; t < 40 && nodes.some((o) => o !== a && Math.hypot(a.tx - o.tx, a.ty - o.ty) < a.r + o.r + 6); t++) { a.tx *= 1.03; a.ty *= 1.03; } });
      kids.forEach((a) => {
        a.rad = Math.hypot(a.tx, a.ty); a.deg = ((Math.atan2(a.tx, -a.ty) / RAD) + 360) % 360; a.q = p.q; a.hx = a.tx; a.hy = a.ty;
        link(p, a);
        if (rand() < 0.35) { // 이웃 갈래 사이에 가끔 다리를 놓아 그물처럼 엮는다
          let best = null, bd = 140;
          nodes.forEach((o) => { if (o !== a && o !== p && o.q === a.q && !a.nb.has(o.i)) { const d = Math.hypot(a.tx - o.tx, a.ty - o.ty); if (d < bd) { bd = d; best = o; } } });
          if (best) link(a, best);
        }
      });
      return kids;
    }

    // ---- 화면: 세계 좌표(내가 원점)를 화면으로. view.x·y는 화면 가운데에 오는 세계 좌표, view.k는 확대 배율.
    let W = 0, H = 0, dpr = 1, view = { x: 0, y: 0, k: 1 }, paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let theta = 0, dirty = true, labelsDirty = true, hoverId = -1, selId = -1, lastRings = 0, lastLabelAt = 0;
    const base = () => (Math.min(W, H) / 1000) * 0.95, sc = () => view.k * base();
    const toScreen = (x, y) => [W / 2 + (x - view.x) * sc(), H / 2 + (y - view.y) * sc()];
    // 접힌 갈래(사분면)의 점은 모두 감춘다. 위험 수는 감춰져도 배지로 남긴다.
    const folded = [false, false, false, false], badgeRect = [null, null, null, null], riskRects = [];
    // 이 점 중심으로 보기: 고른 점과 N단계 이웃만 남긴다(나머지는 감춘다). 접힌 갈래와 같은 "감춤"이라 shown 하나로 처리한다.
    let focusSet = null, focusId = -1, focusDepth = 1, focusPrev = null, cardNode = null, riskTxt = '';
    const shown = (n) => !folded[n.q] && (!focusSet || focusSet.has(n.i));
    // 거르기: 범례 칩(상태)과 종류·내 기술만. 맞지 않는 점은 감추지 않고 흐리게 둬서 자리와 이어짐은 그대로 보인다.
    // 상태 칩은 켠 것 중 하나라도 맞으면 진하게(위험+주의), 서로 다른 묶음(상태·종류·범위)은 모두 맞아야 한다.
    const STATE = { d: (n) => n.g === 'd', w: (n) => n.g === 'w', fresh: (n) => n.fresh, old: (n) => n.h != null && !n.fresh, n: (n) => n.g === 'n', u: (n) => n.g === 'u', e: (n) => !!n.err, o: (n) => n.mine && n.nb.size === 0 };
    const fstate = new Set(), fkind = new Set();
    let fmine = false, fActive = false, fFns = [];
    const isOn = (n) => !fActive || ((!fFns.length || fFns.some((f) => f(n))) && (!fkind.size || fkind.has(n.kind)) && (!fmine || n.mine));
    const countQ = (q, pick) => nodes.filter((n) => n.q === q && pick(n)).length;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    // 보이는 자리(px, py)는 목표 자리(tx, ty)를 부드럽게 따라간다. 움직임을 멈춘 상태(paused)에서는 바로 간다.
    const posOf = (n, now) => {
      if (n.born) {
        const t = (now - n.born) / DUR;
        if (!paused && t < 1) { const p = nodes[n.parent], e = ease(Math.max(0, t)); return [p.px + (n.tx - p.px) * e, p.py + (n.ty - p.py) * e]; }
        n.born = 0; n.px = n.tx; n.py = n.ty;
      }
      return [n.px, n.py];
    };
    function settle(dt) {
      let moving = false; const f = 1 - Math.exp(-dt * 14);
      nodes.forEach((n) => {
        if (n.born) return;
        const dx = n.tx - n.px, dy = n.ty - n.py;
        if (paused || Math.abs(dx) + Math.abs(dy) < 0.05) { n.px = n.tx; n.py = n.ty; return; }
        n.px += dx * f; n.py += dy * f; moving = true;
      });
      return moving;
    }
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2); W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); dirty = labelsDirty = true;
    }
    new ResizeObserver(resize).observe(cv);
    function zoomAt(cx, cy, f) {
      const before = sc(), wx = view.x + (cx - W / 2) / before, wy = view.y + (cy - H / 2) / before;
      view.k = clamp(view.k * f, 0.2, 6);
      const after = sc(); view.x = wx - (cx - W / 2) / after; view.y = wy - (cy - H / 2) / after; dirty = labelsDirty = true;
    }
    function fit(withOrigin = true) { // 거르는 중이면 맞는 점에 맞춘다. 중심 보기에서는 가운데(나)를 빼고 그 점들에 맞춘다.
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      const pool = nodes.filter((n) => shown(n) && isOn(n));
      (pool.length ? pool : nodes.filter(shown)).forEach((n) => { x0 = Math.min(x0, n.tx); x1 = Math.max(x1, n.tx); y0 = Math.min(y0, n.ty); y1 = Math.max(y1, n.ty); });
      if (withOrigin === true || x0 > x1) { x0 = Math.min(x0, 0); x1 = Math.max(x1, 0); y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
      const s = Math.min(W / (x1 - x0 + 220), H / (y1 - y0 + 260));
      view.k = clamp(s / base(), 0.2, 6); view.x = (x0 + x1) / 2; view.y = (y0 + y1) / 2; dirty = labelsDirty = true;
    }

    const sprite = {};
    [['p', C.lit], ['d', C.danger], ['w', C.warn]].forEach(([k, col]) => {
      const s = document.createElement('canvas'); s.width = s.height = 96;
      const g = s.getContext('2d'), gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
      gr.addColorStop(0, col + '99'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.fillRect(0, 0, 96, 96); sprite[k] = s;
    });
    const glow = (behind) => (behind < TAIL ? Math.pow(1 - behind / TAIL, 1.6) : 0);
    const radiusPx = (n) => Math.max(2.4, n.r * Math.pow(sc(), 0.6));
    const status = (n) => (n.g === 'd' ? C.danger : n.g === 'w' ? C.warn : n.fresh ? C.lit : C.dim);
    const labelText = (n) => n.name + (n.always ? ` ${GRADE[n.g]}${n.err ? ' ✕' : ''}` : ''); // 위험·주의는 등급을 글자로 늘 적고, 읽기에 실패했으면 ✕도

    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      const s = sc(), [cx, cy] = toScreen(0, 0), far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 40;
      // 고리: 바깥으로 계속 이어지며 흐려진다. 경계가 없다.
      ctx.lineWidth = 1; lastRings = 0;
      for (let k = 1; k < 90; k++) {
        const r = k * RING * s; if (r > far) break; if (r < 5) continue;
        ctx.strokeStyle = `rgba(30,143,85,${Math.max(0.05, 0.42 / Math.pow(k, 0.7)).toFixed(3)})`; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke(); lastRings++;
      }
      ctx.strokeStyle = 'rgba(30,143,85,.22)'; ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
      if (s > 0.45 && s < 3) { // 갈래 이름은 가까이 볼 때만
        ctx.font = '12px ui-monospace, Consolas, monospace'; ctx.fillStyle = '#1fa85a'; ctx.textAlign = 'center';
        QUAD.forEach((t, q) => { if (folded[q]) return; const p = polar(q * 90 + 45, 395), [x, y] = toScreen(p.x, p.y); ctx.fillText(t, x, y); });
        ctx.textAlign = 'left';
      }
      folded.forEach((f, q) => { // 접힌 갈래: 감춘 점 대신 "내 기술 n · 위험 n" 배지. 누르면 펴진다.
        badgeRect[q] = null; if (!f) return;
        const p = polar(q * 90 + 45, 230), [x, y] = toScreen(p.x, p.y), d = countQ(q, (n) => n.g === 'd');
        const t = `${QUAD[q]} 접힘 · 내 기술 ${countQ(q, (n) => n.mine)} · 위험 ${d}`;
        ctx.font = '13px ui-monospace, Consolas, monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
        const w = ctx.measureText(t).width + 24; badgeRect[q] = [x - w / 2, y - 16, w, 32];
        ctx.fillStyle = 'rgba(10,14,20,.92)'; ctx.strokeStyle = d ? C.danger : '#1fa85a'; ctx.lineWidth = 1.2;
        ctx.fillRect(x - w / 2, y - 16, w, 32); ctx.strokeRect(x - w / 2, y - 16, w, 32); ctx.fillStyle = C.ink; ctx.fillText(t, x, y); ctx.textAlign = 'left';
      });
      ctx.fillStyle = C.green; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 6.2832); ctx.fill();

      // 도는 선: 화면 끝까지 그어진다.
      if (!paused) {
        const a1 = theta * RAD - Math.PI / 2, a0 = a1 - TRAIL * RAD, L = far;
        const gr = ctx.createLinearGradient(cx + L * 0.9 * Math.cos(a0), cy + L * 0.9 * Math.sin(a0), cx + L * 0.9 * Math.cos(a1), cy + L * 0.9 * Math.sin(a1));
        gr.addColorStop(0, 'rgba(46,213,115,0)'); gr.addColorStop(1, 'rgba(46,213,115,.15)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, L, a0, a1); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(46,213,115,.18)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + L * Math.cos(a1), cy + L * Math.sin(a1)); ctx.stroke();
        ctx.strokeStyle = C.green; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + L * Math.cos(a1), cy + L * Math.sin(a1)); ctx.stroke();
      }

      const focus = hoverId >= 0 ? hoverId : selId, fam = focus >= 0 ? nodes[focus] : null;
      const P = nodes.map((n) => { const [x, y] = posOf(n, now); const [sx, sy] = toScreen(x, y); n.sx = sx; n.sy = sy; return n; });
      // 선: 평소엔 가늘고 흐리게 모두 보이고, 점을 올리면 그 가족의 선만 밝아진다.
      const inFam = (e) => fam && (e.a === focus || e.b === focus), faint = [];
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${C.edge},${fam ? 0.07 : 0.24})`; ctx.beginPath();
      edges.forEach((e) => {
        if (inFam(e)) return; const a = P[e.a], b = P[e.b]; if (!shown(a) || !shown(b)) return;
        if ((a.sx < -50 && b.sx < -50) || (a.sx > W + 50 && b.sx > W + 50) || (a.sy < -50 && b.sy < -50) || (a.sy > H + 50 && b.sy > H + 50)) return;
        if (fActive && !(isOn(a) && isOn(b))) { faint.push(e); return; }
        ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
      });
      ctx.stroke();
      if (faint.length) { ctx.strokeStyle = `rgba(${C.edge},0.04)`; ctx.beginPath(); faint.forEach((e) => { ctx.moveTo(P[e.a].sx, P[e.a].sy); ctx.lineTo(P[e.b].sx, P[e.b].sy); }); ctx.stroke(); }
      if (fam) { ctx.strokeStyle = 'rgba(46,213,115,.8)'; ctx.lineWidth = 1.4; ctx.beginPath(); edges.forEach((e) => { if (inFam(e) && shown(P[e.a]) && shown(P[e.b])) { ctx.moveTo(P[e.a].sx, P[e.a].sy); ctx.lineTo(P[e.b].sx, P[e.b].sy); } }); ctx.stroke(); }

      P.forEach((n) => {
        if (!shown(n) || n.sx < -40 || n.sx > W + 40 || n.sy < -40 || n.sy > H + 40) { n.k = 0; return; }
        const rp = radiusPx(n), dimmed = fam && n !== fam && !fam.nb.has(n.i), off = fActive && !isOn(n), A = off ? 0.1 : dimmed ? 0.22 : 1;
        n.k = !paused && n.fresh ? glow((((theta - n.deg) % 360) + 360) % 360) : 0;
        ctx.globalAlpha = A;
        if (n.fresh || n.always) { if (n.k > 0.01) { const g = rp * 5.5; ctx.globalAlpha = (A) * n.k * 0.7; ctx.drawImage(sprite[n.g === 'd' ? 'd' : n.g === 'w' ? 'w' : 'p'], n.sx - g / 2, n.sy - g / 2, g, g); ctx.globalAlpha = A; } }
        const rr = rp * (1 + n.k * 0.45);
        if (n.always) { ctx.strokeStyle = status(n); ctx.globalAlpha *= 0.55; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(n.sx, n.sy, rr + 5, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = A; }
        if (n.g === 'u') { ctx.strokeStyle = C.dim; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(n.sx, n.sy, rr, 0, 6.2832); ctx.stroke(); }
        else if (n.g === 'n') { ctx.strokeStyle = C.dim; ctx.lineWidth = 1.6; ctx.setLineDash([1.5, 2.5]); ctx.beginPath(); ctx.arc(n.sx, n.sy, rr, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); }
        // 최근 확인한 통과 점: 선이 닿기 전 0.8, 닿으면 1. 멈추면 1(선이 없어도 오래된 점과 확실히 구분되게)
        else { ctx.fillStyle = status(n); if (n.g === 'p' && n.fresh) ctx.globalAlpha *= paused ? 1 : 0.8 + n.k * 0.2; ctx.beginPath(); ctx.arc(n.sx, n.sy, rr, 0, 6.2832); ctx.fill(); ctx.globalAlpha = A; }
        if (n.err) { // 수집 오류는 등급 위에 ✕를 덧붙인다(등급을 가리지 않는다)
          const bx = n.sx - rr * 0.85 - 2, by = n.sy - rr * 0.85 - 2;
          ctx.fillStyle = C.bg; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(bx, by, 5, 0, 6.2832); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(bx - 2.2, by - 2.2); ctx.lineTo(bx + 2.2, by + 2.2); ctx.moveTo(bx + 2.2, by - 2.2); ctx.lineTo(bx - 2.2, by + 2.2); ctx.stroke();
        }
        if (n.chg) { ctx.fillStyle = C.ink; ctx.strokeStyle = C.bg; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(n.sx + rr * 0.85, n.sy - rr * 0.85, 3, 0, 6.2832); ctx.stroke(); ctx.fill(); }
        if (n.kidsN && !n.expanded) { ctx.strokeStyle = 'rgba(46,213,115,.7)'; ctx.lineWidth = 1.1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(n.sx, n.sy, rr + (n.always ? 10 : 5), 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); }
        if (n.i === selId || n.i === hoverId) { ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(n.sx, n.sy, rr + 9, 0, 6.2832); ctx.stroke(); }
        ctx.globalAlpha = 1;
      });

      // 이름표: 가까이 볼수록 더 많이. 위험·주의는 늘, 선이 지나가면 잠깐, 올리면 그 점.
      ctx.font = '12px ui-monospace, Consolas, monospace'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      P.forEach((n) => {
        if (!shown(n) || (fActive && !isOn(n)) || (!n.spot && n.i !== hoverId && n.i !== selId)) return;
        const zoomA = n.always ? 1 : n.mine ? (s >= 0.5 ? 0.9 : 0) : s >= 1.4 ? 0.9 : 0;
        const a = n.i === hoverId || n.i === selId ? 1 : Math.max(zoomA, n.k);
        if (a < 0.03 || n.sx < -80 || n.sx > W + 80 || n.sy < -20 || n.sy > H + 20) return;
        const sp = n.spot || { dx: radiusPx(n) + 8, dy: 0 }, t = labelText(n);
        ctx.globalAlpha = (fam && n !== fam && !fam.nb.has(n.i) ? 0.2 : 1) * a; ctx.lineWidth = 3.5; ctx.strokeStyle = C.bg; ctx.fillStyle = C.green; ctx.strokeText(t, n.sx + sp.dx, n.sy + sp.dy); ctx.fillText(t, n.sx + sp.dx, n.sy + sp.dy);
      });
      ctx.globalAlpha = 1;
      drawRisk(P);
    }

    // 화면 밖의 위험·주의: 지도가 끝없어서 놓칠 수 있으니 가장자리에 삼각형으로 알린다. 방향이 비슷한 것은 하나로 묶고 개수를 적는다.
    // 누르면 그 방향에서 가장 위험한(같으면 가까운) 점으로 간다. 같은 정보는 아래 오른쪽의 ◀ ▶ 단추와 `[` `]` 키로도 된다.
    function drawRisk(P) {
      riskRects.length = 0;
      let total = 0, outN = 0; const bk = new Map();
      P.forEach((n) => {
        if (!n.always || !shown(n) || !isOn(n)) return;
        total++;
        if (n.sx >= 0 && n.sx <= W && n.sy >= 0 && n.sy <= H) return;
        outN++;
        const dx = n.sx - W / 2, dy = n.sy - H / 2, a = Math.atan2(dy, dx), key = Math.round(a / (Math.PI / 12)), d = Math.hypot(dx, dy), b = bk.get(key);
        if (!b) bk.set(key, { c: 1, w: n, a, d });
        else { b.c++; if ((n.g === 'd' && b.w.g !== 'd') || (n.g === b.w.g && d < b.d)) { b.w = n; b.a = a; b.d = d; } }
      });
      bk.forEach((b) => {
        // 가장자리에서 조금 안쪽(아래는 범례를 피해 112px)에 놓는다. 가운데에서 점 쪽으로 쏜 선이 그 틀과 만나는 곳.
        const ux = Math.cos(b.a), uy = Math.sin(b.a), tx = ux > 0 ? (W - 18 - W / 2) / ux : ux < 0 ? (18 - W / 2) / ux : 1e9, ty = uy > 0 ? (H - 112 - H / 2) / uy : uy < 0 ? (18 - H / 2) / uy : 1e9;
        const t = Math.max(0, Math.min(tx, ty)), x = W / 2 + ux * t, y = H / 2 + uy * t;
        // 위험은 속이 찬 삼각형, 주의는 속이 빈 삼각형(색만으로 구분하지 않는다)
        const dg = b.w.g === 'd';
        ctx.save(); ctx.translate(x, y); ctx.rotate(b.a); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, 7); ctx.lineTo(-6, -7); ctx.closePath();
        if (dg) { ctx.strokeStyle = C.bg; ctx.fillStyle = C.danger; ctx.stroke(); ctx.fill(); } else { ctx.fillStyle = 'rgba(10,14,20,.92)'; ctx.strokeStyle = C.warn; ctx.fill(); ctx.stroke(); }
        ctx.restore();
        if (b.c > 1) { ctx.font = '12px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = C.bg; ctx.fillStyle = C.ink; ctx.strokeText(b.c, x - ux * 22, y - uy * 22); ctx.fillText(b.c, x - ux * 22, y - uy * 22); ctx.textAlign = 'left'; }
        riskRects.push({ x: x - 16, y: y - 16, w: 32, h: 32, i: b.w.i });
      });
      const txt = `위험·주의 ${total}개 · 화면 밖 ${outN}개`;
      if (txt !== riskTxt) { riskTxt = txt; $('rinfo').textContent = txt; }
    }

    // 이름표 자리: 지금 보이는 점만, 중요한 순으로 다른 이름표·점과 겹치지 않는 첫 자리. 확대·이동·펼침이 멈춘 뒤 다시 정한다.
    function placeLabels(now) {
      const s = sc(), vis = nodes.filter((n) => { const [x, y] = toScreen(n.tx, n.ty); return shown(n) && x > -20 && x < W + 20 && y > -20 && y < H + 20; });
      const want = vis.filter((n) => isOn(n) && (n.always || n.mine || n.fresh || s >= 1.4)).sort((a, b) => (b.always - a.always) || (b.mine - a.mine) || (b.fresh - a.fresh) || (b.pop - a.pop)).slice(0, 160);
      ctx.font = '12px ui-monospace, Consolas, monospace';
      const sx = (n) => toScreen(n.tx, n.ty), boxes = vis.map((n) => { const [x, y] = sx(n), r = radiusPx(n) + 4; return { n, x: x - r, y: y - r, w: 2 * r, h: 2 * r }; });
      const clash = (a, list) => list.some((q) => a.x < q.x + q.w && q.x < a.x + a.w && a.y < q.y + q.h && q.y < a.y + a.h);
      const placed = []; nodes.forEach((n) => { n.spot = null; });
      want.forEach((n) => {
        const [x, y] = sx(n), rp = radiusPx(n), w = ctx.measureText(labelText(n)).width + 6, H2 = 14, b = rp + 8, d = b * 0.75, others = boxes.filter((q) => q.n !== n);
        const cand = [[b, 0], [-b - w, 0], [-w / 2, -b - 6], [-w / 2, b + 6], [d, -d - 6], [d, d + 6], [-d - w, -d - 6], [-d - w, d + 6]];
        const hit = cand.find(([dx, dy]) => { const r = { x: x + dx, y: y + dy - H2 / 2, w, h: H2 }; return !clash(r, placed) && !clash(r, others); });
        if (!hit) return;
        placed.push({ x: x + hit[0], y: y + hit[1] - H2 / 2, w, h: H2 }); n.spot = { dx: hit[0], dy: hit[1] };
      });
      lastLabelAt = now; labelsDirty = false;
    }

    let last = performance.now() / 1000, lastDraw = 0;
    function frame(ms) {
      const now = ms / 1000, dt = Math.min(0.05, now - last); last = now;
      if (!paused) theta = (theta + (dt / PERIOD) * 360) % 360;
      if (drag && drag.node && drag.at) applyDrag();
      const animating = settle(dt) || nodes.some((n) => n.born);
      if (labelsDirty && now - lastLabelAt > 0.12 && !animating) placeLabels(now);
      if ((!paused || dirty || animating) && (now - lastDraw >= 0.03 || dirty)) { draw(now); lastDraw = now; dirty = false; }
      requestAnimationFrame(frame);
    }

    // ---- 조작: 끌기로 옮기기, 휠로 확대, 점 누르면 펼치기
    const hit = (cx, cy) => {
      let best = -1, bd = 1e9;
      nodes.forEach((n) => { if (n.sx == null || !shown(n) || !isOn(n)) return; const d = Math.hypot(n.sx - cx, n.sy - cy), lim = Math.max(radiusPx(n) + 6, 12); if (d < lim && d < bd) { bd = d; best = n.i; } });
      return best;
    };
    const badgeAt = (x, y) => badgeRect.findIndex((r) => r && x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]);
    const riskAt = (x, y) => riskRects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.i ?? -1;
    const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    let drag = null;
    // ---- 점 옮기기(옵시디언처럼): 잡은 점은 포인터를 따라가고, 이어진 점은 줄에 끌려오듯 따라온다. 줄 길이는 잡기 전의 거리다.
    // 겹치면 밀어낸다. 옮긴 자리는 저장하지 않는다(새로 고치면 처음 자리). 갈래·접기·밝기는 자리가 아니라 데이터(q, 최근 확인)를 따른다.
    const captureRopes = () => edges.forEach((e) => { e.len = Math.hypot(nodes[e.a].tx - nodes[e.b].tx, nodes[e.a].ty - nodes[e.b].ty); });
    const syncPolar = () => nodes.forEach((n) => { n.rad = Math.hypot(n.tx, n.ty); n.deg = ((Math.atan2(n.tx, -n.ty) / RAD) + 360) % 360; });
    const isMoved = (n) => Math.hypot(n.tx - n.hx, n.ty - n.hy) > 1;
    function pull(pin) {
      const before = nodes.map((n) => [n.tx, n.ty]);
      for (let it = 0; it < 8; it++) {
        edges.forEach((e) => {
          const a = nodes[e.a], b = nodes[e.b], dx = b.tx - a.tx, dy = b.ty - a.ty, d = Math.hypot(dx, dy) || 0.01;
          if (d <= e.len) return;
          const wa = a === pin ? 0 : 1, wb = b === pin ? 0 : 1, w = wa + wb, ex = (d - e.len) / d;
          if (!w) return;
          a.tx += (dx * ex * wa) / w; a.ty += (dy * ex * wa) / w; b.tx -= (dx * ex * wb) / w; b.ty -= (dy * ex * wb) / w;
        });
      }
      // 겹침 풀기: 움직인 점(잡은 점 포함)이 다른 점과 겹치면 서로 밀어낸다. 잡은 점은 안 밀리고 상대가 다 밀린다.
      // 밀린 점도 같은 일을 하고, 더 밀 것이 없으면 멈춘다. 칸(40)으로 나눠 가까운 점끼리만 본다(점 반지름 9 이하라 겹칠 수 있는 거리는 26 이하).
      const moved = [pin, ...nodes.filter((n, i) => n !== pin && (n.tx !== before[i][0] || n.ty !== before[i][1]))], movedSet = new Set(moved);
      const push = (a, o) => {
        const dx = a.tx - o.tx, dy = a.ty - o.ty, d = Math.hypot(dx, dy) || 0.01, min = a.r + o.r + 8, wa = a === pin ? 0 : 1, wb = o === pin ? 0 : 1;
        if (d >= min || !(wa + wb)) return false;
        const f = (min - d) / d / (wa + wb);
        a.tx += dx * f * wa; a.ty += dy * f * wa; o.tx -= dx * f * wb; o.ty -= dy * f * wb;
        [a, o].forEach((n) => { if (!movedSet.has(n)) { movedSet.add(n); moved.push(n); } });
        return true;
      };
      for (let it = 0, any = true; it < 16 && any; it++) {
        const grid = new Map(), cellOf = (n) => Math.floor(n.tx / 40) * 100003 + Math.floor(n.ty / 40);
        nodes.forEach((o) => { const k = cellOf(o), l = grid.get(k); if (l) l.push(o); else grid.set(k, [o]); });
        any = false;
        for (let m = 0; m < moved.length; m++) {
          const a = moved[m], c = cellOf(a);
          for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) (grid.get(c + i * 100003 + j) ?? []).forEach((o) => { if (o !== a && push(a, o)) any = true; });
        }
      }
      syncPolar(); dirty = labelsDirty = true;
    }
    function moveNode(n, x, y) { n.born = 0; n.tx = n.px = x; n.ty = n.py = y; pull(n); }
    function applyDrag() {
      const [x, y] = drag.at, s = sc(); drag.at = null;
      moveNode(drag.node, view.x + (x - W / 2) / s + drag.off[0], view.y + (y - H / 2) / s + drag.off[1]);
      if (!drag.shown) { drag.shown = true; describe(drag.node); } // 옮기기 시작하면 카드의 "자리"가 바로 바뀐다
    }
    function startNodeDrag(d) {
      d.node = nodes[d.id]; captureRopes(); selId = hoverId = d.id; describe(d.node);
      const s = sc(); d.off = [d.node.tx - (view.x + (d.x - W / 2) / s), d.node.ty - (view.y + (d.y - H / 2) / s)];
    }
    function goHome() { nodes.forEach((n) => { n.tx = n.hx; n.ty = n.hy; }); syncPolar(); $('stat').dataset.msg = '옮긴 점을 원래 자리로 돌려 보냈어요'; refresh(); if (selId >= 0) describe(nodes[selId]); dirty = labelsDirty = true; }
    cv.addEventListener('pointerdown', (e) => { const [x, y] = local(e); cv.setPointerCapture(e.pointerId); drag = { x, y, vx: view.x, vy: view.y, id: hit(x, y), bq: badgeAt(x, y), rk: riskAt(x, y), moved: false }; });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = local(e);
      if (drag) {
        const dx = x - drag.x, dy = y - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; cv.classList.add('grabbing'); if (drag.id >= 0) startNodeDrag(drag); }
        if (drag.moved && drag.node) drag.at = [x, y];
        else if (drag.moved) { view.x = drag.vx - dx / sc(); view.y = drag.vy - dy / sc(); dirty = labelsDirty = true; }
        return;
      }
      const h = hit(x, y);
      cv.classList.toggle('node', h >= 0); cv.classList.toggle('pointer', h < 0 && (badgeAt(x, y) >= 0 || riskAt(x, y) >= 0));
      if (h !== hoverId) { hoverId = h; if (h >= 0 && selId < 0) describe(nodes[h]); dirty = true; } // 고른 점이 있으면 카드는 그 점에 머문다(카드의 단추를 누르러 갈 때 바뀌지 않게)
    });
    const endDrag = (e) => {
      if (!drag) return;
      cv.classList.remove('grabbing');
      if (!drag.moved && drag.id >= 0) { selId = drag.id; describe(nodes[selId]); expandNode(nodes[selId]); }
      else if (!drag.moved && drag.bq >= 0) setFold(drag.bq, false);
      else if (!drag.moved && drag.rk >= 0) goTo(nodes[drag.rk]);
      else if (!drag.moved) { selId = -1; }
      else if (drag.node) { if (drag.at) applyDrag(); $('stat').dataset.msg = `${drag.node.name}을(를) 옮겼어요`; refresh(); describe(drag.node); }
      drag = null; dirty = true;
    };
    cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', () => { drag = null; cv.classList.remove('grabbing'); });
    cv.addEventListener('pointerleave', () => { if (!drag && hoverId >= 0) { hoverId = -1; cv.classList.remove('pointer', 'node'); dirty = true; } });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = local(e); zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    cv.addEventListener('dblclick', () => fit()); // 이벤트가 인자로 넘어가면 "가운데 빼기"로 읽히므로 비워서 부른다

    const lastText = (n) => (n.h == null ? '확인한 적 없어요' : `${n.h}시간 전`) + (n.err ? ' · 그 뒤 읽기 실패' : '');
    const kidsText = (n) => (n.expanded ? '펼쳤어요' : n.kidsN ? `눌러서 ${n.kidsN}개 펼쳐요` : '더 없어요');
    const stateText = (n) => (n.err ? '수집 오류라서 확인했다고 보지 않아요' : n.h == null ? '확인한 적이 없어서 어두워요' : n.fresh ? '최근에 확인해서 선이 닿으면 밝아져요' : `${WIN}시간이 넘어서 어두워요`);
    const dot = (n) => `<svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true" style="vertical-align:-1px"><circle r="5" fill="${status(n)}"/></svg>`;
    const MOVES = [['0,-1', '↑', '위로'], ['0,1', '↓', '아래로'], ['-1,0', '←', '왼쪽으로'], ['1,0', '→', '오른쪽으로']];
    function describe(n) {
      cardNode = n; $('infoEmpty').hidden = true; $('infoBody').hidden = false;
      $('infoBody').innerHTML = `<h2 style="margin-bottom:6px">${dot(n)} ${n.name}</h2><dl><dt>종류·갈래</dt><dd>${KIND[n.kind]} · ${QUAD[n.q]}</dd><dt>보안 등급</dt><dd>${gradeText(n)}</dd><dt>이유</dt><dd>${gradeWhy(n)}</dd>
        <dt>마지막 확인</dt><dd>${lastText(n)}</dd><dt>최근 변경</dt><dd>${n.chg ? '있음' : '없음'}</dd><dt>연결</dt><dd>${n.nb.size}개</dd><dt>펼치기</dt><dd>${kidsText(n)}</dd><dt>자리</dt><dd>${isMoved(n) ? '직접 옮겼어요' : '처음 자리예요'}</dd><dt>밝기</dt><dd>${stateText(n)}</dd></dl>
        <div class="acts">${n.kidsN && !n.expanded ? `<button type="button" class="tbtn" data-exp>펼치기 +${n.kidsN}</button>` : ''}<button type="button" class="tbtn" data-focus>${focusSet && focusId === n.i ? '중심으로 보는 중' : '이 점 중심으로 보기'}</button></div>
        <div class="acts"><span class="lab">옮기기</span>${MOVES.map(([v, s, l]) => `<button type="button" class="tbtn" data-mv="${v}" aria-label="이 점을 ${l} 옮기기">${s}</button>`).join('')}</div>`;
    }
    // 끌기의 대안(WCAG 2.5.7): 카드의 방향 단추와 쉬프트+방향키가 같은 일을 한다. 한 번에 화면 24px.
    function nudge(n, dx, dy) {
      captureRopes(); moveNode(n, n.tx + dx, n.ty + dy); selId = n.i;
      $('stat').dataset.msg = `${n.name}을(를) 옮겼어요`; refresh(); describe(n);
    }
    $('infoBody').addEventListener('click', (e) => {
      const n = cardNode, f = e.target.closest('[data-focus]'), m = e.target.closest('[data-mv]'), x = e.target.closest('[data-exp]');
      if (!n) return;
      if (x) { expandNode(n); $('infoBody').querySelector('[data-focus]')?.focus(); } // 마우스 없이도 펼친다(펼치고 나면 이 단추는 사라지므로 포커스를 옆 단추로)
      else if (f) { enterFocus(n.i); $('infoBody').querySelector('[data-focus]')?.focus(); }
      else if (m) { const [dx, dy] = m.dataset.mv.split(',').map(Number), d = 24 / sc(); nudge(n, dx * d, dy * d); $('infoBody').querySelector(`[data-mv="${m.dataset.mv}"]`)?.focus(); }
    });
    function expandNode(n) {
      if (folded[n.q]) setFold(n.q, false);
      const kids = expand(n);
      if (focusSet && focusSet.has(n.i)) kids.forEach((k) => focusSet.add(k.i)); // 중심 보기 중에 펼친 점은 보인다
      if (!kids.length) { if (n.kidsN && !n.expanded) $('stat').dataset.msg = '시안에서는 기술 1,200개까지만 펼쳐요'; return; }
      dirty = labelsDirty = true; $('stat').dataset.msg = `${n.name}에서 같은 역할 ${kids.length}개를 펼쳤어요`; refresh(); describe(n);
    }
    function refresh() {
      const fresh = nodes.filter((n) => n.fresh).length;
      const hiddenN = nodes.filter((n) => !shown(n)).length, movedN = nodes.filter(isMoved).length;
      $('home').disabled = !movedN; syncLegend();
      $('stat').innerHTML = `기술 ${nodes.length}개${hiddenN ? `(지금 감춘 ${hiddenN}개)` : ''} 연결 ${edges.length}개${movedN ? ` 옮긴 점 ${movedN}개` : ''}<br>최근 확인 ${fresh}개${$('stat').dataset.msg ? `<br>${$('stat').dataset.msg}` : ''}`;
      renderTable();
    }
    // 표 보기: 지도와 같은 모든 점(접힌·걸러진·감춘 점도). 위험 먼저·이름순·마지막 확인이 오래된 순으로 정렬하고, 상태(범례와 같은 판정)와 이름으로 거른다.
    const SEV = (n) => (n.g === 'd' ? 0 : n.g === 'w' ? 1 : n.err ? 2 : n.g === 'u' ? 3 : n.g === 'n' ? 4 : 5);
    const nat = (a, b) => a.name.localeCompare(b.name, 'en', { numeric: true });
    function renderTable() {
      const f = $('tFilter').value, q = $('tQ').value.trim().toLowerCase(), by = $('tSort').value;
      const rows = nodes.filter((n) => (!f || STATE[f](n)) && (!q || n.name.toLowerCase().includes(q)))
        .sort(by === 'name' ? nat : by === 'old' ? (a, b) => ((b.h ?? 1e9) - (a.h ?? 1e9)) || nat(a, b) : (a, b) => (SEV(a) - SEV(b)) || nat(a, b));
      $('tableNote').textContent = rows.length === nodes.length ? `전체 ${nodes.length}개예요.` : `${nodes.length}개 중 ${rows.length}개를 보여요.`;
      $('rows').innerHTML = rows.map((n) => `<tr><td>${n.name}</td><td>${KIND[n.kind]}</td><td>${QUAD[n.q]}</td><td>${gradeText(n)}</td><td>${lastText(n)}</td><td>${n.chg ? '있음' : '없음'}</td>
        <td>${n.kidsN && !n.expanded ? `<button type="button" class="tbtn" data-expand="${n.i}">펼치기 +${n.kidsN}</button>` : n.expanded ? '펼쳤어요' : '없음'}</td></tr>`).join('');
    }
    $('rows').addEventListener('click', (e) => {
      const b = e.target.closest('[data-expand]'); if (!b) return;
      const at = [...$('rows').querySelectorAll('[data-expand]')].indexOf(b); expandNode(nodes[+b.dataset.expand]);
      const left = $('rows').querySelectorAll('[data-expand]'); (left[at] ?? left[left.length - 1] ?? $('tableBox').querySelector('summary')).focus(); // 누른 단추는 사라지므로 포커스를 다음 단추로
    });

    // ---- 갈래 접기: 단추 이름은 그대로 두고 펼침 상태(aria-expanded)만 바꾼다.
    const foldBox = $('folds');
    foldBox.innerHTML = QUAD.map((t, q) => `<button type="button" class="tbtn" data-fold="${q}"></button>`).join('');
    function syncFolds() {
      foldBox.querySelectorAll('[data-fold]').forEach((b) => {
        const q = +b.dataset.fold, f = folded[q];
        b.setAttribute('aria-expanded', String(!f));
        b.textContent = f ? `▸ ${QUAD[q]} · 내 기술 ${countQ(q, (n) => n.mine)} · 위험 ${countQ(q, (n) => n.g === 'd')}` : `▾ ${QUAD[q]}`;
      });
    }
    function setFold(q, v) {
      folded[q] = v;
      if (v) {
        if (selId >= 0 && nodes[selId].q === q) { selId = -1; $('infoEmpty').hidden = false; $('infoBody').hidden = true; }
        if (hoverId >= 0 && nodes[hoverId].q === q) hoverId = -1;
      }
      $('stat').dataset.msg = `${QUAD[q]} 갈래를 ${v ? '접었어요' : '폈어요'}`; syncFolds(); refresh(); dirty = labelsDirty = true;
    }
    foldBox.addEventListener('click', (e) => { const b = e.target.closest('[data-fold]'); if (b) setFold(+b.dataset.fold, !folded[+b.dataset.fold]); });

    // ---- 검색: 지금 지도에 있는 기술의 이름·종류로 찾아 그 점으로 간다. 접힌 갈래에 있으면 펴서 보여 준다.
    const qIn = $('q'), hitsBox = $('hits');
    const find = (text) => {
      const t = text.trim().toLowerCase();
      return t ? nodes.filter((n) => `${n.name} ${KIND[n.kind]}`.toLowerCase().includes(t)).sort((a, b) => (b.always - a.always) || (b.mine - a.mine) || a.name.localeCompare(b.name, 'en', { numeric: true })) : [];
    };
    function goTo(n, focusMap = true) { // 감춰져 있으면(중심 보기·거르기·접기) 풀고 보여 준다
      if (focusSet && !focusSet.has(n.i)) exitFocus(false);
      if (fActive && !isOn(n)) clearFilters();
      if (folded[n.q]) setFold(n.q, false);
      selId = n.i; describe(n); view.x = n.tx; view.y = n.ty; view.k = clamp(Math.max(view.k, 1.6), 0.2, 6);
      $('stat').dataset.msg = `${n.name}(으)로 이동했어요`; refresh(); dirty = labelsDirty = true; if (focusMap) cv.focus({ preventScroll: true }); // 지도를 옮길 때 페이지가 같이 움직이지 않게
    }
    function showHits() {
      const r = find(qIn.value), top = r.slice(0, 8);
      hitsBox.hidden = !qIn.value.trim();
      hitsBox.innerHTML = top.length
        ? top.map((n) => `<li><button type="button" data-go="${n.i}"><span>${n.name}</span><span class="m">${KIND[n.kind]} · ${gradeText(n)}</span></button></li>`).join('') + (r.length > 8 ? `<li class="more">외 ${r.length - 8}개예요. 더 입력해 보세요</li>` : '')
        : '<li class="none">찾는 기술이 없어요. 이 시안은 지금 지도에 있는 기술만 찾아요</li>';
      $('qnote').textContent = qIn.value.trim() ? `검색 결과 ${r.length}개` : '';
    }
    qIn.addEventListener('input', showHits); qIn.addEventListener('focus', showHits);
    qIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const n = find(qIn.value)[0]; if (n) { goTo(n); hitsBox.hidden = true; } }
      else if (e.key === 'Escape') { qIn.value = ''; showHits(); }
      else if (e.key === 'ArrowDown') hitsBox.querySelector('button')?.focus();
      else return;
      e.preventDefault();
    });
    hitsBox.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) { goTo(nodes[+b.dataset.go]); hitsBox.hidden = true; } });
    hitsBox.addEventListener('keydown', (e) => {
      const bs = [...hitsBox.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') bs[i + 1]?.focus(); else if (e.key === 'ArrowUp') (i > 0 ? bs[i - 1] : qIn).focus(); else if (e.key === 'Escape') { hitsBox.hidden = true; qIn.focus(); } else return;
      e.preventDefault();
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) hitsBox.hidden = true; });

    // ---- 범례 = 거르기: 칩을 누르면 그 상태의 점만 진하게(눌러 둔 것 중 하나라도 맞으면). 숫자는 지금 보이는 점 수.
    const svg = (inner, s = 14) => `<svg width="${s}" height="${s}" viewBox="-7 -7 14 14" aria-hidden="true">${inner}</svg>`;
    const dotSvg = (c) => svg(`<circle r="4.5" fill="${c}"/>`), ringSvg = (extra = '') => svg(`<circle r="4.5" fill="none" stroke="${C.dim}" stroke-width="1.6" ${extra}/>`);
    const CHIPS = [
      ['d', '위험', dotSvg(C.danger)], ['w', '주의', dotSvg(C.warn)], ['fresh', '최근 확인', dotSvg(C.lit)], ['old', '오래됨', dotSvg(C.dim)],
      ['n', '검사 전', ringSvg('stroke-dasharray="1.5 2.5"')], ['u', '찾지 못함', ringSvg()],
      ['e', '수집 오류', svg(`<circle r="5" fill="none" stroke="${C.ink}" stroke-width="1.4"/><path d="M-2.5-2.5L2.5 2.5M2.5-2.5L-2.5 2.5" stroke="${C.ink}" stroke-width="1.4"/>`)],
      ['o', '외톨이', svg(`<circle cx="3" r="3" fill="${C.dim}"/><path d="M-6 0H-2" stroke="${C.dim}" stroke-dasharray="1.5 1.5"/>`)],
    ];
    $('tFilter').innerHTML = '<option value="">전체</option>' + CHIPS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
    ['tSort', 'tFilter'].forEach((id) => $(id).addEventListener('change', renderTable)); $('tQ').addEventListener('input', renderTable);
    const legend = $('legend');
    legend.innerHTML = CHIPS.map(([k, t, i]) => `<li><button type="button" class="chip" data-f="${k}" aria-pressed="false">${i}${t} <b>0</b></button></li>`).join('')
      + '<li><button type="button" class="chip" id="fclear" hidden>거르기 풀기</button></li>'
      + `<li>${svg(`<circle r="3" fill="${C.dim}"/><circle r="5.5" fill="none" stroke="#2ed573" stroke-width="1" stroke-dasharray="2 2.5"/>`)}점선 고리: 눌러서 펼치기</li>`
      + `<li>${svg(`<circle cx="-1" cy="1" r="3.6" fill="${C.dim}"/><circle cx="3.2" cy="-3.2" r="2.2" fill="${C.ink}"/>`)}흰 점: 최근 변경</li><li>최근 확인한 점은 선이 닿으면 밝아져요</li>`;
    function syncLegend() {
      const vis = nodes.filter(shown);
      legend.querySelectorAll('[data-f]').forEach((b) => { b.setAttribute('aria-pressed', String(fstate.has(b.dataset.f))); b.querySelector('b').textContent = vis.filter(STATE[b.dataset.f]).length; });
      $('fclear').hidden = !fActive;
    }
    function afterFilter() {
      fFns = [...fstate].map((k) => STATE[k]); fActive = fstate.size > 0 || fkind.size > 0 || fmine;
      const n = fstate.size + fkind.size + (fmine ? 1 : 0), on = nodes.filter((x) => shown(x) && isOn(x)).length;
      $('fsum').textContent = n ? `거르기 (${n})` : '거르기';
      $('stat').dataset.msg = !fActive ? '거르기를 풀었어요' : on ? `거르는 중: 맞는 점 ${on}개만 진하게 보여요` : '거르는 조건에 맞는 점이 없어요';
      refresh(); dirty = labelsDirty = true;
    }
    function clearFilters() { fstate.clear(); fkind.clear(); fmine = false; $('filterBox').querySelectorAll('input').forEach((i) => { i.checked = false; }); afterFilter(); }
    legend.addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]');
      if (b) { const k = b.dataset.f; if (fstate.has(k)) fstate.delete(k); else fstate.add(k); afterFilter(); }
      else if (e.target.closest('#fclear')) clearFilters();
    });
    $('filterBox').addEventListener('change', (e) => {
      const i = e.target;
      if (i.dataset.kind) { if (i.checked) fkind.add(i.dataset.kind); else fkind.delete(i.dataset.kind); } else if (i.dataset.scope) fmine = i.checked;
      afterFilter();
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('#filterBox')) $('filterBox').open = false; });

    // ---- 이 점 중심으로 보기(1~3단계): 카드의 단추나 Enter. 숫자 1~3으로 단계를, Esc로 전체를 본다. 나갈 때 들어오기 전 자리로 돌아간다.
    function calcFocus() {
      const set = new Set([focusId]); let edge = [focusId];
      for (let d = 0; d < focusDepth; d++) { const next = []; edge.forEach((i) => nodes[i].nb.forEach((j) => { if (!set.has(j)) { set.add(j); next.push(j); } })); edge = next; }
      focusSet = set;
    }
    function syncFocus() {
      $('focusbar').hidden = !focusSet; if (!focusSet) return;
      $('fname').textContent = `${nodes[focusId].name} 중심`; $('fdepth').textContent = `${focusDepth}단계 · ${focusSet.size}개`;
      $('fdec').disabled = focusDepth <= 1; $('finc').disabled = focusDepth >= 3;
    }
    function enterFocus(i) {
      if (!focusSet) { focusPrev = { ...view }; focusDepth = 1; }
      focusId = i; calcFocus(); selId = i; describe(nodes[i]); syncFocus(); fit(false); view.k = Math.min(view.k, 3);
      $('stat').dataset.msg = `${nodes[i].name} 중심으로 봐요. 숫자 1~3으로 단계를, Esc로 전체를 봐요`; refresh();
    }
    function setDepth(d) { if (!focusSet) return; focusDepth = clamp(d, 1, 3); calcFocus(); syncFocus(); fit(false); view.k = Math.min(view.k, 3); refresh(); }
    function exitFocus(restore = true) {
      if (!focusSet) return;
      focusSet = null; focusId = -1; if (restore && focusPrev) Object.assign(view, focusPrev); focusPrev = null;
      syncFocus(); $('stat').dataset.msg = '전체를 봐요'; refresh(); if (selId >= 0) describe(nodes[selId]); dirty = labelsDirty = true;
    }
    $('fdec').addEventListener('click', () => setDepth(focusDepth - 1)); $('finc').addEventListener('click', () => setDepth(focusDepth + 1)); $('fexit').addEventListener('click', () => exitFocus());

    // ---- 화면 이동 단추와 위험 찾기(끌지 않고도 되게: WCAG 2.5.7). 가운데 단추는 가운데(나)로.
    $('dpad').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pan]'); if (!b) return;
      const [dx, dy] = b.dataset.pan.split(',').map(Number);
      if (!dx && !dy) { view.x = 0; view.y = 0; } else { view.x += (dx * W * 0.25) / sc(); view.y += (dy * H * 0.25) / sc(); }
      dirty = labelsDirty = true;
    });
    const riskList = () => nodes.filter((n) => n.always && shown(n) && isOn(n)).sort((a, b) => ((b.g === 'd') - (a.g === 'd')) || (a.rad - b.rad) || a.name.localeCompare(b.name, 'en', { numeric: true }));
    function jumpRisk(dir, focusMap = true) {
      const l = riskList();
      if (!l.length) { $('stat').dataset.msg = '지금 보이는 위험·주의가 없어요'; refresh(); return; }
      const cur = l.findIndex((n) => n.i === selId);
      goTo(l[cur < 0 ? (dir > 0 ? 0 : l.length - 1) : (cur + dir + l.length) % l.length], focusMap);
    }
    $('rprev').addEventListener('click', () => jumpRisk(-1, false)); $('rnext').addEventListener('click', () => jumpRisk(1, false));

    // ---- 키보드로 점 사이 이동(PRD-F23 "키보드로 이동"): J/K = 다음·이전 점(위험·주의 → 내 기술 → 가까운 순), , . = 고른 점의 이전·다음 이웃(가까운 순).
    // 보이는 점(접힌·거른·중심 보기에서 감춘 점 제외)만 오간다. 이동하면 그 점이 선택되어 카드가 읽힌다.
    const navList = () => nodes.filter((n) => shown(n) && isOn(n))
      .sort((a, b) => ((b.always - a.always) || ((b.g === 'd') - (a.g === 'd')) || (b.mine - a.mine) || (a.rad - b.rad) || nat(a, b)));
    function stepNode(dir) {
      const l = navList();
      if (!l.length) { $('stat').dataset.msg = '지금 보이는 점이 없어요'; refresh(); return; }
      const cur = l.findIndex((n) => n.i === selId), n = l[cur < 0 ? (dir > 0 ? 0 : l.length - 1) : (cur + dir + l.length) % l.length];
      goTo(n); $('stat').dataset.msg = `${n.name} (${l.indexOf(n) + 1}/${l.length})`; refresh();
    }
    let nbRing = null;
    function stepNeighbor(dir) {
      if (selId < 0) { $('stat').dataset.msg = '먼저 점을 골라 주세요(J·K, 검색, 클릭)'; refresh(); return; }
      if (!nbRing || nbRing.list[nbRing.idx]?.i !== selId) { // 새로 고른 점이면 그 점의 이웃을 가까운 순으로 모은다. 이웃으로 옮겨 다니는 동안은 같은 점의 이웃을 돈다
        const s = nodes[selId], d = (n) => Math.hypot(n.tx - s.tx, n.ty - s.ty);
        nbRing = { origin: s, idx: -1, list: [...s.nb].map((i) => nodes[i]).filter((n) => shown(n) && isOn(n)).sort((a, b) => d(a) - d(b) || nat(a, b)) };
      }
      const L = nbRing.list;
      if (!L.length) { $('stat').dataset.msg = `${nbRing.origin.name}에 이어진 점이 없어요(감춰진 것 제외)`; nbRing = null; refresh(); return; }
      nbRing.idx = nbRing.idx < 0 ? (dir > 0 ? 0 : L.length - 1) : (nbRing.idx + dir + L.length) % L.length;
      const n = L[nbRing.idx]; goTo(n); $('stat').dataset.msg = `${nbRing.origin.name}의 이웃 ${nbRing.idx + 1}/${L.length}: ${n.name}`; refresh();
    }

    const pause = $('pause');
    const syncPause = () => { pause.setAttribute('aria-pressed', String(paused)); pause.textContent = paused ? '움직임 켜기' : '움직임 멈추기'; dirty = true; };
    const togglePause = () => { paused = !paused; syncPause(); };
    pause.addEventListener('click', togglePause); $('fit').addEventListener('click', () => fit()); $('home').addEventListener('click', goHome);
    $('zin').addEventListener('click', () => zoomAt(W / 2, H / 2, 1.4)); $('zout').addEventListener('click', () => zoomAt(W / 2, H / 2, 1 / 1.4));
    $('toTable').addEventListener('click', () => { const d = $('tableBox'); d.open = true; d.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); d.querySelector('summary').focus(); });
    cv.addEventListener('keydown', (e) => {
      const step = 70 / sc(), k = e.key;
      if (e.shiftKey && selId >= 0 && k.startsWith('Arrow')) { // 끌기의 대안: 고른 점을 쉬프트+방향키로 옮긴다
        const d = 24 / sc();
        nudge(nodes[selId], k === 'ArrowRight' ? d : k === 'ArrowLeft' ? -d : 0, k === 'ArrowDown' ? d : k === 'ArrowUp' ? -d : 0); e.preventDefault(); return;
      }
      if (k === ']' || k === '[') { jumpRisk(k === ']' ? 1 : -1); e.preventDefault(); return; } // 다음·이전 위험·주의
      if (k === 'j' || k === 'J' || k === 'k' || k === 'K') { stepNode(k === 'j' || k === 'J' ? 1 : -1); e.preventDefault(); return; } // 다음·이전 점
      if (k === '.' || k === ',') { stepNeighbor(k === '.' ? 1 : -1); e.preventDefault(); return; } // 고른 점의 다음·이전 이웃
      if (k === 'Escape' && !focusSet && selId >= 0) { selId = -1; $('infoEmpty').hidden = false; $('infoBody').hidden = true; dirty = true; e.preventDefault(); return; } // 선택 풀기(중심 보기 중이면 문서 단축키가 중심 보기를 푼다)
      if (k === 'Enter' && selId >= 0 && shown(nodes[selId])) { enterFocus(selId); e.preventDefault(); return; }
      if (k === 'ArrowLeft') view.x -= step; else if (k === 'ArrowRight') view.x += step; else if (k === 'ArrowUp') view.y -= step; else if (k === 'ArrowDown') view.y += step;
      else if (k === '+' || k === '=') zoomAt(W / 2, H / 2, 1.25); else if (k === '-' || k === '_') zoomAt(W / 2, H / 2, 1 / 1.25); else if (k === '0' || k === 'f' || k === 'F') fit();
      else return;
      e.preventDefault(); dirty = labelsDirty = true;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && focusSet && !e.target.closest('#q, #hits')) { exitFocus(); e.preventDefault(); return; }
      if (focusSet && /^[1-3]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest('input, textarea, select')) { setDepth(+e.key); e.preventDefault(); return; } // 지도에 포커스가 없어도(카드 단추 위에서도) 된다
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest('input, select, textarea')) { e.preventDefault(); qIn.focus(); return; }
      if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest('button, a, summary, input, select, textarea')) { e.preventDefault(); togglePause(); }
    });

    window.__g = { nodes, edges, view, expand: expandNode, fit, zoomAt, sc, toScreen, get theta() { return theta; }, get paused() { return paused; }, get rings() { return lastRings; }, TAIL, size: () => ({ W, H }), hit, folded, fold: setFold, find, goTo, badgeRect, move: moveNode, ropes: captureRopes, home: goHome, isMoved,
      isOn, fstate, fkind, afterFilter, clearFilters, riskList, jumpRisk, riskRects, focus: enterFocus, depth: setDepth, exitFocus, get focusSet() { return focusSet; }, nudge, shown, navList, stepNode, stepNeighbor, renderTable };
    resize(); syncFolds(); refresh(); syncPause(); fit(); requestAnimationFrame(frame);
  })();
