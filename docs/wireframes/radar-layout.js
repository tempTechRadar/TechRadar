// 보기 설정(묶기 1~3단계 · 색 · 거르기) ↔ 주소, 그리고 레이더 위 자리 정하기. 화면을 건드리지 않는 순수 함수만 둔다.
// 규칙은 앱 코드(feat/P-12c-map lib/map/view-config.ts · layout.ts)와 같다: 가운데 → 고리 1 = 1단계 묶음 → … → 맨 바깥 = 기술,
// 부채꼴 너비 ∝ √(들어 있는 기술 수), 하위 묶음은 부모 부채꼴을 나눈다. 다른 점 하나: 기술이 많으면 바깥 고리를 여러 줄로 쌓는다(앱은 3줄 번갈아).
(() => {
  const { UNSORTED } = TR.radar;
  const OTHER = '그 밖', NOT_MINE = '내 프로젝트 아님';
  const DIMS = {
    field: ['하는 일', (t) => t.big || UNSORTED], sub: ['세부 갈래', (t) => t.sub || UNSORTED], kind: ['종류', (t) => t.kind],
    host: ['쓰는 곳', (t) => t.host], grade: ['보안 등급', (t) => t.grade], project: ['내 프로젝트', (t) => t.project || NOT_MINE],
  };
  const FKEY = { field: 'ff', sub: 'fs', kind: 'fk', host: 'fh', grade: 'fg', project: 'fp' }; // 거르기 주소 이름
  const DEFAULT = { group: ['field', 'kind'], color: 'field' };
  const FIRST_RING = 110, LEVEL_GAP = 95, LEAF_GAP = 15, ROW_GAP = 16;
  const HUB_R = [0, 22, 15, 10]; // 단계마다 크기·모양: 1 육각 · 2 마름모 · 3 네모
  const GRADE_TOKENS = { 위험: '--danger', 주의: '--caution', 통과: '--pass', '찾지 못함': '--unknown' };
  const special = (v) => v === UNSORTED || v === OTHER || v === '찾지 못함' || v === NOT_MINE;
  const byValue = (a, b) => (special(a) !== special(b) ? (special(a) ? 1 : -1) : a.localeCompare(b, 'ko'));
  const val = (t, dim) => DIMS[dim][1](t);
  const dimOk = (d, login) => Object.hasOwn(DIMS, d) && (d !== 'project' || login); // 내 프로젝트는 로그인 뒤에만

  /** 주소(URLSearchParams) → 보기 설정. 모르는 이름·값은 버린다(주소는 누구나 고쳐 넣을 수 있어서 허용 목록만) */
  function parseView(p, login, techs) {
    const group = [...new Set((p.get('g') || '').split(',').filter((d) => dimOk(d, login)))].slice(0, 3);
    const v = { group: group.length ? group : [...DEFAULT.group], color: '', filter: {}, risky: p.get('risky') === '1', mine: login && p.get('mine') === '1', nw: p.get('new') === '1' };
    v.color = dimOk(p.get('c'), login) ? p.get('c') : v.group[0];
    for (const [dim, key] of Object.entries(FKEY)) {
      if (!dimOk(dim, login) || !p.get(key)) continue;
      const known = new Set(techs.map((t) => val(t, dim)));
      const vals = p.get(key).split('|').filter((x) => known.has(x));
      if (vals.length) v.filter[dim] = new Set(vals);
    }
    return v;
  }
  /** 보기 설정 → 주소 조각(기본값은 싣지 않는다) */
  function viewParams(v) {
    const p = new URLSearchParams();
    if (v.group.join() !== DEFAULT.group.join()) p.set('g', v.group.join());
    if (v.color !== v.group[0]) p.set('c', v.color);
    for (const [dim, set] of Object.entries(v.filter)) if (set.size) p.set(FKEY[dim], [...set].join('|'));
    if (v.risky) p.set('risky', '1');
    if (v.mine) p.set('mine', '1');
    if (v.nw) p.set('new', '1');
    return p;
  }
  const passes = (t, v) => (!v.risky || t.grade === '위험' || t.grade === '주의') && (!v.mine || t.mine) && (!v.nw || t.nw)
    && Object.entries(v.filter).every(([dim, set]) => !set.size || set.has(val(t, dim)));

  /** 색: 많은 값 8개까지 범주 색, 나머지는 "그 밖", 분류 전 같은 특별 값은 회색. 보안 등급은 뜻이 정해진 색 */
  function legendOf(nodes, dim) {
    const counts = new Map();
    nodes.forEach((t) => counts.set(val(t, dim), (counts.get(val(t, dim)) || 0) + 1));
    if (dim === 'grade') {
      const legend = Object.keys(GRADE_TOKENS).filter((v) => counts.has(v)).map((v) => ({ value: v, count: counts.get(v), token: GRADE_TOKENS[v] }));
      return { legend, tokenOf: (v) => GRADE_TOKENS[v] || '--unknown' };
    }
    const ranked = [...counts].filter(([v]) => !special(v)).sort((a, b) => b[1] - a[1] || byValue(a[0], b[0]));
    const colored = new Map(ranked.slice(0, 8).map(([v], i) => [v, `--cat-${i + 1}`]));
    const legend = ranked.slice(0, 8).map(([value, count]) => ({ value, count, token: colored.get(value) }));
    const rest = ranked.slice(8).reduce((s, [, c]) => s + c, 0);
    if (rest) legend.push({ value: OTHER, count: rest, token: '--unknown', rest: true });
    for (const [v, c] of counts) if (special(v)) legend.push({ value: v, count: c, token: '--unknown' });
    return { legend, tokenOf: (v) => colored.get(v) || '--unknown' };
  }

  const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  /** 보기 설정 → 묶음·기술의 제자리(home). 같은 입력이면 같은 결과 */
  function layout(techs, edges, v) {
    const kept = techs.filter((t) => passes(t, v));
    const { legend, tokenOf } = legendOf(kept, v.color);
    const items = [], depth = v.group.length, leafR = FIRST_RING + depth * LEVEL_GAP + 15;
    let maxR = leafR;
    function place(list, level, parent, a0, a1) {
      if (level > depth) {
        const sorted = [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
        const cap = Math.max(1, Math.floor(((a1 - a0) * leafR) / LEAF_GAP)), rows = Math.ceil(sorted.length / cap), per = Math.ceil(sorted.length / rows);
        sorted.forEach((t, i) => {
          const row = Math.floor(i / per), inRow = Math.min(per, sorted.length - row * per), col = i - row * per;
          const r = leafR + row * ROW_GAP + (rows === 1 && sorted.length > 1 ? (i % 2) * 18 : 0); // 한 줄이면 번갈아 내밀어 이름표가 덜 겹치게
          const [x, y] = polar(a0 + ((a1 - a0) * (col + 0.5)) / inRow, r);
          maxR = Math.max(maxR, r);
          items.push({ id: t.id, type: 't', t, parent, level, x, y, r: t.mine ? 6 : 4.5, token: tokenOf(val(t, v.color)) });
        });
        return;
      }
      const dim = v.group[level - 1], buckets = new Map();
      list.forEach((t) => { const k = val(t, dim); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(t); });
      const keys = [...buckets.keys()].sort(byValue), weight = (k) => Math.max(1, Math.sqrt(buckets.get(k).length));
      const total = keys.reduce((s, k) => s + weight(k), 0), pad = level === 1 && keys.length > 1 ? 0.04 : 0;
      let start = a0;
      for (const k of keys) {
        const span = ((a1 - a0) * weight(k)) / total, inner = buckets.get(k), id = `${parent ? parent + ' / ' : ''}${dim}=${k}`;
        const [x, y] = polar(start + span / 2, FIRST_RING + (level - 1) * LEVEL_GAP);
        items.push({
          id, type: 'g', level, dim, value: k, parent, x, y, r: HUB_R[level], count: inner.length,
          danger: inner.filter((t) => t.grade === '위험').length, caution: inner.filter((t) => t.grade === '주의').length,
          err: inner.filter((t) => t.err).length, mine: inner.filter((t) => t.mine).length, token: dim === v.color ? tokenOf(k) : null,
        });
        place(inner, level + 1, id, start + span * pad, start + span * (1 - pad));
        start += span;
      }
    }
    place(kept, 1, null, -Math.PI / 2, (3 * Math.PI) / 2);
    const byId = new Map(items.map((it) => [it.id, it]));
    return { items, byId, legend, depth, leafR, radius: maxR + 30, shown: kept.length, total: techs.length,
      edges: edges.filter(([a, b]) => byId.has(a) && byId.has(b)) };
  }

  /** 올린·고른 것과 이어진 것: 묶음이면 위로 가는 길 + 그 아래 전부, 기술이면 위로 가는 길 + 비교군 */
  function connected(L, id) {
    const out = new Set([id]), it = L.byId.get(id);
    if (!it) return out;
    for (let p = it.parent; p; p = L.byId.get(p).parent) out.add(p);
    if (it.type === 'g') L.items.forEach((x) => { if (isUnder(L, x, id)) out.add(x.id); });
    else L.edges.forEach(([a, b]) => { if (a === id) out.add(b); if (b === id) out.add(a); });
    return out;
  }
  function isUnder(L, it, gid) { for (let p = it.parent; p; p = L.byId.get(p).parent) if (p === gid) return true; return false; }
  /** 접은 묶음 아래에 있어 안 보이는 것 */
  const hiddenOf = (L, collapsed) => new Set(L.items.filter((it) => [...collapsed].some((g) => isUnder(L, it, g))).map((it) => it.id));
  /** 처음 펼침: 기술이 많으면(400 넘게) 맨 안쪽 묶음 단계를 접어 둔다 */
  const defaultCollapsed = (L) => new Set(L.shown > 400 ? L.items.filter((it) => it.type === 'g' && it.level === L.depth).map((it) => it.id) : []);

  TR.radarLayout = { DIMS, FKEY, DEFAULT, FIRST_RING, LEVEL_GAP, OTHER, val, dimOk, parseView, viewParams, passes, layout, connected, isUnder, hiddenOf, defaultCollapsed };
})();
