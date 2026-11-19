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
      d: '알려진 취약점이 있어요(심각도 높음)' + (n.mine ? '. 고친 버전은 알림에서 확인해요' : ''), // 알림은 내 기술에만 온다
      w: '12개월 넘게 활동이 없거나 주의할 패턴이 있어요',
      p: '알려진 문제를 찾지 못했어요. 안전하다는 보증은 아니에요',
      u: '근거를 하나도 확인하지 못했어요. 문제가 없다는 뜻은 아니에요',
      n: '아직 한 번도 읽지 않았어요. 읽은 뒤에 등급이 정해져요',
    }[n.g]) + (n.err ? `. 지금은 수집 오류예요(${n.err}). ${n.h == null ? '아직 한 번도 읽지 못했어요' : '등급은 마지막으로 읽은 결과예요'}. 문제가 없다고 보지 않아요` : '');
    const QUAD = ['코드 작성', '보안 점검', '데이터', '화면 디자인'];
    // 쓰는 곳(erd `technologies.hosts`, 여러 개일 수 있음)은 갈래가 아니라 기술의 칸이다(ADR 0008 9번). 보기만 이 칸으로 다시 묶는다. 시안 값은 씨앗으로 정한 예시:
    // 스킬은 Claude Code(셋 중 하나는 Codex에서도), MCP는 Claude Code나 Cursor(다섯 중 하나는 Codex에서도), 패키지는 따로 쓰는 도구.
    const HOSTS = ['Claude Code', 'Codex', 'Cursor', '따로 쓰는 도구'];
    const hostsOf = (kind, seed) => (kind === 'pkg' ? [3] : kind === 'skill' ? (seed % 3 ? [0] : [0, 1]) : [seed % 2 ? 2 : 0, ...(seed % 5 ? [] : [1])]);
    const WIN = 36, PERIOD = 18, TAIL = 150, TRAIL = 70, RAD = Math.PI / 180, RING = 110, MAXN = 1200, DUR = 0.6;
    // 처음 열 때 선은 한 바퀴 2초로 빠르게 돈다. LOAD는 시안에서 데이터를 기다리는 척하는 시간(초)이고 실제 앱에서는 데이터가 오면 끝난다. ?load=3 으로 길게 볼 수 있다.
    const FAST = 2, loadArg = Number(new URLSearchParams(location.search).get('load') ?? 0.9), LOAD = Number.isFinite(loadArg) ? Math.max(0, loadArg) : 0.9;
    const C = { bg: '#0a0e14', green: '#2ed573', ring: '#1e8f55', dim: '#5a7890', lit: '#5ec8ff', danger: '#f87171', warn: '#fbbf24', ink: '#e6edf3', muted: '#8fa3b0', edge: '143,163,176' };
    const count = { mcp: 0, skill: 0, pkg: 0 }, nodes = [], edges = [];

    function add(o) {
      let g = o.g, h = o.h, err = null;
      if (g === 'e') { // 읽기 실패를 만드는 약속: 마지막으로 매긴 등급(통과였거나, 한 번도 못 읽었으면 찾지 못함)을 남기고 오류만 덧붙인다
        err = WHY[o.seed % 5]; g = o.seed % 2 ? 'u' : 'p'; h = g === 'u' ? null : 40 + (o.seed % 60);
      }
      const n = { i: nodes.length, name: `sample-${o.kind}-${++count[o.kind]}`, kind: o.kind, hosts: hostsOf(o.kind, o.seed), g, h, err, pop: o.pop, chg: !!o.chg, mine: !!o.mine, tier: o.tier,
        x: o.x, y: o.y, tx: o.x, ty: o.y, px: o.x, py: o.y, hx: o.x, hy: o.y, parent: o.parent ?? -1, seed: o.seed, kidsN: o.kidsN, expanded: false, born: 0, nb: new Set(), spot: null, k: 0 };
      n.rad = Math.hypot(n.x, n.y); n.deg = ((Math.atan2(n.x, -n.y) / RAD) + 360) % 360; n.q = Math.floor(n.deg / 90);
      n.fresh = !n.err && n.h != null && n.h <= WIN; n.always = n.g === 'd' || n.g === 'w'; n.r = n.always ? Math.max(7, 3.2 + n.pop * 1.1) : 3.2 + n.pop * 1.1;
      nodes.push(n); return n;
    }
    // 최근 변경의 종류(R17, Zalando·BYOR): 지난 확인보다 등급이 나빠짐 ▲·나아짐 ▼, 새로 들어옴 ★, 그 밖(버전·정보) ●.
    // 넷째 표시("최근 변경")의 모양만 나눈 것이라 표시 수는 넷 그대로다. 실제 앱은 등급 이력·추가된 시각에서 나온다(시안은 예시: 검사 전 = 새로).
    // 판단 대기: 판단(적용 후보·보류 등)을 아직 안 한 알림(IA-6·7, 문제정의 "판단 근거가 보이는 지도").
    // 알림은 보안 경고(위험이 됨·처음 본 위험)와 적용 기회(같은 역할 새 기술 확정)만 생긴다(erd alerts.kind). 주의는 알림이 없다.
    // 시안은 alerts.html과 같은 예시 알림 목록을 쓴다(두 화면 숫자가 맞게). 실제 앱은 alerts·judgments에서 센다.
    const ALERTS = [{ tech: 'sample-mcp-1', kind: '보안 경고' }, { tech: 'sample-mcp-1', kind: '적용 기회' }];
    const pendingOf = (n) => ALERTS.filter((a) => a.tech === n.name).length;
    const pending = (n) => pendingOf(n) > 0;
    const deltaOf = (n) => (n.g === 'n' ? 'new' : !n.chg ? null : n.always ? 'worse' : n.seed % 3 === 0 ? 'better' : 'other');
    const deltaText = (n) => ({ worse: `등급이 나빠졌어요(${n.g === 'd' ? '주의' : '통과'} → ${GRADE[n.g]})`, better: '등급이 나아졌어요(주의 → 통과)', new: '새로 들어왔어요', other: '버전·정보가 바뀌었어요' })[deltaOf(n)] ?? '';
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
    const made = []; // 처음 펼친 순서. 같은 순서로 다시 펼치면 같은 점이 같은 자리에 생긴다(상세에서 돌아올 때 되살린다)
    function expand(p) {
      if (p.made || !p.kidsN || nodes.length + p.kidsN > MAXN) return [];
      p.made = p.expanded = true; made.push(p.i);
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
      // 겹침은 부모 둘레(400)의 점끼리만 본다. 새 점은 부모에서 85~130 떨어져 나오고 겹칠 수 있는 거리는 34 이하라, 더 먼 점은 결과를 바꾸지 않는다(점이 많을 때 전체를 돌지 않게).
      const near = nodes.filter((o) => Math.hypot(o.tx - p.tx, o.ty - p.ty) < 400);
      for (let it = 0; it < 30; it++) kids.forEach((a) => {
        near.forEach((o) => {
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
    let theta = 0, dirty = true, labelsDirty = true, hoverId = -1, hoverHdl = -1, selId = -1, lastRings = 0, lastLabelAt = 0;
    // 처음 열기: 데이터를 기다리는 동안은 고리가 안쪽부터 퍼지고 선만 돈다(점은 그리지 않는다, 불변 6). 데이터가 오면 선이 한 바퀴 돌며
    // 지나간 자리부터 점이 나타나고 지도가 전체 보기로 물러난다. 움직임을 멈춘 상태면 건너뛰고, 누르거나 키를 치면 바로 끝난다.
    let intro = paused ? null : { phase: 'load', t0: performance.now() / 1000, swept: 0, sweep0: 0 }, introEnd = 0, fly = null;
    const base = () => (Math.min(W, H) / 1000) * 0.95, sc = () => view.k * base();
    const toScreen = (x, y) => [W / 2 + (x - view.x) * sc(), H / 2 + (y - view.y) * sc()];
    // 접힌 갈래(사분면)의 점은 모두 감춘다. 위험 수는 감춰져도 배지로 남긴다.
    const folded = [false, false, false, false], badgeRect = [null, null, null, null], riskRects = [];
    // 이 점 중심으로 보기: 고른 점과 N단계 이웃만 남긴다(나머지는 감춘다). 접힌 갈래와 같은 "감춤"이라 shown 하나로 처리한다.
    let focusSet = null, focusId = -1, focusDepth = 1, focusPrev = null, cardNode = null, riskTxt = '';
    // 보기(mode): cat 지도·갈래별, host 지도·쓰는 곳별, tree 나무·쓰는 곳별. arr는 지도의 지금 배치(나무로 갔다 와도 그대로).
    let mode = 'cat', arr = 'cat', segs = [], hubs = [], foldKeep = null;
    const shown = (n) => !n.cut && !folded[n.q] && (!focusSet || focusSet.has(n.i));
    // 접기: 펼쳐 나온 점은 지우지 않고 감춘다(n.cut). 부모가 접혔거나 감춰졌으면 감춘다. 자식은 늘 부모보다 뒤에 만들어지므로 한 번 훑으면 된다.
    const recut = () => nodes.forEach((n) => { n.cut = n.tier >= 2 && (!nodes[n.parent].expanded || nodes[n.parent].cut); });
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
      let moving = false; const f = 1 - Math.exp(-dt * 14), now = performance.now() / 1000;
      nodes.forEach((n) => {
        if (n.born) return;
        if (n.wait) { if (!paused && now < n.wait) { moving = true; return; } n.wait = 0; } // 보기를 바꿀 때 출발 순서를 기다린다
        const dx = n.tx - n.px, dy = n.ty - n.py;
        if (paused || Math.abs(dx) + Math.abs(dy) < 0.05) { n.px = n.tx; n.py = n.ty; return; }
        n.px += dx * f; n.py += dy * f; moving = true;
      });
      return moving;
    }
    // 위 단추 줄(메뉴·첫 점검 띠·도구가 열리면 높이가 바뀐다)의 높이. 카드와 위쪽 위험 삼각형이 그 밑으로 숨지 않게 쓴다. 매 프레임 재지 않고 바뀔 때만 잰다
    let barH = 96;
    const syncBar = () => { barH = document.querySelector(".title").offsetHeight; dirty = true; };
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2); W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); dirty = labelsDirty = true; syncBar();
    }
    new ResizeObserver(resize).observe(cv);
    // 카메라는 목표로 미끄러져 간다. 멈춘 상태면 바로 간다. 휠·확대 단추·방향키는 미끄러지던 것을 먼저 끝낸다.
    function flyTo(x, y, k, d = 0.5) {
      if (paused) { Object.assign(view, { x, y, k }); fly = null; dirty = labelsDirty = true; return; }
      fly = { from: { ...view }, to: { x, y, k }, t0: performance.now() / 1000, d };
    }
    const land = () => { if (fly) { Object.assign(view, fly.to); fly = null; dirty = labelsDirty = true; } };
    const aim = () => (fly ? fly.to : view); // 미끄러지는 중이면 도착할 자리를 기준으로 삼는다
    function zoomAt(cx, cy, f) {
      land();
      const before = sc(), wx = view.x + (cx - W / 2) / before, wy = view.y + (cy - H / 2) / before;
      view.k = clamp(view.k * f, 0.2, 6);
      const after = sc(); view.x = wx - (cx - W / 2) / after; view.y = wy - (cy - H / 2) / after; dirty = labelsDirty = true;
    }
    function fit(withOrigin = true, maxK = 6) { // 거르는 중이면 맞는 점에 맞춘다. 중심 보기에서는 가운데(나)를 빼고 그 점들에 맞춘다.
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      const pool = nodes.filter((n) => shown(n) && isOn(n));
      (pool.length ? pool : nodes.filter(shown)).forEach((n) => { x0 = Math.min(x0, n.tx); x1 = Math.max(x1, n.tx); y0 = Math.min(y0, n.ty); y1 = Math.max(y1, n.ty); });
      if (withOrigin === true || x0 > x1) { x0 = Math.min(x0, 0); x1 = Math.max(x1, 0); y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
      const s = Math.min(W / (x1 - x0 + 220), H / (y1 - y0 + 260));
      flyTo((x0 + x1) / 2, (y0 + y1) / 2, clamp((s / base()) * (arr === 'host' ? 0.9 : 1), 0.2, maxK)); // 쓰는 곳 지도는 바깥 끝에 조각 이름이 붙어 조금 더 물러난다
    }
    const loading = () => intro?.phase === 'load'; // 데이터가 오기 전에는 개수도 보이지 않는다(불변 6)
    function startReveal() { intro.phase = 'reveal'; intro.sweep0 = theta; $('loading').hidden = true; fit(); if (fly) fly.d = 1.8; refresh(); }
    function finishIntro() {
      if (!intro) return;
      const wasLoading = loading();
      if (wasLoading) fit();
      intro = null; introEnd = performance.now() / 1000; land(); $('loading').hidden = true; $('risk').hidden = false; dirty = labelsDirty = true;
      if (wasLoading) refresh();
    }

    const sprite = {};
    [['p', C.lit], ['d', C.danger], ['w', C.warn]].forEach(([k, col]) => {
      const s = document.createElement('canvas'); s.width = s.height = 96;
      const g = s.getContext('2d'), gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
      gr.addColorStop(0, col + '99'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.fillRect(0, 0, 96, 96); sprite[k] = s;
    });
    const glow = (behind) => (behind < TAIL ? Math.pow(1 - behind / TAIL, 1.6) : 0);
    const appear = (n, now) => (!intro ? 1 : n.rv == null ? 0 : ease(Math.min(1, (now - n.rv) / 0.35))); // 처음 열 때 선이 지나간 뒤 0.35초에 걸쳐 커진다
    const burst = (n, t, rr, grow, col = C.green, A = 1) => { ctx.globalAlpha = A * (1 - t) * 0.6; ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(n.sx, n.sy, rr + 4 + grow * ease(t), 0, 6.2832); ctx.stroke(); };
    const deltaPath = (k, x, y) => { // ▲ ▼ ★ ●, 지름 약 9px
      if (k === 'worse') { ctx.moveTo(x, y - 4.5); ctx.lineTo(x + 4.5, y + 3.5); ctx.lineTo(x - 4.5, y + 3.5); ctx.closePath(); }
      else if (k === 'better') { ctx.moveTo(x, y + 4.5); ctx.lineTo(x + 4.5, y - 3.5); ctx.lineTo(x - 4.5, y - 3.5); ctx.closePath(); }
      else if (k === 'new') { for (let j = 0; j < 8; j++) { const r = j % 2 ? 1.9 : 5, a = (j * Math.PI) / 4 - Math.PI / 2; ctx[j ? 'lineTo' : 'moveTo'](x + r * Math.cos(a), y + r * Math.sin(a)); } ctx.closePath(); }
      else ctx.arc(x, y, 3, 0, 6.2832);
    };
    const radiusPx = (n) => Math.max(2.4, n.r * Math.pow(sc(), 0.6));
    const status = (n) => (n.g === 'd' ? C.danger : n.g === 'w' ? C.warn : n.fresh ? C.lit : C.dim);
    const labelText = (n) => n.name + (n.always ? ` ${GRADE[n.g]}${n.err ? ' ✕' : ''}` : '') + (pending(n) ? ' · 판단 대기' : ''); // 위험·주의는 등급을 글자로 늘 적고, 수집 오류면 ✕도. 내 기술이면 판단 대기도(새 모양 대신 글자로)

    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      const s = sc(), [cx, cy] = toScreen(0, 0), far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 40, age = intro ? now - intro.t0 : 9;
      // 나를 둘러싼 은은한 빛. 세계에 붙어 있어 지도를 옮기면 같이 움직인다.
      const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, RING * 3 * s);
      gl.addColorStop(0, 'rgba(46,213,115,.07)'); gl.addColorStop(1, 'rgba(46,213,115,0)'); ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
      if (arr === 'host') segs.forEach((g) => { // 쓰는 곳 지도: 쓰는 곳마다 부채꼴 배경을 번갈아 아주 옅게(등급 색과 섞이지 않게 초록 명암만). 함께 쓰는 조각은 칠하지 않는다
        if (g.hosts.length > 1) return;
        ctx.fillStyle = `rgba(46,213,115,${g.shade ? 0.05 : 0.025})`; ctx.beginPath();
        ctx.arc(cx, cy, far, (g.a0 - 90) * RAD, (g.a1 - 90) * RAD); ctx.arc(cx, cy, HUB_R * 0.6 * s, (g.a1 - 90) * RAD, (g.a0 - 90) * RAD, true); ctx.closePath(); ctx.fill();
      });
      // 고리: 바깥으로 계속 이어지며 흐려진다. 경계가 없다. 처음 열 때는 안쪽부터 차례로 퍼져 나온다.
      ctx.lineWidth = 1; lastRings = 0;
      for (let k = 1; k < 90; k++) {
        const r0 = k * RING * s; if (r0 > far) break; if (r0 < 5) continue;
        const g = ease(clamp((age - Math.min(k, 12) * 0.06) / 0.6, 0, 1)); if (!g) continue;
        ctx.strokeStyle = `rgba(30,143,85,${(g * Math.max(0.05, 0.42 / Math.pow(k, 0.7))).toFixed(3)})`; ctx.beginPath(); ctx.arc(cx, cy, r0 * g, 0, 6.2832); ctx.stroke(); lastRings++;
      }
      ctx.strokeStyle = 'rgba(30,143,85,.22)'; ctx.beginPath();
      if (arr === 'host') segs.forEach((g, i) => { // 쓰는 곳 지도: 십자선 대신 조각 경계(쓰는 곳이 바뀌는 곳은 진하게, 종류만 바뀌는 곳은 옅게)
        if (i && segs[i - 1].host === g.host) return; const u = polar(g.a0, 1); ctx.moveTo(cx, cy); ctx.lineTo(cx + u.x * far, cy + u.y * far);
      });
      else { ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); }
      ctx.stroke();
      if (arr === 'host') { ctx.strokeStyle = 'rgba(30,143,85,.1)'; ctx.beginPath(); segs.forEach((g, i) => { if (!i || segs[i - 1].host !== g.host) return; const u = polar(g.a0, 1); ctx.moveTo(cx, cy); ctx.lineTo(cx + u.x * far, cy + u.y * far); }); ctx.stroke(); }
      if (!intro && arr === 'cat' && s > 0.45 && s < 3) { // 갈래 이름은 가까이 볼 때만(쓰는 곳별 배치에서는 각도가 갈래가 아니라 빼다)
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

      // 도는 선: 화면 끝까지 그어진다. 꼬리는 각도를 따라 흐려지고(선 바로 뒤가 가장 진함), 꼬리 안의 고리는 잔광처럼 조금 밝다.
      if (!paused) {
        const a1 = theta * RAD - Math.PI / 2, a0 = a1 - TRAIL * RAD, L = far, f = TRAIL / 360;
        const cone = (peak) => { const g = ctx.createConicGradient(a0, cx, cy); g.addColorStop(0, 'rgba(46,213,115,0)'); g.addColorStop(f * 0.6, `rgba(46,213,115,${peak * 0.25})`); g.addColorStop(f, `rgba(46,213,115,${peak})`); g.addColorStop(Math.min(1, f + 0.001), 'rgba(46,213,115,0)'); return g; };
        // 은은하게(사용자 요청 2026-11-19): 꼬리·잔광·선을 모두 옅게, 반응(B·C)도 작게. 점과 글자가 주인공이고 선은 배경이다.
        ctx.fillStyle = cone(0.09); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, L, a0, a1); ctx.closePath(); ctx.fill();
        if (!intro) { ctx.strokeStyle = cone(0.2); ctx.lineWidth = 1; ctx.beginPath(); for (let k = 1, r = RING * s; k < 90 && r < L; r = ++k * RING * s) { ctx.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0)); ctx.arc(cx, cy, r, a0, a1); } ctx.stroke(); }
        const line = (col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + L * Math.cos(a1), cy + L * Math.sin(a1)); ctx.stroke(); };
        const rk = Math.max(0, 1 - (now - redAt) / 0.7);
        line(`rgba(46,213,115,${(0.07 + 0.08 * heat).toFixed(3)})`, 4 + 2 * heat); // B 최근 확인한 점을 많이 지날수록 조금 굵고 밝게
        if (rk > 0) line(`rgba(248,113,113,${(0.3 * rk).toFixed(3)})`, 4); // B 위험한 점을 지나면 잠깐 붉게
        line(`rgba(46,213,115,${(0.5 + 0.2 * Math.min(1, heat)).toFixed(3)})`, 1 + 0.5 * heat);
        const pt = (now - pulseAt) / 2.4; // C 점검 한 번이 끝나면 한 번 퍼지는 파동
        if (pt < 1) { ctx.strokeStyle = `rgba(46,213,115,${((1 - pt) * 0.2).toFixed(3)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, far * ease(pt), 0, 6.2832); ctx.stroke(); }
      }
      const sweepSum = (t, vis, deg, age) => { // A 도는 선이 갈래(쓰는 곳 지도에서는 조각)에 들어서면 그 이름과 요약이 잠깐
        const cnt = (f) => vis.filter(f).length;
        const R = clamp(395 * s, 130, 0.36 * Math.min(W, H)), ang = deg * RAD, x = cx + R * Math.sin(ang), y = cy - R * Math.cos(ang);
        ctx.globalAlpha = age < 0.3 ? age / 0.3 : Math.max(0, 1 - (age - 0.3) / 2.3);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 4; ctx.strokeStyle = C.bg;
        ctx.font = '700 13px ui-monospace, Consolas, monospace'; ctx.fillStyle = C.green; ctx.strokeText(t, x, y); ctx.fillText(t, x, y);
        const sum = `위험 ${cnt((n) => n.g === 'd')} · 주의 ${cnt((n) => n.g === 'w')} · 최근 확인 ${cnt((n) => n.fresh)}`;
        ctx.font = '12px ui-monospace, Consolas, monospace'; ctx.fillStyle = C.ink; ctx.strokeText(sum, x, y + 17); ctx.fillText(sum, x, y + 17);
        ctx.globalAlpha = 1; ctx.textAlign = 'left';
      };
      if (!intro && !paused && arr === 'cat') QUAD.forEach((t, q) => { const age = now - quadAt[q]; if (!folded[q] && age <= 2.6) sweepSum(t, nodes.filter((n) => n.q === q && shown(n)), q * 90 + 45, age); });
      if (!intro && !paused && arr === 'host') segs.forEach((g) => { const age = now - (g.at ?? -9); if (age <= 2.6) sweepSum(g.label, g.members.filter(shown), (g.a0 + g.a1) / 2, age); });

      const focus = hoverHub ? -1 : hoverId >= 0 ? hoverId : selId, fam = focus >= 0 ? nodes[focus] : null, lit = litOf(fam);
      const P = nodes.map((n) => { const [x, y] = posOf(n, now); const [sx, sy] = toScreen(x, y); n.sx = sx; n.sy = sy; n.app = appear(n, now); n.hdl = null; return n; });
      if (arr === 'host' && !intro) drawHubLines(s, cx, cy, lit);
      // 선: 평소엔 가늘고 흐리게 모두 보이고, 점을 올리면 그 가족의 선만 밝아진다. 쓰는 곳 지도에서는 같은 역할이 여러 조각에 흩어져 선이 얽히므로 아주 옅게 둔다.
      const inFam = (e) => fam && (e.a === focus || e.b === focus), faint = [];
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${C.edge},${lit ? 0.06 : arr === 'host' ? 0.07 : 0.24})`; ctx.beginPath();
      edges.forEach((e) => {
        if (inFam(e)) return; const a = P[e.a], b = P[e.b]; if (!shown(a) || !shown(b)) return;
        if ((a.sx < -50 && b.sx < -50) || (a.sx > W + 50 && b.sx > W + 50) || (a.sy < -50 && b.sy < -50) || (a.sy > H + 50 && b.sy > H + 50)) return;
        if (fActive && !(isOn(a) && isOn(b))) { faint.push(e); return; }
        const ap = Math.min(a.app, b.app); if (ap <= 0) return; // 처음 열 때 선은 두 점이 나타난 뒤 한쪽에서 뻗어 나간다
        ctx.moveTo(a.sx, a.sy); ctx.lineTo(a.sx + (b.sx - a.sx) * ap, a.sy + (b.sy - a.sy) * ap);
      });
      ctx.stroke();
      if (faint.length) { ctx.strokeStyle = `rgba(${C.edge},0.04)`; ctx.beginPath(); faint.forEach((e) => { ctx.moveTo(P[e.a].sx, P[e.a].sy); ctx.lineTo(P[e.b].sx, P[e.b].sy); }); ctx.stroke(); }
      if (fam) { ctx.strokeStyle = 'rgba(46,213,115,.8)'; ctx.lineWidth = 1.4; ctx.beginPath(); edges.forEach((e) => { if (inFam(e) && shown(P[e.a]) && shown(P[e.b])) { ctx.moveTo(P[e.a].sx, P[e.a].sy); ctx.lineTo(P[e.b].sx, P[e.b].sy); } }); ctx.stroke(); }

      const crowded = P.filter((n) => shown(n) && n.sx > 0 && n.sx < W && n.sy > 0 && n.sy < H).length > 120;
      P.forEach((n) => {
        if (!n.app || !shown(n) || n.sx < -40 || n.sx > W + 40 || n.sy < -40 || n.sy > H + 40) { n.k = 0; return; }
        const rp = radiusPx(n) * n.app, dimmed = lit && !lit.nodes.has(n.i), off = fActive && !isOn(n), A = (off ? 0.1 : dimmed ? 0.22 : 1) * n.app;
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
        const dl = deltaOf(n);
        if (dl) { ctx.fillStyle = C.ink; ctx.strokeStyle = C.bg; ctx.lineWidth = 2; ctx.beginPath(); deltaPath(dl, n.sx + rr * 0.85 + 1, n.sy - rr * 0.85 - 1); ctx.stroke(); ctx.fill(); }
        // 펼치기 손잡이: 가운데(나)에서 먼 쪽, 새 점이 나올 방향에 붙인다. 펼쳤으면 −(누르면 접힘).
        // 어지럽지 않게 −와, 멀리서 볼 때·점이 많을 때의 +는 올린·고른 점에만 단다.
        if (n.kidsN && (n.expanded || room(n)) && !intro && (n.i === hoverId || n.i === hoverHdl || n.i === selId || (!n.expanded && s >= 0.55 && !crowded))) {
          // R15(Linkurious): 누르기 전에 몇 개가 나올지 보이게 "+3"처럼 적는다. 펼쳤으면 "−".
          const txt = n.expanded ? '−' : `+${n.kidsN}`; ctx.font = '10px ui-monospace, Consolas, monospace';
          const w = Math.max(14, ctx.measureText(txt).width + 8), ox = n.sx - cx, oy = n.sy - cy, d = Math.hypot(ox, oy) || 1, far2 = rr + (n.always ? 9 : 4) + w / 2;
          const hx = n.sx + (ox / d) * far2, hy = n.sy + (oy / d) * far2;
          n.hdl = [hx, hy];
          ctx.fillStyle = C.bg; ctx.strokeStyle = n.i === hoverHdl ? C.green : 'rgba(46,213,115,.75)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.roundRect(hx - w / 2, hy - 7, w, 14, 7); ctx.fill(); ctx.stroke();
          ctx.fillStyle = n.i === hoverHdl ? C.green : '#7fdca6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, hx, hy + 0.5); ctx.textAlign = 'left';
        }
        if (n.i === selId || n.i === hoverId) { ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(n.sx, n.sy, rr + 9, 0, 6.2832); ctx.stroke(); }
        // 퍼지는 고리(선 색, 등급과 무관): 처음 열 때 점이 나타나는 순간, 그리고 펼친 점에서 한 번
        if (n.rv != null && now - n.rv < 0.7) burst(n, (now - n.rv) / 0.7, rr, 18);
        if (n.rip && now - n.rip < 0.7) burst(n, Math.max(0, now - n.rip) / 0.7, rr, 60 * s);
        // 핑: 선이 최근 확인한 점을 지날 때 등급 색 고리가 한 번 퍼진다. 오래된 점·수집 오류는 퍼지지 않는다(퍼짐 = 최근 확인)
        if (!paused && n.ping && now - n.ping < 0.9) burst(n, (now - n.ping) / 0.9, rr, 14, status(n), A); // 멈춘 상태면 퍼지는 고리를 그리지 않는다(멈춘 그림으로 남지 않게)
        if (!paused && n.failAt && now - n.failAt < 0.9) burst(n, (now - n.failAt) / 0.9, rr, 22, C.ink, A); // D 이번 점검에서 수집 오류(흰색: 빨강은 위험 등급에만 쓴다. 수집 오류는 등급이 아니다, 불변 2)
        if (run && run.steps[run.i]?.n === n) { ctx.globalAlpha = A; ctx.strokeStyle = C.green; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(n.sx, n.sy, rr + 12, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); } // D 지금 읽는 점
        ctx.globalAlpha = 1;
      });

      // 이름표: 가까이 볼수록 더 많이. 위험·주의는 늘, 선이 지나가면 잠깐, 올리면 그 점.
      ctx.font = '12px ui-monospace, Consolas, monospace'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      P.forEach((n) => {
        if (intro || !shown(n) || (fActive && !isOn(n)) || (!n.spot && n.i !== hoverId && n.i !== selId)) return;
        const zoomA = n.always ? 1 : n.mine ? (s >= 0.5 ? 0.9 : 0) : s >= 1.4 ? 0.9 : 0;
        const a = n.i === hoverId || n.i === selId ? 1 : Math.max(zoomA, n.k);
        if (a < 0.03 || n.sx < -80 || n.sx > W + 80 || n.sy < -20 || n.sy > H + 20) return;
        const sp = n.spot || { dx: radiusPx(n) + 8, dy: 0 }, t = labelText(n);
        ctx.globalAlpha = (lit && !lit.nodes.has(n.i) ? 0.2 : 1) * a * clamp((now - introEnd - 0.15) / 0.5, 0, 1); ctx.lineWidth = 3.5; ctx.strokeStyle = C.bg; ctx.fillStyle = C.green; ctx.strokeText(t, n.sx + sp.dx, n.sy + sp.dy); ctx.fillText(t, n.sx + sp.dx, n.sy + sp.dy);
      });
      ctx.globalAlpha = 1;
      if (arr === 'host' && !intro) drawHubs(s, lit);
      if (intro) riskRects.length = 0; else drawRisk(P);
      placeTip();
    }

    // 쓰는 곳 지도의 맨 위 항목: 쓰는 곳은 큰 육각형, 종류는 작은 마름모(기술 점인 동그라미와 모양으로 구별한다). 나 → 쓰는 곳 → 종류 → 기술을 선으로 잇는다.
    // 두 곳 이상에서 함께 쓰는 조각의 마름모는 점선 테두리이고 두 쓰는 곳 모두와 이어진다. 숫자는 지금 보이는 점 수다.
    const shapePath = (x, y, r, sides, rot) => { ctx.beginPath(); for (let i = 0; i < sides; i++) { const a = rot + (i * 2 * Math.PI) / sides; ctx[i ? 'lineTo' : 'moveTo'](x + r * Math.cos(a), y + r * Math.sin(a)); } ctx.closePath(); };
    const hubPx = (s, big) => Math.max(big ? 11 : 6, (big ? 24 : 12) * Math.pow(s, 0.6));
    // 커서를 올린 항목과 이어진 것(밝게 둘 것). 점이면 그 점·같은 역할 이웃과, 쓰는 곳 지도에서는 그 점의 종류·쓰는 곳까지.
    // 마름모(종류)면 그 종류의 점들과 쓰는 곳, 육각형(쓰는 곳)이면 그 쓰는 곳의 종류와 점 모두. 아무것도 안 올렸으면 null(모두 보통).
    let hoverHub = null; // { host } 또는 { seg }: 쓰는 곳 지도에서 커서가 올라간 육각형·마름모
    function litOf(fam) {
      const hostsOf2 = (gs) => new Set(hubs.filter((b) => gs.some((g) => g.hosts.includes(b.h))));
      if (hoverHub?.host) { const gs = segs.filter((g) => g.hosts.includes(hoverHub.host.h)); return { nodes: new Set(gs.flatMap((g) => g.members.map((n) => n.i))), segs: new Set(gs), hubs: new Set([hoverHub.host]) }; }
      if (hoverHub?.seg) { const g = hoverHub.seg; return { nodes: new Set(g.members.map((n) => n.i)), segs: new Set([g]), hubs: hostsOf2([g]) }; }
      if (!fam) return null;
      const gs = arr === 'host' && fam.seg ? [fam.seg] : [];
      return { nodes: new Set([fam.i, ...fam.nb]), segs: new Set(gs), hubs: hostsOf2(gs) };
    }
    const hubAt = (x, y) => { // 쓰는 곳 지도의 육각형·마름모(꼬리표 포함) 위인지
      if (arr !== 'host' || intro) return null;
      const s = sc(), b = hubs.find((b) => { const [hx, hy] = toScreen(b.x, b.y); return Math.hypot(hx - x, hy - y) < hubPx(s, true) + 4; });
      if (b) return { host: b };
      const g = segs.find((g) => { const [gx, gy] = toScreen(g.x, g.y), p = kindTag(g, s, g.members.length); return Math.hypot(gx - x, gy - y) < hubPx(s, false) + 6 || (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h); });
      return g ? { seg: g } : null;
    };
    function drawHubLines(s, cx, cy, lit) { // 점보다 먼저 그린다(선이 점을 가리지 않게). 이어진 것을 밝힐 때는 나머지 선을 더 옅게
      const on = (b, g) => lit && lit.hubs.has(b) && (!g || lit.segs.has(g)), dim = lit ? 0.4 : 1;
      const tree = (pick) => { hubs.forEach((b) => { const [x, y] = toScreen(b.x, b.y); if (pick(b)) { ctx.moveTo(cx, cy); ctx.lineTo(x, y); } segs.forEach((g) => { if (!g.hosts.includes(b.h) || !pick(b, g)) return; const [gx, gy] = toScreen(g.x, g.y); ctx.moveTo(x, y); ctx.lineTo(gx, gy); }); }); };
      ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(46,213,115,${0.3 * dim})`; ctx.beginPath(); tree((b, g) => !on(b, g)); ctx.stroke();
      const leaves = (pick) => segs.forEach((g) => { const [gx, gy] = toScreen(g.x, g.y); g.members.forEach((n) => { if (shown(n) && n.app && pick(g, n)) { ctx.moveTo(gx, gy); ctx.lineTo(n.sx, n.sy); } }); });
      const leafOn = (g, n) => lit && lit.segs.has(g) && lit.nodes.has(n.i);
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(46,213,115,${0.1 * dim})`; ctx.beginPath(); leaves((g, n) => !leafOn(g, n)); ctx.stroke();
      if (!lit) return;
      ctx.strokeStyle = 'rgba(46,213,115,.85)'; ctx.lineWidth = 2; ctx.beginPath(); tree(on); ctx.stroke();
      ctx.strokeStyle = 'rgba(46,213,115,.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); leaves(leafOn); ctx.stroke();
    }
    function kindTag(g, s, c) { // 종류 꼬리표 자리: 마름모의 바깥쪽 옆(이름표 자리 정하기도 같은 자리를 피한다)
      ctx.font = '12px ui-monospace, Consolas, monospace';
      const [x, y] = toScreen(g.x, g.y), r = hubPx(s, false), u = polar((g.a0 + g.a1) / 2, 1), t = `${g.kind} ${c}`, w = ctx.measureText(t).width + 14, h = 18;
      const ax = x + u.x * (r + 6), ay = y + u.y * (r + 6);
      return { t, w, h, x: u.x > 0.3 ? ax : u.x < -0.3 ? ax - w : ax - w / 2, y: Math.abs(u.x) > 0.3 ? ay - h / 2 : u.y > 0 ? ay : ay - h };
    }
    function drawHubs(s, lit) {
      const live = (g) => g.members.filter(shown).length;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      segs.forEach((g) => {
        const c = live(g); if (!c) return;
        ctx.globalAlpha = lit && !lit.segs.has(g) ? 0.3 : 1;
        const [x, y] = toScreen(g.x, g.y), r = hubPx(s, false), u = polar((g.a0 + g.a1) / 2, 1);
        shapePath(x, y, r, 4, 0); ctx.fillStyle = C.bg; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#7fdca6'; ctx.setLineDash(g.hosts.length > 1 ? [2.5, 2.5] : []); ctx.stroke(); ctx.setLineDash([]);
        const p = kindTag(g, s, c); // 점이 많아 겹쳐도 읽히게 바탕이 있는 꼬리표로
        ctx.fillStyle = 'rgba(10,14,20,.9)'; ctx.strokeStyle = 'rgba(127,220,166,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, 8); ctx.fill(); ctx.stroke();
        ctx.textAlign = 'center'; ctx.fillStyle = '#7fdca6'; ctx.fillText(p.t, p.x + p.w / 2, p.y + p.h / 2 + 0.5);
      });
      hubs.forEach((b) => {
        const c = new Set(segs.filter((g) => g.hosts.includes(b.h)).flatMap((g) => g.members.filter(shown))).size; if (!c) return;
        const [x, y] = toScreen(b.x, b.y), r = hubPx(s, true), on = lit && lit.hubs.has(b);
        ctx.globalAlpha = lit && !on ? 0.3 : 1;
        shapePath(x, y, r, 6, Math.PI / 6); ctx.fillStyle = on ? '#1a4a31' : '#0f2a1d'; ctx.fill(); ctx.lineWidth = on ? 3 : 2; ctx.strokeStyle = C.green; ctx.stroke();
        ctx.textAlign = 'center'; ctx.font = '700 13px ui-monospace, Consolas, monospace'; ctx.lineWidth = 4; ctx.strokeStyle = C.bg; ctx.fillStyle = C.green;
        ctx.strokeText(b.label, x, y + r + 12); ctx.fillText(b.label, x, y + r + 12);
        ctx.font = '700 11px ui-monospace, Consolas, monospace'; ctx.fillStyle = C.ink; ctx.fillText(String(c), x, y + 0.5);
      });
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
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
        // 가장자리에서 조금 안쪽(위는 단추 줄, 아래는 범례·옮기기 단추를 피해 72px)에 놓는다. 가운데에서 점 쪽으로 쏜 선이 그 틀과 만나는 곳.
        const ux = Math.cos(b.a), uy = Math.sin(b.a), tx = ux > 0 ? (W - 18 - W / 2) / ux : ux < 0 ? (18 - W / 2) / ux : 1e9, ty = uy > 0 ? (H - 72 - H / 2) / uy : uy < 0 ? (barH + 16 - H / 2) / uy : 1e9;
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
      if (arr === 'host') { // 쓰는 곳 육각형(이름 포함)·종류 마름모와 꼬리표 자리는 이름표가 피한다
        hubs.forEach((b) => { const [x, y] = toScreen(b.x, b.y), r = hubPx(s, true); boxes.push({ n: null, x: x - 60, y: y - r, w: 120, h: 2 * r + 22 }); });
        segs.forEach((g) => { const [x, y] = toScreen(g.x, g.y), r = hubPx(s, false), p = kindTag(g, s, g.members.length); boxes.push({ n: null, x: x - r, y: y - r, w: 2 * r, h: 2 * r }, { n: null, ...p }); });
      }
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

    // ---- 도는 선이 데이터에 반응한다(불변 6: 장식이 아니라 실제 값에서 나온 움직임만).
    // A 갈래에 들어서면 그 갈래 이름과 "위험·주의·최근 확인" 수가 잠깐 뜬다. B 최근 확인한 점을 많이 지날수록 선이 굵고 밝아지고(heat), 위험한 점을 지나면 잠깐 붉어진다.
    // C 점검 한 번이 끝나면 가운데에서 파동이 한 번 퍼진다(바퀴마다가 아니라). D 점검 중에는 실행 기록(run_steps)을 읽어 선이 읽는 기술로 가서 멈추고 결과를 그린다.
    let run = null, pulseAt = -9, heat = 0, redAt = -9, lastQ = -1;
    const quadAt = [-9, -9, -9, -9];
    let lastSeg = null; // 쓰는 곳 지도에서 도는 선이 지금 지나는 조각
    // 시안의 예시 실행 기록: 보이는 점(검사 전 제외)을 선이 도는 순서로 읽는다. 원래 읽기 실패였던 점은 또 실패하고, 하나는 이번에 새로 실패한다.
    // 실패해도 등급은 그대로 두고 오류만 덧붙인다(불변 2). 실제 앱은 서버의 runs·run_steps를 읽는다.
    function makeRun() {
      const l = nodes.filter((n) => shown(n) && n.g !== 'n').sort((a, b) => ((a.deg - theta + 360) % 360) - ((b.deg - theta + 360) % 360));
      const newFail = l.find((n) => n.g === 'p' && !n.err && !n.mine);
      return { i: 0, ok: 0, fail: 0, steps: l.map((n) => ({ n, err: n.err || (n === newFail ? WHY[2] : null), at: 0 })) };
    }
    function applyStep(st, now, quiet = false) {
      const n = st.n;
      if (st.err) { n.err = st.err; n.fresh = false; n.failAt = now; run.fail++; } else { n.h = 0; n.fresh = true; n.ping = now; run.ok++; }
      if (quiet) return; // 한꺼번에 끝낼 때는 마지막에 한 번만 다시 그린다
      $('stat').dataset.msg = `예시 점검 ${run.i + 1}/${run.steps.length}: ${n.name} ${st.err ? `수집 오류(${st.err})` : '읽음'}`; syncRunBtn(); refresh();
    }
    function endRun(now) {
      const { ok, fail, steps } = run; run = null; pulseAt = now;
      $('stat').dataset.msg = `예시 점검 끝: ${steps.length}개 중 읽음 ${ok} · 수집 오류 ${fail}. 수집 오류인 점은 등급을 그대로 두고 ✕를 붙여요. 예시라서 새로 고치면 처음으로 돌아가요`; syncRunBtn(); refresh(); refreshTip(); dirty = labelsDirty = true;
    }
    function finishRun() { // 남은 단계를 움직임 없이 바로 적용한다(멈춘 상태에서 시작했거나, 점검 중에 멈췄을 때)
      const now = performance.now() / 1000;
      for (; run.i < run.steps.length; run.i++) if (!run.steps[run.i].at) applyStep(run.steps[run.i], now, true);
      endRun(now);
    }
    function startRun() {
      if (run || intro) return;
      run = makeRun(); say('점검을 시작해요(예시 실행 기록)');
      if (paused) finishRun(); else syncRunBtn();
    }
    function runStep(now, dt) { // 이번 프레임에 선이 움직일 각도
      const st = run.steps[run.i];
      if (!st) { endRun(now); return 0; }
      const diff = (st.n.deg - theta + 360) % 360, mv = dt * 540;
      if (!st.at && diff > mv) return mv;
      if (!st.at) { st.at = now; applyStep(st, now); return diff; }
      if (now - st.at > 0.14) run.i++;
      return 0;
    }
    const syncRunBtn = () => { const b = $('runBtn'); b.disabled = !!run; b.textContent = run ? `예시 점검 중 ${Math.min(run.i + 1, run.steps.length)}/${run.steps.length}` : '예시 점검 보기'; };

    let last = performance.now() / 1000, lastDraw = 0;
    function frame(ms) {
      const now = ms / 1000, dt = Math.min(0.05, now - last); last = now;
      if (intro?.phase === 'load' && now - intro.t0 >= LOAD) startReveal();
      if (!paused) { // 처음 열 때는 빠르게 돌고, 끝나면 0.8초에 걸쳐 평소 속도로 느려진다
        const boost = intro ? 1 : Math.max(0, 1 - (now - introEnd) / 0.8) ** 2;
        const step = run ? runStep(now, dt) : dt * 360 * (1 / PERIOD + (1 / FAST - 1 / PERIOD) * boost); // 점검 중에는 선이 읽고 있는 기술로 간다
        theta = (theta + step) % 360;
        if (!intro) {
          let pinged = 0;
          nodes.forEach((n) => { // 이번 프레임에 선이 지나간 점
            if (!shown(n) || (theta - n.deg + 360) % 360 >= step) return;
            if (n.fresh) { n.ping = now; pinged++; }
            if (n.g === 'd') redAt = now;
          });
          heat = Math.min(1.5, heat * Math.exp(-dt * 2.5) + pinged * 0.35);
          const qn = Math.floor(theta / 90); if (qn !== lastQ) { if (lastQ >= 0) quadAt[qn] = now; lastQ = qn; }
          if (arr === 'host') { const g = segs.find((x) => theta >= x.a0 && theta < x.a1); if (g && g !== lastSeg) { if (lastSeg) g.at = now; lastSeg = g; } }
        }
        if (intro?.phase === 'reveal') {
          intro.swept += step;
          nodes.forEach((n) => { if (n.rv == null && (n.deg - intro.sweep0 + 360) % 360 <= intro.swept) n.rv = now; });
          if (intro.swept >= 360 * 1.35) finishIntro(); // 한 바퀴 + 마지막 점이 다 커질 시간
        }
      }
      if (fly) {
        const t = clamp((now - fly.t0) / fly.d, 0, 1), e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
        view.x = fly.from.x + (fly.to.x - fly.from.x) * e; view.y = fly.from.y + (fly.to.y - fly.from.y) * e; view.k = fly.from.k * (fly.to.k / fly.from.k) ** e;
        dirty = labelsDirty = true; if (t >= 1) fly = null;
      }
      if (drag && drag.node && drag.at) applyDrag();
      const simming = simStep(dt), settling = settle(dt);
      const animating = simming || settling || nodes.some((n) => n.born || (n.rip && now - n.rip < 0.7)) || !!fly || !!intro;
      if (labelsDirty && now - lastLabelAt > 0.12 && !animating) placeLabels(now);
      if (mode !== 'tree' && (!paused || dirty || animating) && (now - lastDraw >= 0.03 || dirty)) { draw(now); lastDraw = now; dirty = false; }
      requestAnimationFrame(frame);
    }

    // ---- 조작: 끌기로 옮기기, 휠로 확대, 점 누르면 펼치기
    const hit = (cx, cy) => {
      let best = -1, bd = 1e9;
      nodes.forEach((n) => { if (n.sx == null || !shown(n) || !isOn(n)) return; const d = Math.hypot(n.sx - cx, n.sy - cy), lim = Math.max(radiusPx(n) + 6, 12); if (d < lim && d < bd) { bd = d; best = n.i; } });
      return best;
    };
    const handleAt = (x, y) => { // 손잡이는 그린 것(지름 13px)보다 넓게(지름 28px) 눌린다
      let best = -1, bd = 14;
      nodes.forEach((n) => { if (!n.hdl) return; const d = Math.hypot(n.hdl[0] - x, n.hdl[1] - y); if (d < bd) { bd = d; best = n.i; } });
      return best;
    };
    const badgeAt = (x, y) => badgeRect.findIndex((r) => r && x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]);
    const riskAt = (x, y) => riskRects.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.i ?? -1;
    const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    let drag = null;
    // ---- 점 옮기기(옵시디언처럼): 잡은 점은 포인터를 따라가고, 이어진 점은 용수철로 따라와 모양을 대체로 지킨다(용수철 길이 = 잡기 전 거리).
    // 부딪힌 점은 밀려났다가 흔들리며 자리를 잡는다. 모든 점은 잡기 직전 자리에 약하게 묶여 있어 멀리 있는 점은 덜 움직이고 지도 전체가 흐트러지지 않는다.
    // 놓으면 1초 남짓 흔들리다 멈추고, 잡은 점은 놓은 자리에 남는다. 움직임을 멈춘 상태면 흔들림 없이 바로 자리를 잡는다.
    // 옮긴 자리는 저장하지 않는다(새로 고치면 처음 자리). 갈래·접기·밝기는 자리가 아니라 데이터(q, 최근 확인)를 따른다.
    const captureRopes = () => edges.forEach((e) => { e.rx = nodes[e.b].tx - nodes[e.a].tx; e.ry = nodes[e.b].ty - nodes[e.a].ty; e.len = Math.hypot(e.rx, e.ry); });
    const syncPolar = () => nodes.forEach((n) => { n.rad = Math.hypot(n.tx, n.ty); n.deg = ((Math.atan2(n.tx, -n.ty) / RAD) + 360) % 360; });
    const isMoved = (n) => Math.hypot(n.tx - n.hx, n.ty - n.hy) > 1;
    // 용수철 둘: 길이(늘고 줄어듦)와 모양(잡기 전의 방향). 거리만 지키면 옆으로 끌 때 이웃이 따라오지 않고 빙 돌기만 한다.
    // 잡은 점은 둘레(pushR)까지 이어지지 않은 점을 밀어내고(물결처럼), 끄는 빠르기의 일부(carry)를 넘겨 준다. 밀린 점의 이웃은 용수철로 함께 출렁인다.
    const PHYS = { spring: 0.04, shape: 0.03, anchor: 0.006, repel: 0.25, damp: 0.85, gap: 14, vmax: 34, pushR: 64, push: 1.1, carry: 0.6 };
    let sim = null; // { pin, alpha }
    function kick(pin) { // 지금 모양을 쉬는 모양으로 삼고 움직이기 시작한다
      captureRopes(); nodes.forEach((n) => { n.ax = n.tx; n.ay = n.ty; n.vx = n.vy = 0; });
      sim = { pin, alpha: 1 };
    }
    function simStep(dt) {
      if (!sim) return false;
      const t = Math.min(2, dt * 60), live = (n) => shown(n) && !n.born, act = nodes.filter(live);
      act.forEach((n) => { if (n.ax == null) { n.ax = n.tx; n.ay = n.ty; n.vx = n.vy = 0; } }); // 움직이는 중에 펼쳐 나온 점
      for (let it = 0; it < (paused ? 40 : 1) && sim; it++) {
        const a = sim.alpha;
        edges.forEach((e) => {
          const p = nodes[e.a], q = nodes[e.b]; if (!live(p) || !live(q)) return;
          const dx = q.tx - p.tx, dy = q.ty - p.ty, d = Math.hypot(dx, dy) || 0.01; if (e.len == null) { e.len = d; e.rx = dx; e.ry = dy; }
          const f = ((d - e.len) / d) * PHYS.spring * a * t, k = PHYS.shape * a * t, sx = (dx - e.rx) * k, sy = (dy - e.ry) * k;
          p.vx += dx * f + sx; p.vy += dy * f + sy; q.vx -= dx * f + sx; q.vy -= dy * f + sy;
        });
        const grid = new Map(), cell = (x, y) => Math.floor(x / 40) * 100003 + Math.floor(y / 40); // 겹칠 수 있는 거리(32 이하)보다 칸(40)이 커서 둘레 9칸만 본다
        act.forEach((n) => { const k = cell(n.tx, n.ty); (grid.get(k) ?? grid.set(k, []).get(k)).push(n); });
        act.forEach((n) => {
          for (let i = -40; i <= 40; i += 40) for (let j = -40; j <= 40; j += 40) (grid.get(cell(n.tx + i, n.ty + j)) ?? []).forEach((o) => {
            if (o.i <= n.i) return;
            const dx = n.tx - o.tx, dy = n.ty - o.ty, d = Math.hypot(dx, dy) || 0.01, min = n.r + o.r + PHYS.gap;
            if (d >= min) return;
            const f = ((min - d) / d) * PHYS.repel * t; n.vx += dx * f; n.vy += dy * f; o.vx -= dx * f; o.vy -= dy * f;
          });
        });
        const pin = sim.pin, pvx = pin.tx - (sim.lx ?? pin.tx), pvy = pin.ty - (sim.ly ?? pin.ty); sim.lx = pin.tx; sim.ly = pin.ty;
        if (live(pin)) act.forEach((o) => {
          if (o === pin || pin.nb.has(o.i)) return; // 이웃은 용수철이 맡는다
          const dx = o.tx - pin.tx, dy = o.ty - pin.ty, d = Math.hypot(dx, dy) || 0.01, R = pin.r + o.r + PHYS.pushR;
          if (d >= R) return;
          const s = 1 - d / R, f = s * s * PHYS.push * R * 0.12 * t; // 가까울수록 훨씬 세게
          o.vx += (dx / d) * f + pvx * s * PHYS.carry; o.vy += (dy / d) * f + pvy * s * PHYS.carry;
        });
        const damp = Math.pow(PHYS.damp, t);
        act.forEach((n) => {
          if (n === sim.pin) { n.vx = n.vy = 0; return; }
          n.vx = clamp((n.vx + (n.ax - n.tx) * PHYS.anchor * a * t) * damp, -PHYS.vmax, PHYS.vmax); n.vy = clamp((n.vy + (n.ay - n.ty) * PHYS.anchor * a * t) * damp, -PHYS.vmax, PHYS.vmax);
          n.tx += n.vx; n.ty += n.vy; n.px = n.tx; n.py = n.ty; // 한 번 더 부드럽게 하면 출렁임이 묻힌다
        });
        if (drag?.node !== sim.pin) { sim.alpha *= Math.pow(0.94, t); if (sim.alpha < 0.02) sim = null; } // 놓은 뒤에는 식으며 멈춘다
      }
      syncPolar(); dirty = labelsDirty = true;
      return true;
    }
    function moveNode(n, x, y) { if (sim?.pin !== n) kick(n); else sim.alpha = 1; n.born = 0; n.tx = n.px = x; n.ty = n.py = y; } // 옮기기 전 모양을 쉬는 모양으로 잡아야 용수철이 당긴다
    function applyDrag() {
      const [x, y] = drag.at, s = sc(); drag.at = null;
      moveNode(drag.node, view.x + (x - W / 2) / s + drag.off[0], view.y + (y - H / 2) / s + drag.off[1]);
    }
    function startNodeDrag(d) {
      d.node = nodes[d.id]; kick(d.node); selId = hoverId = d.id; syncTip();
      const s = sc(); d.off = [d.node.tx - (view.x + (d.x - W / 2) / s), d.node.ty - (view.y + (d.y - H / 2) / s)];
    }
    function goHome() { sim = null; nodes.forEach((n) => { n.tx = n.hx; n.ty = n.hy; }); syncPolar(); $('stat').dataset.msg = '옮긴 점을 원래 자리로 돌려 보냈어요'; refresh(); refreshTip(); dirty = labelsDirty = true; }
    // 처음 열기 중에 누르거나 키를 치면 바로 끝낸다. 지도를 누른 것은 점을 고른 것으로 치지 않는다(아직 점이 다 안 보였으므로).
    document.addEventListener('pointerdown', (e) => { if (intro) { finishIntro(); if (e.target === cv) e.stopPropagation(); } }, true);
    document.addEventListener('keydown', () => finishIntro(), true);
    // 두 손가락 확대: 두 손가락 사이 거리의 비율만큼 배율을 바꾸고, 두 손가락 가운데 아래의 지도 자리는 그대로 둔다. 두 번째 손가락이 닿으면 끌기·누르기는 취소된다.
    const touches = new Map(); let pinch = null;
    const pinchMid = () => { const [a, b] = [...touches.values()]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.hypot(a[0] - b[0], a[1] - b[1]) || 1]; };
    const lift = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
    cv.addEventListener('pointerdown', (e) => {
      fly = null; const [x, y] = local(e), hd = handleAt(x, y); cv.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, [x, y]);
      if (touches.size >= 2) { // 손가락이 둘 이상이면 끌기·누르기가 아니다(셋째 손가락이 누르기로 읽히지 않게)
        drag = null; cv.classList.remove('grabbing');
        if (touches.size === 2) { const [mx, my, d] = pinchMid(), s = sc(); pinch = { d, k: view.k, wx: view.x + (mx - W / 2) / s, wy: view.y + (my - H / 2) / s }; }
        return;
      }
      drag = { pid: e.pointerId, x, y, vx: view.x, vy: view.y, hd, id: hd >= 0 ? -1 : hit(x, y), bq: badgeAt(x, y), rk: riskAt(x, y), moved: false, touch: e.pointerType !== 'mouse' };
    });
    cv.addEventListener('pointermove', (e) => {
      if (intro) return;
      const [x, y] = local(e);
      if (touches.has(e.pointerId)) touches.set(e.pointerId, [x, y]);
      if (pinch) {
        if (touches.size === 2) { const [mx, my, d] = pinchMid(); view.k = clamp(pinch.k * d / pinch.d, 0.2, 6); const s = sc(); view.x = pinch.wx - (mx - W / 2) / s; view.y = pinch.wy - (my - H / 2) / s; dirty = labelsDirty = true; }
        return;
      }
      if (drag) {
        const dx = x - drag.x, dy = y - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; cv.classList.add('grabbing'); if (drag.id >= 0) startNodeDrag(drag); }
        if (drag.moved && drag.node) drag.at = [x, y];
        else if (drag.moved) { view.x = drag.vx - dx / sc(); view.y = drag.vy - dy / sc(); dirty = labelsDirty = true; }
        return;
      }
      const hd = handleAt(x, y), h = hd >= 0 ? -1 : hit(x, y);
      cv.classList.toggle('node', h >= 0); cv.classList.toggle('pointer', h < 0 && (hd >= 0 || badgeAt(x, y) >= 0 || riskAt(x, y) >= 0));
      if (hd !== hoverHdl) { hoverHdl = hd; dirty = true; }
      const hb = h < 0 && hd < 0 ? hubAt(x, y) : null; // 육각형·마름모에 올리면 이어진 것을 밝힌다
      if ((hb?.host ?? hb?.seg) !== (hoverHub?.host ?? hoverHub?.seg)) { hoverHub = hb; dirty = true; }
      if (h !== hoverId) { const was = hoverId; hoverId = h; dirty = true; if (h < 0 && was >= 0) laterTip(); else syncTip(); }
    });
    const endDrag = (e) => {
      if (!drag || drag.pid !== e.pointerId) return;
      cv.classList.remove('grabbing');
      // 점을 누르면 상세. 손가락은 올리기가 없으니 처음 누르면 카드만 띄우고, 카드가 뜬 점을 다시 누르면 상세로 간다.
      if (!drag.moved && drag.hd >= 0) toggleOpen(nodes[drag.hd]);
      else if (!drag.moved && drag.id >= 0) { const n = nodes[drag.id]; if (drag.touch && selId !== n.i) select(n); else openDetail(n); }
      else if (!drag.moved && drag.bq >= 0) setFold(drag.bq, false);
      else if (!drag.moved && drag.rk >= 0) goTo(nodes[drag.rk]);
      else if (!drag.moved) select(null);
      else if (drag.node) { if (drag.at) applyDrag(); $('stat').dataset.msg = `옮겼어요: ${drag.node.name}`; refresh(); }
      const dropped = drag.moved && drag.node; drag = null; dirty = true;
      if (dropped) refreshTip(); // 끄는 동안 감춘 카드를 놓은 점 옆에 다시
    };
    cv.addEventListener('pointerup', (e) => { endDrag(e); lift(e); }); cv.addEventListener('pointercancel', (e) => { lift(e); drag = null; cv.classList.remove('grabbing'); });
    cv.addEventListener('pointerleave', () => { hoverHdl = -1; hoverHub = null; dirty = true; if (!drag && hoverId >= 0) { hoverId = -1; cv.classList.remove('pointer', 'node'); dirty = true; laterTip(); } }); // 카드로 마우스를 옮기는 동안 카드가 사라지지 않게 잠깐 기다린다
    cv.addEventListener('wheel', (e) => { e.preventDefault(); finishIntro(); const [x, y] = local(e); zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    cv.addEventListener('dblclick', () => fit()); // 이벤트가 인자로 넘어가면 "가운데 빼기"로 읽히므로 비워서 부른다

    const lastText = (n) => (n.h == null ? '확인한 적 없어요' : n.h === 0 ? '방금' : `${n.h}시간 전`) + (n.err ? (n.h == null ? ' · 수집 오류' : ' · 그 뒤 수집 오류') : '');
    const dot = (n) => `<svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true"><circle r="5" fill="${status(n)}"/></svg>`;
    const MOVES = [['0,-1', '↑', '위로'], ['0,1', '↓', '아래로'], ['-1,0', '←', '왼쪽으로'], ['1,0', '→', '오른쪽으로']];
    // ---- 간단 카드(IA-10 "올리면 속성 카드"): 올린 점, 없으면 고른 점 옆에 뜬다. 등급은 색과 글자로. 옮기기 단추는 고른 점에만(끌기의 대안, WCAG 2.5.7).
    const tip = $('tip');
    let tipFor = -1, tipHold = false, tipTimer = 0, tipBox = null; // tipBox: 카드 크기(내용이 바뀔 때만 다시 잰다. 매 프레임 재면 브라우저가 매번 배치를 다시 계산한다)
    function describe(n) {
      cardNode = n; tipBox = null;
      tip.innerHTML = `<h2>${dot(n)}<span>${n.name}</span><span class="g" style="color:${n.g === 'd' ? C.danger : n.g === 'w' ? C.warn : C.ink}">${gradeText(n)}</span></h2><p>${gradeWhy(n)}</p>
        <p class="meta">마지막 확인 ${lastText(n)} · ${KIND[n.kind]} · ${QUAD[n.q]}${n.mine ? ' · 내 기술' : ''}</p><p class="meta">쓰는 곳: ${hostText(n)}</p>${deltaOf(n) ? `<p class="meta">최근 변경: ${deltaText(n)}</p>` : ''}
        ${pending(n) ? `<p class="pend">판단 대기 ${pendingOf(n)}건 · <a href="alerts.html#list">알림에서 판단하기</a></p>` : ''}
        <p class="hint">누르면 상세${n.kidsN ? (n.expanded ? ' · 펼쳤어요(−로 접어요)' : room(n) ? ` · 펼칠 수 있음 ${n.kidsN}개(+)` : ` · 같은 역할 ${n.kidsN}개가 더 있지만 시안 한도(${MAXN.toLocaleString()}개)라 펼치지 않아요`) : ''}</p>
        <div class="acts"><button type="button" class="tbtn" data-detail>상세 보기</button>${n.kidsN && (n.expanded || room(n)) ? `<button type="button" class="tbtn" data-exp aria-keyshortcuts="E">${n.expanded ? '접기' : `펼치기 +${n.kidsN}`}</button>` : ''}<button type="button" class="tbtn" data-focus>${focusSet && focusId === n.i ? '중심으로 보는 중' : '중심 보기'}</button></div>
        ${n.i === selId ? `<div class="acts"><span class="lab">옮기기</span>${MOVES.map(([v, s, l]) => `<button type="button" class="tbtn" data-mv="${v}" aria-label="이 점을 ${l} 옮기기">${s}</button>`).join('')}</div>` : ''}`;
    }
    function syncTip() {
      clearTimeout(tipTimer);
      if (drag?.node || mode === 'tree') { tip.hidden = true; return; } // 끄는 동안엔 따라오는 이웃을 가리지 않게 감추고, 놓으면 다시 띄운다
      const i = tipHold && tipFor >= 0 ? tipFor : selId >= 0 ? selId : hoverId; // 고른 점이 있으면 올려도 카드가 바뀌지 않는다(카드 단추로 가는 길에 내용·포커스가 바뀌지 않게)
      if (i < 0 || !shown(nodes[i])) { tipFor = -1; cardNode = null; tip.hidden = true; return; }
      if (i !== tipFor) { tipFor = i; describe(nodes[i]); }
      tip.hidden = false; dirty = true;
    }
    const laterTip = () => { clearTimeout(tipTimer); tipTimer = setTimeout(syncTip, 250); };
    const refreshTip = () => { tipFor = -1; syncTip(); }; // 내용이 바뀌었을 때(펼침·옮김·중심 보기)
    const select = (n) => { selId = n ? n.i : -1; refreshTip(); };
    function placeTip() { // 점 오른쪽에, 넘치면 왼쪽에. 위아래는 단추 줄과 화면 끝 안으로. 점이 화면 밖이면 감춘다.
      if (tip.hidden || tipFor < 0) return;
      const n = nodes[tipFor], off = n.sx == null || n.sx < 0 || n.sx > W || n.sy < 0 || n.sy > H;
      tipBox ??= [tip.offsetWidth, tip.offsetHeight];
      tip.style.visibility = off ? 'hidden' : ''; if (off) return;
      const [w, h] = tipBox, r =radiusPx(n) + (n.kidsN ? 34 : 14); // 손잡이("+3")를 가리지 않게
      let x = n.sx + r; if (x + w > W - 8) x = n.sx - r - w;
      tip.style.transform = `translate(${Math.round(clamp(x, 8, W - w - 8))}px, ${Math.round(clamp(n.sy - h / 2, barH + 4, H - h - 8))}px)`;
    }
    tip.addEventListener('pointerenter', () => { tipHold = true; clearTimeout(tipTimer); });
    tip.addEventListener('pointerleave', () => { tipHold = false; laterTip(); });
    // 끌기의 대안(WCAG 2.5.7): 카드의 방향 단추와 쉬프트+방향키가 같은 일을 한다. 한 번에 화면 24px.
    function nudge(n, dx, dy) {
      moveNode(n, n.tx + dx, n.ty + dy); selId = n.i;
      $('stat').dataset.msg = `옮겼어요: ${n.name}`; refresh(); refreshTip();
    }
    tip.addEventListener('click', (e) => {
      const n = cardNode, f = e.target.closest('[data-focus]'), m = e.target.closest('[data-mv]'), x = e.target.closest('[data-exp]');
      if (!n) return;
      if (e.target.closest('[data-detail]')) openDetail(n);
      else if (x) { toggleOpen(n); tip.querySelector('[data-exp]')?.focus(); }
      else if (f) { enterFocus(n.i); tip.querySelector('[data-focus]')?.focus(); }
      else if (m) { const [dx, dy] = m.dataset.mv.split(',').map(Number), d = 24 / sc(); nudge(n, dx * d, dy * d); tip.querySelector(`[data-mv="${m.dataset.mv}"]`)?.focus(); }
    });

    // ---- 상세(IA-4): 같은 탭에서 연다. 보던 자리·펼친 순서·보기·거르기·갈래 접기·중심 보기를 주소(#)에 남겨, 뒤로 오면 그대로 되살린다(끌어 옮긴 자리는 남기지 않는다).
    const saveState = () => [`v=${view.x.toFixed(1)},${view.y.toFixed(1)},${view.k.toFixed(3)}`, `e=${made.join('.')}`, `c=${made.filter((i) => !nodes[i].expanded).join('.')}`, `m=${mode}`,
      fstate.size && `f=${[...fstate].join('.')}`, fkind.size && `k=${[...fkind].join('.')}`, fmine && 'mi=1',
      folded.some(Boolean) && `fo=${folded.map((f, q) => (f ? q : '')).filter(String).join('.')}`, focusSet && `fc=${focusId}.${focusDepth}`].filter(Boolean).join('&');
    const hostText = (n) => n.hosts.map((h) => HOSTS[h]).join(' · ');
    function openDetail(n, replace = false, from = '') { // from: 알림 화면에서 왔으면 'alerts'(상세의 "돌아가기"가 알림으로) // replace: 상세의 "같은 역할" 링크로 왔을 때(뒤로 가면 앞 상세로 가게 지도 칸을 바꿔 끼운다)
      land();
      const nb = [...n.nb].map((i) => nodes[i]).filter((m) => !m.cut).slice(0, 12).map((m) => ({ i: m.i, name: m.name, grade: gradeText(m), g: m.g }));
      const d = { name: n.name, kind: KIND[n.kind], quad: QUAD[n.q], g: n.g, grade: gradeText(n), why: gradeWhy(n), last: lastText(n), chg: deltaText(n), mine: n.mine, fresh: n.fresh, pending: pendingOf(n), pt: ALERTS.length, from, hosts: hostText(n), nb, h: saveState() };
      history.replaceState(null, '', `#${saveState()}`);
      location[replace ? 'replace' : 'assign'](`detail.html?d=${encodeURIComponent(JSON.stringify(d))}`);
    }

    // ---- 펼치기·접기: 손잡이(+/−), 카드 단추, E 키. 처음 펼치면 새로 만들고, 그 뒤로는 감춘 것을 다시 보인다(같은 점이 같은 자리에).
    function expandNode(n, quiet = false) {
      if (n.expanded) return [];
      if (folded[n.q]) setFold(n.q, false);
      let kids;
      if (n.made) {
        const was = new Set(nodes.filter((m) => !m.cut).map((m) => m.i)), born = performance.now() / 1000;
        n.expanded = true; recut(); kids = nodes.filter((m) => !m.cut && !was.has(m.i));
        if (!paused) kids.forEach((k) => { k.born = born; });
      } else if (arr === 'host') { // 갈래별 자리에서 펼친다(갈래별로 돌아가면 갈래 안에 있게). 그 뒤 쓰는 곳별로 다시 놓는다
        nodes.forEach((m) => { [m.tx, m.ty] = m.cat; }); syncPolar();
        kids = expand(n); kids.forEach((k) => { k.cat = [k.tx, k.ty, k.hx, k.hy]; }); hostLayout();
      } else kids = expand(n);
      if (focusSet && focusSet.has(n.i)) kids.forEach((k) => focusSet.add(k.i)); // 중심 보기 중에 펼친 점은 보인다
      if (!kids.length) { if (!quiet && n.kidsN) { $('stat').dataset.msg = '시안에서는 기술 1,200개까지만 펼쳐요'; refresh(); } return []; }
      if (!paused) n.rip = performance.now() / 1000;
      dirty = labelsDirty = true;
      if (!quiet) { $('stat').dataset.msg = `${n.name}에서 같은 역할 ${kids.length}개를 펼쳤어요`; refresh(); refreshTip(); }
      return kids;
    }
    function dropCut() { // 감춰진 점을 가리키던 선택·올림·중심 보기를 정리한다(감춘 점 때문에 지도가 흐려진 채 남지 않게)
      if (selId >= 0 && nodes[selId].cut) selId = -1;
      if (hoverId >= 0 && nodes[hoverId].cut) hoverId = -1;
      if (focusSet && nodes[focusId].cut) exitFocus(false);
    }
    function collapseNode(n) {
      if (!n.expanded) return;
      n.expanded = false; recut(); dropCut();
      $('stat').dataset.msg = `${n.name} 아래를 접었어요`; refresh(); refreshTip(); dirty = labelsDirty = true;
    }
    const toggleOpen = (n) => (n.expanded ? collapseNode(n) : expandNode(n));
    // 모두 펼치기: 지금 보이는 펼칠 수 있는 점을 모두 한 단계씩. 한 번에 끝까지 펼치지 않는다(수백~천 개로 늘어 무엇이 새로 나왔는지 놓친다).
    const room = (n) => n.made || nodes.length + n.kidsN <= MAXN; // 시안 한도(1,200개)에 걸려 새로 펼칠 수 없으면 손잡이·단추를 감춘다(눌러도 아무 일이 없지 않게)
    const openable = () => nodes.filter((n) => shown(n) && n.kidsN && !n.expanded && room(n));
    function expandAll() {
      const l = openable(); let added = 0;
      l.forEach((n) => { added += expandNode(n, true).length; });
      const capped = l.some((n) => !n.expanded); // 상한(1,200개)에 걸려 못 펼친 점
      $('stat').dataset.msg = added ? `${l.length}개 점에서 같은 역할 ${added}개를 펼쳤어요${capped ? '. 시안에서는 1,200개까지만 펼쳐요' : ''}` : '더 펼칠 점이 없어요';
      refresh(); refreshTip(); if (added) fit();
    }
    function foldAll() {
      nodes.forEach((n) => { n.expanded = false; }); recut(); dropCut();
      $('stat').dataset.msg = '펼친 점을 모두 접었어요'; refresh(); refreshTip(); fit(); dirty = labelsDirty = true;
    }
    function syncExpandButtons() {
      const l = openable(), gain = l.reduce((s, n) => s + n.kidsN, 0);
      $('expAll').textContent = gain ? `모두 펼치기 +${gain}` : nodes.some((n) => shown(n) && n.kidsN && !n.expanded) ? '시안 한도에 닿았어요' : '모두 펼쳤어요'; $('expAll').disabled = !gain;
      $('foldAll').disabled = !nodes.some((n) => n.expanded);
    }
    // 첫 점검 띠(PRD-F14, SPEC-5.2): 내 기술의 첫 점검 결과를 처음 한 번 보인다. 확인을 누르면 이 탭에서는 다시 안 보인다(실제 앱은 실행 id로 기억, P-12b).
    // 읽지 못한 내 기술이 있으면 "빠졌어요"를 붙여 0으로 단정하지 않는다(불변 2). 불러오는 동안에는 숫자를 보이지 않는다(불변 6).
    let bandSeen = false; try { bandSeen = sessionStorage.getItem('tr-band') === '1'; } catch { /* 저장소를 못 쓰면 매번 보인다 */ }
    function syncBand() {
      if (bandSeen || loading()) { $('band').hidden = true; return; }
      const mine = nodes.filter((n) => n.mine), c = (g) => mine.filter((n) => n.g === g).length, miss = mine.filter((n) => n.err).length;
      $('bandTxt').innerHTML = `첫 점검: 위험 ${c('d')} · 주의 ${c('w')}${miss ? ` · 읽지 못한 내 기술 ${miss}개는 빠졌어요` : ''} · <a href="alerts.html">알림에서 보기</a>`;
      $('band').hidden = false;
    }
    $('bandOk').addEventListener('click', () => { bandSeen = true; try { sessionStorage.setItem('tr-band', '1'); } catch { /* 이 탭에서만 감춘다 */ } syncBand(); syncBar(); cv.focus({ preventScroll: true }); });
    // R16(Grafana는 기본 200개까지만 보이고 나머지를 숨긴다): 우리는 숨기지 않고(위험이 가려질 수 있어서) 알리기만 한다.
    const MANY = 200;
    // 화면 읽기 프로그램에는 바뀐 알림 글만 읽힌다(통계 전체를 매번 읽지 않게). 점검 중에는 시작과 끝만.
    let said = '';
    // 바뀐 알림은 화면에도 짧게(약 2.5초) 띄운다. 아래 요약 글은 작고 좁은 화면에서는 감춰져 "옮겼어요"·"맞는 점이 없어요" 같은 결과를 놓치기 쉬워서다.
    let toastTimer = 0;
    const say = (t) => {
      if (!t || t === said) return;
      said = t; $('say').textContent = t;
      const el = $('toast'); el.textContent = t; el.style.top = `${document.querySelector('.title').offsetHeight + 4}px`; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
    };
    function refresh() {
      syncLegend();
      if (loading()) { // 데이터가 오기 전에는 개수를 보이지 않는다(불변 6)
        $('stat').textContent = '불러오는 중'; $('expAll').textContent = '모두 펼치기'; $('expAll').disabled = true; $('foldAll').disabled = true; $('many').hidden = true; return;
      }
      syncExpandButtons();
      const pendN = ALERTS.length; $('pendN').textContent = pendN ? `판단 대기 ${pendN}` : ''; syncBand();
      const visN = nodes.filter(shown).length;
      $('many').hidden = visN <= MANY; $('many').textContent = `지금 보이는 점이 ${visN}개예요. ${MANY}개가 넘으면 읽기 어려워요. 모두 접기나 거르기로 줄여 보세요.`;
      const fresh = nodes.filter((n) => n.fresh).length;
      const hiddenN = nodes.filter((n) => !shown(n)).length, movedN = nodes.filter(isMoved).length, msg = $('stat').dataset.msg;
      $('home').disabled = !movedN;
      $('stat').innerHTML = `기술 ${nodes.length}개${hiddenN ? `(지금 감춘 ${hiddenN}개)` : ''} 연결 ${edges.length}개${movedN ? ` 옮긴 점 ${movedN}개` : ''}<br>최근 확인 ${fresh}개${msg ? `<br>${msg}` : ''}`;
      if (!run) say(msg);
      renderTable(); renderTree(); syncBar();
    }
    // 표 보기: 지도와 같은 모든 점(접힌·걸러진·감춘 점도). 위험 먼저·이름순·마지막 확인이 오래된 순으로 정렬하고, 상태(범례와 같은 판정)와 이름으로 거른다.
    const SEV = (n) => (n.g === 'd' ? 0 : n.g === 'w' ? 1 : n.err ? 2 : n.g === 'u' ? 3 : n.g === 'n' ? 4 : 5);
    const nat = (a, b) => a.name.localeCompare(b.name, 'en', { numeric: true });
    function renderTable() {
      if (!$('tableBox').open) return; // 닫혀 있으면 열 때 그린다(점이 많을 때 매번 표 전체를 다시 만들지 않게)
      const f = $('tFilter').value, q = $('tQ').value.trim().toLowerCase(), by = $('tSort').value;
      const rows = nodes.filter((n) => (!f || STATE[f](n)) && (!q || n.name.toLowerCase().includes(q)))
        .sort(by === 'name' ? nat : by === 'old' ? (a, b) => ((b.h ?? 1e9) - (a.h ?? 1e9)) || nat(a, b) : (a, b) => (SEV(a) - SEV(b)) || nat(a, b));
      $('tableNote').textContent = rows.length === nodes.length ? `전체 ${nodes.length}개예요.` : `${nodes.length}개 중 ${rows.length}개를 보여요.`;
      $('rows').innerHTML = rows.map((n) => `<tr><td>${n.name}</td><td>${KIND[n.kind]}</td><td>${QUAD[n.q]}</td><td>${gradeText(n)}</td><td>${lastText(n)}</td><td>${deltaText(n) || '없음'}</td>
        <td>${n.kidsN && !n.expanded && room(n) ? `<button type="button" class="tbtn" data-expand="${n.i}">펼치기 +${n.kidsN}</button>` : n.expanded ? '펼쳤어요' : n.kidsN ? '시안 한도' : '없음'}</td></tr>`).join('');
    }
    $('tableBox').addEventListener('toggle', renderTable);
    $('rows').addEventListener('click', (e) => {
      const b = e.target.closest('[data-expand]'); if (!b) return;
      const at = [...$('rows').querySelectorAll('[data-expand]')].indexOf(b); expandNode(nodes[+b.dataset.expand]);
      const left = $('rows').querySelectorAll('[data-expand]'); (left[at] ?? left[left.length - 1] ?? $('tableBox').querySelector('summary')).focus(); // 누른 단추는 사라지므로 포커스를 다음 단추로
    });

    // ---- 쓰는 곳 지도: 갈래 지도와 같은 레이더 모양이다. 각도를 갈래 대신 "쓰는 곳 + 종류" 조각으로 나누고(조각 폭은 점 수에 비례),
    // 가운데에서의 거리는 갈래 지도의 거리(가까울수록 내 기술, 펼친 점은 바깥)를 그대로 쓴다. 두 곳 이상에서 쓰는 점은 두 쓰는 곳 조각 사이에 따로 조각을 둔다.
    // 조각 안에서는 가까운 점부터, 갈래 안에서의 각도와 비슷한 자리를 먼저 보고, 원래 거리 이상에서 겹치지 않는 첫 자리에 놓는다(난수 없음: 같은 데이터면 같은 자리).
    // 갈래 지도의 자리(n.cat)는 기억해 두었다가 돌아갈 때 되살린다. 등급·밝기·갈래(q)는 자리가 아니라 데이터라 그대로다. 갈래 접기는 갈래 지도에서만 쓴다.
    const HUB_R = 150, KIND_R = 235, TECH_R = 300; // 쓰는 곳 육각형·종류 마름모·기술 점이 놓이는 거리(세계 좌표)
    function hostLayout() {
      const sets = new Map(), key = (n) => `${n.hosts.join('+')}|${n.kind}`, grid = new Map(), cell = (x, y) => Math.floor(x / 40) * 100003 + Math.floor(y / 40);
      nodes.forEach((n) => (sets.get(key(n)) ?? sets.set(key(n), []).get(key(n))).push(n));
      // shortcut: 둘레 순서를 쓰는 곳 번호의 평균으로 정해서, 처음과 끝(Claude Code와 따로 쓰는 도구)을 함께 쓰는 묶음이 생기면 가운데로 간다. 그런 묶음이 생기면 둘레를 이어서 센다.
      const mid = (l) => l[0].hosts.reduce((s, h) => s + h, 0) / l[0].hosts.length;
      const list = [...sets.values()].sort((a, b) => (mid(a) - mid(b)) || (KINDS.indexOf(a[0].kind) - KINDS.indexOf(b[0].kind)));
      const wt = (l) => Math.max(1.6, Math.sqrt(l.length)), total = list.reduce((s, l) => s + wt(l), 0); // √점 수: 큰 조각이 둘레를 독차지하지 않고 작은 조각도 보이게
      const free = (x, y, r) => { for (let i = -40; i <= 40; i += 40) for (let j = -40; j <= 40; j += 40) for (const o of grid.get(cell(x + i, y + j)) ?? []) if (Math.hypot(x - o.tx, y - o.ty) < r + o.r + 12) return false; return true; };
      let a = 0;
      segs = list.map((l) => {
        const a0 = a, a1 = a + (360 * wt(l)) / total, pad = Math.min(3, (a1 - a0) * 0.12); a = a1;
        const lo = a0 + pad, w = a1 - pad - lo, rOf = (n) => Math.hypot(n.cat[0], n.cat[1]);
        [...l].sort((p, q) => (rOf(p) - rOf(q)) || (p.i - q.i)).forEach((n) => {
          const t0 = clamp(((((Math.atan2(n.cat[0], -n.cat[1]) / RAD) + 360) % 90) - 6) / 78, 0, 1); // 갈래 안에서의 각도 비율
          for (let r = Math.max(TECH_R, rOf(n)); r < 6000; r += 8) { // 안쪽은 쓰는 곳·종류 점 자리로 비워 둔다
            const steps = Math.max(1, Math.floor((w * RAD * r) / (2 * n.r + 12))), s0 = Math.round(t0 * steps);
            for (let d = 0; d <= steps; d++) for (const s of d ? [s0 + d, s0 - d] : [s0]) {
              if (s < 0 || s > steps) continue;
              const p = polar(lo + (w * s) / steps, r);
              if (!free(p.x, p.y, n.r)) continue;
              n.tx = n.hx = p.x; n.ty = n.hy = p.y; const k = cell(p.x, p.y); (grid.get(k) ?? grid.set(k, []).get(k)).push(n);
              return;
            }
          }
        });
        return { a0, a1, label: `${l[0].hosts.map((h) => HOSTS[h]).join('·')} ${KIND[l[0].kind]}`, kind: KIND[l[0].kind], hosts: l[0].hosts, members: l, host: l[0].hosts.join('+') };
      });
      let k = -1, prev = ''; segs.forEach((g) => { if (g.hosts.length === 1 && g.host !== prev) { k++; prev = g.host; } g.shade = k % 2; }); // 쓰는 곳마다 번갈아 칠할 명암
      segs.forEach((g) => { Object.assign(g, polar((g.a0 + g.a1) / 2, KIND_R)); g.members.forEach((n) => { n.seg = g; }); }); // 종류 마름모는 조각 가운데
      hubs = HOSTS.map((label, h) => { // 쓰는 곳 육각형은 혼자 쓰는 조각들의 가운데(없으면 함께 쓰는 조각들의 가운데)
        const any = segs.filter((g) => g.hosts.includes(h)), own = any.filter((g) => g.hosts.length === 1), l = own.length ? own : any;
        return l.length ? { ...polar((l[0].a0 + l[l.length - 1].a1) / 2, HUB_R), label, h } : null;
      }).filter(Boolean);
      syncPolar(); dirty = labelsDirty = true;
    }
    function arrange(a) {
      sim = null; arr = a; hoverHub = null;
      if (a === 'host') { nodes.forEach((n) => { n.cat = [n.tx, n.ty, n.hx, n.hy]; }); foldKeep = [...folded]; folded.fill(false); hostLayout(); }
      else { nodes.forEach((n) => { [n.tx, n.ty, n.hx, n.hy] = n.cat; }); folded.splice(0, 4, ...foldKeep); syncPolar(); }
      $('folds').hidden = a === 'host'; syncFolds(); dropCut(); fit();
      if (!paused) { const t0 = performance.now() / 1000; nodes.forEach((n) => { n.wait = t0 + Math.min(0.5, Math.hypot(n.tx, n.ty) / 2000); }); } // 가운데에서 가까운 점부터 차례로 출발한다(모여드는 느낌)
    }
    function setView(v) {
      if (v === mode) return;
      mode = v; if (v !== 'tree' && v !== arr) arrange(v);
      $('stage').dataset.mode = v === 'tree' ? 'tree' : 'map'; $('treeView').hidden = v !== 'tree';
      document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
      $('stat').dataset.msg = { cat: '갈래 지도로 봐요', host: '쓰는 곳 지도로 봐요. 육각형은 쓰는 곳, 마름모는 종류예요', tree: '쓰는 곳 나무로 봐요' }[v];
      syncTip(); refresh(); dirty = labelsDirty = true;
    }
    $('views').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });

    // ---- 쓰는 곳별 나무: 쓰는 곳 → 종류 → 갈래 → 기술을 접고 펴는 목록으로. 지도에 지금 보이는(거르기에 맞는) 점만, 위험 먼저.
    // 접힌 가지도 위험 수는 이름 옆에 남긴다(갈래 접기 배지와 같은 이유). 누르면 상세, "지도"는 그 점을 지도에서 보여 준다.
    const treeFlip = new Set(); // 기본(쓰는 곳·종류는 펼침, 갈래는 접힘)과 다르게 둔 가지
    let lastTree = '';
    function renderTree() {
      if (mode !== 'tree') return;
      const box = $('treeView'), items = nodes.filter((n) => shown(n) && isOn(n)).sort((a, b) => (SEV(a) - SEV(b)) || nat(a, b));
      const rk = (l) => { const d = l.filter((n) => n.g === 'd').length; return d ? ` <span class="rk">위험 ${d}</span>` : ''; };
      const branch = (key, lvl, label, l, inner) => `<li><details data-k="${key}" data-l="${lvl}"${(lvl < 3) !== treeFlip.has(key) ? ' open' : ''}><summary>${label} <b>${l.length}</b>${rk(l)}</summary><ul>${inner}</ul></details></li>`;
      const leaf = (n, h) => {
        const also = n.hosts.filter((x) => x !== h).map((x) => HOSTS[x]);
        return `<li class="row"><button type="button" class="leaf" data-open="${n.i}">${dot(n)}<span>${n.name}</span><span class="m">${gradeText(n)}${deltaOf(n) ? ` · ${deltaText(n)}` : ''}${also.length ? ` · ${also.join('·')}에서도` : ''}</span></button><button type="button" class="tbtn" data-map="${n.i}" aria-label="${n.name} 지도에서 보기">지도</button></li>`;
      };
      const html = HOSTS.map((hn, h) => {
        const inH = items.filter((n) => n.hosts.includes(h)); if (!inH.length) return '';
        return branch(`${h}`, 1, hn, inH, KINDS.map((k) => {
          const inK = inH.filter((n) => n.kind === k); if (!inK.length) return '';
          return branch(`${h}.${k}`, 2, KIND[k], inK, QUAD.map((qn, q) => { const l = inK.filter((n) => n.q === q); return l.length ? branch(`${h}.${k}.${q}`, 3, qn, l, l.map((n) => leaf(n, h)).join('')) : ''; }).join(''));
        }).join(''));
      }).join('');
      const out = `<p class="note">쓰는 곳 → 종류 → 갈래로 묶었어요. 지도에 지금 보이는 기술 ${items.length}개만 나와요(모두 펼치기로 늘어요). 여러 곳에서 쓰는 기술은 곳마다 보여서 합계가 더 클 수 있어요.</p>${html ? `<ul>${html}</ul>` : '<p class="note">보여 줄 기술이 없어요. 거르기·중심 보기·갈래 접기를 풀어 보세요</p>'}`;
      box.style.paddingTop = `${document.querySelector('.title').offsetHeight + 8}px`;
      if (out === lastTree) return; // 바뀐 게 없으면 다시 만들지 않는다(누르던 단추의 포커스가 날아가지 않게)
      const a = document.activeElement, keep = box.contains(a) ? (a.dataset.open ? `[data-open="${a.dataset.open}"]` : a.dataset.map ? `[data-map="${a.dataset.map}"]` : a.parentElement?.dataset.k ? `[data-k="${a.parentElement.dataset.k}"] > summary` : null) : null;
      lastTree = out; box.innerHTML = out;
      if (keep) box.querySelector(keep)?.focus();
    }
    $('treeView').addEventListener('toggle', (e) => { const d = e.target; if (!d.dataset?.k) return; if (d.open === (+d.dataset.l < 3)) treeFlip.delete(d.dataset.k); else treeFlip.add(d.dataset.k); }, true);
    $('treeView').addEventListener('click', (e) => { const o = e.target.closest('[data-open]'), m = e.target.closest('[data-map]'); if (o) openDetail(nodes[+o.dataset.open]); else if (m) goTo(nodes[+m.dataset.map]); });

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
        if (selId >= 0 && nodes[selId].q === q) selId = -1;
        if (hoverId >= 0 && nodes[hoverId].q === q) hoverId = -1;
      }
      $('stat').dataset.msg = `${QUAD[q]} 갈래를 ${v ? '접었어요' : '폈어요'}`; syncFolds(); refresh(); syncTip(); dirty = labelsDirty = true;
    }
    foldBox.addEventListener('click', (e) => { const b = e.target.closest('[data-fold]'); if (b) setFold(+b.dataset.fold, !folded[+b.dataset.fold]); });

    // ---- 검색: 지금 지도에 있는 기술의 이름·종류로 찾아 그 점으로 간다. 접힌 갈래에 있으면 펴서 보여 준다.
    const qIn = $('q'), hitsBox = $('hits');
    const find = (text) => {
      const t = text.trim().toLowerCase();
      return t ? nodes.filter((n) => `${n.name} ${KIND[n.kind]}`.toLowerCase().includes(t)).sort((a, b) => (b.always - a.always) || (b.mine - a.mine) || a.name.localeCompare(b.name, 'en', { numeric: true })) : [];
    };
    function goTo(n, focusMap = true) { // 감춰져 있으면(중심 보기·거르기·접기) 풀고 보여 준다. 나무에서 부르면 지도로 돌아간다
      if (mode === 'tree') setView(arr);
      if (n.cut) { // 접혀 감춘 점이면 위쪽 점부터 차례로 다시 펼친다(검색은 접힌 점도 찾는다)
        const up = []; for (let p = nodes[n.parent]; p; p = p.parent >= 0 ? nodes[p.parent] : null) if (!p.expanded) up.unshift(p);
        up.forEach((p) => expandNode(p, true));
      }
      if (focusSet && !focusSet.has(n.i)) exitFocus(false);
      if (fActive && !isOn(n)) clearFilters();
      if (folded[n.q]) setFold(n.q, false);
      select(n); flyTo(n.tx, n.ty, clamp(Math.max(aim().k, 1.6), 0.2, 6));
      $('stat').dataset.msg = `이동했어요: ${n.name} · ${gradeText(n)}`; refresh(); dirty = labelsDirty = true; if (focusMap) cv.focus({ preventScroll: true }); // 지도를 옮길 때 페이지가 같이 움직이지 않게
    }
    function showHits() {
      const r = find(qIn.value), top = r.slice(0, 8);
      hitsBox.hidden = !qIn.value.trim();
      hitsBox.innerHTML = top.length
        ? top.map((n) => `<li><button type="button" data-go="${n.i}"><span>${n.name}</span><span class="m">${KIND[n.kind]} · ${gradeText(n)}</span></button></li>`).join('') + (r.length > 8 ? `<li class="more">외 ${r.length - 8}개예요. 더 입력해 보세요</li>` : '')
        : '<li class="none">찾는 기술이 없어요. 이 시안은 한 번이라도 펼친 기술만 찾아요</li>';
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
      + `<li>${svg(`<circle r="5.5" fill="${C.bg}" stroke="#2ed573" stroke-width="1.2"/><path d="M-3 0H3M0-3V3" stroke="#2ed573" stroke-width="1.2"/>`)}+ 손잡이: 같은 역할 기술 펼치기(−는 접기)</li>`
      + `<li>${svg(`<path d="M0-4.5L4.5 3.5H-4.5Z" fill="${C.ink}"/>`)}등급이 나빠짐 ${svg(`<path d="M0 4.5L4.5-3.5H-4.5Z" fill="${C.ink}"/>`)}나아짐</li>`
      + `<li>${svg(`<path d="M0-5L1.3-1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3-1.3Z" fill="${C.ink}"/>`)}새로 들어옴 ${svg(`<circle r="3" fill="${C.ink}"/>`)}그 밖의 변경(점 오른쪽 위, 지난 확인 대비)</li><li>최근 확인한 점은 선이 닿으면 밝아져요</li><li>${svg(`<path d="M0-6L5.2-3V3L0 6L-5.2 3V-3Z" fill="#0f2a1d" stroke="#2ed573" stroke-width="1.4"/>`)}쓰는 곳 ${svg(`<path d="M0-5L5 0L0 5L-5 0Z" fill="none" stroke="#7fdca6" stroke-width="1.3"/>`)}종류(점선은 두 곳 이상에서 함께 씀). 쓰는 곳 지도에서만 보여요. 기술 점은 자기 종류와 이어지고, 가운데에서의 거리는 갈래 지도와 같아요</li><li>도는 선은 최근 확인한 점을 차례로 비춰요. 점검이 돌고 있다는 뜻은 아니에요. 위험한 점을 지나면 잠깐 붉어져요(예시 점검 중에는 선이 읽는 점에서 멈춰요)</li>`;
    function syncLegend() {
      const vis = nodes.filter(shown);
      legend.querySelectorAll('[data-f]').forEach((b) => { b.setAttribute('aria-pressed', String(fstate.has(b.dataset.f))); b.querySelector('b').textContent = loading() ? '…' : vis.filter(STATE[b.dataset.f]).length; });
      $('fclear').hidden = !fActive;
    }
    function afterFilter() {
      fFns = [...fstate].map((k) => STATE[k]); fActive = fstate.size > 0 || fkind.size > 0 || fmine;
      const n = fstate.size + fkind.size + (fmine ? 1 : 0), on = nodes.filter((x) => shown(x) && isOn(x)).length;
      $('fsum').textContent = n ? `거르기 (${n})` : '거르기'; $('lsum').textContent = fstate.size ? `범례 (${fstate.size}개로 거르는 중)` : '범례';
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
      if (!focusSet) { focusPrev = { ...aim() }; focusDepth = 1; }
      focusId = i; calcFocus(); select(nodes[i]); syncFocus(); fit(false, 3);
      $('stat').dataset.msg = `${nodes[i].name} 중심으로 봐요. 숫자 1~3으로 단계를, Esc로 중심 보기를 끝내요`; refresh();
    }
    function setDepth(d) { if (!focusSet) return; focusDepth = clamp(d, 1, 3); calcFocus(); syncFocus(); fit(false, 3); refresh(); }
    function exitFocus(restore = true) {
      if (!focusSet) return;
      focusSet = null; focusId = -1; if (restore && focusPrev) flyTo(focusPrev.x, focusPrev.y, focusPrev.k); focusPrev = null;
      syncFocus(); $('stat').dataset.msg = '중심 보기를 끝냈어요'; refresh(); refreshTip(); dirty = labelsDirty = true;
    }
    $('fdec').addEventListener('click', () => setDepth(focusDepth - 1)); $('finc').addEventListener('click', () => setDepth(focusDepth + 1)); $('fexit').addEventListener('click', () => exitFocus());

    // ---- 화면 이동 단추와 위험 찾기(끌지 않고도 되게: WCAG 2.5.7). 가운데 단추는 가운데(나)로.
    $('dpad').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pan]'); if (!b) return;
      const [dx, dy] = b.dataset.pan.split(',').map(Number);
      const v = aim(), s = v.k * base(); // 여러 번 누르면 도착할 자리에서 이어서 옮긴다
      if (!dx && !dy) flyTo(0, 0, v.k); else flyTo(v.x + (dx * W * 0.25) / s, v.y + (dy * H * 0.25) / s, v.k);
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
      goTo(n); $('stat').dataset.msg = `${n.name} · ${gradeText(n)} (${l.indexOf(n) + 1}/${l.length})`; refresh(); // 화면 읽기 프로그램에도 등급이 읽히게
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
      const n = L[nbRing.idx]; goTo(n); $('stat').dataset.msg = `이웃 ${nbRing.idx + 1}/${L.length}: ${n.name} · ${gradeText(n)} (같은 역할: ${nbRing.origin.name})`; refresh();
    }

    const pause = $('pause');
    const syncPause = () => { pause.setAttribute('aria-pressed', String(paused)); pause.textContent = paused ? '움직임 켜기' : '움직임 멈추기'; dirty = true; };
    const togglePause = () => { finishIntro(); land(); paused = !paused; syncPause(); if (paused && run) finishRun(); }; // 점검 중에 멈추면 남은 결과만 바로
    // 운영체제의 "움직임 줄이기"를 쓰는 중에 바꿔도 따른다
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => { if (e.matches !== paused) togglePause(); });
    pause.addEventListener('click', togglePause); $('fit').addEventListener('click', () => fit()); $('home').addEventListener('click', goHome);
    $('more').addEventListener('click', (e) => { e.currentTarget.setAttribute('aria-expanded', document.querySelector('.title').classList.toggle('open')); syncBar(); });
    $('runBtn').addEventListener('click', startRun); syncRunBtn();
    $('keysBtn').addEventListener('click', () => $('keys').showModal());
    $('expAll').addEventListener('click', expandAll); $('foldAll').addEventListener('click', foldAll);
    $('zin').addEventListener('click', () => zoomAt(W / 2, H / 2, 1.4)); $('zout').addEventListener('click', () => zoomAt(W / 2, H / 2, 1 / 1.4));
    $('toTable').addEventListener('click', () => { const d = $('tableBox'); d.open = true; d.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); d.querySelector('summary').focus(); });
    cv.addEventListener('keydown', (e) => {
      land(); const step = 70 / sc(), k = e.key;
      if (e.shiftKey && selId >= 0 && k.startsWith('Arrow')) { // 끌기의 대안: 고른 점을 쉬프트+방향키로 옮긴다
        const d = 24 / sc();
        nudge(nodes[selId], k === 'ArrowRight' ? d : k === 'ArrowLeft' ? -d : 0, k === 'ArrowDown' ? d : k === 'ArrowUp' ? -d : 0); e.preventDefault(); return;
      }
      if (k === ']' || k === '[') { jumpRisk(k === ']' ? 1 : -1); e.preventDefault(); return; } // 다음·이전 위험·주의
      if (k === 'j' || k === 'J' || k === 'k' || k === 'K') { stepNode(k === 'j' || k === 'J' ? 1 : -1); e.preventDefault(); return; } // 다음·이전 점
      if (k === '.' || k === ',') { stepNeighbor(k === '.' ? 1 : -1); e.preventDefault(); return; } // 고른 점의 다음·이전 이웃
      if (k === 'Escape' && !focusSet && selId >= 0) { select(null); dirty = true; e.preventDefault(); return; } // 선택 풀기(중심 보기 중이면 문서 단축키가 중심 보기를 푼다)
      if (k === 'Enter' && selId >= 0 && shown(nodes[selId])) { openDetail(nodes[selId]); e.preventDefault(); return; } // 누르기와 같다: 상세
      if ((k === 'e' || k === 'E') && selId >= 0 && nodes[selId].kidsN) { toggleOpen(nodes[selId]); e.preventDefault(); return; }
      if (k === 'ArrowLeft') view.x -= step; else if (k === 'ArrowRight') view.x += step; else if (k === 'ArrowUp') view.y -= step; else if (k === 'ArrowDown') view.y += step;
      else if (k === '+' || k === '=') zoomAt(W / 2, H / 2, 1.25); else if (k === '-' || k === '_') zoomAt(W / 2, H / 2, 1 / 1.25); else if (k === '0' || k === 'f' || k === 'F') fit();
      else return;
      e.preventDefault(); dirty = labelsDirty = true;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && focusSet && !e.target.closest('#q, #hits')) { exitFocus(); e.preventDefault(); return; }
      if (focusSet && /^[1-3]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest('input, textarea, select')) { setDepth(+e.key); e.preventDefault(); return; } // 지도에 포커스가 없어도(카드 단추 위에서도) 된다
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest('input, select, textarea')) { e.preventDefault(); $('keys').showModal(); return; } // 단축키 도움말
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest('input, select, textarea')) { e.preventDefault(); qIn.focus(); return; }
      if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest('button, a, summary, input, select, textarea')) { e.preventDefault(); togglePause(); }
    });

    window.__g = { nodes, edges, view, expand: expandNode, fit, zoomAt, sc, toScreen, get theta() { return theta; }, get paused() { return paused; }, get rings() { return lastRings; }, TAIL, size: () => ({ W, H }), hit, folded, fold: setFold, find, goTo, badgeRect, move: moveNode, ropes: captureRopes, home: goHome, isMoved,
      isOn, fstate, fkind, afterFilter, clearFilters, riskList, jumpRisk, riskRects, focus: enterFocus, depth: setDepth, exitFocus, get focusSet() { return focusSet; }, nudge, shown, navList, stepNode, stepNeighbor, renderTable,
      get intro() { return intro; }, get fly() { return fly; }, finishIntro, land, select, toggleOpen, expandAll, foldAll, saveState, made, get tipFor() { return tipFor; }, syncTip, get sim() { return sim; }, PHYS, startRun, get run() { return run; }, get heat() { return heat; }, quadAt, get pulseAt() { return pulseAt; }, get redAt() { return redAt; }, setView, get mode() { return mode; }, get arr() { return arr; }, get segs() { return segs; }, get hubs() { return hubs; }, get hoverHub() { return hoverHub; }, litOf, HOSTS };
    // 상세에서 뒤로 왔으면(#v=…) 처음 열기 없이 보던 자리와 펼친 모습을 되살린다. 같은 순서로 다시 펼치면 같은 점이 같은 자리에 생긴다.
    const saved = new URLSearchParams(location.hash.slice(1)), sv = saved.get('v')?.split(',').map(Number), restored = sv?.length === 3 && sv.every(Number.isFinite);
    if (restored) {
      intro = null;
      (saved.get('e') || '').split('.').filter(Boolean).forEach((i) => { if (nodes[+i]) expand(nodes[+i]); });
      (saved.get('c') || '').split('.').filter(Boolean).forEach((i) => { if (nodes[+i]) nodes[+i].expanded = false; });
      recut(); nodes.forEach((n) => { n.born = 0; n.px = n.tx; n.py = n.ty; });
      Object.assign(view, { x: sv[0], y: sv[1], k: clamp(sv[2], 0.2, 6) });
      (saved.get('fo') || '').split('.').filter((q) => /^[0-3]$/.test(q)).forEach((q) => { folded[+q] = true; });
      (saved.get('f') || '').split('.').filter((k) => STATE[k]).forEach((k) => fstate.add(k));
      (saved.get('k') || '').split('.').filter((k) => KIND[k]).forEach((k) => { fkind.add(k); $('filterBox').querySelector(`[data-kind="${k}"]`).checked = true; });
      if (saved.get('mi') === '1') { fmine = true; $('filterBox').querySelector('[data-scope]').checked = true; }
      const fc = (saved.get('fc') || '').split('.').map(Number);
      if (saved.has('fc') && nodes[fc[0]] && !nodes[fc[0]].cut) { focusId = fc[0]; focusDepth = clamp(fc[1] || 1, 1, 3); calcFocus(); }
    }
    resize(); syncFolds(); refresh(); syncPause();
    if (fstate.size || fkind.size || fmine) afterFilter();
    syncFocus();
    const m0 = saved.get('m'); // 상세에서 돌아오면 보던 보기도 되살린다(쓰는 곳별 자리는 데이터로 다시 계산된다)
    if (restored && (m0 === 'host' || m0 === 'tree')) { setView(m0); land(); nodes.forEach((n) => { n.px = n.tx; n.py = n.ty; }); Object.assign(view, { x: sv[0], y: sv[1], k: clamp(sv[2], 0.2, 6) }); }
    // 다른 화면에서 온 링크: go = 그 기술 상세로 바로(상세의 "같은 역할"·알림의 "기술 상세"), sel = 지도에서 그 점을 골라 보여 주기(알림의 "지도에서 보기").
    // 값은 점 번호나 이름(알림 화면은 이름으로 건다). from=alerts면 상세의 돌아가기가 알림으로 간다.
    const pick = (v) => (v == null ? null : nodes.find((n) => n.name === v) ?? nodes[Number(v)] ?? null);
    const goN = pick(saved.get('go')), selN = pick(saved.get('sel'));
    if (restored && goN && !goN.cut) openDetail(goN, true, saved.get('from') === 'alerts' ? 'alerts' : '');
    else if (restored && selN && !selN.cut) goTo(selN);
    if (intro) { view.k = 2.2; $('loading').hidden = false; $('risk').hidden = true; } else if (!restored) { fit(); land(); } // 처음에는 나를 가까이서 보다가, 데이터가 오면 물러난다
    requestAnimationFrame(frame);
  })();
