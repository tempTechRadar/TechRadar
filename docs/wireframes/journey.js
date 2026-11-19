// 화면 흐름 시안(무채색). 탐색 → 이해 → 판단 → 기억 → 조립을 눌러 본다. 데이터는 journey-data.js의 샘플이고 새로고침하면 처음으로 돌아간다.
(() => {
  const { I, icon, esc, FIELDS, TAGS, TECH, byId, SAME, ALERTS, NEWS, JN, SEC, judged, records, stateOf, secIcon, dotSvg, dotIcon, path, tagRow, ui } = TR;
  const neighbors = (id) => SAME.filter((e) => e.includes(id)).map((e) => (e[0] === id ? e[1] : e[0]));
  const waiting = () => ALERTS.filter((a) => a.status === 'wait');
  const secText = {
    d: '보안 위험: 알려진 취약점이 있어요(OSV). 위험한 버전은 적용 후보로 고를 수 없어요.',
    w: '보안 주의: 오래 고쳐지지 않은 이슈가 있어요.',
    e: '수집 오류: 지난번 읽기에 실패했어요. "문제 없음"이 아니에요. 마지막으로 읽은 값을 그대로 둬요.',
  };
  const secLine = (t) => `<p class="muted">${t.sec ? icon(secIcon(t.sec), 15) + ' ' + secText[t.sec] : '보안: 알려진 문제를 찾지 못했어요(안전하다는 보증은 아니에요).'}</p>`;
  const secSvg = (s, x, y) => `<g transform="translate(${x} ${y})"><rect x="-1" y="-1" width="16" height="16" rx="4" fill="var(--bg)"/><g class="sec" transform="scale(.58)">${I[secIcon(s)]}</g></g>`;
  const legend = () => `<div class="legend">${['use', 'cand', 'int', 'hold', ''].map((j) => `<span>${dotIcon(j)}${JN[j] || '아직 안 봄'}</span>`).join('')}
    <span><svg width="18" height="18"><circle cx="9" cy="9" r="8" class="nw"/></svg>NEW = 이번 주에 들어온 기술</span>
    <span>${icon('danger', 15)}${icon('caution', 15)}${icon('error', 15)}보안 위험·주의·수집 오류</span></div>`;

  // ---- 묶어 보기: 태그·종류·쓰는 곳 중 하나를 고르면 그 무리를 둥근 테두리로 감싼다. 분야(자리)는 그대로라 분야마다 따로 감싼다
  const GROUP_BY = { tag: ['태그', (t) => t.tags], kind: ['종류', (t) => [t.kind]], host: ['쓰는 곳', (t) => [t.host]] };
  const groupValues = (by) => (by === 'tag' ? TAGS : [...new Set(TECH.map((t) => GROUP_BY[by][1](t)[0]))]).map((v) => [v, TECH.filter((t) => GROUP_BY[by][1](t).includes(v)).length]).filter(([, n]) => n);
  const inGroup = (t) => !ui.group.by || GROUP_BY[ui.group.by][1](t).includes(ui.group.val);
  function hull(p) { // 볼록 껍질(단조 사슬). 점이 1~2개면 그대로 돌려준다
    if (p.length < 3) return p;
    const s = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (l) => l.reduce((h, q) => { while (h.length > 1 && cr(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); return h; }, []);
    const lo = half(s), up = half(s.reverse());
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function hullsSvg(pos) {
    if (!ui.group.by) return '';
    return FIELDS.map((_, q) => TECH.filter((t) => t.f === q && inGroup(t)).map(pos)).filter((p) => p.length).map((p) => {
      const h = hull(p), top = p.reduce((a, b) => (b[1] < a[1] ? b : a));
      const shape = h.length === 1 ? `<circle cx="${h[0][0]}" cy="${h[0][1]}" r="26" class="hull"/>` : `<path d="M${h.map((q) => q.join(' ')).join('L')}Z" class="hull" stroke-width="52" stroke-linejoin="round"/>`;
      return `${shape}<text x="${top[0]}" y="${top[1] - 32}" text-anchor="middle" class="hl">${ui.group.by === 'tag' ? '#' : ''}${ui.group.val} ${p.length}</text>`;
    }).join('');
  }

  // ---- 지도: 분야를 땅처럼, 가운데 "나", 점 = 판단, 고르면 그 기술의 같은 역할만 진하게(나머지는 흐리게)
  function mapSvg(sel, fresh) {
    const W = 720, H = 440, cx = 340, cy = 220, kx = 1.4, ky = 1.5;
    const near = sel ? new Set([sel, ...neighbors(sel)]) : null;
    const pos = (t) => [cx + t.x * kx, cy + t.y * ky];
    let g = `<svg viewBox="0 0 ${W} ${H}" class="map" role="group" aria-label="기술 지도(샘플). 점에 올리면 한 줄 설명, 누르면 오른쪽에 자세한 설명이 열려요">`;
    const Z = [[cx, 0, W - cx, cy], [cx, cy, W - cx, H - cy], [0, cy, cx, H - cy], [0, 0, cx, cy]];
    const L = [[W - 14, 24, 'end'], [W - 14, H - 12, 'end'], [14, H - 12, 'start'], [14, 24, 'start']];
    Z.forEach(([x, y, w, h], q) => {
      const n = TECH.filter((t) => t.f === q);
      g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="z${q % 2}"/><text x="${L[q][0]}" y="${L[q][1]}" text-anchor="${L[q][2]}" class="zl">${FIELDS[q]} <tspan>${n.length}개 · NEW ${n.filter((t) => t.nw).length}</tspan></text>`;
    });
    for (let r = 70; r < 400; r += 70) g += `<circle cx="${cx}" cy="${cy}" r="${r}" class="ring"/>`;
    if (!fresh) g += hullsSvg(pos);
    SAME.forEach(([a, b]) => {
      const on = near && (a === sel || b === sel), [x1, y1] = pos(byId[a]), [x2, y2] = pos(byId[b]);
      g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="edge${on ? ' on' : ''}${(near && !on) || ui.group.by ? ' dim' : ''}"/>`;
      if (on) g += `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle" class="el">비교군</text>`;
    });
    if (!fresh) g += `<g transform="translate(${cx - 10} ${cy - 10})" color="var(--muted)">${icon('radar', 20)}</g><text x="${cx}" y="${cy + 26}" text-anchor="middle" class="lbl soft">나</text>`;
    TECH.forEach((t) => {
      const [x, y] = pos(t), s = fresh ? '' : stateOf(t), dim = (near && !near.has(t.id)) || (ui.onlyNew && !t.nw) || (!fresh && !inGroup(t));
      const say = [t.id, path(t), JN[s] || '아직 안 봄', t.nw && '이번 주 들어온 새 기술', SEC[t.sec], t.desc].filter(Boolean).join(', ');
      g += `<g class="dot${dim ? ' dim' : ''}" data-id="${t.id}" ${fresh ? '' : `tabindex="0" role="button" aria-pressed="${t.id === sel}"`} aria-label="${say}"><circle cx="${x}" cy="${y}" r="18" class="hit"/>`;
      if (t.nw) g += `<circle cx="${x}" cy="${y}" r="11" class="nw"/>`;
      g += dotSvg(s, x, y);
      if (t.sec) g += secSvg(t.sec, x + 4, y - 20);
      if (t.id === sel) g += `<circle cx="${x}" cy="${y}" r="16" class="sel"/>`;
      g += `<text x="${x + 14}" y="${y + 4}" class="lbl${s || t.nw ? '' : ' soft'}">${t.id}${t.nw ? '<tspan class="new"> NEW</tspan>' : ''}</text></g>`;
    });
    return g + '</svg>';
  }

  // ---- 올리면 한 줄 설명(누르지 않아도 무엇인지 안다). 키보드 초점에도 같이 뜬다
  function showTip(dot) {
    const tip = document.getElementById('tip'), stage = document.getElementById('stage'), t = byId[dot.dataset.id];
    if (!tip || !stage || !t) return;
    tip.innerHTML = `<b>${t.id}</b>${t.nw ? ' <span class="tag new">NEW</span>' : ''}<div class="muted">${path(t)}</div><div>${t.desc}</div><div class="row">${tagRow(t)}</div>`;
    tip.hidden = false;
    const r = dot.getBoundingClientRect(), s = stage.getBoundingClientRect(), room = s.width - (stage.classList.contains('open') ? 400 : 0);
    const left = r.right - s.left + 8 + tip.offsetWidth > room ? r.left - s.left - tip.offsetWidth - 8 : r.right - s.left + 8;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.min(s.height - tip.offsetHeight - 8, Math.max(8, r.top - s.top - 8))}px`;
  }
  const hideTip = () => { const tip = document.getElementById('tip'); if (tip) tip.hidden = true; };

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

  // ---- 사이드바(이해). 지도를 떠나지 않고 연다. 태그를 누르면 그 태그로 묶어 보기
  function panel(t) {
    const s = stateOf(t), nb = neighbors(t.id).map((id) => byId[id]), mine = nb.find((n) => n.mine);
    return `<a class="btn close" href="#map" aria-label="닫기">${icon('close', 16)}</a>
      <h2 id="pTitle" tabindex="-1">${t.id}</h2>
      <div class="muted">${path(t)}</div>
      <div class="row" style="margin:6px 0 8px">${t.nw ? '<span class="tag new" title="이번 주에 들어온 기술">NEW</span>' : ''}${s ? `<span class="tag strong">${JN[s]}</span>` : ''}${tagRow(t, true)}</div>
      <p>${t.desc}</p><p class="muted">${icon('trend', 15)} ${t.pop} · 업데이트 ${t.upd}</p>${secLine(t)}
      <h3>비교군 ${nb.length}</h3><ul class="near">${nb.map((n) => `<li>${dotIcon(stateOf(n))}<a href="#map/${n.id}">${n.id}</a><span class="muted">${JN[stateOf(n)] || ''}</span></li>`).join('')}</ul>
      ${mine && !t.mine ? `<p style="margin-top:8px"><a class="btn" href="#tech/${t.id}">${icon('compare', 16)}내 ${mine.id}와 비교</a></p>` : ''}
      <h3>내 판단</h3>${judgeBox(t)}
      <p style="margin-top:14px"><a class="btn primary" href="#tech/${t.id}">전체 상세 보기${icon('chevron', 16)}</a></p>`;
  }

  // ---- 화면들
  // 지도 위에 뜨는 요약 칩(= 대시보드 숫자 바로가기). 판단하면 숫자가 바뀌어 따로 다시 그린다
  function chips() {
    const nw = TECH.filter((t) => t.nw), mine = TECH.filter((t) => t.mine);
    const band = ui.firstCheck ? `<span class="chip">첫 점검: 내 기술 ${mine.length}개 · 위험 1 · 주의 1 <a href="#alerts">알림에서 보기</a><button class="btn" data-act="band">확인</button></span>` : '';
    return `${band}<a class="chip" href="#new" aria-label="이번 주 새 기술 ${nw.length}, 아직 판단 안 한 것 ${nw.filter((t) => !stateOf(t)).length}"><span class="tag new">NEW</span><b>${nw.length}</b></a>
      <a class="chip" href="#alerts">${icon('bell', 16)}판단 기다림 <b>${waiting().length}</b></a><a class="chip" href="#radar">${icon('radar', 16)}내 레이더 <b>${mine.length}</b></a>`;
  }
  const groupSelect = () => `<select id="gBy" aria-label="묶어 보기"><option value="">묶어 보기: 없음</option>${Object.entries(GROUP_BY).map(([k, [n]]) => `<option value="${k}" ${k === ui.group.by ? 'selected' : ''}>묶어 보기: ${n}</option>`).join('')}</select>`;
  const groupBar = () => (ui.group.by ? groupValues(ui.group.by).map(([v, n]) => `<button class="tag" data-act="groupVal" data-val="${v}" aria-pressed="${v === ui.group.val}">${ui.group.by === 'tag' ? '#' : ''}${v} ${n}</button>`).join('') : '');

  function mapView(id) {
    const t = byId[id];
    return `<h1 class="sr" tabindex="-1">기술 지도</h1><div class="stage${t ? ' open' : ''}${ui.group.by ? ' grouped' : ''}" id="stage">
      <div class="map-full" id="mapHost">${mapSvg(t ? id : '')}</div>
      <div class="hud"><label class="search">${icon('search')}<input id="q" list="names" placeholder="기술 찾기" aria-label="기술 찾기"></label><datalist id="names">${TECH.map((x) => `<option value="${x.id}">`).join('')}</datalist>
        <button class="btn" data-act="onlyNew" aria-pressed="${ui.onlyNew}"><span class="tag new">NEW</span>만 보기</button>${groupSelect()}<span class="muted" title="로그인 전에는 저장하지 않아요">보기는 내 계정에 저장돼요</span><span class="row" id="chips">${chips()}</span></div>
      <div class="gbar" id="gbar" role="group" aria-label="묶음 고르기">${groupBar()}</div>
      <div class="dock"><details class="float-box"><summary>범례</summary>${legend()}</details></div>
      <div class="tip" id="tip" role="tooltip" hidden></div>
      <aside class="side" id="side" aria-label="고른 기술">${t ? panel(t) : ''}</aside></div>`;
  }

  function startView(step) {
    if (step === 'repo') return `<h1 tabindex="-1">내 프로젝트 등록</h1><p class="muted">공개 GitHub 저장소 주소를 넣으면 쓰는 기술을 읽어 지도 가운데에 놓아요.</p>
      <form class="box" data-act="repo" style="max-width:560px;display:grid;gap:8px"><label for="repo">저장소 주소</label><input type="url" id="repo" value="https://github.com/sample/my-app" required>
      <div class="row"><button class="btn primary">등록하고 읽기</button><a class="btn" href="#start">나중에</a></div></form>`;
    if (step === 'read') return `<h1 tabindex="-1">저장소를 읽었어요</h1><div class="box" style="max-width:560px"><ul class="steps">
      <li>package.json: 기술 2개</li><li>.mcp.json: 기술 2개</li><li>.claude/skills/: 기술 1개</li></ul>
      <p><b>첫 점검:</b> 보안 위험 1 · 주의 1. 읽지 못한 파일이 있으면 "수집 오류"로 따로 보여요.</p>
      <a class="btn primary" href="#map" data-act="toMap">지도에서 내 기술 보기</a></div>`;
    // 지도는 로그인 없이 누구나 본다(사용자 11-20). 모은 기술만 보이고, 관심·판단·내 기술·알림은 로그인 뒤
    return `<h1 tabindex="-1">기술 지도</h1><p class="note row">로그인하지 않아도 그동안 모은 기술 지도를 볼 수 있어요. 묶기·거르기는 둘러보는 동안만 바뀌고 저장되지 않아요. 로그인하면 보기 설정 · 관심 · 판단이 내 계정에 남아요.
      <a class="btn primary" href="#start/repo">구글로 계속하기</a><a class="btn" href="#start/repo">내 프로젝트 등록하기</a></p>
      <div class="map-box" style="margin-top:10px">${mapSvg('', true)}</div>`;
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
  const VIEWS = { map: mapView, start: startView, new: newView, tech: techView, alerts: alertsView, alert: alertView, records: recordsView, ...TR.views };
  const STEP = { map: 'find', new: 'find', tech: 'know', alert: 'judge', alerts: 'judge', radar: 'keep', records: 'keep', start: 'start' };
  const main = document.getElementById('main');
  function render() {
    const [name, arg = ''] = (location.hash.slice(1) || 'map').split('/');
    const key = Object.hasOwn(VIEWS, name) ? name : 'map', id = decodeURIComponent(arg);
    const stage = document.getElementById('stage');
    if (key === 'map' && stage) { // 지도에 머물면 틀은 그대로 두고 바뀐 곳만 고친다(그래야 사이드바가 밀려나오고 찾기 칸 글자가 남는다)
      const t = byId[id], side = document.getElementById('side');
      document.getElementById('mapHost').innerHTML = mapSvg(t ? id : '');
      document.getElementById('chips').innerHTML = chips();
      document.getElementById('gbar').innerHTML = groupBar();
      stage.classList.toggle('grouped', !!ui.group.by);
      if (t) side.innerHTML = panel(t); // 닫을 때는 내용을 둔 채 밀려 들어간다
      stage.classList.toggle('open', !!t);
      hideTip();
    } else main.innerHTML = VIEWS[key](id);
    document.body.classList.toggle('full', key === 'map');
    document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    const step = key === 'map' && byId[id] ? 'know' : STEP[key];
    document.querySelectorAll('[data-step]').forEach((a) => (a.dataset.step === step ? a.setAttribute('aria-current', 'step') : a.removeAttribute('aria-current')));
    document.getElementById('bNew').textContent = TECH.filter((t) => t.nw && !stateOf(t)).length || '';
    document.getElementById('bWait').textContent = waiting().length || '';
    return { key, id };
  }
  function onRoute() {
    const prev = ui.prev, { key, id } = render();
    ui.prev = location.hash;
    // 사이드바만 바뀌면 사이드바 제목으로, 닫히면 그 점으로, 화면이 바뀌면 그 화면 제목으로 초점을 옮긴다
    const was = prev.match(/^#map\/(.+)/);
    if (key === 'map' && id) document.getElementById('pTitle')?.focus();
    else if (key === 'map' && was) main.querySelector(`.dot[data-id="${was[1]}"]`)?.focus();
    else main.querySelector('h1')?.focus();
  }
  function setGroup(by, val) {
    ui.group = { by, val: by ? val ?? groupValues(by)[0][0] : '' };
    const sel = document.getElementById('gBy');
    if (sel) sel.value = by; // 고르는 칸은 다시 그리지 않으므로(초점 유지) 사이드바 태그로 바뀔 때 값만 맞춘다
    if (!location.hash.startsWith('#map')) location.hash = '#map'; else render();
  }

  document.addEventListener('click', (e) => {
    const dot = e.target.closest('.dot[tabindex]');
    if (dot) return void (location.hash = `#map/${dot.dataset.id}`);
    const jb = e.target.closest('[data-judge]');
    if (jb) return save(jb.dataset.id, jb.dataset.judge, '', jb.dataset.alert);
    const el = e.target.closest('[data-act]'), act = el?.dataset.act;
    if (act === 'hold') { const f = e.target.closest('.box, .side').querySelector('form.hold'); f.hidden = false; f.querySelector('textarea').focus(); }
    if (act === 'holdCancel') { e.target.closest('form').hidden = true; ui.holdFor = ''; }
    if (act === 'onlyNew') { ui.onlyNew = !ui.onlyNew; render(); document.querySelector('[data-act="onlyNew"]').setAttribute('aria-pressed', ui.onlyNew); }
    if (act === 'groupVal') { setGroup(ui.group.by, el.dataset.val); document.querySelector(`[data-act="groupVal"][data-val="${el.dataset.val}"]`)?.focus(); }
    if (act === 'groupTag') setGroup('tag', el.dataset.val);
    if (act === 'band') { ui.firstCheck = false; render(); }
    if (act === 'rate') { const r = records.find((x) => x.key === el.dataset.key); r.rating = r.rating === Number(el.dataset.val) ? 0 : Number(el.dataset.val); document.getElementById('rlist').innerHTML = recordRows(document.getElementById('rq').value, document.getElementById('rj').value); document.querySelector(`[data-act="rate"][data-key="${r.key}"][data-val="${el.dataset.val}"]`)?.focus(); say(r.rating ? `만족도 별 ${r.rating}개로 남겼어요.` : '만족도를 지웠어요.'); }
    if (act === 'toMap') ui.firstCheck = true;
    if (act === 'scenario') say('적용 시나리오는 누를 때만 만들어요(IA-8). 이 시안에서는 만들지 않아요.');
    if (act === 'stub') say('이 시안에서는 동작하지 않아요(IA-3·IA-22).');
  });
  document.addEventListener('keydown', (e) => {
    const dot = e.target.closest?.('.dot[tabindex]');
    if (dot && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); location.hash = `#map/${dot.dataset.id}`; }
    if (e.key === 'Escape') { hideTip(); if (/^#map\/./.test(location.hash)) location.hash = '#map'; }
  });
  document.addEventListener('mouseover', (e) => { const d = e.target.closest?.('.dot'); if (d) showTip(d); });
  document.addEventListener('mouseout', (e) => { if (e.target.closest?.('.dot') && !e.relatedTarget?.closest?.('.dot')) hideTip(); });
  document.addEventListener('focusin', (e) => (e.target.closest?.('.dot') ? showTip(e.target.closest('.dot')) : hideTip()));
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
  document.addEventListener('change', (e) => {
    if (e.target.id === 'q' && byId[e.target.value]) location.hash = `#map/${e.target.value}`;
    if (e.target.id === 'gBy') setGroup(e.target.value);
  });
  Object.assign(TR, { save, say, render });
  document.getElementById('logo').insertAdjacentHTML('afterbegin', icon('radar', 20));
  window.addEventListener('hashchange', onRoute);
  ui.prev = location.hash;
  render();
})();
