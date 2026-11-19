// 화면 흐름 시안(무채색). 탐색 → 이해 → 판단 → 기억 → 조립을 눌러 본다. 데이터는 journey-data.js의 샘플이고 새로고침하면 처음으로 돌아간다.
(() => {
  const { icon, esc, FIELDS, TECH, byId, SAME, ALERTS, NEWS, JN, SEC, judged, records, stateOf, secIcon, path, tagRow, ui } = TR;
  const neighbors = (id) => SAME.filter((e) => e.includes(id)).map((e) => (e[0] === id ? e[1] : e[0]));
  const waiting = () => ALERTS.filter((a) => a.status === 'wait');
  const secText = {
    d: '보안 위험: 알려진 취약점이 있어요(OSV). 위험한 버전은 적용 후보로 고를 수 없어요.',
    w: '보안 주의: 오래 고쳐지지 않은 이슈가 있어요.',
    e: '수집 오류: 지난번 읽기에 실패했어요. "문제 없음"이 아니에요. 마지막으로 읽은 값을 그대로 둬요.',
  };
  const secLine = (t) => `<p class="muted">${t.sec ? icon(secIcon(t.sec), 15) + ' ' + secText[t.sec] : '보안: 알려진 문제를 찾지 못했어요(안전하다는 보증은 아니에요).'}</p>`;
  // 기술 지도는 radar.html(11-20 새 레이더). 이 흐름 시안의 #map·#map/<id>는 그쪽으로 보낸다
  const mapUrl = (id) => `radar.html${id ? `#sel=${encodeURIComponent(id)}` : ''}`;

  // ---- 판단 단추. 판단은 기록일 뿐 아무것도 설치·변경하지 않는다(불변 1, ADR 0010)
  function judgeBox(t, alert) {
    const holdForm = `<form class="hold" data-id="${t.id}" data-alert="${alert ? alert.id : ''}" hidden>
      <label for="why-${t.id}">보류 이유 (5자 이상)</label><textarea id="why-${t.id}" minlength="5" required></textarea>
      <div class="row"><button class="btn primary">보류로 저장</button><button type="button" class="btn" data-act="holdCancel">취소</button></div></form>`;
    if (alert) {
      if (alert.status === 'done') return `<p class="note">판단을 마쳤어요: <b>${alert.kind === '보안 경고' && alert.result === 'cand' ? '고친 버전으로 올리기' : JN[alert.result]}</b>. 완료는 판단을 마쳤다는 뜻이고, 설치하거나 바꾼 것은 없어요.</p>`;
      const sec = alert.kind === '보안 경고';
      const cand = sec ? (alert.fixed ? `고친 버전 ${alert.fixed}로 올리기` : '') : '써 볼 후보로';
      return `<div class="row">${cand ? `<button class="btn primary" data-judge="cand" data-id="${t.id}" data-alert="${alert.id}">${cand}</button>` : ''}<button class="btn" data-act="hold">보류</button></div>${holdForm}`;
    }
    if (t.mine) {
      const w = waiting().filter((a) => a.tech === t.id);
      return `<p class="muted">저장소에서 읽은 내 기술이라 <b>쓰는 중</b>이에요.</p>${w.map((a) => `<a class="btn primary" href="#alert/${a.id}">${icon('bell', 16)}${a.kind} 판단하기</a>`).join(' ')}`;
    }
    const s = judged[t.id], risky = t.sec === 'd';
    const b = (j, extra = '') => `<button class="btn" ${j === 'hold' ? 'data-act="hold"' : `data-judge="${j}" data-id="${t.id}"`} aria-pressed="${s === j}" ${extra}>${JN[j]}</button>`;
    return `<div class="row">${b('int')}${b('cand', risky ? 'disabled aria-describedby="risk-' + t.id + '"' : '')}${b('hold')}</div>
      ${risky ? `<p class="muted" id="risk-${t.id}">위험한 버전은 적용 후보가 될 수 없어요.</p>` : ''}${holdForm}`;
  }

  function compareTable(t, mine) {
    const rows = [['하는 일', (x) => x.desc], ['인기', (x) => x.pop], ['마지막 업데이트', (x) => x.upd], ['보안', (x) => ({ d: '위험', w: '주의', e: '수집 오류' })[x.sec] || '알려진 문제 없음']];
    return `<table><caption class="sr">${t.id}와 내 ${mine.id} 비교</caption><thead><tr><th></th><th>${t.id}</th><th>내 ${mine.id}</th></tr></thead><tbody>${rows.map(([k, f]) => `<tr><th scope="row">${k}</th><td>${f(t)}</td><td>${f(mine)}</td></tr>`).join('')}</tbody></table>`;
  }

  // ---- 화면들
  function startView(step) {
    if (step === 'repo') return `<h1 tabindex="-1">내 프로젝트 등록</h1><p class="muted">공개 GitHub 저장소 주소를 넣으면 쓰는 기술을 읽어 지도 가운데에 놓아요.</p>
      <form class="box" data-act="repo" style="max-width:560px;display:grid;gap:8px"><label for="repo">저장소 주소</label><input type="url" id="repo" value="https://github.com/sample/my-app" required>
      <div class="row"><button class="btn primary">등록하고 읽기</button><a class="btn" href="#start">나중에</a></div></form>`;
    if (step === 'read') return `<h1 tabindex="-1">저장소를 읽었어요</h1><div class="box" style="max-width:560px"><ul class="steps">
      <li>package.json: 기술 2개</li><li>.mcp.json: 기술 2개</li><li>.claude/skills/: 기술 1개</li></ul>
      <p><b>첫 점검:</b> 보안 위험 1 · 주의 1. 읽지 못한 파일이 있으면 "수집 오류"로 따로 보여요.</p>
      <a class="btn primary" href="radar.html#from=start">지도에서 내 기술 보기</a></div>`;
    // 지도는 로그인 없이 누구나 본다(사용자 11-20). 모은 기술만 보이고, 관심·판단·내 기술·알림은 로그인 뒤
    return `<h1 tabindex="-1">기술 지도</h1><p class="note row">로그인하지 않아도 그동안 모은 기술 지도를 볼 수 있어요. 묶기·거르기는 둘러보는 동안만 바뀌고 저장되지 않아요. 로그인하면 보기 설정 · 관심 · 판단이 내 계정에 남아요.
      <a class="btn primary" href="#start/repo">구글로 계속하기</a><a class="btn" href="#start/repo">내 프로젝트 등록하기</a><a class="btn" href="radar.html">로그인 없이 지도 보기</a></p>`;
  }

  function newView() {
    const nw = TECH.filter((t) => t.nw);
    return `<h1 tabindex="-1">새 기술</h1><p class="muted">이번 주에 알아서 모은 기술이에요. 판단은 필요할 때만 하면 돼요.</p>
      ${FIELDS.map((n, q) => [n, nw.filter((t) => t.f === q)]).filter(([, l]) => l.length).map(([n, l]) => `<h3>${n} ${l.length}</h3><ul class="list">${l.map((t) => `<li><div><b>${t.id}</b> <span class="tag new">NEW</span> ${stateOf(t) ? `<span class="tag strong">${JN[stateOf(t)]}</span>` : ''}<div class="muted">${path(t)}</div>${t.desc}<br><span class="muted">${t.pop}${t.sec ? ' · ' + SEC[t.sec] : ''}</span></div>
        <div class="row"><a class="btn" href="#map/${t.id}">지도에서 보기</a><button class="btn" data-judge="int" data-id="${t.id}" aria-pressed="${judged[t.id] === 'int'}">관심</button><a class="btn" href="#tech/${t.id}">상세</a></div></li>`).join('')}</ul>`).join('')}
      <h3>공식 소식 (알림이 아니에요)</h3><ul class="list">${NEWS.map(([a, b]) => `<li><div>${a}<br><span class="muted">${b}</span></div></li>`).join('')}</ul>`;
  }

  function techView(id) {
    const t = byId[id];
    if (!t) return `<h1 tabindex="-1">찾지 못했어요</h1><a href="#map">지도로</a>`;
    const nb = neighbors(id).map((n) => byId[n]), mine = nb.find((n) => n.mine), rec = records.filter((r) => r.id === id);
    return `<a class="btn" href="#map/${id}">${icon('back', 16)}지도로</a>
      <div class="cols" style="margin-top:12px"><div class="box">
        <h1 tabindex="-1">${t.id}</h1><div class="muted">${path(t)}</div><div class="row" style="margin:6px 0 8px">${t.nw ? '<span class="tag new" title="이번 주에 들어온 기술">NEW</span>' : ''}${tagRow(t)}</div>
        <p>${t.desc}</p><dl class="kv"><dt>인기</dt><dd>${t.pop}</dd><dt>마지막 업데이트</dt><dd>${t.upd}</dd><dt>비교군</dt><dd>${nb.map((n) => `<a href="#tech/${n.id}">${n.id}</a>`).join(', ') || '없음'}</dd></dl>
        ${mine && !t.mine ? `<h3>내 ${mine.id}와 비교</h3>${compareTable(t, mine)}` : ''}
        <h3>보안 (곁들임)</h3>${secLine(t)}
        <h3>적용 시나리오</h3><p class="muted">내 프로젝트에 넣는 방법을 Claude가 써 줘요. 누를 때만 만들어요(참고 자료).</p><button class="btn" data-act="scenario">적용 시나리오 만들기</button>
      </div><div class="box"><h2>내 판단</h2>${judgeBox(t)}
        <h3>이 기술의 판단 기록</h3>${rec.length ? `<ul class="near">${rec.map((r) => `<li>${r.at} · <b>${r.label || JN[r.j]}</b> ${esc(r.why)}</li>`).join('')}</ul>` : '<p class="muted">아직 없어요.</p>'}</div></div>`;
  }

  function alertsView() {
    return `<h1 tabindex="-1">알림</h1><p class="muted">내 기술에 생긴 일 가운데 내 판단이 필요한 것만 와요.</p>
      <ul class="list">${ALERTS.map((a) => `<li><div><b>${a.tech}</b><div class="row" style="margin:2px 0"><span class="tag strong">${a.kind}</span><span class="tag">${FIELDS[byId[a.tech].f]}</span><span class="tag">${byId[a.tech].kind}</span>${tagRow(byId[a.tech])}</div>${a.what}<br><span class="muted">${a.at}</span></div>
        <div class="row"><span class="tag${a.status === 'wait' ? ' strong' : ''}">${a.status === 'wait' ? '판단 대기' : '완료 · ' + (a.kind === '보안 경고' && a.result === 'cand' ? '고친 버전으로' : JN[a.result])}</span><a class="btn" href="#alert/${a.id}">${a.status === 'wait' ? '판단하기' : '보기'}</a></div></li>`).join('')}</ul>`;
  }

  function alertView(id) {
    const a = ALERTS.find((x) => x.id === id);
    if (!a) return `<h1 tabindex="-1">찾지 못했어요</h1><a href="#alerts">알림으로</a>`;
    const t = byId[a.tech], sec = a.kind === '보안 경고', mine = neighbors(t.id).map((n) => byId[n]).find((n) => n.mine);
    const past = records.filter((r, i) => byId[r.id].f === t.f && r.id !== t.id && records.findIndex((x) => x.id === r.id) === i); // 기술마다 최신 판단 하나
    return `<a class="btn" href="#alerts">${icon('back', 16)}알림 목록</a>
      <div class="cols" style="margin-top:12px"><div class="box"><span class="tag">${a.kind}</span><h1 tabindex="-1">${t.id}</h1>
        <dl class="kv"><dt>무엇이 바뀌었나</dt><dd>${a.what}</dd><dt>언제</dt><dd>${a.at}</dd>${sec ? `<dt>고친 버전</dt><dd>${a.fixed}</dd>` : ''}</dl>
        ${sec ? `<h3>대응안 초안 (Claude, 참고)</h3><p>고친 버전 ${a.fixed}로 올리기를 권해요. 출처: OSV, GitHub Advisory.</p>` : mine ? `<h3>내 ${mine.id}와 비교</h3>${compareTable(t, mine)}` : ''}
        <h3>비슷한 과거 판단</h3>${past.length ? past.map((r) => `<p>${r.at} · ${r.id} · <b>${r.label || JN[r.j]}</b> ${esc(r.why)}</p>`).join('') : '<p class="muted">없어요.</p>'}
        <div class="row" style="margin-top:8px"><a class="btn" href="#map/${t.id}">지도에서 보기</a><a class="btn" href="#tech/${t.id}">기술 상세</a><button class="btn" data-act="scenario">적용 시나리오 만들기</button></div>
      </div><div class="box"><h2>판단</h2><p class="muted">판단하기 전에는 아무것도 바뀌지 않아요.</p>${judgeBox(t, a)}</div></div>`;
  }

  function recordsView() {
    return `<h1 tabindex="-1">기록</h1><p class="muted">지난 판단과 이유예요. 비슷한 기술이 나오면 여기서 다시 찾아요.</p>
      <div class="tools"><label class="search">${icon('search')}<input id="rq" placeholder="기술 이름 · 이유 · 코멘트 · 태그로 찾기" aria-label="기록 찾기"></label>
        <select id="rj" aria-label="판단으로 거르기"><option value="">모든 판단</option>${['cand', 'int', 'hold'].map((j) => `<option value="${j}">${JN[j]}</option>`).join('')}</select></div>
      <ul class="list" id="rlist">${recordRows()}</ul>`;
  }
  function recordRows(q = '', j = '') {
    const l = records.filter((r) => (!j || r.j === j) && (r.id + r.why + r.note + byId[r.id].tags.join(' ')).toLowerCase().includes(q.toLowerCase()));
    return l.map((r) => { const t = byId[r.id]; return `<li><div><span class="muted">${r.at}</span> · <b>${r.id}</b>
        <div class="row" style="margin:2px 0"><span class="tag strong">${r.label || JN[r.j]}</span><span class="tag">${FIELDS[t.f]}</span><span class="tag">${t.kind}</span>${tagRow(t)}</div>${esc(r.why) || '<span class="muted">이유 없음</span>'}
        <div class="row rating" role="group" aria-label="${r.id} 결과 만족도">${[1, 2, 3, 4, 5].map((n) => `<button class="star" data-act="rate" data-key="${r.key}" data-val="${n}" aria-pressed="${r.rating >= n}" aria-label="별 ${n}개">${r.rating >= n ? '★' : '☆'}</button>`).join('')}
          <input class="note-in" data-note="${r.key}" value="${esc(r.note)}" maxlength="60" placeholder="한 줄 코멘트(결과가 어땠나)" aria-label="${r.id} 코멘트"></div></div><a class="btn" href="#tech/${r.id}">상세</a></li>`; }).join('') || '<li><div class="muted">맞는 기록이 없어요.</div></li>';
  }

  // ---- 저장(샘플: 메모리에만). 적용 후보·보류를 지도에서 골라도 같은 기술의 적용 기회 알림이 함께 완료된다
  function save(id, j, why, alertId) {
    const t = byId[id], alert = ALERTS.find((a) => a.id === alertId);
    if (j === 'cand' && t.sec === 'd' && !alert) return say('위험한 버전은 적용 후보로 고를 수 없어요.');
    if (!t.mine) judged[id] = j;
    const done = alert ? [alert] : j === 'int' ? [] : waiting().filter((a) => a.tech === id && a.kind === '적용 기회');
    done.forEach((a) => { a.status = 'done'; a.result = j; });
    const label = alert && alert.kind === '보안 경고' && j === 'cand' ? `고친 버전 ${alert.fixed}로 올리기` : '';
    records.unshift({ key: `r${Date.now()}`, id, j, why: why || '', at: '방금', label, rating: 0, note: '' });
    ui.holdFor = '';
    say(`판단을 저장했어요: ${label || JN[j]}. 설치하거나 바꾼 것은 없어요.${done.length && !alert ? ` 알림 ${done.length}건도 판단을 마쳤어요.` : ''}`);
    render();
    (document.getElementById('pTitle') || main.querySelector('h1'))?.focus();
  }
  let toastT;
  function say(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => { el.textContent = ''; }, 3500);
  }

  // ---- 길(해시)과 그리기
  const VIEWS = { start: startView, new: newView, tech: techView, alerts: alertsView, alert: alertView, records: recordsView, ...TR.views };
  const STEP = { new: 'find', tech: 'know', alert: 'judge', alerts: 'judge', radar: 'keep', records: 'keep', start: 'start' };
  const main = document.getElementById('main');
  function render() {
    const [name, arg = ''] = (location.hash.slice(1) || 'map').split('/');
    if (!Object.hasOwn(VIEWS, name)) { location.replace(mapUrl(name === 'map' ? decodeURIComponent(arg) : '')); return { key: 'map', id: '' }; }
    const key = name, id = decodeURIComponent(arg);
    main.innerHTML = VIEWS[key](id);
    document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    document.querySelectorAll('[data-step]').forEach((a) => (a.dataset.step === STEP[key] ? a.setAttribute('aria-current', 'step') : a.removeAttribute('aria-current')));
    document.getElementById('bNew').textContent = TECH.filter((t) => t.nw && !stateOf(t)).length || '';
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
    if (act === 'scenario') say('적용 시나리오는 누를 때만 만들어요(IA-8). 이 시안에서는 만들지 않아요.');
    if (act === 'stub') say('이 시안에서는 동작하지 않아요(IA-3·IA-22).');
  });
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.dataset.act === 'repo') { location.hash = '#start/read'; return; }
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
