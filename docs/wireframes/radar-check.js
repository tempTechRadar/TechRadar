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
  ok('로그인 전에는 내 프로젝트 묶기·내 기술만 필터 안 됨', RL.parseView(P('g=project&mine=1'), false, techs).group.join() === 'field,kind' && !RL.parseView(P('mine=1'), false, techs).mine);
  ok('분류 전은 맨 뒤 + 회색', (() => { const g = a.items.filter((i) => i.level === 1); return g[g.length - 1].value === UNSORTED && g[g.length - 1].token === '--unknown'; })());
  ok('보안 등급 색: 위험 = --danger', RL.layout(techs, edges, { ...base, color: 'grade' }).legend.find((l) => l.value === '위험').token === '--danger');
  const g1 = a.items.find((i) => i.level === 1), hid = RL.hiddenOf(a, new Set([g1.id]));
  ok('접은 묶음 아래는 숨김, 묶음 자신은 보임', !hid.has(g1.id) && a.items.filter((i) => RL.isUnder(a, i, g1.id)).every((i) => hid.has(i.id)));
  const leaf = a.items.find((i) => i.type === 't'), con = RL.connected(a, leaf.id);
  ok('기술 올리기 = 위로 가는 길 + 비교군', [...con].every((id) => id === leaf.id || a.byId.get(id).type === 'g' || edges.some((e) => e.includes(leaf.id) && e.includes(id))));

  // 이 분류만 보기(scope)
  const sv = RL.parseView(P('in=field:리서치'), false, techs), SL = RL.layout(techs, edges, sv);
  ok('분류만 보기: 그 안의 기술만', SL.items.filter((i) => i.type === 't').every((i) => i.t.big === '리서치') && SL.shown === techs.filter((t) => t.big === '리서치').length);
  ok('분류만 보기: 쓴 기준은 묶기에서 빠짐(하는 일 › 종류 → 종류만)', SL.depth === 1 && SL.items.filter((i) => i.type === 'g').every((i) => i.dim === 'kind'));
  ok('분류만 보기: 주소 왕복', RL.viewParams(RL.parseView(P('in=field:리서치|kind:MCP'), false, techs)).get('in') === 'field:리서치|kind:MCP');
  ok('분류만 보기: 모르는 기준·없는 값·같은 기준 두 번은 버림', RL.parseView(P('in=evil:x|field:없는갈래|kind:MCP|kind:스킬|field'), false, techs).scope.map((s) => s.dim + s.value).join() === 'kindMCP');
  const reset = RL.parseView(P(''), false, techs);
  ok('보기 초기화 = 기본 설정(필터·분류만 보기 없음)', reset.group.join() === 'field,kind' && reset.color === 'field' && !Object.keys(reset.filter).length && !reset.scope.length && !reset.risky && !reset.nw);
  ok('비교군마다 이유가 있음', edges.every(([x, y]) => TR.radar.why(x, y).quote && TR.radar.why(x, y).who));

  // 사용성 점검 뒤 고친 것(usability-review)
  ok('수집 오류만 필터: 주소 왕복 · 오류 기술만', RL.viewParams(RL.parseView(P('err=1'), false, techs)).get('err') === '1' && RL.layout(techs, edges, RL.parseView(P('err=1'), false, techs)).items.filter((i) => i.type === 't').every((i) => i.t.err));
  ok('분류 전은 빈 점(그 밖과 모양으로 구별)', a.items.filter((i) => i.type === 't' && !i.t.big).every((i) => i.hollow) && a.items.filter((i) => i.type === 't' && i.t.big).every((i) => !i.hollow));
  ok('출처: 저장소 줄은 늘 있음(없으면 찾지 못함), 위험·주의는 보안 근거', techs.every((t) => TR.radar.sourcesOf(t)[0][0] === '저장소') && techs.filter((t) => t.grade === '위험').every((t) => t.advisory));

  const mv = RL.parseView(P('mine=1'), true, techs), ML = RL.layout(techs, edges, mv), mineIds = techs.filter((t) => t.mine).map((t) => t.id);
  ok('내 기술과 비교군: 내 기술 전부 + 확인된 비교군 한 단계만', mineIds.every((id) => ML.byId.has(id)) && ML.items.filter((i) => i.type === 't').every((i) => i.t.mine || TR.SAME.some(([x, y]) => (x === i.id && mineIds.includes(y)) || (y === i.id && mineIds.includes(x)))));

  const fail = rows.filter((r) => r.결과 !== '통과').length;
  console.table(rows);
  document.getElementById('check').textContent = `자체 점검 ${rows.length - fail}/${rows.length} 통과\n${rows.map((r) => `${r.결과 === '통과' ? '○' : '✕'} ${r.점검}`).join('\n')}`;
})();
