// 끌어 놓는 두 화면: 내 레이더(칸반)와 블루프린트(단계별 조립, 제안). save·say·render는 journey.js가 TR에 붙인다(누를 때 부르므로 순서 상관없음).
(() => {
  const { icon, esc, TECH, byId, ALERTS, JN, SEC, records, stateOf, secIcon, dotIcon, path, ui } = TR;
  const whyOf = (id) => (records.find((r) => r.id === id) || {}).why || '';
  const secMark = (t) => (t.sec ? `<span class="muted" title="${SEC[t.sec]}">${icon(secIcon(t.sec), 15)} ${SEC[t.sec]}</span>` : '');

  // ---- 내 레이더 = 칸반. 칸 = 판단 상태. 끌거나 "옮기기"로 판단을 바꾼다(같은 저장 규칙: 쓰는 중은 저장소에서만, 보류는 이유, 위험한 버전은 후보 불가)
  const COLS = [['int', '관심', '눈여겨볼 것'], ['cand', '적용 후보', '써 볼 것'], ['use', '쓰는 중', '저장소에서 읽은 것만'], ['hold', '보류', '이유와 함께']];
  function card(t) {
    const s = stateOf(t), w = s === 'hold' || s === 'cand' || s === 'int' ? whyOf(t.id) : '';
    const move = t.mine ? '<span class="muted">저장소에서 읽음</span>'
      : `<label class="sr" for="mv-${t.id}">${t.id} 옮기기</label><select id="mv-${t.id}" data-move="${t.id}"><option value="">옮기기…</option>${['int', 'cand', 'hold'].filter((j) => j !== s).map((j) => `<option value="${j}">${JN[j]}로</option>`).join('')}</select>`;
    const hold = ui.holdFor === t.id ? `<form class="hold" data-id="${t.id}" data-alert=""><label for="why-${t.id}">보류 이유 (5자 이상)</label><textarea id="why-${t.id}" minlength="5" required></textarea><div class="row"><button class="btn primary">보류로 저장</button><button type="button" class="btn" data-act="holdCancel">취소</button></div></form>` : '';
    return `<li class="card" data-id="${t.id}" ${t.mine ? '' : 'draggable="true"'}><a href="#tech/${t.id}"><b>${t.id}</b></a>${t.nw ? ' <span class="tag new">NEW</span>' : ''}
      <div class="muted">${path(t)}</div><p>${t.desc}</p>${w ? `<p class="muted">"${esc(w)}"</p>` : ''}${secMark(t)}<div class="row">${move}</div>${hold}</li>`;
  }
  function radarView(tab) {
    const mine = TECH.filter((t) => t.mine), wait = ALERTS.filter((a) => a.status === 'wait').length;
    const head = `<h1 tabindex="-1">내 레이더</h1><p class="muted">내가 쓰는 기술과 판단한 기술을 한곳에. 모든 프로젝트 합계예요.</p>
      <div class="sum"><a href="#radar/list"><span>내 기술</span><b>${mine.length}</b><small>저장소에서 읽음</small></a><a href="#alerts"><span>이번 주 변경</span><b>2</b><small>보안 등급 1 · 새 알림 1</small></a><a href="#alerts"><span>판단 기다림 / 완료</span><b>${wait} / ${ALERTS.length - wait}</b><small>알림 기준</small></a></div>
      <nav class="tabs" aria-label="보기"><a href="#radar" ${tab ? '' : 'aria-current="page"'}>칸반</a><a href="#radar/list" ${tab ? 'aria-current="page"' : ''}>목록</a></nav>`;
    if (tab === 'list') return `${head}<div class="row" style="margin-bottom:8px"><button class="btn" data-act="stub">다시 읽기</button><button class="btn" data-act="stub">직접 추가</button><button class="btn" data-act="stub">설치 프롬프트 만들기</button></div>
      <table><thead><tr><th>기술</th><th>상태</th><th>경로</th><th>태그</th><th>보안</th></tr></thead><tbody>${TECH.filter(stateOf).map((t) => `<tr><td><a href="#tech/${t.id}">${t.id}</a></td><td>${JN[stateOf(t)]}</td><td>${path(t)}</td><td>${t.tags.map((g) => '#' + g).join(' ')}</td><td>${SEC[t.sec] || '알려진 문제 없음'}</td></tr>`).join('')}</tbody></table>`;
    return `${head}<p class="muted">카드를 다른 칸으로 끌거나 "옮기기"로 판단을 바꿔요. 바꿔도 설치하거나 바꾸는 것은 없어요.</p>
      <div class="kanban">${COLS.map(([j, n, hint]) => { const l = TECH.filter((t) => stateOf(t) === j); return `<section class="col" data-drop="col:${j}" aria-label="${n} ${l.length}개">
        <h2>${dotIcon(j)}${n} <span class="muted">${l.length}</span></h2><p class="muted">${hint}</p><ul>${l.map(card).join('') || '<li class="muted">없어요</li>'}</ul></section>`; }).join('')}</div>`;
  }
  function moveTo(id, j) {
    const t = byId[id];
    if (!t || t.mine || stateOf(t) === j) return;
    if (j === 'use') return TR.say('쓰는 중은 저장소에서 읽은 기술만이에요. 프로젝트에 넣고 다시 읽으면 여기로 와요.');
    if (j === 'hold') { ui.holdFor = id; TR.render(); document.getElementById(`why-${id}`)?.focus(); return; }
    TR.save(id, j, '');
  }

  // ---- 블루프린트(제안): 단계 뼈대에 기술을 붙여 나만의 조합을 만들고 글로 내보낸다. 내 저장소에 직접 쓰지 않는다(불변 1, ADR 0010)
  const STAGES = [['문제정의', ['리서치', '문서']], ['솔루션 후보', ['리서치']], ['기획', ['문서']], ['개발', ['백엔드', '데이터베이스', 'git', '프론트엔드']], ['디자인', ['디자인', '프론트엔드']], ['QA', ['테스트', '보안']], ['배포', ['배포', 'git']]];
  const ORDER = { use: 0, cand: 1, int: 2, undefined: 3, hold: 4 };
  const fixedOf = (id) => (ALERTS.find((x) => x.tech === id && x.fixed) || {}).fixed;
  const candidates = (i) => TECH.filter((t) => t.tags.some((g) => STAGES[i][1].includes(g))).sort((a, b) => ORDER[stateOf(a)] - ORDER[stateOf(b)]);
  function exportText() {
    const used = STAGES.map(([n], i) => [n, ui.bp[i].map((id) => byId[id])]).filter(([, l]) => l.length);
    if (!used.length) return '';
    if (ui.bpOut === 'md') return `## 작업 단계와 쓸 도구\n\n| 단계 | 쓸 도구 | 하는 일 |\n|---|---|---|\n${used.map(([n, l]) => `| ${n} | ${l.map((t) => t.id).join(', ')} | ${l.map((t) => t.desc).join(' ')} |`).join('\n')}\n`;
    return `아래 순서로 작업해 줘. 단계마다 적은 도구를 먼저 써 줘.\n\n${used.map(([n, l], k) => `${k + 1}. ${n}: ${l.map((t) => `${t.id}(${t.desc})`).join(', ')}`).join('\n')}\n`;
  }
  function blueprintView() {
    const i = ui.bpStage, txt = exportText();
    const stage = ([n], k) => `<li class="stage-box${k === i ? ' on' : ''}" data-drop="stage:${k}"><button class="stage-name" data-act="bpStage" data-val="${k}" aria-pressed="${k === i}">${n} <span class="muted">${ui.bp[k].length}</span></button>
      <ul>${ui.bp[k].map((id) => `<li class="slot">${dotIcon(stateOf(byId[id]))}<span title="${id}">${id}</span><button class="x" data-act="bpRemove" data-val="${k}:${id}" aria-label="${n}에서 ${id}빼기">${icon('close', 14)}</button></li>`).join('') || '<li class="muted">여기로 끌어 오기</li>'}</ul></li>`;
    const row = (t) => { const s = stateOf(t), risky = t.sec === 'd', inIt = ui.bp[i].includes(t.id);
      return `<tr ${risky ? '' : 'draggable="true"'} data-id="${t.id}"><td>${dotIcon(s)} <a href="#tech/${t.id}">${t.id}</a>${t.nw ? ' <span class="tag new">NEW</span>' : ''}<div class="muted">${JN[s] || '아직 안 봄'} · ${t.kind}</div></td><td>${t.desc}</td><td>${t.pop}</td><td>${secMark(t) || '<span class="muted">알려진 문제 없음</span>'}</td>
        <td>${risky ? `<span class="muted">위험한 버전은 넣지 않아요${fixedOf(t.id) ? `. 고친 버전 ${fixedOf(t.id)}로 올리면 넣을 수 있어요` : ''}</span>` : `<button class="btn" data-act="bpAdd" data-val="${t.id}" ${inIt ? 'disabled' : ''}>${inIt ? '넣었어요' : '이 단계에 넣기'}</button>`}</td></tr>`; };
    return `<h1 tabindex="-1">블루프린트 <span class="tag">제안</span></h1><p class="muted">단계마다 쓸 기술을 골라 나만의 조합을 만들어요. 다 만들면 프롬프트나 CLAUDE.md 글로 내보내요. 글만 만들고, 설치하거나 내 저장소를 바꾸지 않아요.</p>
      <ol class="flow-line">${STAGES.map(stage).join('<li class="arrow" aria-hidden="true">→</li>')}</ol>
      <div class="row" style="margin:8px 0"><button class="btn" data-act="bpFill">지금 쓰는 기술로 채우기</button><button class="btn" data-act="bpClear">비우기</button></div>
      <div class="cols"><div class="box"><h2>${STAGES[i][0]} 단계 후보 <span class="muted">${STAGES[i][1].map((g) => '#' + g).join(' ')}</span></h2>
        <table><thead><tr><th>기술</th><th>하는 일</th><th>인기</th><th>보안</th><th></th></tr></thead><tbody>${candidates(i).map(row).join('')}</tbody></table></div>
      <div class="box"><h2>내보내기</h2><div class="row"><button class="btn" data-act="bpOut" data-val="prompt" aria-pressed="${ui.bpOut === 'prompt'}">프롬프트</button><button class="btn" data-act="bpOut" data-val="md" aria-pressed="${ui.bpOut === 'md'}">CLAUDE.md 글</button></div>
        <textarea id="bpText" readonly aria-label="내보낼 글" style="width:100%;min-height:200px;margin-top:8px">${esc(txt)}</textarea>
        <button class="btn primary" data-act="bpCopy" ${txt ? '' : 'disabled'}>${icon('copy', 16)}복사</button><p class="muted">복사한 글은 내가 직접 붙여 넣어요. 위험한 버전은 넣을 수 없어요(IA-22와 같은 규칙).</p></div></div>`;
  }
  function addTo(k, id) {
    const t = byId[id];
    if (!t || t.sec === 'd') return TR.say('위험한 버전은 블루프린트에 넣을 수 없어요.');
    if (!ui.bp[k].includes(id)) ui.bp[k].push(id);
    TR.say(`${STAGES[k][0]} 단계에 ${id}를 넣었어요.`); TR.render();
  }

  // ---- 끌어 놓기(두 화면 공용). 키보드로는 "옮기기"·"이 단계에 넣기"를 쓴다
  document.addEventListener('dragstart', (e) => { const el = e.target.closest?.('[draggable="true"][data-id]'); if (el) e.dataTransfer.setData('text/plain', el.dataset.id); });
  document.addEventListener('dragover', (e) => { const z = e.target.closest?.('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', (e) => e.target.closest?.('[data-drop]')?.classList.remove('over'));
  document.addEventListener('drop', (e) => {
    const z = e.target.closest?.('[data-drop]');
    if (!z) return;
    e.preventDefault(); z.classList.remove('over');
    const id = e.dataTransfer.getData('text/plain'), [kind, v] = z.dataset.drop.split(':');
    if (kind === 'col') moveTo(id, v); else addTo(Number(v), id);
  });
  document.addEventListener('change', (e) => { if (e.target.dataset.move && e.target.value) moveTo(e.target.dataset.move, e.target.value); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act^="bp"]');
    if (!b) return;
    const a = b.dataset.act, v = b.dataset.val;
    if (a === 'bpStage') { ui.bpStage = Number(v); TR.render(); document.querySelector(`[data-act="bpStage"][data-val="${v}"]`)?.focus(); }
    if (a === 'bpAdd') addTo(ui.bpStage, v);
    if (a === 'bpRemove') { const [k, id] = v.split(':'); ui.bp[k] = ui.bp[k].filter((x) => x !== id); TR.render(); }
    if (a === 'bpOut') { ui.bpOut = v; TR.render(); }
    if (a === 'bpClear') { ui.bp = STAGES.map(() => []); TR.render(); }
    if (a === 'bpFill') { STAGES.forEach(([, tags], k) => { TECH.filter((t) => t.mine && t.sec !== 'd' && t.tags.some((g) => tags.includes(g)) && !ui.bp[k].includes(t.id)).forEach((t) => ui.bp[k].push(t.id)); }); TR.say('지금 쓰는 기술을 맞는 단계에 넣었어요. 위험한 버전은 뺐어요.'); TR.render(); }
    if (a === 'bpCopy') navigator.clipboard.writeText(document.getElementById('bpText').value).then(() => TR.say('복사했어요.'), () => TR.say('복사하지 못했어요. 글을 직접 골라 복사해 주세요.'));
  });

  TR.views = { radar: radarView, blueprint: blueprintView };
})();
