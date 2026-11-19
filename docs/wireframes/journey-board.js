// 끌어 놓는 화면: 내 레이더(칸반). 블루프린트는 넓은 판이 필요해 따로(blueprint.html). save·say·render는 journey.js가 TR에 붙인다(누를 때 부르므로 순서 상관없음).
(() => {
  const { icon, esc, TECH, byId, ALERTS, JN, SEC, records, stateOf, secIcon, dotIcon, path, ui } = TR; // ui.holdFor: 보류 이유 칸을 연 카드
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

  // ---- 끌어 놓기. 키보드로는 "옮기기"를 쓴다
  document.addEventListener('dragstart', (e) => { const el = e.target.closest?.('[draggable="true"][data-id]'); if (el) e.dataTransfer.setData('text/plain', el.dataset.id); });
  document.addEventListener('dragover', (e) => { const z = e.target.closest?.('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('over'); } });
  document.addEventListener('dragleave', (e) => e.target.closest?.('[data-drop]')?.classList.remove('over'));
  document.addEventListener('drop', (e) => {
    const z = e.target.closest?.('[data-drop]');
    if (!z) return;
    e.preventDefault(); z.classList.remove('over');
    const id = e.dataTransfer.getData('text/plain'), [kind, v] = z.dataset.drop.split(':');
    if (kind === 'col') moveTo(id, v);
  });
  document.addEventListener('change', (e) => { if (e.target.dataset.move && e.target.value) moveTo(e.target.dataset.move, e.target.value); });
  TR.views = { radar: radarView };
})();
