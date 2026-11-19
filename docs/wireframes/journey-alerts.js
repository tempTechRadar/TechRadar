// 알림 시안: 목록(IA-6) · 상세와 판단(IA-7) · 적용 시나리오(IA-8). 메인 여정 "알림 받는 하루"(UJ-2~UJ-9).
// 틀은 기술 상세와 같은 머리 + 2단: 위 머리(무엇이 · 언제 · 상태)와 판단 줄 / 왼쪽 = 무엇이 바뀌었나 → 이유 → 대응안 초안 또는 비교표 → 적용 시나리오 /
// 오른쪽 = 관련된 내 기술 · 비슷한 과거 판단 · 이 알림의 기록. 판단 전에는 아무것도 바뀌지 않는다(불변 1), 저장 실패면 판단 대기 그대로(불변 4).
// ?state=savefail → 판단 저장 실패, ?state=aifail → 적용 시나리오 만들기 실패를 볼 수 있다.
(() => {
  const { icon, esc, ALERTS, JN, records, ui } = TR;
  const R = (id) => TR.radar.byId[id];
  const AIFAIL = new URLSearchParams(location.search).get('state') === 'aifail';
  // 알림마다 더 자세한 값(샘플). 앱에서는 사건(변경)·출처·대응안 초안 표에서 온다
  const MORE = {
    a1: { field: '보안 등급', before: '주의', after: '위험', range: '1.2.0 이상 1.4.2 미만', my: '1.4.0 · my-app · .mcp.json',
      why: '저장소를 읽을 때 쓰는 토큰을 다른 서버로 보낼 수 있는 취약점이 알려졌어요. 1.4.2에서 고쳐졌어요.',
      src: [['OSV · GHSA-sample-1234', 'https://osv.dev/list?q=sample-mcp-1'], ['GitHub Advisory', 'https://github.com/advisories?query=sample-mcp-1']],
      draft: ['.mcp.json에서 sample-mcp-1 버전을 1.4.2로 바꾸고 Claude Code를 다시 시작하세요.', '바꾸기 전에 GITHUB_TOKEN 권한을 읽기 전용으로 줄이면 그동안의 위험이 줄어요.', '1.4.2에서 바뀐 설정은 없다고 릴리스 노트에 적혀 있어요.'] },
    a2: { field: '비교군', before: '—', after: 'sample-mcp-3 새로 들어옴', mine: 'sample-mcp-1', why: '내가 쓰는 sample-mcp-1과 같은 역할(관리자 확인)의 기술이 이번 주에 들어왔어요.' },
    a3: { field: '비교군', before: '—', after: 'sample-pkg-2', mine: 'sample-mcp-2', why: '내가 쓰는 sample-mcp-2와 같은 역할의 기술이에요.' },
  };
  const kindTag = (a) => `<span class="tag strong">${a.kind === '보안 경고' ? icon('danger', 12) + ' ' : ''}${a.kind}</span>`;
  const resultText = (a) => (a.kind === '보안 경고' && a.result === 'cand' ? `고친 버전 ${a.fixed}로 올리기` : JN[a.result]);
  const titleOf = (a) => (a.kind === '보안 경고' ? `${a.tech} 보안 등급 ${MORE[a.id].before} → ${MORE[a.id].after}` : `${a.tech}: 내 ${MORE[a.id].mine}의 비교군`);

  // ---- 알림 목록 (IA-6): 종류·상태로 보기, 행마다 태그(design.md 14절 ④)
  function alertsView() {
    const st = ui.aState || 'wait', kind = ui.aKind || '';
    const list = ALERTS.filter((a) => (st === 'all' || a.status === st) && (!kind || a.kind === kind));
    const n = (s) => ALERTS.filter((a) => a.status === s).length;
    const chip = (key, val, label) => `<button class="tag${(key === 'aState' ? st : kind) === val ? ' strong' : ''}" data-aa="${key}" data-val="${val}" aria-pressed="${(key === 'aState' ? st : kind) === val}">${label}</button>`;
    return `<h1 tabindex="-1">알림</h1><p class="muted">내 기술에 생긴 일 가운데 <b>내 판단이 필요한 것만</b> 와요. 같은 변경을 다시 읽어도 알림은 하나예요.</p>
      <div class="row tools" role="group" aria-label="알림 보기">${chip('aState', 'wait', `판단 대기 ${n('wait')}`)}${chip('aState', 'done', `완료 ${n('done')}`)}${chip('aState', 'all', '전체')}<span class="muted">·</span>${chip('aKind', '', '모든 종류')}${chip('aKind', '보안 경고', '보안 경고')}${chip('aKind', '적용 기회', '적용 기회')}</div>
      <ul class="list">${list.map((a) => { const t = R(a.tech); return `<li><div><b>${esc(titleOf(a))}</b>
        <div class="row" style="margin:2px 0">${kindTag(a)}<span class="tag">${esc(t.big || TR.radar.UNSORTED)}</span><span class="tag">${t.kind}</span>${TR.byId[a.tech] ? TR.tagRow(TR.byId[a.tech]) : ''}</div><span class="muted">${a.at}</span></div>
        <div class="row"><span class="tag${a.status === 'wait' ? ' strong' : ''}">${a.status === 'wait' ? '판단 대기' : '완료 · ' + resultText(a)}</span><a class="btn" href="#alert/${a.id}">${a.status === 'wait' ? '판단하기' : '보기'}</a></div></li>`; }).join('')
        || `<li><div class="muted">${st === 'wait' ? '판단할 알림이 없어요. 새 일이 생기면 여기에 와요.' : '맞는 알림이 없어요.'}</div></li>`}</ul>`;
  }

  // ---- 알림 상세 (IA-7)
  function judgeBar(a, t) {
    if (a.status === 'done') return `<p class="note">판단을 마쳤어요: <b>${resultText(a)}</b>. 완료는 판단을 마쳤다는 뜻이고, 설치하거나 바꾼 것은 없어요. <button class="btn sm" data-aa="reopen" data-val="${a.id}">다시 판단하기</button></p>`;
    const sec = a.kind === '보안 경고', cand = sec ? (a.fixed ? `고친 버전 ${a.fixed}로 올리기` : '') : '써 볼 후보로';
    return `<div class="box judgebox"><div class="row">${cand ? `<button class="btn primary" data-judge="cand" data-id="${t.id}" data-alert="${a.id}">${cand}</button>` : ''}<button class="btn" data-act="hold">보류</button>
      <span class="muted">${sec ? (a.fixed ? '위험한 버전은 적용 후보가 될 수 없어서, 고친 버전으로 올리기만 고를 수 있어요.' : '고친 버전이 아직 없어서 보류만 고를 수 있어요.') : '판단하기 전에는 아무것도 바뀌지 않아요.'}</span></div>
      <form class="hold" data-id="${t.id}" data-alert="${a.id}" hidden><label for="why-${a.id}">보류 이유 (5자 이상)</label>
        <div class="row jreasons">${['마감이라 나중에', '보안 문제가 풀리면', '비교가 더 필요해요', '지금 쓰는 걸로 충분해요'].map((r) => `<button type="button" class="chip" data-jr="${r}">${r}</button>`).join('')}</div>
        <textarea id="why-${a.id}" minlength="5" required></textarea><div class="row"><button class="btn primary">보류로 저장</button><button type="button" class="btn" data-act="holdCancel">취소</button></div></form></div>`;
  }
  function changeHtml(a, m) {
    const src = (m.src || []).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join(' · ') || '찾지 못함';
    return `<section class="box"><h2>무엇이 바뀌었나</h2><dl class="kv"><dt>${m.field}</dt><dd><b>${esc(m.before)} → ${esc(m.after)}</b></dd><dt>언제</dt><dd>${a.at}</dd>
      ${m.range ? `<dt>영향받는 버전</dt><dd>${m.range}</dd><dt>내 버전</dt><dd>${m.my}</dd><dt>고친 버전</dt><dd>${a.fixed || '아직 없음'}</dd>` : ''}<dt>출처</dt><dd>${src}</dd></dl>
      <p>${esc(m.why)}</p></section>`;
  }
  function scenarioHtml(a, t) { // IA-8: 누를 때만 만든다. 참고 자료일 뿐 설치·적용은 사용자가 한다
    const s = (ui.scen ||= {})[a.id];
    const body = s === 'busy' ? '<p class="muted" aria-live="polite">만드는 중이에요… 보통 몇 초 걸려요.</p>'
      : s === 'fail' ? `<p role="alert"><b>만들지 못했어요.</b> 잠시 뒤 다시 요청해 주세요. 판단에는 영향이 없어요.</p><button class="btn" data-aa="scenario" data-val="${a.id}">다시 요청</button>`
      : s === 'done' ? `<p class="muted">Claude가 만든 참고 자료예요(방금). 실제로 바꾸는 일은 직접 해요.</p>
        <h3>적용 단계</h3><ol>${a.kind === '보안 경고' ? '<li>.mcp.json에서 버전을 1.4.2로 바꾸기</li><li>Claude Code 다시 시작</li><li>저장소 읽기로 바뀐 버전 확인</li>' : `<li>${esc(t.id)}를 프로젝트 밖 칸에 직접 추가해 써 보기</li><li>한 주 써 보고 내 ${esc(MORE[a.id].mine)}와 비교</li><li>바꾸면 저장소 설정에서 옛것 빼기</li>`}</ol>
        <h3>위험과 되돌리는 방법</h3><p>문제가 생기면 이전 버전 번호로 되돌리고 다시 시작하면 돼요. 설정 파일은 바꾸기 전에 복사해 두세요.</p>
        <h3>참고한 출처</h3><p class="src">${(MORE[a.id].src || []).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join(' · ') || TR.srcLinks(t)}</p>`
      : `<p class="muted">내 프로젝트에 넣는 방법을 Claude가 써 줘요. <b>누를 때만</b> 만들어요(판단 전후 언제든).</p><button class="btn" data-aa="scenario" data-val="${a.id}">적용 시나리오 만들기</button>`;
    return `<section class="box"><h2>적용 시나리오</h2>${body}</section>`;
  }
  function alertView(id) {
    const a = ALERTS.find((x) => x.id === id);
    if (!a) return `<h1 tabindex="-1">찾지 못했어요</h1><a class="btn" href="#alerts">알림으로</a>`;
    const t = R(a.tech), m = MORE[a.id], mineT = m.mine ? R(m.mine) : t, sec = a.kind === '보안 경고';
    // 비슷한 과거 판단(UJ-9): 같은 내 기술 또는 같은 갈래, 기술마다 최신 하나
    const past = records.filter((r, i) => r.id !== t.id && (r.id === mineT.id || R(r.id).big === t.big) && records.findIndex((x) => x.id === r.id) === i).slice(0, 3);
    const log = [[a.at, '알림이 생김'], ...records.filter((r) => r.id === t.id).slice(0, 3).reverse().map((r) => [r.at, `${r.label || JN[r.j]}${r.why ? ' · ' + r.why : ''}`])];
    return `<header class="dhead"><div class="row"><a class="btn" href="#alerts">${icon('back', 16)}알림 목록</a>${kindTag(a)}<h1 tabindex="-1">${esc(titleOf(a))}</h1></div>
        <div class="muted">${a.at} · ${a.status === 'wait' ? '<b>판단 대기</b>' : '완료'} · 관련된 내 기술 ${esc(mineT.id)}</div>
        <div class="jbar"><span class="jlabel">판단</span>${judgeBar(a, t)}</div></header>
      <div class="dgrid"><div class="dmain">${changeHtml(a, m)}
        ${sec ? `<section class="box"><h2>대응안 초안 <span class="muted">(Claude, 참고)</span></h2><ol>${m.draft.map((d) => `<li>${esc(d)}</li>`).join('')}</ol><p class="muted src">참고한 출처: ${m.src.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join(' · ')}. 초안은 판단을 대신하지 않아요.</p></section>`
          : `<section class="box"><h2>내 ${esc(mineT.id)}와 비교</h2><p class="muted">왜 비교군: ${esc(TR.radar.why(t.id, mineT.id).quote)} · ${TR.radar.why(t.id, mineT.id).who}</p>${TR.compareTable(t, mineT)}</section>`}
        ${scenarioHtml(a, t)}</div>
      <aside class="dside">
        <section class="box"><h2>관련된 내 기술</h2><p><a href="#tech/${encodeURIComponent(mineT.id)}"><b>${esc(mineT.id)}</b></a> <span class="muted">${esc(TR.radar.pathOf(mineT))}</span></p><p class="muted">${mineT.grade} · ${esc(TR.radar.SEC_TEXT[mineT.grade])}</p>
          <div class="row"><a class="btn sm" href="#tech/${encodeURIComponent(t.id)}">${esc(t.id)} 상세</a><a class="btn sm" href="#map/${encodeURIComponent(t.id)}">지도에서 보기</a></div></section>
        <section class="box"><h2>비슷한 과거 판단</h2>${past.length ? `<ul class="near">${past.map((r) => `<li><div><span class="muted">${r.at}</span> · ${esc(r.id)} · <b>${r.label || JN[r.j]}</b>${r.why ? `<div class="muted">"${esc(r.why)}"</div>` : ''}</div></li>`).join('')}</ul>` : '<p class="muted">없어요.</p>'}</section>
        <section class="box"><h2>이 알림의 기록</h2><ul class="near">${log.map(([at, w]) => `<li><div><span class="muted">${at}</span> · ${esc(w)}</div></li>`).join('')}</ul></section>
      </aside></div>`;
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-aa]'); if (!el) return;
    const a = el.dataset.aa, v = el.dataset.val;
    if (a === 'aState' || a === 'aKind') { ui[a] = v; TR.render(); document.querySelector(`[data-aa="${a}"][data-val="${CSS.escape(v)}"]`)?.focus(); }
    if (a === 'scenario') {
      ui.scen[v] = 'busy'; TR.render();
      setTimeout(() => { ui.scen[v] = AIFAIL ? 'fail' : 'done'; if (location.hash === `#alert/${v}`) TR.render(); TR.say(AIFAIL ? '적용 시나리오를 만들지 못했어요.' : '적용 시나리오를 만들었어요(참고 자료).'); }, 1200);
    }
    if (a === 'reopen') { // 다시 판단하기(Dependabot "다시 열기" 참고): 판단 기록은 남기고 알림만 판단 대기로
      const al = ALERTS.find((x) => x.id === v); al.status = 'wait'; delete al.result;
      records.unshift({ key: `r${Date.now()}`, id: al.tech, j: 'int', label: '알림을 다시 엶', why: '', at: '방금', rating: 0, note: '', fresh: true });
      TR.judge.keep(); TR.render(); TR.say('알림을 다시 열었어요. 지난 판단은 기록에 그대로 있어요.');
    }
  });
  Object.assign(TR.views ||= {}, { alerts: alertsView, alert: alertView });
})();
