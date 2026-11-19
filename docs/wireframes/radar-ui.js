// 레이더 시안의 상태·화면 조각: 보기 설정 도구 줄, 범례, 덮는 사이드바, 올리기 카드, 키보드 목록, 주소·계정 저장, 카메라, 그리기 고리.
// 저장 규칙(design.md 14절): 로그인 전 = 아무것도 남기지 않음(주소로 공유만), 로그인 뒤 = 보기 설정·옮긴 자리를 계정에(시안은 이 브라우저로 흉내).
(() => {
  const { icon, esc, JN, judged, ALERTS } = TR;
  const { techs, edges, byId: T, UNSORTED } = TR.radar;
  const RL = TR.radarLayout, { FIRST_RING } = RL, phys = TR.radarPhysics.create(), { draw } = TR.radarDraw;
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
    syncControls(); syncLegend(); syncStatus(); syncList(); setFocus(S.focusId);
    $('empty').hidden = S.L.shown > 0;
  }
  function setView(patch) {
    const regroup = patch.group && patch.group.join() !== S.view.group.join();
    S.view = { ...S.view, ...patch };
    rebuild(() => [0, 0], regroup ? null : [...S.collapsed]);
    saveState(); dirty();
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
  /** 보기 초기화: 처음 화면(기본 카메라 · 옮긴 점 제자리 · 기본 펼침). 묶기·색·거르기는 그대로 */
  function resetView() {
    if (login) { const acc = store.get(ACCOUNT) || {}; if (acc.moved) delete acc.moved[viewKey()]; store.set(ACCOUNT, acc); }
    closeSide();
    S.collapsed = RL.defaultCollapsed(S.L); S.hidden = RL.hiddenOf(S.L, S.collapsed); S.leaving.clear();
    phys.sync(visible(), (it) => { const p = it.parent && phys.B.get(it.parent); return p ? [p.x, p.y] : null; });
    phys.settleTo(visible().map((it) => [it.id, [it.x, it.y]]), 0.06);
    flyTo(homeCam(), false); syncList(); syncStatus(); saveState(); dirty();
    say('처음 보기로 돌아왔어요. 묶기·색·거르기는 그대로예요.');
  }

  // ---- 카메라
  const homeCam = () => { // 처음 보기: 보이는 것(접힌 묶음 제외)이 꽉 차게, 도구 줄 밑 가운데에
    const vr = Math.max(FIRST_RING, ...visible().map((it) => Math.hypot(it.x, it.y))) + 40, k = Math.max(0.2, Math.min(6, S.L.radius / vr));
    return { x: 0, y: -S.top / 2 / (k * S.base()), k };
  };
  const toWorld = (sx, sy) => [S.cam.x + (sx - S.W / 2) / S.scale(), S.cam.y + (sy - S.H / 2) / S.scale()];
  const toScreen = (x, y) => [S.W / 2 + (x - S.cam.x) * S.scale(), S.H / 2 + (y - S.cam.y) * S.scale()];
  function flyTo(to, user = true) { S.userCam = user; if (S.still) { S.cam = { ...to }; S.fly = null; } else S.fly = { from: { ...S.cam }, to, t0: S.now, dur: 0.5 }; dirty(); }
  function zoomAt(sx, sy, f) {
    const [wx, wy] = toWorld(sx, sy);
    S.fly = null; S.userCam = true; S.cam.k = Math.max(0.2, Math.min(6, S.cam.k * f));
    S.cam.x = wx - (sx - S.W / 2) / S.scale(); S.cam.y = wy - (sy - S.H / 2) / S.scale(); dirty();
  }
  function fitVisible() {
    const bs = visible().map((it) => phys.B.get(it.id)).filter(Boolean);
    if (!bs.length) return;
    const xs = bs.map((b) => b.x), ys = bs.map((b) => b.y), w = Math.max(80, Math.max(...xs) - Math.min(...xs)), h = Math.max(80, Math.max(...ys) - Math.min(...ys));
    const k = Math.max(0.2, Math.min(6, Math.min((S.W - S.right - 40) / w, (S.H - S.top - 40) / h) / S.base()));
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
  const secText = { 위험: '보안 위험: 알려진 취약점이 있어요(OSV). 위험한 버전은 적용 후보로 고를 수 없어요.', 주의: '보안 주의: 오래 고쳐지지 않은 이슈가 있어요.', '찾지 못함': '보안: 아직 등급을 찾지 못했어요.', 통과: '보안: 알려진 문제를 찾지 못했어요(안전하다는 보증은 아니에요).' };
  const errText = '수집 오류: 지난번 읽기에 실패했어요. "문제 없음"이 아니에요. 마지막으로 읽은 값을 그대로 둬요.';
  const pathOf = (t) => `${t.big || UNSORTED} › ${t.sub || UNSORTED} · ${t.kind} · ${t.host}`;
  function tipHtml(it) {
    if (it.type === 'g') {
      const shut = S.collapsed.has(it.id);
      return `<b>${esc(it.value)}</b><span class="muted">${dimName(it.dim)} · ${it.count}개${it.danger ? ` · 위험 ${it.danger}` : ''}${it.caution ? ` · 주의 ${it.caution}` : ''}${it.err ? ` · 수집 오류 ${it.err}` : ''}</span><span class="muted">누르면 ${shut ? '펼쳐요' : '접어요'} · 이름을 누르면 목록 · 끌면 함께 옮겨요</span>`;
    }
    const t = it.t;
    return `<b>${esc(t.id)}${t.nw ? ' <span class="tag new">NEW</span>' : ''}</b><span class="muted">${esc(pathOf(t))}</span>${t.grade === '위험' || t.grade === '주의' ? `<span>${t.grade === '위험' ? '✕ 보안 위험' : '! 보안 주의'}</span>` : ''}${t.err ? '<span>수집 오류(지난 값 표시)</span>' : ''}<span class="muted">누르면 자세히 · 끌면 이웃이 따라와요</span>`;
  }
  function showTip(id, sx, sy) {
    const tip = $('tip'), it = id && S.L.byId.get(id);
    if (!it) { tip.hidden = true; return; }
    tip.innerHTML = tipHtml(it); tip.hidden = false;
    const left = sx + 16 + tip.offsetWidth > S.W - S.right ? sx - 16 - tip.offsetWidth : sx + 16;
    tip.style.left = `${Math.max(8, left)}px`; tip.style.top = `${Math.min(S.H - tip.offsetHeight - 8, Math.max(S.top, sy + 12))}px`;
  }

  // ---- 사이드바(지도 위에 덮음)
  let lastFocus = null;
  const dotOf = (it) => `<i style="background:var(${it ? it.token : '--unknown'})"></i>`;
  function sideTech(it) {
    const t = it.t, nb = edges.filter((e) => e.includes(t.id)).map((e) => T[e[0] === t.id ? e[1] : e[0]]), j = judged[t.id];
    return `<h2 id="sTitle" tabindex="-1">${esc(t.id)}</h2><div class="muted">${esc(pathOf(t))}</div>
      <div class="row" style="margin:6px 0 8px">${t.nw ? '<span class="tag new">NEW</span>' : ''}${login && t.mine ? '<span class="tag strong">내 기술 · 쓰는 중</span>' : ''}${login && j ? `<span class="tag strong">${JN[j]}</span>` : ''}</div>
      <p>${esc(t.desc)}</p><p class="muted">${esc(t.pop)} · 업데이트 ${esc(t.upd)}</p><p class="muted">${secText[t.grade]}</p>${t.err ? `<p class="muted">${errText}</p>` : ''}
      <h3>비교군 ${nb.length}</h3><ul class="near">${nb.map((n) => `<li>${dotOf(S.L.byId.get(n.id))}<button data-go="${esc(n.id)}">${esc(n.id)}</button>${n.grade === '위험' ? '<span class="tag">위험</span>' : ''}</li>`).join('') || '<li class="muted">아직 없어요.</li>'}</ul>
      <h3>내 판단</h3>${login ? (TR.byId[t.id] ? `<a class="btn" href="journey.html#tech/${t.id}">관심 · 적용 후보 · 보류 고르기</a>` : '<p class="muted">판단 화면은 샘플 13개에만 있어요.</p>') : '<p class="muted">로그인하면 관심 · 판단을 남길 수 있어요. 지도는 로그인 없이 볼 수 있어요.</p>'}
      ${TR.byId[t.id] ? `<p style="margin-top:14px"><a class="btn primary" href="journey.html#tech/${t.id}">전체 상세 보기</a></p>` : ''}`;
  }
  function sideGroup(g) {
    const sev = (t) => (t.grade === '위험' ? 0 : t.grade === '주의' ? 1 : t.err ? 2 : 3);
    const list = S.L.items.filter((it) => it.type === 't' && RL.isUnder(S.L, it, g.id)).sort((a, b) => sev(a.t) - sev(b.t) || (a.id < b.id ? -1 : 1));
    const unsorted = g.value === UNSORTED && (g.dim === 'field' || g.dim === 'sub');
    const cls = unsorted ? `<div class="box"><b>분류 전 ${g.count}개</b><span class="muted">기본 규칙(이름·설명 낱말)으로 갈래를 정하지 못한 기술이에요.</span>
      ${login ? `<div class="row"><a class="btn" href="classify.html">직접 분류하기</a><a class="btn" href="classify.html">AI 제안 받기 · 오늘 남은 20</a></div><span class="muted">AI 제안은 내가 확인해야 내 분류에 저장돼요.</span>`
        : `<div class="row"><span class="btn" aria-disabled="true">직접 분류하기</span><span class="btn" aria-disabled="true">AI 제안 받기</span></div><span class="muted">로그인하면 나만의 분류를 만들 수 있어요.</span>`}</div>` : '';
    return `<h2 id="sTitle" tabindex="-1">${esc(g.value)}</h2><div class="muted">${g.level}단계 · ${dimName(g.dim)} · ${g.count}개${g.danger ? ` · 위험 ${g.danger}` : ''}${g.caution ? ` · 주의 ${g.caution}` : ''}${g.err ? ` · 수집 오류 ${g.err}` : ''}</div>
      <p class="row" style="margin-top:8px"><button class="btn" data-toggle="${esc(g.id)}">${S.collapsed.has(g.id) ? '펼치기' : '접기'}</button></p>${cls}
      <h3>기술 ${list.length}${list.length > 50 ? ' (위험·주의 먼저 50개)' : ''}</h3><ul class="near">${list.slice(0, 50).map((it) => `<li>${dotOf(it)}<button data-go="${esc(it.id)}">${esc(it.id)}</button>${it.t.grade === '위험' || it.t.grade === '주의' ? `<span class="tag">${it.t.grade}</span>` : ''}${it.t.err ? '<span class="tag">수집 오류</span>' : ''}</li>`).join('')}</ul>`;
  }
  function openSide(id, move = true) {
    const it = S.L.byId.get(id); if (!it) return;
    if (!stage.classList.contains('open')) lastFocus = document.activeElement;
    S.sel = id; $('side').innerHTML = `<button class="btn close" data-close aria-label="닫기">${icon('close', 16)}</button>${it.type === 'g' ? sideGroup(it) : sideTech(it)}`;
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
  /** 찾기·비교군 누르기: 걸러졌으면 거르기를 풀고, 접힌 묶음 안이면 펼친 뒤 고른다 */
  function goTo(id) {
    if (!T[id]) return say('모은 기술에서 찾지 못했어요.');
    if (!RL.passes(T[id], S.view)) { setView({ filter: {}, risky: false, mine: false, nw: false }); say('거르기를 풀었어요.'); }
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
    const kinds = [...new Set(techs.map((t) => t.kind))], fields = [...TR.radar.BIG, UNSORTED], f = S.view.filter;
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
    const dim = S.view.color, f = S.view.filter[dim];
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
      ? `<li><button data-k="${esc(it.id)}" aria-expanded="${!S.collapsed.has(it.id)}">${S.collapsed.has(it.id) ? '▸' : '▾'} ${esc(it.value)} (${it.count}${it.danger ? ` · 위험 ${it.danger}` : ''})</button>${S.collapsed.has(it.id) ? '' : `<ul>${(kids.get(it.id) || []).map(li).join('')}</ul>`}</li>`
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
    if (needDraw || anim || sweeping || S.leaving.size || (S.hasDanger && !S.still && tick % 2 === 0)) { draw(c, S, now); needDraw = false; }
  }

  // ---- 시작
  function start() {
    let p = new URLSearchParams(location.hash.slice(1));
    const viewKeys = ['g', 'c', 'risky', 'mine', 'new', 'x', ...Object.values(RL.FKEY)];
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

  TR.radarUI = { S, $, phys, canvas, stage, toWorld, toScreen, zoomAt, fitVisible, flyTo, setView, toggle, resetView, openSide, closeSide, goTo, setFocus, showTip, say, dirty, saveState, syncList, syncStatus,
    get login() { return login; }, setLogin(v) { login = v; S.login = v; try { sessionStorage.setItem('radar-login', v ? '1' : '0'); } catch { /* 탭을 닫으면 로그인 전으로 */ } S.view = RL.parseView(RL.viewParams(S.view), v, techs); rebuild(null, [...S.collapsed]); saveState(); dirty(); } };
  start();
})();
