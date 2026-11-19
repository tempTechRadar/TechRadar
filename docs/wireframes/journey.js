// 화면 흐름 시안(무채색). 탐색 → 이해 → 판단 → 기억 → 조립을 눌러 본다. 데이터는 journey-data.js의 샘플이고 새로고침하면 처음으로 돌아간다.
(() => {
  const { icon, esc, byId, SAME, ALERTS, NEWS, JN, judged, records, stateOf, tagRow, ui } = TR;
  const R = (id) => TR.radar.byId[id]; // 지도와 같은 카탈로그(radar-data.js): 샘플 13개 + 모은 기술 표본
  const neighbors = (id) => SAME.filter((e) => e.includes(id)).map((e) => (e[0] === id ? e[1] : e[0]));
  const waiting = () => ALERTS.filter((a) => a.status === 'wait');
  // 기술 지도는 radar.html(11-20 새 레이더). 이 흐름 시안의 #map·#map/<id>는 그쪽으로 보낸다(?n= 표본 크기는 그대로)
  const mapUrl = (id) => `radar.html${location.search}${id ? `#sel=${encodeURIComponent(id)}` : ''}`;

  // ---- 알림 판단 단추. 판단은 기록일 뿐 아무것도 설치·변경하지 않는다(불변 1, ADR 0010). 알림 없는 판단은 tr-judge.js 세 단추
  function judgeBox(t, alert) {
    const holdForm = `<form class="hold" data-id="${t.id}" data-alert="${alert.id}" hidden>
      <label for="why-${t.id}">보류 이유 (5자 이상)</label><textarea id="why-${t.id}" minlength="5" required></textarea>
      <div class="row"><button class="btn primary">보류로 저장</button><button type="button" class="btn" data-act="holdCancel">취소</button></div></form>`;
    if (alert.status === 'done') return `<p class="note">판단을 마쳤어요: <b>${alert.kind === '보안 경고' && alert.result === 'cand' ? '고친 버전으로 올리기' : JN[alert.result]}</b>. 완료는 판단을 마쳤다는 뜻이고, 설치하거나 바꾼 것은 없어요.</p>`;
    const sec = alert.kind === '보안 경고';
    const cand = sec ? (alert.fixed ? `고친 버전 ${alert.fixed}로 올리기` : '') : '써 볼 후보로';
    return `<div class="row">${cand ? `<button class="btn primary" data-judge="cand" data-id="${t.id}" data-alert="${alert.id}">${cand}</button>` : ''}<button class="btn" data-act="hold">보류</button></div>${holdForm}`;
  }

  // 출처는 항목마다, 없으면 "찾지 못함"(UJ-4·UJ-6, 지어내지 않음)
  const srcLinks = (t) => TR.radar.sourcesOf(t).map(([label, url]) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${label}</a>` : `${label}: 찾지 못함`)).join(' · ');
  /** 두 기술 나란히(지도 카탈로그 값). b가 내 기술이면 "내 …" */
  function compareTable(a, b) {
    const rows = [['이럴 때 좋아요', (x) => x.goodFor || '찾지 못함'], ['하는 일', (x) => x.desc], ['세부 갈래', (x) => x.sub || TR.radar.UNSORTED], ['종류', (x) => x.kind], ['쓰는 곳', (x) => x.host], ['인기', (x) => x.pop], ['마지막 업데이트', (x) => x.upd], ['라이선스', (x) => x.license || '찾지 못함'], ['보안', (x) => x.grade + (x.err ? ' · 수집 오류' : '')]];
    const nb = `${b.mine ? '내 ' : ''}${esc(b.id)}`;
    return `<table class="cmp"><caption class="sr">${esc(a.id)}와 ${nb} 비교</caption><thead><tr><th></th><th>${esc(a.id)}</th><th>${nb}</th></tr></thead><tbody>${rows.map(([k, f]) => `<tr><th scope="row">${k}</th><td>${esc(f(a))}</td><td>${esc(f(b))}</td></tr>`).join('')}
      <tr><th scope="row">출처</th><td>${srcLinks(a)}</td><td>${srcLinks(b)}</td></tr></tbody></table>`;
  }

  // ---- 화면들
  // 시작·로그인·등록 화면은 journey-project.js(TR.views.start)
  function newView() {
    const nw = TR.radar.techs.filter((t) => t.nw), groups = [...TR.radar.BIG, TR.radar.UNSORTED]; // 지도와 같은 갈래(U19)
    return `<h1 tabindex="-1">새 기술</h1><p class="muted">이번 주에 알아서 모은 기술 ${nw.length}개예요. 판단은 필요할 때만 하면 돼요. 마지막 수집 ${TR.radar.LAST_RUN}.</p>
      ${groups.map((n) => [n, nw.filter((t) => (t.big || TR.radar.UNSORTED) === n)]).filter(([, l]) => l.length).map(([n, l]) => `<h3>${n} ${l.length}</h3><ul class="list">${l.map((t) => `<li><div><b>${esc(t.id)}</b> <span class="tag new">NEW</span> ${stateOf(t) ? `<span class="tag strong">${JN[stateOf(t)]}</span>` : ''}<div class="muted">${esc(TR.radar.pathOf(t))}</div>${esc(t.desc)}<br><span class="muted">${t.pop}${t.grade === '위험' || t.grade === '주의' ? ' · 보안 ' + t.grade : ''}${t.err ? ' · 수집 오류' : ''}</span></div>
        <div class="row"><a class="btn" href="#map/${t.id}">지도에서 보기</a><button class="btn" data-judge="int" data-id="${t.id}" aria-pressed="${judged[t.id] === 'int'}">관심</button><a class="btn" href="#tech/${t.id}">상세</a></div></li>`).join('')}</ul>`).join('')}
      <h3>공식 소식 (알림이 아니에요)</h3><ul class="list">${NEWS.map(([a, b]) => `<li><div>${a}<br><span class="muted">${b}</span></div></li>`).join('')}</ul>`;
  }

  // ---- 기술 상세(머리 + 2단, 사용자 11-20): 위 머리·판단 줄 / 왼쪽 본문(하는 일 → 비교군과 이유 → 보안·수집 → 시나리오) / 오른쪽 요약(핵심 정보 · 판단 기록)
  const BADGE = { 위험: ['danger', '보안 위험'], 주의: ['caution', '보안 주의'] };
  function techView(id) {
    const t = R(id);
    if (!t) return `<h1 tabindex="-1">찾지 못했어요</h1><a class="btn" href="${mapUrl()}">지도로</a>`;
    const rels = TR.radar.edges.filter((e) => e.includes(id)).map((e) => { const o = e[0] === id ? e[1] : e[0]; return { n: R(o), why: TR.radar.why(id, o) }; }).sort((p, q) => (q.why.by === 'admin') - (p.why.by === 'admin'));
    const pick = (rels.find((r) => r.n.id === ui.cmp) || rels.find((r) => r.n.mine) || rels[0] || {}).n;
    const rec = records.filter((r) => r.id === id), badge = BADGE[t.grade], base = byId[id];
    const facts = [['종류', t.kind], ['쓰는 곳', t.host], ['하는 일', t.big || TR.radar.UNSORTED], ['세부 갈래', t.sub || TR.radar.UNSORTED], ['인기', t.pop], ['마지막 업데이트', t.upd], ['라이선스', t.license || '찾지 못함'],
      ['마지막 확인', t.err ? '읽기 실패 · 지난 값(11월 18일 06:00)' : '오늘 06:00 정기 수집']];
    return `<header class="dhead">
        <div class="row"><a class="btn" href="${mapUrl(id)}">${icon('back', 16)}지도로</a><h1 tabindex="-1">${esc(id)}</h1>${t.nw ? '<span class="tag new" title="이번 주에 들어온 기술">NEW</span>' : ''}${badge ? `<span class="tag strong">${icon(badge[0], 14)} ${badge[1]}</span>` : ''}${t.err ? `<span class="tag strong">${icon('error', 14)} 수집 오류</span>` : ''}</div>
        <div class="muted">${esc(TR.radar.pathOf(t))}</div>
        <div class="jbar"><span class="jlabel">내 판단</span>${TR.judge.html(t, { login: true })}${waiting().filter((a) => a.tech === id).map((a) => `<a class="btn primary" href="#alert/${a.id}">${icon('bell', 16)}${a.kind} 판단하기</a>`).join('')}</div>
      </header>
      <div class="dgrid"><div class="dmain">
        <section class="box"><h2>하는 일</h2><p>${esc(t.desc)}</p>${t.goodFor ? `<p><b>이럴 때 좋아요:</b> ${esc(t.goodFor)}</p>` : ''}${base ? `<div class="row">${tagRow(base)}</div>` : ''}</section>
        <section class="box"><h2>비교군 ${rels.length}</h2>${rels.length ? `<p class="muted">같은 역할을 하는 기술이에요. 이름을 누르면 아래 표에서 나란히 봐요.</p>
          <ul class="near">${rels.map(({ n, why }) => `<li class="rel"><div><button class="link" data-act="cmp" data-val="${esc(n.id)}" aria-pressed="${n === pick}">${esc(n.id)}${n.mine ? ' (내 기술)' : ''}</button><span class="why">왜: ${esc(why.quote)}</span><span class="muted">${why.who}</span></div><a class="btn sm" href="#tech/${encodeURIComponent(n.id)}">상세</a></li>`).join('')}</ul>
          ${compareTable(t, pick)}` : '<p class="muted">아직 비교군이 없어요.</p>'}</section>
        <section class="box"><h2>보안 · 수집 상태</h2><p>${badge ? icon(badge[0], 15) + ' ' : ''}${TR.radar.SEC_TEXT[t.grade]}</p>${t.err ? `<p>${icon('error', 15)} ${TR.radar.ERR_TEXT}</p>` : ''}<p class="muted src">출처: ${srcLinks(t)} · 보안은 곁들임 정보예요.</p></section>
        <section class="box"><h2>적용 시나리오</h2><p class="muted">내 프로젝트에 넣는 방법을 Claude가 써 줘요. 누를 때만 만들어요(참고 자료).</p><button class="btn" data-act="scenario">적용 시나리오 만들기</button></section>
      </div><aside class="dside">
        <section class="box"><h2>핵심 정보</h2><dl class="kv">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl></section>
        <section class="box"><h2>이력</h2><ul class="near">${TR.radar.historyOf(t).map(([at, what]) => `<li><div><span class="muted">${at}</span> · ${what}</div></li>`).join('')}</ul></section>
        <section class="box"><h2>내 판단 기록</h2>${rec.length ? `<ul class="near">${rec.map((r) => `<li><div><span class="muted">${r.at}</span> · <b>${r.label || JN[r.j]}</b> ${esc(r.why)}${r.rating ? ` <span aria-label="별 ${r.rating}개">${'★'.repeat(r.rating)}</span>` : ''}${r.note ? `<div class="muted">${esc(r.note)}</div>` : ''}</div></li>`).join('')}</ul>` : '<p class="muted">아직 없어요. 위 판단 단추로 바로 남겨요.</p>'}</section>
        <a class="btn" href="${mapUrl(id)}">지도에서 보기</a>
      </aside></div>`;
  }

  function alertsView() {
    return `<h1 tabindex="-1">알림</h1><p class="muted">내 기술에 생긴 일 가운데 내 판단이 필요한 것만 와요.</p>
      <ul class="list">${ALERTS.map((a) => `<li><div><b>${a.tech}</b><div class="row" style="margin:2px 0"><span class="tag strong">${a.kind}</span><span class="tag">${R(a.tech).big}</span><span class="tag">${byId[a.tech].kind}</span>${tagRow(byId[a.tech])}</div>${a.what}<br><span class="muted">${a.at}</span></div>
        <div class="row"><span class="tag${a.status === 'wait' ? ' strong' : ''}">${a.status === 'wait' ? '판단 대기' : '완료 · ' + (a.kind === '보안 경고' && a.result === 'cand' ? '고친 버전으로' : JN[a.result])}</span><a class="btn" href="#alert/${a.id}">${a.status === 'wait' ? '판단하기' : '보기'}</a></div></li>`).join('')}</ul>`;
  }

  function alertView(id) {
    const a = ALERTS.find((x) => x.id === id);
    if (!a) return `<h1 tabindex="-1">찾지 못했어요</h1><a href="#alerts">알림으로</a>`;
    const t = byId[a.tech], sec = a.kind === '보안 경고', mine = neighbors(t.id).map((n) => byId[n]).find((n) => n.mine);
    const past = records.filter((r, i) => R(r.id).big === R(t.id).big && r.id !== t.id && records.findIndex((x) => x.id === r.id) === i); // 같은 갈래, 기술마다 최신 판단 하나
    return `<a class="btn" href="#alerts">${icon('back', 16)}알림 목록</a>
      <div class="cols" style="margin-top:12px"><div class="box"><span class="tag">${a.kind}</span><h1 tabindex="-1">${t.id}</h1>
        <dl class="kv"><dt>무엇이 바뀌었나</dt><dd>${a.what}</dd><dt>언제</dt><dd>${a.at}</dd>${sec ? `<dt>고친 버전</dt><dd>${a.fixed}</dd>` : ''}</dl>
        ${sec ? `<h3>대응안 초안 (Claude, 참고)</h3><p>고친 버전 ${a.fixed}로 올리기를 권해요. 출처: OSV, GitHub Advisory.</p>` : mine ? `<h3>내 ${mine.id}와 비교</h3>${compareTable(R(t.id), R(mine.id))}` : ''}
        <h3>비슷한 과거 판단</h3>${past.length ? past.map((r) => `<p>${r.at} · ${r.id} · <b>${r.label || JN[r.j]}</b> ${esc(r.why)}</p>`).join('') : '<p class="muted">없어요.</p>'}
        <div class="row" style="margin-top:8px"><a class="btn" href="#map/${t.id}">지도에서 보기</a><a class="btn" href="#tech/${t.id}">기술 상세</a><button class="btn" data-act="scenario">적용 시나리오 만들기</button></div>
      </div><div class="box"><h2>판단</h2><p class="muted">판단하기 전에는 아무것도 바뀌지 않아요.</p>${judgeBox(t, a)}</div></div>`;
  }

  function recordsView() {
    return `<h1 tabindex="-1">기록</h1><p class="muted">지난 판단과 이유예요. 비슷한 기술이 나오면 여기서 다시 찾아요.</p>
      <div class="tools"><label class="search">${icon('search')}<input id="rq" placeholder="기술 이름 · 이유 · 코멘트 · 태그로 찾기" aria-label="기록 찾기"></label>
        <select id="rj" aria-label="판단 필터"><option value="">모든 판단</option>${['cand', 'int', 'hold'].map((j) => `<option value="${j}">${JN[j]}</option>`).join('')}</select></div>
      <ul class="list" id="rlist">${recordRows()}</ul>`;
  }
  function recordRows(q = '', j = '') {
    // 기록은 지도의 어떤 기술에도 남을 수 있어서 갈래·종류는 지도 카탈로그(R)에서, 태그는 샘플 13개에만 있다
    const tagsOf = (id) => (byId[id] ? byId[id].tags : []);
    const l = records.filter((r) => (!j || r.j === j) && (r.id + r.why + r.note + tagsOf(r.id).join(' ')).toLowerCase().includes(q.toLowerCase()));
    return l.map((r) => { const t = R(r.id); return `<li><div><span class="muted">${r.at}</span> · <b>${esc(r.id)}</b>
        <div class="row" style="margin:2px 0"><span class="tag strong">${r.label || JN[r.j]}</span><span class="tag">${esc(t.big || TR.radar.UNSORTED)}</span><span class="tag">${t.kind}</span>${byId[r.id] ? tagRow(byId[r.id]) : ''}</div>${esc(r.why) || '<span class="muted">이유 없음</span>'}
        <div class="row rating" role="group" aria-label="${r.id} 결과 만족도">${[1, 2, 3, 4, 5].map((n) => `<button class="star" data-act="rate" data-key="${r.key}" data-val="${n}" aria-pressed="${r.rating >= n}" aria-label="별 ${n}개">${r.rating >= n ? '★' : '☆'}</button>`).join('')}
          <input class="note-in" data-note="${r.key}" value="${esc(r.note)}" maxlength="60" placeholder="한 줄 코멘트(결과가 어땠나)" aria-label="${r.id} 코멘트"></div></div><a class="btn" href="#tech/${r.id}">상세</a></li>`; }).join('') || '<li><div class="muted">맞는 기록이 없어요.</div></li>';
  }

  // ---- 저장은 tr-judge.js(지도 사이드바와 같은 규칙: 적용 후보·보류를 고르면 같은 기술의 적용 기회 알림도 함께 완료)
  function save(id, j, why, alertId) {
    ui.holdFor = '';
    say(TR.judge.save(id, j, why || '', alertId));
    render();
    main.querySelector('h1')?.focus();
  }
  TR.judge.onChange = (id, msg, warnOnly, undo) => { say(msg, undo); if (!warnOnly) render(); };
  let toastT;
  function say(msg, undo) {
    const el = document.getElementById('toast');
    el.textContent = msg; clearTimeout(toastT);
    if (undo) { // 판단을 실수로 눌렀을 때(U16)
      const b = document.createElement('button'); b.type = 'button'; b.className = 'undo'; b.textContent = '되돌리기';
      b.addEventListener('click', () => { undo(); render(); el.textContent = '되돌렸어요.'; toastT = setTimeout(() => { el.textContent = ''; }, 2000); });
      el.append(b);
    }
    toastT = setTimeout(() => { el.textContent = ''; }, undo ? 6000 : 3500);
  }

  // ---- 길(해시)과 그리기
  const VIEWS = { new: newView, tech: techView, alerts: alertsView, alert: alertView, records: recordsView, ...TR.views };
  const STEP = { new: 'find', tech: 'know', alert: 'judge', alerts: 'judge', radar: 'keep', records: 'keep', project: 'keep', start: 'start' };
  const main = document.getElementById('main');
  function render() {
    const [name, arg = ''] = (location.hash.slice(1) || 'map').split('/');
    if (!Object.hasOwn(VIEWS, name)) { location.replace(mapUrl(name === 'map' ? decodeURIComponent(arg) : '')); return { key: 'map', id: '' }; }
    const key = name, id = decodeURIComponent(arg);
    main.innerHTML = VIEWS[key](id);
    document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    document.querySelectorAll('[data-step]').forEach((a) => (a.dataset.step === STEP[key] ? a.setAttribute('aria-current', 'step') : a.removeAttribute('aria-current')));
    document.getElementById('bNew').textContent = TR.radar.techs.filter((t) => t.nw && !stateOf(t)).length || '';
    document.getElementById('bWait').textContent = waiting().length || '';
    return { key, id };
  }
  function onRoute() {
    if (render().key !== 'map') main.querySelector('h1')?.focus();
  }

  document.addEventListener('click', (e) => {
    const jb = e.target.closest('[data-judge]');
    if (jb) return save(jb.dataset.id, jb.dataset.judge, '', jb.dataset.alert);
    const el = e.target.closest('[data-act]'), act = el?.dataset.act;
    if (act === 'hold') { const f = e.target.closest('.box').querySelector('form.hold'); f.hidden = false; f.querySelector('textarea').focus(); }
    if (act === 'holdCancel') { e.target.closest('form').hidden = true; ui.holdFor = ''; }
    if (act === 'rate') { const r = records.find((x) => x.key === el.dataset.key); r.rating = r.rating === Number(el.dataset.val) ? 0 : Number(el.dataset.val); document.getElementById('rlist').innerHTML = recordRows(document.getElementById('rq').value, document.getElementById('rj').value); document.querySelector(`[data-act="rate"][data-key="${r.key}"][data-val="${el.dataset.val}"]`)?.focus(); say(r.rating ? `만족도 별 ${r.rating}개로 남겼어요.` : '만족도를 지웠어요.'); }
    if (act === 'cmp') { ui.cmp = el.dataset.val; render(); main.querySelector(`[data-act="cmp"][data-val="${CSS.escape(ui.cmp)}"]`)?.focus(); }
    if (act === 'scenario') say('적용 시나리오는 누를 때만 만들어요(IA-8). 이 시안에서는 만들지 않아요.');
    if (act === 'stub') say('이 시안에서는 동작하지 않아요(IA-3·IA-22).');
  });
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.classList.contains('jform') || f.dataset.pform != null) return; // 세 단추의 보류 이유는 tr-judge.js, 내 프로젝트 화면은 journey-project.js가 받는다
    const why = f.querySelector('textarea').value.trim();
    if (why.length < 5) return say('보류 이유를 5자 이상 써 주세요.');
    save(f.dataset.id, 'hold', why, f.dataset.alert);
  });
  document.addEventListener('input', (e) => {
    if (e.target.dataset.note) { records.find((x) => x.key === e.target.dataset.note).note = e.target.value.slice(0, 60); return; }
    if (e.target.id === 'rq' || e.target.id === 'rj') document.getElementById('rlist').innerHTML = recordRows(document.getElementById('rq').value, document.getElementById('rj').value);
  });
  Object.assign(TR, { save, say, render });
  document.getElementById('logo').insertAdjacentHTML('afterbegin', icon('radar', 20));
  window.addEventListener('hashchange', onRoute);
  render();
})();
