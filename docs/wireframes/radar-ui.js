// 레이더 시안의 상태·화면 조각: 보기 설정 도구 줄, 이 분류만 보기(경로 칩), 범례, 덮는 사이드바, 올리기 카드, 키보드 목록, 주소·계정 저장, 카메라, 그리기 고리.
// 저장 규칙(design.md 14절): 로그인 전 = 아무것도 남기지 않음(주소로 공유만), 로그인 뒤 = 보기 설정·옮긴 자리를 계정에(시안은 이 브라우저로 흉내).
(() => {
  const { icon, esc, ALERTS } = TR;
  const { techs, edges, byId: T } = TR.radar;
  const RL = TR.radarLayout, { FIRST_RING } = RL, phys = TR.radarPhysics.create(), { draw } = TR.radarDraw;
  const ZMIN = 0.05, ZMAX = 12; // 확대·축소 제한을 넓혀 끝없는 판처럼(사용자 11-20)
  const clampK = (k) => Math.max(ZMIN, Math.min(ZMAX, k));
  const $ = (id) => document.getElementById(id);
  const canvas = $('map'), c = canvas.getContext('2d'), stage = $('stage');
  const ACCOUNT = 'radar-account'; // 로그인한 척일 때만 쓰는 "계정" 자리
  const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 못 해도 화면은 그대로 */ } } };
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let login = false;
  try { login = sessionStorage.getItem('radar-login') === '1'; } catch { /* 없으면 로그인 전으로 */ }

  const S = { W: 0, H: 0, top: 0, right: 0, cam: { x: 0, y: 0, k: 1 }, fly: null, L: null, view: null, collapsed: new Set(), hidden: new Set(), leaving: new Map(),
    phys, sel: '', hover: '', kfocus: '', focusId: '', lit: null, login, still: motion.matches, sweep: { start: Infinity }, riskRects: [], hubLabels: [], now: 0,
    base() { return Math.min(this.W, this.H - this.top) / (2 * this.L.radius); }, scale() { return this.cam.k * this.base(); } };
  const visible = () => S.L.items.filter((it) => !S.hidden.has(it.id));
  const dimName = (d) => RL.DIMS[d][0];

  // ---- 주소·계정
  const viewKey = () => RL.viewParams(S.view).toString();
  function saveState() {
    const p = RL.viewParams(S.view), def = RL.defaultCollapsed(S.L);
    if ([...S.collapsed].sort().join('|') !== [...def].sort().join('|')) p.set('x', [...S.collapsed].join('~') || '-');
    if (S.sel) p.set('sel', S.sel);
    history.replaceState(null, '', `#${p}`);
    if (!login) return;
    const acc = store.get(ACCOUNT) || {};
    p.delete('sel');
    store.set(ACCOUNT, { ...acc, q: p.toString() });
  }
  function savedMoves() { return login ? ((store.get(ACCOUNT) || {}).moved || {})[viewKey()] || {} : {}; }
  function saveMoves() { // 물리가 멈춘 뒤: 제자리에서 옮겨진 것만(로그인 뒤에만)
    if (!login) return;
    const acc = store.get(ACCOUNT) || {}, moved = {};
    for (const it of visible()) { const b = phys.B.get(it.id); if (b && Math.hypot(b.rest[0] - it.x, b.rest[1] - it.y) > 1) moved[it.id] = b.rest.map(Math.round); }
    store.set(ACCOUNT, { ...acc, moved: { ...(acc.moved || {}), [viewKey()]: moved } });
  }

  // ---- 배치
  const homeOf = (it, moves = savedMoves()) => moves[it.id] || [it.x, it.y];
  function rebuild(from, collapsedIds) {
    S.L = RL.layout(techs, edges, S.view);
    S.collapsed = collapsedIds ? new Set(collapsedIds.filter((id) => S.L.byId.has(id))) : RL.defaultCollapsed(S.L);
    S.hidden = RL.hiddenOf(S.L, S.collapsed); S.leaving.clear();
    if (S.sel && !S.L.byId.has(S.sel)) closeSide();
    const moves = savedMoves(), vis = visible();
    phys.sync(vis, from);
    if (from) phys.settleTo(vis.map((it) => [it.id, homeOf(it, moves)]), 0.07);
    else vis.forEach((it) => { const b = phys.B.get(it.id), [x, y] = homeOf(it, moves); Object.assign(b, { x, y, rest: [x, y] }); });
    S.hasDanger = vis.some((it) => it.type === 't' && it.t.grade === '위험');
    const sc = S.view.scope;
    S.scopeLabel = sc.length ? `${sc[sc.length - 1].value} · ${S.L.shown}개` : '';
    syncControls(); syncLegend(); syncStatus(); syncList(); syncCrumbs(); setFocus(S.focusId);
    $('empty').hidden = S.L.shown > 0;
  }
  /** 보기 설정 바꾸기. from = 새로 나타나는 것이 튀어나올 자리(들어간 묶음 자리 등) */
  function setView(patch, from = [0, 0]) {
    const regroup = (patch.group && patch.group.join() !== S.view.group.join()) || patch.scope;
    S.view = { ...S.view, ...patch };
    rebuild(() => from, regroup ? null : [...S.collapsed]);
    if (patch.scope) flyTo(homeCam(), false);
    saveState(); dirty();
  }
  /** 이 분류만 보기: 그 묶음까지의 경로를 scope에 더하고, 그 안만 원반 전체로 다시 펼친다 */
  function drill(id) {
    const g = S.L.byId.get(id);
    if (!g || g.type !== 'g') return;
    const chain = [];
    for (let p = g; p; p = p.parent && S.L.byId.get(p.parent)) chain.unshift({ dim: p.dim, value: p.value });
    const b = phys.B.get(id);
    hideDrill(true); closeSide();
    setView({ scope: [...S.view.scope, ...chain] }, b ? [b.x, b.y] : [0, 0]);
    say(`${g.value}만 보고 있어요. 위 경로에서 한 단계씩 나올 수 있어요.`);
  }
  function syncCrumbs() {
    const sc = S.view.scope, el = $('crumbs');
    el.hidden = !sc.length;
    el.innerHTML = sc.length ? `<button class="chip" data-crumb="0">전체</button>${sc.map((s, i) => `<span aria-hidden="true">›</span>${i === sc.length - 1
      ? `<b aria-current="location">${esc(s.value)}</b>` : `<button class="chip" data-crumb="${i + 1}">${esc(s.value)}</button>`}`).join('')}<button class="chip" data-crumb="0" aria-label="분류만 보기 끝내기">✕</button>` : '';
  }
  // 묶음에 올리면 옆에 뜨는 "이 분류만 보기" 단추. 포인터가 단추로 옮겨 가는 동안(0.3초) 남아 있다
  let drillT = 0;
  function showDrill(id) { clearTimeout(drillT); S.drillId = id; syncDrill(); }
  function hideDrill(now) {
    clearTimeout(drillT);
    const off = () => { S.drillId = ''; $('drill').hidden = true; };
    if (now) off(); else drillT = setTimeout(off, 300);
  }
  function syncDrill() {
    const el = $('drill'), it = S.drillId && S.L.byId.get(S.drillId), b = it && phys.B.get(it.id);
    if (!b || S.hidden.has(it.id)) { el.hidden = true; return; }
    const [x, y] = toScreen(b.x, b.y), r = it.r * Math.min(1.4, Math.max(0.7, S.scale() ** 0.5));
    el.hidden = false; el.dataset.drill = it.id; el.setAttribute('aria-label', `${it.value}만 보기`);
    el.style.left = `${Math.min(S.W - S.right - el.offsetWidth - 8, x + r + 6)}px`; el.style.top = `${Math.max(S.top, y - r - 34)}px`;
  }
  const shiftOf = (id) => { const it = S.L.byId.get(id), b = phys.B.get(id); return it && b ? [b.x - it.x, b.y - it.y] : [0, 0]; };
  /** 묶음 펼치기·접기. 펼치면 자식이 묶음 자리에서 튀어나오고, 접으면 묶음으로 빨려 들어간다 */
  function toggle(id) {
    const g = S.L.byId.get(id);
    if (!g || g.type !== 'g') return;
    const b = phys.B.get(id), [dx, dy] = shiftOf(id);
    if (S.collapsed.has(id)) {
      S.collapsed.delete(id);
      const was = S.hidden; S.hidden = RL.hiddenOf(S.L, S.collapsed);
      const born = visible().filter((it) => was.has(it.id));
      phys.sync(visible(), () => [b.x, b.y]);
      phys.settleTo(born.map((it) => [it.id, [it.x + dx, it.y + dy]]), 0.09);
      say(`${g.value} 펼침: ${g.count}개`);
    } else {
      const under = visible().filter((it) => RL.isUnder(S.L, it, id)), end = S.now + 0.35;
      S.collapsed.add(id);
      phys.settleTo(under.map((it) => [it.id, [b.x, b.y]]), 0.15);
      under.forEach((it) => S.leaving.set(it.id, end));
      setTimeout(() => { S.hidden = RL.hiddenOf(S.L, S.collapsed); under.forEach((it) => S.leaving.delete(it.id)); phys.sync(visible()); syncStatus(); dirty(); }, S.still ? 0 : 350);
      if (S.sel && under.some((it) => it.id === S.sel)) closeSide();
      say(`${g.value} 접음`);
    }
    syncList(); syncStatus(); saveState(); dirty();
    if (S.sel === id) openSide(id, false);
  }
  /** 보기 초기화: 맨 처음 화면으로(묶기·색·필터·분류만 보기·펼침·옮긴 자리·카메라 모두, 사용자 11-20) */
  function resetView() {
    if (login) { const acc = store.get(ACCOUNT) || {}; delete acc.moved; store.set(ACCOUNT, acc); }
    closeSide(); hideDrill(true);
    S.view = RL.parseView(new URLSearchParams(), login, techs);
    rebuild((it) => { const p = it.parent && phys.B.get(it.parent); return p ? [p.x, p.y] : [0, 0]; }, null);
    flyTo(homeCam(), false); saveState(); dirty();
    say('처음 보기로 돌아왔어요. 묶기·색·필터도 처음으로 돌렸어요.');
  }

  // ---- 카메라
  const homeCam = () => { // 처음 보기: 보이는 것(접힌 묶음 제외)이 꽉 차게, 도구 줄 밑 가운데에
    const vr = Math.max(FIRST_RING, ...visible().map((it) => Math.hypot(it.x, it.y))) + 40, k = clampK(S.L.radius / vr);
    return { x: 0, y: -S.top / 2 / (k * S.base()), k };
  };
  const toWorld = (sx, sy) => [S.cam.x + (sx - S.W / 2) / S.scale(), S.cam.y + (sy - S.H / 2) / S.scale()];
  const toScreen = (x, y) => [S.W / 2 + (x - S.cam.x) * S.scale(), S.H / 2 + (y - S.cam.y) * S.scale()];
  function flyTo(to, user = true) { S.userCam = user; if (S.still) { S.cam = { ...to }; S.fly = null; } else S.fly = { from: { ...S.cam }, to, t0: S.now, dur: 0.5 }; dirty(); }
  function zoomAt(sx, sy, f) {
    const [wx, wy] = toWorld(sx, sy);
    S.fly = null; S.userCam = true; S.cam.k = clampK(S.cam.k * f);
    S.cam.x = wx - (sx - S.W / 2) / S.scale(); S.cam.y = wy - (sy - S.H / 2) / S.scale(); dirty();
  }
  function fitVisible() {
    const bs = visible().map((it) => phys.B.get(it.id)).filter(Boolean);
    if (!bs.length) return;
    const xs = bs.map((b) => b.x), ys = bs.map((b) => b.y), w = Math.max(80, Math.max(...xs) - Math.min(...xs)), h = Math.max(80, Math.max(...ys) - Math.min(...ys));
    const k = clampK(Math.min((S.W - S.right - 40) / w, (S.H - S.top - 40) / h) / S.base());
    const sc = k * S.base(), cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    flyTo({ k, x: cx + S.right / 2 / sc, y: cy - S.top / 2 / sc });
  }
  /** 고른 것이 사이드바·도구 줄 밑에 가려지면 카메라만 옮긴다(지도 크기는 그대로) */
  function reveal(id) {
    const b = phys.B.get(id); if (!b) return;
    const [x, y] = toScreen(b.x, b.y), sc = S.scale(), cx = (S.W - S.right) / 2, cy = (S.H + S.top) / 2;
    if (x > 30 && x < S.W - S.right - 30 && y > S.top + 30 && y < S.H - 30) return;
    flyTo({ k: S.cam.k, x: b.x - (cx - S.W / 2) / sc, y: b.y - (cy - S.H / 2) / sc });
  }

  // ---- 올리기·초점·카드
  function setFocus(id) {
    S.focusId = id && S.L.byId.has(id) ? id : '';
    const on = S.focusId || (S.L.byId.has(S.sel) ? S.sel : '');
    S.lit = on ? RL.connected(S.L, on) : null; dirty();
  }
  function tipHtml(it) {
    if (it.type === 'g') {
      const shut = S.collapsed.has(it.id);
      return `<b>${esc(it.value)}</b><span class="muted">${dimName(it.dim)} · ${it.count}개${it.danger ? ` · 위험 ${it.danger}` : ''}${it.caution ? ` · 주의 ${it.caution}` : ''}${it.err ? ` · 수집 오류 ${it.err}` : ''}</span><span class="muted">누르면 ${shut ? '펼쳐요' : '접어요'} · 이름을 누르면 목록 · 끌면 함께 옮겨요</span>`;
    }
    const t = it.t;
    return `<b>${esc(t.id)}${t.nw ? ' <span class="tag new">NEW</span>' : ''}</b><span class="muted">${esc(TR.radarSide.pathOf(t))}</span>${t.grade === '위험' || t.grade === '주의' ? `<span>${t.grade === '위험' ? '✕ 보안 위험' : '! 보안 주의'}</span>` : ''}${t.err ? '<span>수집 오류(지난 값 표시)</span>' : ''}<span class="muted">누르면 자세히 · 끌면 이웃이 따라와요</span>`;
  }
  function showTip(id, sx, sy) {
    const tip = $('tip'), it = id && S.L.byId.get(id);
    if (!it) { tip.hidden = true; return; }
    tip.innerHTML = tipHtml(it); tip.hidden = false;
    const left = sx + 16 + tip.offsetWidth > S.W - S.right ? sx - 16 - tip.offsetWidth : sx + 16;
    tip.style.left = `${Math.max(8, left)}px`; tip.style.top = `${Math.min(S.H - tip.offsetHeight - 8, Math.max(S.top, sy + 12))}px`;
  }

  // ---- 사이드바(지도 위에 덮음, 내용은 radar-side.js)
  let lastFocus = null;
  const dotOf = (it) => `<i style="background:var(${it ? it.token : '--unknown'})"></i>`;
  function openSide(id, move = true) {
    const it = S.L.byId.get(id); if (!it) return;
    if (!stage.classList.contains('open')) lastFocus = document.activeElement;
    S.sel = id; $('side').innerHTML = `<button class="btn close" data-close aria-label="닫기">${icon('close', 16)}</button>${it.type === 'g' ? TR.radarSide.group(it) : TR.radarSide.tech(it)}`;
    stage.classList.add('open'); measure(); setFocus(S.focusId);
    $('sTitle').focus({ preventScroll: true }); // 초점 때문에 화면이 밀렸다 돌아오던 문제(11-19)
    if (move) reveal(id);
    saveState();
  }
  function closeSide() {
    if (!stage.classList.contains('open')) return;
    S.sel = ''; stage.classList.remove('open'); measure(); setFocus(S.focusId); saveState();
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  /** 찾기·비교군 누르기: 필터·분류만 보기에 걸리면 풀고, 접힌 묶음 안이면 펼친 뒤 고른다 */
  function goTo(id) {
    if (!T[id]) return say('모은 기술에서 찾지 못했어요.');
    if (!RL.passes(T[id], S.view)) {
      const scoped = S.view.scope.length;
      setView({ filter: {}, risky: false, mine: false, nw: false, ...(scoped ? { scope: [] } : {}) });
      say(scoped ? '필터와 분류만 보기를 풀었어요.' : '필터를 풀었어요.');
    }
    const it = S.L.byId.get(id);
    let p = it.parent;
    while (p) { if (S.collapsed.has(p)) toggle(p); p = S.L.byId.get(p).parent; }
    openSide(id);
  }

  // ---- 도구 줄·범례·상태·목록
  const dims = () => Object.keys(RL.DIMS).filter((d) => RL.dimOk(d, login));
  const opts = (sel, none) => (none ? '<option value="">없음</option>' : '') + dims().map((d) => `<option value="${d}"${d === sel ? ' selected' : ''}>${dimName(d)}</option>`).join('');
  function syncControls() {
    const g = S.view.group;
    $('g1').innerHTML = opts(g[0]); $('g2').innerHTML = opts(g[1] || '', true); $('g3').innerHTML = opts(g[2] || '', true);
    $('g3').disabled = !g[1]; $('color').innerHTML = opts(S.view.color);
    const kinds = [...new Set(techs.map((t) => t.kind))], fields = [...TR.radar.BIG, TR.radar.UNSORTED], f = S.view.filter;
    const box = (dim, v) => `<label><input type="checkbox" data-f="${dim}" value="${esc(v)}"${f[dim] && f[dim].has(v) ? ' checked' : ''}> ${esc(v)}</label>`;
    $('fPop').innerHTML = `<fieldset><legend>보안</legend><label><input type="checkbox" data-b="risky"${S.view.risky ? ' checked' : ''}> 위험·주의만</label></fieldset>
      <fieldset><legend>새로 들어옴</legend><label><input type="checkbox" data-b="nw"${S.view.nw ? ' checked' : ''}> NEW만(이번 주)</label></fieldset>
      <fieldset><legend>내 기술</legend><label><input type="checkbox" data-b="mine"${S.view.mine ? ' checked' : ''}${login ? '' : ' disabled'}> 내 기술만${login ? '' : ' (로그인 뒤)'}</label></fieldset>
      <fieldset><legend>종류</legend>${kinds.map((v) => box('kind', v)).join('')}</fieldset><fieldset><legend>하는 일</legend>${fields.map((v) => box('field', v)).join('')}</fieldset>`;
    const n = Object.values(f).reduce((s, x) => s + x.size, 0) + S.view.risky + S.view.mine + S.view.nw;
    $('fCount').textContent = n ? n : '';
    $('saveNote').textContent = login ? '보기는 내 계정에 저장돼요' : '로그인 전: 보기는 저장 안 돼요 · 주소로 공유';
    $('loginNote').textContent = login ? '(보기 설정·옮긴 자리가 계정에 남음)' : '(아무것도 남기지 않음, 주소로만 공유)';
    $('login').checked = login;
  }
  function syncLegend() {
    const dim = S.L.color, f = S.view.filter[dim];
    $('legend').innerHTML = S.L.legend.map((l) => l.rest ? `<span class="chip">${dotOf(l)}${esc(l.value)} ${l.count}</span>`
      : `<button class="chip" data-lv="${esc(l.value)}" aria-pressed="${!!(f && f.has(l.value))}">${dotOf(l)}${esc(l.value)} ${l.count}</button>`).join('');
  }
  function syncStatus() {
    const vis = S.L.items.filter((it) => it.type === 't'), d = vis.filter((it) => it.t.grade === '위험').length, w = vis.filter((it) => it.t.grade === '주의').length, e = vis.filter((it) => it.t.err).length;
    $('status').textContent = `보이는 기술 ${S.L.shown} / 모은 기술 ${S.L.total}${S.collapsed.size ? ` · 접힌 묶음 ${S.collapsed.size}` : ''} · 위험 ${d} · 주의 ${w}${e ? ` · 수집 오류 ${e}(점선 고리)` : ''}`;
  }
  function syncList() { // 키보드·화면 읽기: 같은 묶음 나무를 목록으로
    const kids = new Map();
    S.L.items.forEach((it) => { if (!kids.has(it.parent)) kids.set(it.parent, []); kids.get(it.parent).push(it); });
    const li = (it) => it.type === 'g'
      ? `<li><button data-k="${esc(it.id)}" aria-expanded="${!S.collapsed.has(it.id)}">${S.collapsed.has(it.id) ? '▸' : '▾'} ${esc(it.value)} (${it.count}${it.danger ? ` · 위험 ${it.danger}` : ''})</button> <button data-drill="${esc(it.id)}" aria-label="${esc(it.value)}만 보기">만 보기</button>${S.collapsed.has(it.id) ? '' : `<ul>${(kids.get(it.id) || []).map(li).join('')}</ul>`}</li>`
      : `<li><button data-k="${esc(it.id)}">${esc(it.id)}${it.t.grade === '위험' || it.t.grade === '주의' ? ` · ${it.t.grade}` : ''}${it.t.err ? ' · 수집 오류' : ''}</button></li>`;
    $('klist').innerHTML = `<p class="muted">Enter: 묶음은 펼치기/접기, 기술은 자세히</p><ul>${(kids.get(null) || []).map(li).join('')}</ul>`;
  }

  let toastT;
  function say(msg) { const el = $('toast'); el.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => { el.textContent = ''; }, 2600); }

  // ---- 크기·그리기 고리
  function measure() {
    S.W = stage.clientWidth; S.H = stage.clientHeight;
    S.top = $('hud').getBoundingClientRect().bottom - stage.getBoundingClientRect().top + 6;
    const side = $('side').getBoundingClientRect();
    S.right = stage.classList.contains('open') && side.height > S.H * 0.9 ? side.width : 0;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(S.W * dpr); canvas.height = Math.round(S.H * dpr); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (S.L && !S.userCam && !S.fly) S.cam = homeCam(); // 아직 손대지 않은 카메라는 화면 크기가 바뀌면 처음 보기로 다시 맞춘다
    dirty();
  }
  let needDraw = true, last = 0, wasBusy = false, tick = 0;
  function dirty() { needDraw = true; }
  function frame(ms) {
    requestAnimationFrame(frame); // 한 장이 실패해도 다음 장은 그린다
    const now = ms / 1000, dt = Math.min(0.05, now - last || 0.016); last = now; S.now = now; tick++;
    let anim = false;
    if (S.fly) {
      const p = Math.min(1, (now - S.fly.t0) / S.fly.dur), e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2, { from, to } = S.fly;
      S.cam = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k * (to.k / from.k) ** e };
      if (p >= 1) S.fly = null; anim = true;
    }
    if (phys.busy()) { if (S.still) for (let i = 0; i < 40 && phys.busy(); i++) phys.step(1 / 60, now, true); else phys.step(dt, now, false); anim = true; }
    if (wasBusy && !phys.busy()) saveMoves();
    wasBusy = phys.busy();
    const sweeping = !S.still && now - S.sweep.start < 20;
    if (needDraw || anim || sweeping || S.leaving.size || (S.hasDanger && !S.still && tick % 2 === 0)) { draw(c, S, now); needDraw = false; if (S.drillId) syncDrill(); }
  }

  // ---- 시작
  function start() {
    let p = new URLSearchParams(location.hash.slice(1));
    const viewKeys = ['g', 'c', 'in', 'risky', 'mine', 'new', 'x', ...Object.values(RL.FKEY)];
    if (login && !viewKeys.some((k) => p.has(k))) { const acc = store.get(ACCOUNT); if (acc && acc.q) { const q = new URLSearchParams(acc.q); for (const [k, v] of p) q.set(k, v); p = q; } }
    S.view = RL.parseView(p, login, techs);
    measure();
    rebuild(null, p.has('x') ? (p.get('x') === '-' ? [] : p.get('x').split('~')) : null);
    S.cam = homeCam();
    $('names').innerHTML = techs.map((t) => `<option value="${esc(t.id)}">`).join('');
    $('bWait').textContent = ALERTS.filter((a) => a.status === 'wait').length || '';
    $('partial').hidden = p.get('state') !== 'partial';
    if (login && p.get('from') === 'start') {
      const mine = techs.filter((t) => t.mine);
      $('band').innerHTML = `<strong>첫 점검: 내 기술 ${mine.length}개 · 위험 ${mine.filter((t) => t.grade === '위험').length} · 주의 ${mine.filter((t) => t.grade === '주의').length}</strong><span>읽지 못한 파일이 있으면 수집 오류로 따로 보여요. <a href="journey.html#alerts">알림에서 보기</a></span>`;
      $('band').hidden = false;
    }
    const load = Math.max(0, Number(p.get('load')) || 700); // ?load=5000 이면 "아직 읽는 중"까지 본다
    $('loading').hidden = false;
    const slow = setTimeout(() => { $('loadText').textContent = '아직 읽는 중이에요'; }, 3000);
    setTimeout(() => { clearTimeout(slow); $('loading').hidden = true; S.sweep.start = S.now; dirty(); if (p.get('sel')) goTo(p.get('sel')); }, load);
    requestAnimationFrame(frame);
  }
  motion.addEventListener('change', () => { S.still = motion.matches; dirty(); });
  new ResizeObserver(measure).observe(stage);
  new ResizeObserver(measure).observe($('hud'));

  // 사이드바에서 판단을 남기면 내용만 다시 그린다(초점은 tr-judge가 누른 단추로 돌려놓음)
  TR.judge.onChange = (id, msg, warnOnly) => { say(msg); if (!warnOnly && S.sel === id) openSide(id, false); };

  TR.radarUI = { S, $, phys, canvas, stage, toWorld, toScreen, zoomAt, fitVisible, flyTo, homeCam, setView, toggle, drill, showDrill, hideDrill, resetView, openSide, closeSide, goTo, setFocus, showTip, say, dirty, saveState, syncList, syncStatus,
    get login() { return login; }, setLogin(v) { login = v; S.login = v; try { sessionStorage.setItem('radar-login', v ? '1' : '0'); } catch { /* 탭을 닫으면 로그인 전으로 */ } S.view = RL.parseView(RL.viewParams(S.view), v, techs); rebuild(null, [...S.collapsed]); saveState(); dirty(); } };
  start();
})();
