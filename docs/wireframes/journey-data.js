// 화면 흐름 시안의 샘플 데이터와 공용 조각. journey-board.js·journey.js가 window.TR로 함께 쓴다. 이름·숫자는 모두 샘플이다.
(() => {
  // ---- 아이콘(directions.html과 같은 한 벌, 선 굵기 1.75)
  const I = {
    danger: '<path d="M12 3.5 21.5 20h-19Z"/><path d="M12 10v4.5"/><path d="M12 17.2h.01"/>',
    caution: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.2h.01"/>',
    error: '<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/><path d="M9.6 9.6a2.4 2.4 0 1 1 3.4 2.2c-.6.3-1 .8-1 1.4v.6"/><path d="M12 17h.01"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z"/><path d="M10 19.5a2 2 0 0 0 4 0"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18.4 5.6"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>', back: '<path d="m15 6-6 6 6 6"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>',
    compare: '<path d="M8 4v16M16 4v16M4 8h4M16 16h4"/>',
    trend: '<path d="m4 16 5-5 4 4 7-7"/><path d="M15 8h5v5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  };
  const icon = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  // ---- 샘플. f = 분야(하는 일), host = 쓰는 곳, kind = 종류, tags = 하는 일 태그(여러 개), mine = 저장소에서 읽은 내 기술(쓰는 중),
  // j = 나의 판단, nw = 이번 주 들어옴(NEW), sec = 보안(d 위험 · w 주의 · e 수집 오류)
  // 분류는 한 그루 나무가 아니라 쓰는 곳 › 종류 › 분야 경로 + 태그 여러 개(한 기술이 여러 무리에 속할 수 있어서)
  const FIELDS = ['코드 작성', '검사·배포', '데이터', '화면 디자인'];
  const TAGS = ['리서치', '문서', 'git', '백엔드', '데이터베이스', '프론트엔드', '디자인', '테스트', '보안', '배포'];
  const T = (id, f, kind, host, tags, o, desc, pop, upd) => ({ id, f, kind, host, tags, ...o, desc, pop, upd });
  const TECH = [
    T('sample-mcp-1', 0, 'MCP', 'Claude Code', ['git', '문서'], { mine: true, sec: 'd', x: 92, y: -70 }, 'GitHub 저장소를 읽고 이슈·PR을 다뤄요.', '주간 다운로드 12,000 · 별 +30(7일)', '3일 전'),
    T('sample-mcp-3', 0, 'MCP', 'Claude Code', ['백엔드'], { nw: true, x: 168, y: -26 }, '원격 MCP 서버를 프록시로 이어 줘요.', '주간 다운로드 3,400 · 별 +120(7일)', '오늘'),
    T('sample-skill-5', 0, '스킬', 'Claude Code', ['git', '문서'], { j: 'int', x: 150, y: -112 }, '커밋 메시지를 팀 규칙대로 써 줘요.', '별 +40(7일)', '6일 전'),
    T('sample-mcp-9', 0, 'MCP', 'Claude Code', ['리서치', '문서'], { x: 40, y: -40 }, '웹 자료를 찾아 출처와 함께 요약해요.', '주간 다운로드 5,200', '2일 전'),
    T('sample-skill-1', 1, '스킬', 'Claude Code', ['테스트', '보안'], { mine: true, x: 80, y: 86 }, '코드 리뷰 체크리스트를 돌려요.', '별 +12(7일)', '2주 전'),
    T('sample-mcp-7', 1, 'MCP', 'Cursor', ['보안', 'git'], { nw: true, sec: 'e', x: 162, y: 112 }, '비밀값이 커밋되는지 살펴요.', '주간 다운로드 900', '어제'),
    T('sample-svc-1', 1, '연동 서비스', 'Claude Code', ['배포'], { x: 30, y: 110 }, '배포 상태와 로그를 보여 줘요.', '공식 커넥터', '1주 전'),
    T('sample-pkg-2', 2, '패키지', '앱 코드', ['데이터베이스', '백엔드'], { j: 'cand', x: -92, y: 96 }, 'CSV를 표로 읽어요.', '주간 다운로드 41,000', '1주 전'),
    T('sample-mcp-2', 2, 'MCP', 'Claude Code', ['데이터베이스', '백엔드'], { mine: true, sec: 'w', x: -150, y: 40 }, 'Postgres에 질의해요.', '주간 다운로드 8,800', '5일 전'),
    T('sample-skill-9', 2, '스킬', 'Claude Code', ['데이터베이스'], { j: 'hold', sec: 'd', x: -176, y: 120 }, '데이터 정리 스크립트를 만들어요.', '별 +3(7일)', '3달 전'),
    T('sample-pkg-1', 3, '패키지', '앱 코드', ['프론트엔드', '디자인'], { mine: true, x: -100, y: -70 }, '컴포넌트 미리보기를 띄워요.', '주간 다운로드 120,000', '4일 전'),
    T('sample-pkg-4', 3, '패키지', '앱 코드', ['디자인', '프론트엔드'], { nw: true, x: -160, y: -118 }, '디자인 토큰을 CSS 변수로 바꿔요.', '별 +260(7일)', '오늘'),
    T('sample-skill-3', 3, '스킬', 'Claude Code', ['테스트', '프론트엔드'], { x: -40, y: -128 }, '화면의 접근성 점검을 돌려요.', '별 +8(7일)', '1달 전'),
  ];
  const byId = Object.assign(Object.create(null), Object.fromEntries(TECH.map((t) => [t.id, t]))); // 주소의 "constructor" 같은 이름이 Object 속성에 닿지 않게
  // 같은 역할(관리자 확인으로 확정, ADR 0015). v1에 있는 관계는 이것뿐이라 계보·의존·경쟁 선은 그리지 않는다
  const SAME = [['sample-mcp-1', 'sample-mcp-3'], ['sample-mcp-1', 'sample-skill-5'], ['sample-skill-1', 'sample-mcp-7'], ['sample-pkg-2', 'sample-mcp-2'], ['sample-mcp-2', 'sample-skill-9'], ['sample-pkg-1', 'sample-pkg-4'], ['sample-pkg-1', 'sample-skill-3']];
  const ALERTS = [
    { id: 'a1', tech: 'sample-mcp-1', kind: '보안 경고', what: '보안 등급 주의 → 위험 (새 취약점)', fixed: '1.4.2', at: '11월 18일 10:30', status: 'wait' },
    { id: 'a2', tech: 'sample-mcp-3', kind: '적용 기회', what: '내가 쓰는 sample-mcp-1의 비교군에 새 기술', at: '11월 19일 08:10', status: 'wait' },
    { id: 'a3', tech: 'sample-pkg-2', kind: '적용 기회', what: '내가 쓰는 sample-mcp-2의 비교군', at: '11월 12일 09:00', status: 'done', result: 'cand' },
  ];
  const NEWS = [['Claude Code 새 버전', '공식 블로그 · 어제'], ['sample-mcp-1 공식 보안 공지', 'GitHub Advisory · 11월 18일']];
  const JN = { use: '쓰는 중', cand: '적용 후보', int: '관심', hold: '보류' };
  const SEC = { d: '보안 위험', w: '보안 주의', e: '수집 오류' };
  const judged = Object.fromEntries(TECH.filter((t) => t.j).map((t) => [t.id, t.j]));
  const records = [
    // rating = 그때 결과물이 마음에 들었는지(별 1~5, 0 = 아직 안 남김), note = 짧은 코멘트(사용자 11-20)
    { key: 'r1', id: 'sample-skill-5', j: 'int', why: '팀 커밋 규칙이 생기면 써 보기', at: '11월 15일', rating: 0, note: '' },
    { key: 'r2', id: 'sample-pkg-2', j: 'cand', why: 'CSV 읽기를 직접 짜는 것보다 낫다', at: '11월 12일', rating: 4, note: '큰 파일에서 조금 느렸지만 만족' },
    { key: 'r3', id: 'sample-skill-9', j: 'hold', why: '보안 위험이 풀릴 때까지 기다림', at: '11월 10일', rating: 2, note: '써 본 버전은 결과가 들쭉날쭉' },
  ];

  const stateOf = (t) => (t.mine ? 'use' : judged[t.id]);
  const secIcon = (s) => (s === 'd' ? 'danger' : s === 'w' ? 'caution' : 'error');
  function dotSvg(s, x, y, r = 6) { // 점 모양 = 나의 판단(색 없이 모양으로). 범례·목록에도 쓴다
    if (s === 'use') return `<circle cx="${x}" cy="${y}" r="${r}" class="f-ink"/>`;
    if (s === 'cand') return `<circle cx="${x}" cy="${y}" r="${r - 1}" class="s-ink" stroke-width="2"/><circle cx="${x}" cy="${y}" r="${r * 0.4}" class="f-ink"/>`;
    if (s === 'int') return `<circle cx="${x}" cy="${y}" r="${r - 0.8}" class="s-ink" stroke-width="1.6"/>`;
    if (s === 'hold') return `<circle cx="${x}" cy="${y}" r="${r - 0.8}" class="s-muted"/><path d="M${x - r * 0.6} ${y + r * 0.6}L${x + r * 0.6} ${y - r * 0.6}" class="s-muted"/>`;
    return `<circle cx="${x}" cy="${y}" r="${r * 0.6}" class="f-faint"/>`;
  }
  const dotIcon = (s) => `<svg width="16" height="16" aria-hidden="true">${dotSvg(s, 8, 8)}</svg>`;
  const path = (t) => `${t.host} › ${t.kind} › ${FIELDS[t.f]}`;
  const tagRow = (t) => t.tags.map((g) => `<span class="tag">#${g}</span>`).join('');

  window.TR = { I, icon, esc, FIELDS, TAGS, TECH, byId, SAME, ALERTS, NEWS, JN, SEC, judged, records, stateOf, secIcon, dotSvg, dotIcon, path, tagRow,
    ui: { holdFor: '', bp: [[], [], [], [], [], [], []], bpStage: 3, bpOut: 'prompt' } };
})();
