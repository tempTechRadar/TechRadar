// 레이더 시안의 손 조작: 끌기(물리) · 누르기(사이드바: 묶음은 목록·이 분류만 보기, 기술은 자세히) · 묶음 옆 +/− = 펼치기/접기 · 빈 곳 끌어 이동 · 휠·꼬집기 확대 · 두 번 누르기 = 보이는 것 맞추기,
// 스페이스를 누른 채 끌면 피그마처럼 손 모양으로 화면만 이동(점과 닿아도 반응 없음). 단축키는 두지 않는다(사용자 11-20). Esc는 사이드바 닫기.
(() => {
  const U = TR.radarUI, { S, phys, canvas, stage, $ } = U, RL = TR.radarLayout;
  const pts = new Map();
  let hand = false, down = null, pinch = null;
  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const hubR = (it) => it.r * Math.min(1.4, Math.max(0.7, S.scale() ** 0.5));

  function hit(sx, sy) {
    let best = null, bd = Infinity;
    const sc = S.scale();
    for (const it of S.L.items) {
      if (S.hidden.has(it.id) || S.leaving.has(it.id)) continue;
      const b = phys.B.get(it.id); if (!b) continue;
      const [x, y] = U.toScreen(b.x, b.y), rp = it.type === 'g' ? hubR(it) + 3 : Math.max(2.4, it.r * sc ** 0.6) + 5, d = Math.hypot(x - sx, y - sy);
      if (d < Math.max(rp, 10) && d - rp < bd) { bd = d - rp; best = it; }
    }
    return best;
  }
  const labelAt = (sx, sy) => S.hubLabels.find((l) => sx >= l.x && sx <= l.x + l.w && sy >= l.y && sy <= l.y + l.h);
  const riskAt = (sx, sy) => S.riskRects.find((r) => Math.hypot(r.x - sx, r.y - sy) < 18);
  const handleAt = (sx, sy) => (S.handles || []).find((h) => Math.hypot(h.x - sx, h.y - sy) < 11);
  function hover(id, sx, sy) {
    if (S.hover !== id) {
      S.hover = id; U.setFocus(id);
      if (id && S.L.byId.get(id).type === 'g') U.showDrill(id); else U.hideDrill();
    }
    canvas.classList.toggle('on-item', !!id);
    U.showTip(id, sx, sy);
  }

  // 끌기 시작: 묶음이면 그 아래 전체를 단단히(대형 유지), 기술이면 이웃(위 묶음·비교군)이 줄에 끌려온다
  function startDrag(d) {
    const it = S.L.byId.get(d.id), team = it.type === 'g' ? new Set(S.L.items.filter((x) => !S.hidden.has(x.id) && RL.isUnder(S.L, x, it.id)).map((x) => x.id)) : null;
    const pairs = S.L.items.filter((x) => x.parent && !S.hidden.has(x.id)).map((x) => [x.parent, x.id]).concat(S.L.edges);
    phys.kick(d.id, team, pairs);
    const b = phys.B.get(d.id), [wx, wy] = U.toWorld(d.x, d.y);
    d.off = [b.x - wx, b.y - wy]; d.drag = true;
    canvas.classList.add('dragging'); hover('', 0, 0); U.hideDrill(true);
  }
  $('drill').addEventListener('pointerenter', () => U.showDrill(S.drillId));
  $('drill').addEventListener('pointerleave', () => U.hideDrill());

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    pts.set(e.pointerId, [x, y]);
    if (pts.size === 2) { // 두 손가락: 끌기를 멈추고 꼬집기
      if (down && down.drag) phys.release();
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; down = null; return;
    }
    const cam = { ...S.cam };
    if (hand) { down = { mode: 'pan', x, y, cam }; stage.classList.add('panning'); return; }
    if (S.homeArrow && Math.hypot(S.homeArrow.x - x, S.homeArrow.y - y) < 40) { U.flyTo(U.homeCam(), false); return; } // 멀리 나갔을 때 "지도로 돌아가기"
    const r = riskAt(x, y), hd = handleAt(x, y), lab = labelAt(x, y), it = hit(x, y);
    down = r ? { mode: 'risk', r, x, y } : hd ? { mode: 'handle', id: hd.id, x, y } : it ? { mode: 'item', id: it.id, x, y } : lab ? { mode: 'label', id: lab.id, x, y } : { mode: 'pan', x, y, cam, click: true };
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (pts.has(e.pointerId)) pts.set(e.pointerId, [x, y]);
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], sc = S.scale();
      S.cam.x -= (m[0] - pinch.m[0]) / sc; S.cam.y -= (m[1] - pinch.m[1]) / sc;
      U.zoomAt(m[0], m[1], d / pinch.d); pinch = { d, m }; return;
    }
    if (!down) { if (hand) hover('', 0, 0); else { const hd = handleAt(x, y), it = !hd && hit(x, y), lab = !hd && !it && labelAt(x, y); hover(hd ? hd.id : it ? it.id : lab ? lab.id : '', x, y); } return; }
    const moved = Math.hypot(x - down.x, y - down.y) > 4;
    if (down.mode === 'pan' && (moved || down.panning)) {
      down.panning = true; S.fly = null; S.userCam = true;
      const sc = S.scale(); S.cam.x = down.cam.x - (x - down.x) / sc; S.cam.y = down.cam.y - (y - down.y) / sc; U.dirty();
    } else if (down.mode === 'item') {
      if (!down.drag && moved) startDrag(down);
      if (down.drag) { const [wx, wy] = U.toWorld(x, y); phys.drag(wx + down.off[0], wy + down.off[1]); }
    }
  });
  function endPointer(e, cancel) {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    stage.classList.remove('panning'); canvas.classList.remove('dragging');
    const d = down; down = null;
    if (!d) return;
    if (d.drag) { phys.release(); return; }
    if (cancel || d.panning) return;
    if (d.mode === 'risk') { const worst = d.r.list.find((it) => it.t.grade === '위험') || d.r.list[0]; U.openSide(worst.id); }
    else if (d.mode === 'handle') U.toggle(d.id);
    else if (d.mode === 'label' || d.mode === 'item') U.openSide(d.id); // 묶음도 누르면 사이드바(실수로 접히지 않게, U4)
    else if (d.click) U.closeSide();
  }
  canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  canvas.addEventListener('pointerleave', () => { if (!down) hover('', 0, 0); });
  canvas.addEventListener('dblclick', (e) => { const [x, y] = local(e); if (!hit(x, y)) U.fitVisible(); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = local(e); U.zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

  // 스페이스 = 손 모드(입력 칸·단추에 초점이 있으면 원래 동작 그대로)
  const typing = (el) => el && el.closest && el.closest('input, select, textarea, button, a, summary, [contenteditable], dialog');
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !typing(e.target)) { e.preventDefault(); if (!hand) { hand = true; stage.classList.add('hand'); hover('', 0, 0); } }
    if (e.key === 'Escape') {
      if ($('filter').open) { $('filter').open = false; $('filter').querySelector('summary').focus(); }
      else if (stage.classList.contains('open') && !document.querySelector('dialog[open]')) U.closeSide();
      U.showTip('');
    }
  });
  const handOff = () => { hand = false; stage.classList.remove('hand', 'panning'); };
  document.addEventListener('keyup', (e) => { if (e.code === 'Space') handOff(); });
  window.addEventListener('blur', handOff);

  // 키보드·화면 읽기 목록
  const klist = $('klist');
  klist.addEventListener('click', (e) => {
    const id = e.target.closest('[data-k]')?.dataset.k; if (!id) return;
    const it = S.L.byId.get(id);
    if (it.type === 'g') { U.toggle(id); klist.querySelector(`[data-k="${CSS.escape(id)}"]`)?.focus(); } else U.openSide(id);
  });
  klist.addEventListener('focusin', (e) => {
    const id = e.target.dataset.k, b = id && phys.B.get(id); if (!b) return;
    U.setFocus(id); const [x, y] = U.toScreen(b.x, b.y); U.showTip(id, x, y);
  });
  klist.addEventListener('focusout', (e) => { if (!klist.contains(e.relatedTarget)) { U.setFocus(''); U.showTip(''); } });

  // 도구 줄
  const groupOf = () => {
    const g = [];
    for (const v of [$('g1').value, $('g2').value, $('g3').value]) { if (!v) break; if (!g.includes(v)) g.push(v); }
    return g;
  };
  ['g1', 'g2', 'g3'].forEach((id) => $(id).addEventListener('change', () => { U.setView({ group: groupOf() }); $(id).focus(); }));
  $('color').addEventListener('change', () => { U.setView({ color: $('color').value }); $('color').focus(); });
  $('fPop').addEventListener('change', (e) => {
    const el = e.target, dim = el.dataset.f;
    if (dim) {
      const filter = { ...S.view.filter }, set = new Set(filter[dim] || []);
      if (el.checked) set.add(el.value); else set.delete(el.value);
      filter[dim] = set;
      if (dim === 'field' && !el.checked && filter.sub) filter.sub = new Set([...filter.sub].filter((sv) => !(TR.radar.CATS[el.value] || []).includes(sv))); // 접힌 세부 갈래가 몰래 남지 않게
      U.setView({ filter });
      $('fPop').querySelector(`[data-f="${dim}"][value="${CSS.escape(el.value)}"]`)?.focus();
    } else if (el.dataset.b) { U.setView({ [el.dataset.b]: el.checked }); $('fPop').querySelector(`[data-b="${el.dataset.b}"]`)?.focus(); }
  });
  $('legend').addEventListener('click', (e) => {
    const v = e.target.closest('[data-lv]')?.dataset.lv; if (v == null) return;
    const dim = S.L.color, filter = { ...S.view.filter }, set = new Set(filter[dim] || []);
    if (set.has(v)) set.delete(v); else set.add(v);
    filter[dim] = set; U.setView({ filter });
    $('legend').querySelector(`[data-lv="${CSS.escape(v)}"]`)?.focus();
  });
  document.addEventListener('click', (e) => {
    if ($('filter').open && !e.target.closest('#filter')) $('filter').open = false;
    const t = e.target.closest('[data-close],[data-go],[data-toggle],[data-judge],[data-drill],[data-crumb],[data-nwchip],[data-minechip]');
    if (!t) return;
    if (t.dataset.close != null) U.closeSide();
    if (t.dataset.go) U.goTo(t.dataset.go);
    if (t.dataset.toggle) { U.toggle(t.dataset.toggle); $('side').querySelector('[data-toggle]')?.focus(); }
    if (t.dataset.judge) U.say(TR.judge.save(t.dataset.id, t.dataset.judge)); // "+ 기술 넣기" 상자
    if (t.dataset.nwchip != null) U.setView({ nw: !S.view.nw });
    if (t.dataset.minechip != null) U.setView({ mine: !S.view.mine });
    if (t.dataset.drill) U.drill(t.dataset.drill);
    if (t.dataset.crumb != null) U.setView({ scope: S.view.scope.slice(0, Number(t.dataset.crumb)) });
  });
  $('reset').addEventListener('click', U.resetView);
  $('clearF').addEventListener('click', () => U.setView({ filter: {}, risky: false, mine: false, nw: false, err: false }));
  // 찾기: 이름 일부 · 설명 · 갈래 이름으로(U1). 갈래면 '이 분류만 보기', 기술이면 고르기. ↓로 결과로 내려가고 Esc로 닫음
  $('q').addEventListener('input', () => U.showResults($('q').value));
  $('q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('qres').querySelector('button')?.click(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); $('qres').querySelector('button')?.focus(); }
    if (e.key === 'Escape') U.showResults('');
  });
  $('qres').addEventListener('keydown', (e) => {
    const bs = [...$('qres').querySelectorAll('button')], i = bs.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); bs[Math.min(bs.length - 1, i + 1)]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? bs[i - 1] : $('q')).focus(); }
    if (e.key === 'Escape') { U.showResults(''); $('q').focus(); }
  });
  $('qres').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    U.showResults('');
    if (b.dataset.tech) U.goTo(b.dataset.tech); else U.setView({ scope: [{ dim: b.dataset.dim, value: b.dataset.val }] });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search')) U.showResults(''); });
  $('more').addEventListener('click', () => { const on = $('hud').classList.toggle('more-open'); $('more').setAttribute('aria-expanded', on); });
  $('login').addEventListener('change', (e) => { U.setLogin(e.target.checked); U.say(e.target.checked ? '로그인한 척: 보기 설정과 옮긴 자리가 계정에 남아요.' : '로그인 전: 아무것도 남기지 않아요. 주소로만 공유돼요.'); });
  // "+ 기술 넣기" 결과의 "지도에서 보기"(#map/<id>)
  window.addEventListener('hashchange', () => { const m = location.hash.match(/^#map\/(.+)/); if (m) { document.querySelector('dialog[open]')?.close(); U.goTo(decodeURIComponent(m[1])); } });
})();
