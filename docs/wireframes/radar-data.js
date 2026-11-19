// 레이더 시안의 샘플 카탈로그. journey-data.js의 기술 13개에 분류·종류·쓰는 곳·등급을 붙이고, 시드 고정 난수로 모은 기술을 늘린다(같은 시드 = 같은 지도).
// 갈래 이름은 앱의 기본 분류(feat/P-12c-map lib/map/classify.ts CATEGORY_SEED)와 같다. 이름·숫자는 모두 샘플이다.
(() => {
  const lcg = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); // 옛 map.js와 같은 난수
  const CATS = {
    '리서치': ['웹 검색·수집', '논문·지식', '뉴스·트렌드'],
    '기획·문서': ['문서·노트', '작업·일정', '회의·협업'],
    '디자인': ['디자인 도구', '이미지·영상 생성', '3D·CAD'],
    '프론트엔드': ['브라우저 자동화', '화면·컴포넌트'],
    '백엔드·데이터': ['데이터베이스', 'API·웹훅', '데이터 분석', '파일·저장소'],
    '검사·보안': ['코드 검사·테스트', '보안·감사', '검증·서명'],
    '배포·운영': ['배포·클라우드', '서버·인프라', '모니터링·로그', 'git·이슈'],
    'AI 작업 방식': ['메모리·컨텍스트', '에이전트·오케스트레이션', '사람 확인'],
    '업무·서비스 연동': ['결제·금융', '마케팅·소셜', '커뮤니케이션', '미디어·콘텐츠', '커머스·영업'],
    '생활·정보': ['여행·장소', '건강·운동', '법·세금·공공 데이터'],
  };
  const BIG = Object.keys(CATS), UNSORTED = '분류 전';
  const BIG_W = [6, 8, 5, 5, 12, 5, 9, 9, 7, 3]; // 큰 갈래마다 기술이 얼마나 몰리는지(운영 분류 결과의 대략 비율, 팀 추정)
  const KINDS = [['MCP', 70], ['스킬', 15], ['패키지', 10], ['연동 서비스', 5]];
  const HOST = { MCP: ['Claude Code', 'Cursor', 'MCP 쓰는 도구'], 스킬: ['Claude Code'], 패키지: ['앱 코드'], '연동 서비스': ['Claude Code', 'Cursor'] };
  const KSHORT = { MCP: 'mcp', 스킬: 'skill', 패키지: 'pkg', '연동 서비스': 'svc' };
  const WORDS = ['notion', 'figma', 'postgres', 'playwright', 'slack', 'stripe', 'github', 'sentry', 'arxiv', 'canva', 'redis', 'vercel', 'linear', 'gmail', 'maps', 'weather', 'pdf', 'csv', 'docker', 'memory', 'rag', 'browser', 'scraper', 'calendar', 'youtube', 'shopify', 'drive', 'grafana', 'lint', 'audit'];

  // journey의 13개: 큰 갈래 › 세부 갈래(내 기술·보안·NEW·비교군은 journey-data.js 그대로)
  const FIX = {
    'sample-mcp-1': ['배포·운영', 'git·이슈'], 'sample-mcp-3': ['AI 작업 방식', '에이전트·오케스트레이션'], 'sample-skill-5': ['배포·운영', 'git·이슈'],
    'sample-mcp-9': ['리서치', '웹 검색·수집'], 'sample-skill-1': ['검사·보안', '코드 검사·테스트'], 'sample-mcp-7': ['검사·보안', '보안·감사'],
    'sample-svc-1': ['배포·운영', '배포·클라우드'], 'sample-pkg-2': ['백엔드·데이터', '데이터 분석'], 'sample-mcp-2': ['백엔드·데이터', '데이터베이스'],
    'sample-skill-9': ['백엔드·데이터', '데이터 분석'], 'sample-pkg-1': ['프론트엔드', '화면·컴포넌트'], 'sample-pkg-4': ['디자인', '디자인 도구'], 'sample-skill-3': ['프론트엔드', '화면·컴포넌트'],
  };
  const GRADE_OF = { d: '위험', w: '주의' };
  // "이럴 때 좋아요": 비교군끼리 고르는 기준(Product Hunt "Choose X if…" 참고, usability-review B5). 모은 기술은 아직 없음
  const GOOD_FOR = {
    'sample-mcp-1': 'GitHub 이슈·PR을 Claude Code에서 바로 다룰 때', 'sample-mcp-3': '원격 MCP 서버 여러 개를 한 곳으로 이을 때', 'sample-skill-5': '커밋 메시지를 팀 규칙에 맞춰 쓸 때',
    'sample-mcp-9': '출처가 붙은 웹 조사 요약이 필요할 때', 'sample-skill-1': '리뷰 체크리스트를 빠짐없이 돌릴 때', 'sample-mcp-7': '비밀값이 커밋되는 걸 막고 싶을 때',
    'sample-svc-1': '배포 상태와 로그를 한 화면에서 볼 때', 'sample-pkg-2': '앱 코드에서 CSV를 표로 읽을 때', 'sample-mcp-2': 'Postgres에 직접 질의할 때',
    'sample-skill-9': '데이터 정리 스크립트를 빨리 만들 때', 'sample-pkg-1': '컴포넌트를 따로 띄워 볼 때', 'sample-pkg-4': '디자인 토큰을 CSS 변수로 옮길 때', 'sample-skill-3': '화면 접근성을 점검할 때',
  };
  const pick = (r, list) => { let x = r() * list.reduce((s, [, w]) => s + w, 0); for (const [v, w] of list) if ((x -= w) < 0) return v; return list[0][0]; };

  function build(total) {
    const r = lcg(7), techs = [];
    for (const t of TR.TECH) {
      const [big, sub] = FIX[t.id];
      techs.push({ id: t.id, big, sub, kind: t.kind, host: t.host, grade: GRADE_OF[t.sec] || '통과', err: t.sec === 'e', nw: !!t.nw, mine: !!t.mine,
        project: t.mine ? 'my-app' : '', desc: t.desc, pop: t.pop, upd: t.upd });
    }
    const bigW = BIG.map((b, i) => [b, BIG_W[i]]);
    for (let i = techs.length; i < total; i++) {
      const kind = pick(r, KINDS), unsorted = r() < 0.25; // 운영은 47%가 분류 전(11-19 측정). 시안은 읽기 쉽게 25%
      const big = unsorted ? '' : pick(r, bigW), subs = big ? CATS[big] : [];
      const sub = big ? subs[Math.floor(r() * subs.length)] : '';
      const g = r(), word = WORDS[Math.floor(r() * WORDS.length)];
      techs.push({
        id: `${word}-${KSHORT[kind]}-${i}`, big, sub, kind, host: HOST[kind][Math.floor(r() * HOST[kind].length)],
        grade: g < 0.02 ? '위험' : g < 0.06 ? '주의' : g < 0.12 ? '찾지 못함' : '통과', err: r() < 0.03, nw: r() < 0.05, mine: false, project: '',
        desc: `${word} 관련 ${sub || '일'}을 도와요(샘플).`, pop: `주간 다운로드 ${Math.round(r() * 9000 + 100).toLocaleString('ko')}`, upd: `${1 + Math.floor(r() * 30)}일 전`,
      });
    }
    // 출처·라이선스(샘플 주소). 비어 있으면 화면에 "찾지 못함"(지어내지 않음, UJ-6). 다른 난수라 위 배치는 그대로
    const r2 = lcg(13), LIC = ['MIT', 'MIT', 'Apache-2.0', 'BSD-3-Clause', ''];
    techs.forEach((t) => Object.assign(t, {
      license: LIC[Math.floor(r2() * LIC.length)], repo: r2() < 0.9 ? `https://github.com/sample/${t.id}` : '',
      registry: t.kind === '패키지' ? `https://www.npmjs.com/package/${t.id}` : t.kind === 'MCP' ? `https://registry.modelcontextprotocol.io/?q=${t.id}` : '',
      advisory: t.grade === '위험' || t.grade === '주의' ? `https://osv.dev/list?q=${t.id}` : '', goodFor: GOOD_FOR[t.id] || '',
    }));
    // "내 프로젝트"에서 직접 추가·가져오기·숨김한 것(journey-project.js, 같은 탭)을 내 기술에 반영
    try {
      const pj = JSON.parse(sessionStorage.getItem('tr-proj')) || {};
      (pj.added || []).forEach((a) => { const t = techs.find((x) => x.id === a.id); if (t) t.mine = true; });
      (pj.hidden || []).forEach((id) => { const t = techs.find((x) => x.id === id); if (t) t.mine = false; });
    } catch { /* 없으면 샘플 그대로 */ }
    const byId = Object.assign(Object.create(null), Object.fromEntries(techs.map((t) => [t.id, t])));
    // 비교군: journey의 확정 쌍 + 같은 세부 갈래 안에서 드문드문(같은 역할, ADR 0015. 화면 글자는 "비교군").
    // 이유는 DB tech_relations의 quote(한 줄 근거) · made_by(seed/rule/ai/admin) · confirmed_at과 같은 모양
    const edges = TR.SAME.map((e) => [...e]), why = new Map();
    TR.SAME.forEach(([a, b], i) => why.set(`${a}|${b}`, { quote: SAME_WHY[i], by: 'admin', confirmedAt: '11월 12일', who: '관리자 확인 · 11월 12일' }));
    // 내 기술의 확인된 비교군(한 단계, IA-Q5): "내 기술과 비교군" 필터가 쓴다(ADR 0027 제안)
    TR.SAME.forEach(([a, b]) => { if (byId[a].mine) byId[b].nearMine = true; if (byId[b].mine) byId[a].nearMine = true; });
    const bySub = {};
    techs.forEach((t) => t.sub && (bySub[t.sub] ||= []).push(t.id));
    Object.values(bySub).forEach((ids) => ids.forEach((id, k) => {
      if (!k || r() >= 0.12) return;
      const a = byId[ids[k - 1]], b = byId[id];
      edges.push([a.id, b.id]);
      why.set(`${a.id}|${b.id}`, { quote: `둘 다 '${b.sub}' 일을 해요${a.kind === b.kind ? ` · 같은 종류(${b.kind})` : ''}`, by: 'rule', confirmedAt: '', who: '규칙 후보 · 아직 확인 전' });
    }));
    const none = { quote: '근거가 아직 없어요', by: 'rule', confirmedAt: '', who: '확인 전' };
    return { techs, byId, edges, why: (a, b) => why.get(`${a}|${b}`) || why.get(`${b}|${a}`) || none };
  }
  // 지도 사이드바와 기술 상세가 같이 쓰는 글
  const pathOf = (t) => `${t.big || UNSORTED} › ${t.sub || UNSORTED} · ${t.kind} · ${t.host}`;
  const SEC_TEXT = { 위험: '보안 위험: 알려진 취약점이 있어요(OSV). 위험한 버전은 적용 후보로 고를 수 없어요.', 주의: '보안 주의: 오래 고쳐지지 않은 이슈가 있어요.', '찾지 못함': '보안: 아직 등급을 찾지 못했어요.', 통과: '보안: 알려진 문제를 찾지 못했어요(안전하다는 보증은 아니에요).' };
  const ERR_TEXT = '수집 오류: 지난번 읽기에 실패했어요. "문제 없음"이 아니에요. 마지막으로 읽은 값을 그대로 둬요.';
  /** 기술 이력(샘플): 들어온 날 · 등급 변화 · 수집 오류. 판단 기록은 화면에서 합친다(AOE 항목 이력 참고, usability-review A2) */
  const historyOf = (t) => [
    t.err && ['11월 19일', '수집 오류: 읽지 못해 지난 값을 그대로 둠'],
    t.grade === '위험' && ['11월 18일', '보안 등급 주의 → 위험(새 취약점, OSV)'],
    t.grade === '주의' && ['11월 15일', '보안 등급 통과 → 주의(오래 고쳐지지 않은 이슈)'],
    t.nw ? ['이번 주', '모은 기술에 들어옴'] : ['11월 3일', '모은 기술에 들어옴'],
  ].filter(Boolean);
  /** 출처 목록: 없는 것은 url 없이(화면에 "찾지 못함") */
  const sourcesOf = (t) => [['저장소', t.repo], [t.kind === '패키지' ? 'npm' : 'MCP 레지스트리', t.registry], ['보안 근거(OSV)', t.advisory]].filter(([label, url]) => url || label === '저장소');
  const LAST_RUN = '오늘 06:00'; // 마지막 정기 수집(샘플). 앱에서는 runs 표의 마지막 실행
  const SAME_WHY = [ // journey-data.js SAME 순서대로
    '둘 다 Claude Code가 바깥 서비스(GitHub·원격 서버)에 닿게 해 줘요', '둘 다 저장소 일(이슈·PR·커밋)을 다뤄요', '둘 다 코드를 올리기 전에 문제를 찾아요(리뷰·비밀값)',
    '둘 다 표 데이터를 읽어 다뤄요(CSV·Postgres)', '둘 다 데이터베이스의 데이터를 정리·질의해요', '둘 다 화면 컴포넌트를 만들 때 써요', '둘 다 화면 컴포넌트를 확인해요(미리보기·접근성)',
  ];

  const n = Math.min(1200, Math.max(13, Number(new URLSearchParams(location.search).get('n')) || 320)); // ?n=1200 으로 많을 때를 본다
  TR.radar = { CATS, BIG, UNSORTED, lcg, pathOf, SEC_TEXT, ERR_TEXT, historyOf, sourcesOf, LAST_RUN, ...build(n) };
})();
