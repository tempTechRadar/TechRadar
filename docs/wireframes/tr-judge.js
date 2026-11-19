// 내 판단(관심 · 적용 후보 · 보류) 공용: 지도 사이드바(radar)와 기술 상세·알림(journey)이 같은 단추·같은 저장 규칙을 쓴다.
// 판단은 기록일 뿐 아무것도 설치·변경하지 않는다(불변 1, ADR 0010). 시안끼리 이어 보이게 판단·기록은 이 탭 안(sessionStorage)에만 둔다.
// ?state=savefail 이면 저장이 실패하는 경우를 보여 준다: 판단·알림은 그대로, "처리 완료"로 보이지 않는다(불변 4, UJ-5x).
(() => {
  const { JN, judged, records, ALERTS, esc } = TR;
  const KEY = 'tr-judge', FAIL = new URLSearchParams(location.search).get('state') === 'savefail';
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY));
    if (s) {
      Object.keys(judged).forEach((k) => delete judged[k]); Object.assign(judged, s.judged);
      records.unshift(...s.records);
      s.alerts.forEach(([id, status, result]) => { const a = ALERTS.find((x) => x.id === id); if (a) Object.assign(a, { status, result }); });
    }
  } catch { /* 저장소가 없으면 샘플 처음 상태로 */ }
  const keep = () => { try { sessionStorage.setItem(KEY, JSON.stringify({ judged, records: records.filter((r) => r.fresh), alerts: ALERTS.map((a) => [a.id, a.status, a.result]) })); } catch { /* 못 남겨도 이 화면에서는 그대로 */ } };
  const techOf = (id) => (TR.radar && TR.radar.byId[id]) || TR.byId[id];
  const risky = (t) => t.grade === '위험' || t.sec === 'd';
  const FAIL_MSG = '저장하지 못했어요. 판단은 전과 그대로예요. 잠시 뒤 다시 눌러 주세요.';
  // 바로 앞 저장을 되돌리는 데 필요한 것(판단 · 새 기록 · 함께 완료한 알림)
  let last = null;
  const snapshot = (id) => ({ id, prev: judged[id], alerts: ALERTS.map((a) => [a, a.status, a.result]) });

  /** 판단 저장. 적용 후보·보류를 고르면 같은 기술의 적용 기회 알림도 함께 판단을 마친다 */
  function save(id, j, why = '', alertId) {
    const t = techOf(id), alert = ALERTS.find((a) => a.id === alertId);
    if (j === 'cand' && risky(t) && !alert) return '위험한 버전은 적용 후보로 고를 수 없어요.';
    if (FAIL) return FAIL_MSG;
    last = snapshot(id);
    if (!t.mine) judged[id] = j;
    const done = alert ? [alert] : j === 'int' ? [] : ALERTS.filter((a) => a.status === 'wait' && a.tech === id && a.kind === '적용 기회');
    done.forEach((a) => { a.status = 'done'; a.result = j; });
    const label = alert && alert.kind === '보안 경고' && j === 'cand' ? `고친 버전 ${alert.fixed}로 올리기` : '';
    last.key = `r${Date.now()}`;
    records.unshift({ key: last.key, id, j, why, at: '방금', label, rating: 0, note: '', fresh: true });
    keep();
    return `판단을 저장했어요: ${label || JN[j]}. 설치하거나 바꾼 것은 없어요.${done.length && !alert ? ` 알림 ${done.length}건도 판단을 마쳤어요.` : ''}`;
  }
  function clear(id) {
    if (FAIL) return FAIL_MSG;
    last = snapshot(id); delete judged[id]; keep();
    return '판단을 지웠어요. 기록은 그대로 남아요.';
  }
  /** 실수로 누른 것 되돌리기: 판단·알림을 바로 앞으로, 그때 생긴 기록은 지움 */
  function undo() {
    if (!last) return '';
    const { id, prev, alerts, key } = last;
    if (prev) judged[id] = prev; else delete judged[id];
    alerts.forEach(([a, status, result]) => Object.assign(a, { status, result }));
    if (key) { const i = records.findIndex((r) => r.key === key); if (i >= 0) records.splice(i, 1); }
    last = null; keep();
    return id;
  }

  const REASONS = ['마감이라 나중에', '보안 문제가 풀리면', '비교가 더 필요해요', '지금 쓰는 걸로 충분해요']; // 보류 이유 고르기(Dependabot 닫기 이유 참고)
  /** 세 단추. 내 기술은 "쓰는 중"만, 로그인 전·위험한 버전의 적용 후보는 눌러도 이유만 알려 준다 */
  function html(t, { login }) {
    if (t.mine) return `<div class="judge" data-for="${esc(t.id)}"><p class="muted">저장소에서 읽은 내 기술이라 <b>쓰는 중</b>이에요.</p></div>`;
    const now = judged[t.id], off = (j) => (!login ? '로그인하면 판단을 남길 수 있어요.' : j === 'cand' && risky(t) ? '위험한 버전은 적용 후보로 고를 수 없어요.' : '');
    const b = (j) => `<button type="button" data-jv="${j}" aria-pressed="${now === j}"${off(j) ? ` aria-disabled="true" data-why="${off(j)}"` : ''}>${JN[j]}</button>`;
    return `<div class="judge" data-for="${esc(t.id)}"><div class="jseg" role="group" aria-label="내 판단">${b('int')}${b('cand')}${b('hold')}</div>
      <p class="muted">${!login ? '로그인하면 관심 · 판단을 남길 수 있어요.' : now ? `지금: <b>${JN[now]}</b> · 다시 누르면 지워요` : '아직 판단 안 함 · 눌러서 바로 남겨요'}${login && risky(t) ? ' · 위험한 버전은 적용 후보 불가' : ''}</p>
      <form class="jform" hidden><label for="jw-${esc(t.id)}">보류 이유 (5자 이상)</label>
        <div class="row jreasons" role="group" aria-label="자주 쓰는 이유">${REASONS.map((r) => `<button type="button" class="chip" data-jr="${r}">${r}</button>`).join('')}</div>
        <textarea id="jw-${esc(t.id)}" minlength="5" required></textarea>
        <div class="row"><button class="btn primary">보류로 저장</button><button type="button" class="btn" data-jv-cancel>취소</button></div></form></div>`;
  }

  /** onChange(id, 안내 글, 안내만인가, 되돌리기) — 화면이 다시 그리고 토스트를 띄운다 */
  const J = { save, clear, undo, html, keep, onChange: () => {} };
  function done(id, j, msg) {
    const ok = msg !== FAIL_MSG;
    J.onChange(id, msg, !ok, ok && last ? undo : null);
    document.querySelector(`.judge[data-for="${CSS.escape(id)}"] [data-jv="${j}"]`)?.focus({ preventScroll: true });
  }
  document.addEventListener('click', (e) => {
    const cancel = e.target.closest('[data-jv-cancel]');
    if (cancel) { cancel.closest('form').hidden = true; return; }
    const reason = e.target.closest('[data-jr]');
    if (reason) { const ta = reason.closest('form').querySelector('textarea'); ta.value = reason.dataset.jr; ta.focus(); return; }
    const b = e.target.closest('[data-jv]');
    if (!b) return;
    const box = b.closest('.judge'), id = box.dataset.for, j = b.dataset.jv;
    if (b.getAttribute('aria-disabled') === 'true') return J.onChange(id, b.dataset.why, true);
    if (j === 'hold' && judged[id] !== 'hold') { const f = box.querySelector('form'); f.hidden = false; f.querySelector('textarea').focus(); return; }
    done(id, j, judged[id] === j ? clear(id) : save(id, j));
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form.jform');
    if (!f) return;
    e.preventDefault();
    const id = f.closest('.judge').dataset.for, why = f.querySelector('textarea').value.trim();
    if (why.length < 5) return J.onChange(id, '보류 이유를 5자 이상 써 주세요.', true);
    done(id, 'hold', save(id, 'hold', why));
  });
  TR.judge = J;
})();
