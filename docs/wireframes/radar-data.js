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
    const byId = Object.assign(Object.create(null), Object.fromEntries(techs.map((t) => [t.id, t])));
    // 비교군: journey의 확정 쌍 + 같은 세부 갈래 안에서 드문드문(같은 역할, ADR 0015. 화면 글자는 "비교군").
    // 이유는 DB tech_relations의 quote(한 줄 근거) · made_by(seed/rule/ai/admin) · confirmed_at과 같은 모양
    const edges = TR.SAME.map((e) => [...e]), why = new Map();
    TR.SAME.forEach(([a, b], i) => why.set(`${a}|${b}`, { quote: SAME_WHY[i], by: 'admin', confirmedAt: '11월 12일', who: '관리자 확인 · 11월 12일' }));
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
  const SAME_WHY = [ // journey-data.js SAME 순서대로
    '둘 다 Claude Code가 바깥 서비스(GitHub·원격 서버)에 닿게 해 줘요', '둘 다 저장소 일(이슈·PR·커밋)을 다뤄요', '둘 다 코드를 올리기 전에 문제를 찾아요(리뷰·비밀값)',
    '둘 다 표 데이터를 읽어 다뤄요(CSV·Postgres)', '둘 다 데이터베이스의 데이터를 정리·질의해요', '둘 다 화면 컴포넌트를 만들 때 써요', '둘 다 화면 컴포넌트를 확인해요(미리보기·접근성)',
  ];

  const n = Math.min(1200, Math.max(13, Number(new URLSearchParams(location.search).get('n')) || 320)); // ?n=1200 으로 많을 때를 본다
  TR.radar = { CATS, BIG, UNSORTED, lcg, pathOf, SEC_TEXT, ERR_TEXT, ...build(n) };
})();
