// 지도 위에 덮는 사이드바의 내용: 기술(설명 · 보안 · 비교군과 그 이유 · 내 판단 바로 남기기)과 묶음(목록 · 이 분류만 보기 · 분류 들어가기).
(() => {
  const { esc } = TR;
  const { edges, byId: T, UNSORTED, why, pathOf, SEC_TEXT: secText, ERR_TEXT: errText } = TR.radar;
  const RL = TR.radarLayout;
  const dotOf = (it) => `<i style="background:var(${it ? it.token : '--unknown'})"></i>`;
  const detailUrl = (id) => `journey.html${location.search}#tech/${encodeURIComponent(id)}`; // ?n=1200 이면 상세도 같은 표본

  /** 비교군 한 줄: 이름 + 왜 비교군인지(근거 한 줄) + 누가 정했나(관리자 확인 / 규칙 후보) */
  function relLine(S, id, n) {
    const w = why(id, n.id);
    return `<li class="rel">${dotOf(S.L.byId.get(n.id))}<div><span><button data-go="${esc(n.id)}">${esc(n.id)}</button>${n.grade === '위험' ? ' <span class="tag">위험</span>' : ''}</span>
      <span class="why">왜: ${esc(w.quote)}</span><span class="muted">${w.who}</span></div></li>`;
  }
  const srcLine = (t) => TR.radar.sourcesOf(t).map(([label, url]) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${label}</a>` : `${label}: 찾지 못함`)).join(' · ');
  function tech(it) {
    const { S, login } = TR.radarUI, t = it.t;
    const nb = edges.filter((e) => e.includes(t.id)).map((e) => T[e[0] === t.id ? e[1] : e[0]]);
    // 비교군 = 관리자 확인(ADR 0015). 규칙·AI 후보는 아래에 접어 따로(U13)
    const ok = nb.filter((n) => why(t.id, n.id).by === 'admin'), cand = nb.filter((n) => why(t.id, n.id).by !== 'admin');
    return `<h2 id="sTitle" tabindex="-1">${esc(t.id)}</h2><div class="muted">${esc(pathOf(t))}</div>
      <div class="row" style="margin:6px 0 8px">${t.nw ? '<span class="tag new">NEW</span>' : ''}${login && t.mine ? '<span class="tag strong">내 기술 · 쓰는 중</span>' : ''}</div>
      <p>${esc(t.desc)}</p>${t.goodFor ? `<p><b>이럴 때 좋아요:</b> ${esc(t.goodFor)}</p>` : ''}<p class="muted">${esc(t.pop)} · 업데이트 ${esc(t.upd)} · 라이선스 ${esc(t.license || '찾지 못함')}</p>
      <p class="muted">${secText[t.grade]}</p>${t.err ? `<p class="muted">${errText}</p>` : ''}<p class="muted src">출처: ${srcLine(t)}</p>
      <h3>내 판단</h3>${TR.judge.html(t, { login })}
      <h3>비교군 ${ok.length}</h3><ul class="near">${ok.map((n) => relLine(S, t.id, n)).join('') || '<li class="muted">확인된 비교군이 아직 없어요.</li>'}</ul>
      ${cand.length ? `<details class="cands"><summary>확인 전 후보 ${cand.length}</summary><ul class="near">${cand.map((n) => relLine(S, t.id, n)).join('')}</ul></details>` : ''}
      <p style="margin-top:14px"><a class="btn primary" href="${detailUrl(t.id)}">전체 상세 보기</a></p>`;
  }
  function group(g) {
    const { S, login } = TR.radarUI, dimName = RL.DIMS[g.dim][0];
    const sev = (t) => (t.grade === '위험' ? 0 : t.grade === '주의' ? 1 : t.err ? 2 : 3);
    const list = S.L.items.filter((it) => it.type === 't' && RL.isUnder(S.L, it, g.id)).sort((a, b) => sev(a.t) - sev(b.t) || (a.id < b.id ? -1 : 1));
    const unsorted = g.value === UNSORTED && (g.dim === 'field' || g.dim === 'sub');
    const cls = unsorted ? `<div class="box"><b>분류 전 ${g.count}개</b><span class="muted">기본 규칙(이름·설명 낱말)으로 갈래를 정하지 못한 기술이에요.</span>
      ${login ? `<div class="row"><a class="btn" href="classify.html">직접 분류하기</a><a class="btn" href="classify.html">AI 제안 받기 · 오늘 남은 20</a></div><span class="muted">AI 제안은 내가 확인해야 내 분류에 저장돼요.</span>`
        : `<div class="row"><span class="btn" aria-disabled="true">직접 분류하기</span><span class="btn" aria-disabled="true">AI 제안 받기</span></div><span class="muted">로그인하면 나만의 분류를 만들 수 있어요.</span>`}</div>` : '';
    return `<h2 id="sTitle" tabindex="-1">${esc(g.value)}</h2><div class="muted">${g.level}단계 · ${dimName} · ${g.count}개${g.danger ? ` · 위험 ${g.danger}` : ''}${g.caution ? ` · 주의 ${g.caution}` : ''}${g.err ? ` · 수집 오류 ${g.err}` : ''}</div>
      <p class="row" style="margin-top:8px"><button class="btn primary" data-drill="${esc(g.id)}">이 분류만 보기</button><button class="btn" data-toggle="${esc(g.id)}">${S.collapsed.has(g.id) ? '펼치기' : '접기'}</button></p>${cls}
      <h3>기술 ${list.length}${list.length > 50 ? ' (위험·주의 먼저 50개)' : ''}</h3><ul class="near">${list.slice(0, 50).map((it) => `<li>${dotOf(it)}<button data-go="${esc(it.id)}">${esc(it.id)}</button>${it.t.grade === '위험' || it.t.grade === '주의' ? `<span class="tag">${it.t.grade}</span>` : ''}${it.t.err ? '<span class="tag">수집 오류</span>' : ''}</li>`).join('')}</ul>`;
  }
  TR.radarSide = { tech, group, pathOf };
})();
