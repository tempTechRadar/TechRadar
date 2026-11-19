// radar.html?selfcheck=1 일 때만: 배치·보기 설정 규칙을 브라우저 안에서 점검하고 결과를 콘솔 표와 화면 오른쪽 아래에 보인다.
(() => {
  if (new URLSearchParams(location.search).get('selfcheck') !== '1') return;
  const RL = TR.radarLayout, { techs, edges, UNSORTED } = TR.radar, rows = [];
  const ok = (name, cond) => rows.push({ 점검: name, 결과: cond ? '통과' : '실패' });
  const P = (s) => new URLSearchParams(s), base = RL.parseView(P(''), false, techs);

  const a = RL.layout(techs, edges, base), b = RL.layout(techs, edges, base);
  ok('같은 설정 = 같은 배치', JSON.stringify(a.items.map((i) => [i.id, i.x, i.y])) === JSON.stringify(b.items.map((i) => [i.id, i.x, i.y])));
  ok('기본 묶기 = 하는 일 › 종류, 색 = 하는 일', base.group.join() === 'field,kind' && base.color === 'field');
  for (const g of [['field'], ['field', 'kind'], ['field', 'sub', 'kind']]) {
    const L = RL.layout(techs, edges, { ...base, group: g });
    ok(`${g.length}단계: 묶음 단계가 1~${g.length}, 기술은 모두 한 번씩`, Math.max(...L.items.filter((i) => i.type === 'g').map((i) => i.level)) === g.length && L.items.filter((i) => i.type === 't').length === techs.length);
  }
  const v = RL.parseView(P('g=kind,host&c=grade&fk=MCP&risky=1'), false, techs);
  ok('주소 → 설정 → 주소 왕복', RL.viewParams(v).toString() === P('g=kind,host&c=grade&fk=MCP&risky=1').toString());
  const bad = RL.parseView(P('g=constructor,__proto__,kind&c=evil&fk=없는값&ff=리서치'), false, techs);
  ok('모르는 이름·값은 버림', bad.group.join() === 'kind' && bad.color === 'kind' && !bad.filter.kind && bad.filter.field.has('리서치'));
  ok('로그인 전에는 내 프로젝트 묶기·내 기술만 거르기 안 됨', RL.parseView(P('g=project&mine=1'), false, techs).group.join() === 'field,kind' && !RL.parseView(P('mine=1'), false, techs).mine);
  ok('분류 전은 맨 뒤 + 회색', (() => { const g = a.items.filter((i) => i.level === 1); return g[g.length - 1].value === UNSORTED && g[g.length - 1].token === '--unknown'; })());
  ok('보안 등급 색: 위험 = --danger', RL.layout(techs, edges, { ...base, color: 'grade' }).legend.find((l) => l.value === '위험').token === '--danger');
  const g1 = a.items.find((i) => i.level === 1), hid = RL.hiddenOf(a, new Set([g1.id]));
  ok('접은 묶음 아래는 숨김, 묶음 자신은 보임', !hid.has(g1.id) && a.items.filter((i) => RL.isUnder(a, i, g1.id)).every((i) => hid.has(i.id)));
  const leaf = a.items.find((i) => i.type === 't'), con = RL.connected(a, leaf.id);
  ok('기술 올리기 = 위로 가는 길 + 비교군', [...con].every((id) => id === leaf.id || a.byId.get(id).type === 'g' || edges.some((e) => e.includes(leaf.id) && e.includes(id))));

  const fail = rows.filter((r) => r.결과 !== '통과').length;
  console.table(rows);
  document.getElementById('check').textContent = `자체 점검 ${rows.length - fail}/${rows.length} 통과\n${rows.map((r) => `${r.결과 === '통과' ? '○' : '✕'} ${r.점검}`).join('\n')}`;
})();
