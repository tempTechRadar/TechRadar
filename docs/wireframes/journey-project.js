// "내 프로젝트" 쪽 화면 시안: 로그인·가입(IA-1·1b) → 저장소 등록(IA-2) → 내 기술 목록(IA-3, 파일별 읽기 결과 · 실행 기록 탭 IA-11)
// → 직접 추가 · 설치 프롬프트 · 내 컴퓨터 목록 가져오기(IA-22) · 설정(IA-19). 앱(/projects·/projects/install·/settings)에 있는 것을 따르고,
// 앱에서 빠진 것(프로젝트 밖 칸 늘 보임, 어느 파일이 실패했는지, 실행 기록·설치 화면 링크, <여기에 직접 입력>, 설정 문구)을 먼저 보여 준다.
// 상태는 이 탭 안(sessionStorage 'tr-proj')에만. radar-data.js도 읽어서 직접 추가·숨김이 지도의 "내 기술"에 바로 반영된다.
(() => {
  const { icon, esc, ALERTS, JN, judged, ui } = TR;
  const R = (id) => TR.radar.byId[id];
  const KEY = 'tr-proj';
  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const P = { added: [], hidden: [], runs: [], nick: '', show: true, prefs: [], read: '오늘 09:12', ...load() };
  const keep = () => { try { sessionStorage.setItem(KEY, JSON.stringify(P)); } catch { /* 못 남겨도 이 화면은 그대로 */ } };
  const OUT = '프로젝트 밖(내 컴퓨터)';

  // 저장소에서 읽은 것(샘플). .claude/skills/는 이번 읽기에서 실패 → 그 폴더의 기술은 "수집 오류 · 지난 값"(불변 2)
  const FILES = [['package.json', 'ok', '기술 1개'], ['.mcp.json', 'ok', '기술 2개'], ['.claude/skills/', 'err', '폴더를 읽지 못했어요(접근 거부). 지난번에 읽은 값을 그대로 둬요']];
  const READ = [['sample-pkg-1', 'package.json', '3.1.0'], ['sample-mcp-1', '.mcp.json', '1.4.0'], ['sample-mcp-2', '.mcp.json', '1.2.0'], ['sample-skill-1', '.claude/skills/', '']];
  const ENV = { 'sample-mcp-2': 'DATABASE_URL', 'sample-mcp-1': 'GITHUB_TOKEN', 'sample-svc-1': 'VERCEL_TOKEN' }; // 설치에 필요한 비밀값 이름(값은 받지 않음)
  const SRC = { repo: '저장소에서 읽음', manual: '직접 추가', import: '내 컴퓨터 목록 가져오기' };
  function rows() {
    const fromRepo = READ.map(([id, file, version]) => ({ id, name: id, project: 'my-app', src: 'repo', file, version, fileErr: FILES.find((f) => f[0] === file)[1] === 'err' }));
    return [...fromRepo, ...P.added].map((r) => ({ ...r, t: R(r.id), hidden: P.hidden.includes(r.id || r.name) }));
  }
  const grade = (r) => (r.t ? r.t.grade : '찾지 못함');
  const reason = (r) => (r.t ? TR.radar.SEC_TEXT[r.t.grade].replace(/^보안[^:]*: /, '') : '이름만 적은 기술이라 등급을 찾지 못했어요. 보안 경고도 오지 않아요');

  // ---- 로그인 · 가입 · 등록 (IA-1 · IA-1b · IA-2)
  function startView(step) {
    if (step === 'login') return `<h1 tabindex="-1">TechRadar 시작하기</h1><div class="box narrow">
      <p>쏟아지는 AI 개발 도구(MCP · 스킬 · 패키지)를 지도로 보고, 내 프로젝트에 쓸지 스스로 판단하게 돕는 서비스예요.</p>
      <a class="btn primary" href="#start/name">${icon('chevron', 16)}구글로 계속하기</a>
      <p class="muted">구글 이메일은 로그인에만 써요. 비밀번호·토큰은 받지 않아요. 판단·기록은 나만 보고, 다른 사람에게는 설정에서 켠 "쓰고 있어요"의 별명과 수만 보여요.</p></div>`;
    if (step === 'name') return `<h1 tabindex="-1">처음 오셨네요</h1><form class="box narrow" data-pform="name">
      <label for="nick">별명 (2자 이상, 다른 사람에게 보이는 이름)</label><input id="nick" value="${esc(P.nick || '하늘')}" minlength="2" required>
      <label class="check"><input type="checkbox" id="show" ${P.show ? 'checked' : ''}> 기술 상세의 "쓰고 있어요"에 내 별명 보이기</label>
      <p class="muted">켜 두면 내가 쓰는 기술의 상세에 "쓰고 있어요 n명"과 내 별명이 보여요. 내 프로젝트·판단·기록 내용은 누구에게도 보이지 않아요. 설정에서 언제든 끌 수 있어요.</p>
      <fieldset class="prefs"><legend>무엇을 만드세요? (건너뛰어도 돼요, 추천에만 써요)</legend>${['웹 서비스', '데이터·AI', '자동화·업무', '디자인·콘텐츠'].map((p) => `<label class="check"><input type="checkbox" name="pref" value="${p}" ${P.prefs.includes(p) ? 'checked' : ''}> ${p}</label>`).join('')}</fieldset>
      <div class="row"><button class="btn primary">시작하기</button></div></form>`;
    if (step === 'repo') return `<h1 tabindex="-1">내 프로젝트 등록</h1><p class="muted">공개 GitHub 저장소 주소를 넣으면 package.json · .mcp.json · .claude/skills/를 읽어 쓰는 기술을 찾아요. 비공개 저장소와 토큰은 받지 않아요.</p>
      <form class="box narrow" data-pform="repo" novalidate><label for="repo">공개 GitHub 저장소 주소</label><input type="url" id="repo" value="https://github.com/sample/my-app" required aria-describedby="repoMsg">
      <p class="muted" id="repoMsg" role="alert"></p><div class="row"><button class="btn primary">등록하고 읽기</button><a class="btn" href="#project">나중에</a></div>
      <p class="muted">저장소가 없어도 돼요. 노트북에 깐 도구는 "${OUT}" 칸에 직접 넣거나 목록을 가져올 수 있어요.</p></form>`;
    if (step === 'read') return `<h1 tabindex="-1">저장소를 읽었어요</h1><div class="box narrow">${filesHtml()}
      <p><b>첫 점검:</b> 위험 ${rows().filter((r) => grade(r) === '위험').length} · 주의 ${rows().filter((r) => grade(r) === '주의').length}. 읽지 못한 폴더의 기술은 "수집 오류"로 따로 보여요(문제없음이 아니에요).</p>
      <div class="row"><a class="btn primary" href="radar.html#from=start">지도에서 내 기술 보기</a><a class="btn" href="#project">내 기술 목록</a></div></div>`;
    // 로그인 전 첫 안내: 지도는 로그인 없이 누구나(사용자 11-20)
    return `<h1 tabindex="-1">기술 지도</h1><p class="note row">로그인하지 않아도 그동안 모은 기술 지도를 볼 수 있어요. 묶기·필터는 둘러보는 동안만 바뀌고 저장되지 않아요. 로그인하면 보기 설정 · 관심 · 판단이 내 계정에 남아요.
      <a class="btn primary" href="#start/login">구글로 계속하기</a><a class="btn" href="radar.html">로그인 없이 지도 보기</a></p>`;
  }
  const filesHtml = () => `<ul class="files">${FILES.map(([f, st, msg]) => `<li class="${st}">${st === 'ok' ? '읽음' : icon('error', 15) + ' 수집 오류'} · <b>${f}</b> · ${msg}</li>`).join('')}</ul>`;

  // ---- 내 기술 목록 (IA-2 · IA-3) + 실행 기록 탭(IA-11)
  const tabs = (cur) => `<nav class="tabs" aria-label="내 프로젝트">${[['', '내 기술'], ['runs', '실행 기록'], ['install', '설치 프롬프트'], ['import', '내 컴퓨터 목록 가져오기']].map(([k, n]) => `<a href="#project${k ? '/' + k : ''}" ${cur === k ? 'aria-current="page"' : ''}>${n}</a>`).join('')}</nav>`;
  function projectView(tab) {
    if (tab === 'runs') return runsView();
    if (tab === 'install') return installView();
    if (tab === 'import') return importView();
    if (tab === 'add') return addView();
    const all = rows(), showHidden = ui.showHidden, list = all.filter((r) => showHidden || !r.hidden), hiddenN = all.filter((r) => r.hidden).length;
    const group = (name, head) => { const l = list.filter((r) => r.project === name); return `<section class="box proj"><div class="row phead">${head}</div>
      ${l.length ? `<table><thead><tr><th>기술</th><th>보안</th><th>출처</th><th></th></tr></thead><tbody>${l.map(rowHtml).join('')}</tbody></table>`
        : `<p class="muted">아직 없어요. 노트북에 전역으로 깐 MCP·스킬을 여기에 넣어 두면 저장소 밖 것도 함께 지켜봐요.</p>`}
      ${name === OUT ? `<div class="row"><a class="btn" href="#project/add">직접 추가</a><a class="btn" href="#project/import">내 컴퓨터 목록 가져오기</a></div>` : ''}</section>`; };
    const reading = ui.reading;
    return `<h1 tabindex="-1">내 프로젝트</h1>${tabs('')}
      <div class="row tools"><label class="check"><input type="checkbox" data-pa="showHidden" ${showHidden ? 'checked' : ''}> 숨긴 기술도 보기(${hiddenN})</label><span class="grow"></span><a class="btn" href="#start/repo">+ 프로젝트 등록</a><a class="btn" href="#project/add">직접 추가</a></div>
      ${group('my-app', `<h2>my-app</h2><a class="muted" href="https://github.com/sample/my-app" target="_blank" rel="noopener">github.com/sample/my-app</a><span class="grow"></span>
        <span class="muted" aria-live="polite">${reading ? '읽는 중… 길면 몇 분 걸려요. 다른 화면에 가도 돼요' : `마지막으로 읽음 ${P.read}`}</span><button class="btn" data-pa="reread" ${reading ? 'disabled' : ''}>${reading ? '읽는 중' : '다시 읽기'}</button>`)}
      <details class="box filesbox" ${FILES.some((f) => f[1] === 'err') ? 'open' : ''}><summary>my-app에서 읽은 파일 ${FILES.length}개 · 실패 ${FILES.filter((f) => f[1] === 'err').length}</summary>${filesHtml()}<p class="muted"><a href="#project/runs">실행 기록에서 단계별로 보기</a></p></details>
      ${group(OUT, `<h2>${OUT}</h2><span class="muted">저장소 없이 내가 넣는 칸(자동으로 있어요)</span>`)}`;
  }
  function rowHtml(r) {
    const g = grade(r), key = r.id || r.name, mark = g === '위험' ? icon('danger', 14) : g === '주의' ? icon('caution', 14) : '';
    return `<tr class="${r.hidden ? 'hid' : ''}"><td>${r.t ? `<a href="#tech/${encodeURIComponent(r.id)}">${esc(r.name)}</a>` : `<b>${esc(r.name)}</b>`}${r.version ? ` <span class="muted">${esc(r.version)}</span>` : ''}${r.t ? '' : '<div class="muted">지도에는 관리자 분류 확인 뒤에 올라가요</div>'}</td>
      <td>${mark} <b>${g}</b>${r.fileErr ? ` <span class="tag strong">${icon('error', 12)} 수집 오류</span>` : ''}<div class="muted">${esc(reason(r))}${r.fileErr ? ' 이번에 이 파일을 읽지 못해 지난 값이에요.' : ''}</div></td>
      <td>${SRC[r.src]}${r.file ? ` · ${r.file}` : ''}<div class="muted">${r.src === 'repo' ? P.read : '방금'}${r.hidden ? ' · 직접 숨김' : ''}</div></td>
      <td>${r.hidden ? `<button class="btn sm" data-pa="unhide" data-key="${esc(key)}">되돌리기</button>` : `<button class="btn sm" data-pa="hide" data-key="${esc(key)}">숨기기</button>`}</td></tr>`;
  }
  function runsView() { // 앱에서는 실제 runs · run_steps를 그린다(불변 6). 시안은 샘플임을 밝힌다
    const runs = [...P.runs, { at: '오늘 09:12', by: '다시 읽기', st: '일부 실패', secs: '4.2초', n: 4 }, { at: '11월 18일 14:03', by: '처음 등록', st: '성공', secs: '5.1초', n: 4 }];
    return `<h1 tabindex="-1">내 프로젝트</h1>${tabs('runs')}<p class="muted">내 저장소를 읽은 기록이에요(샘플). 앱에서는 실제 실행 기록에서 그려요.</p>
      <ul class="list">${runs.map((r, i) => `<li><div><b>${r.at}</b> · ${r.by} · <span class="tag${r.st === '성공' ? '' : ' strong'}">${r.st}</span> <span class="muted">${r.secs} · 기술 ${r.n}개 읽음</span>
        ${i === 0 || r.st !== '성공' ? `<ol class="steps">${[['저장소 받기', 'ok'], ...FILES.map(([f, st]) => [f + ' 읽기', st]), ['등급 붙이기', 'ok']].map(([s, st]) => `<li class="${st}">${st === 'ok' ? '✓' : '✕'} ${s}${st === 'err' ? ' — 접근 거부(지난 값 유지)' : ''}</li>`).join('')}</ol>` : ''}</div></li>`).join('')}</ul>`;
  }

  // ---- 직접 추가 (IA-3): 모은 기술에서 찾아 고르기, 없으면 이름만
  function addView() {
    const q = ui.addQ || '', hits = q.trim().length >= 2 ? TR.radar.techs.filter((t) => (t.id + ' ' + t.desc).toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
    return `<h1 tabindex="-1">기술 직접 추가</h1><p class="muted">저장소에 없는 것(노트북에 깐 MCP·스킬 등)을 넣어요. 모은 기술에서 고르면 등급이 붙고, 이름만 쓰면 "찾지 못함"이에요.</p>
      <form class="box narrow" data-pform="add"><label for="addQ">모은 기술에서 찾기 (두 글자 이상)</label><input id="addQ" value="${esc(q)}" autocomplete="off">
      <fieldset class="hits"><legend class="sr">찾은 기술</legend>${q.trim().length < 2 ? '<p class="muted">이름 일부나 하는 일로 찾아요.</p>' : hits.length ? hits.map((t, i) => `<label class="check"><input type="radio" name="pick" value="${esc(t.id)}" ${i === 0 ? 'checked' : ''}> <b>${esc(t.id)}</b> <span class="muted">${esc(TR.radar.pathOf(t))} · ${t.grade}</span></label>`).join('')
        : `<p class="muted">모은 기술에서 찾지 못했어요. 아래 "이름만 넣기"로 적어 둘 수 있어요.</p>`}<label class="check"><input type="radio" name="pick" value="" ${hits.length ? '' : 'checked'}> 이름만 넣기: <b>${esc(q) || '(찾기 칸의 글)'}</b></label></fieldset>
      <label for="addTo">넣을 곳</label><select id="addTo"><option>${OUT}</option><option>my-app</option></select>
      <label for="addVer">버전 (몰라도 돼요)</label><input id="addVer" placeholder="예: 1.2.0">
      <div class="row"><button class="btn primary">넣기</button><a class="btn" href="#project">취소</a></div></form>`;
  }

  // ---- 설치 프롬프트 (IA-22 ①): 정해진 틀, 위험한 버전은 어떤 경우에도 빠짐, 비밀값은 <여기에 직접 입력>
  // 넣을 수 있는 것은 정해진 세 출처뿐(SPEC-4.3): 저장소에서 읽은 것 · 값 검사를 통과한 가져오기 · 공식 이름과 같은 카탈로그의 적용 후보
  function candidates() {
    const mine = rows().filter((r) => !r.hidden && r.t && (r.src === 'repo' || r.src === 'import'));
    const candIds = Object.keys(judged).filter((id) => judged[id] === 'cand' && R(id) && !mine.some((r) => r.id === id));
    return [...mine.map((r) => ({ t: r.t, version: r.version, why: SRC[r.src] })), ...candIds.map((id) => ({ t: R(id), version: '', why: '적용 후보(공식 이름과 같은 카탈로그)' }))];
  }
  /** 고를 수 없는 것과 이유(앱은 개수만 보여 줘서 무엇이 빠졌는지 몰랐다) */
  function notAllowed(list) {
    return rows().filter((r) => !r.hidden && !list.some((c) => c.t.id === r.id)).map((r) => [r.name, !r.t ? '모은 기술과 맞지 않아 이름만 있음' : '직접 추가한 것은 정해진 세 출처가 아님(적용 후보로 판단하면 들어가요)']);
  }
  function fixedFor(t) { const a = ALERTS.find((x) => x.tech === t.id && x.kind === '보안 경고' && x.status === 'done' && x.result === 'cand'); return a ? a.fixed : ''; }
  function installView() {
    const list = candidates(), sel = ui.installSel || new Set(list.map((c) => c.t.id));
    ui.installSel = sel;
    const ok = list.filter((c) => sel.has(c.t.id) && (c.t.grade !== '위험' || fixedFor(c.t)));
    const out = [...list.filter((c) => c.t.grade === '위험' && !fixedFor(c.t)).map((c) => [c.t.id, '위험한 버전']), ...notAllowed(list)];
    const line = (c, i) => { const v = c.t.grade === '위험' ? fixedFor(c.t) : c.version, env = ENV[c.t.id];
      return `${i + 1}. ${c.t.id}${v ? ` ${v}` : ''} (${c.t.kind}) — ${c.t.kind === '스킬' ? '.claude/skills/에 넣기' : c.t.kind === '패키지' ? 'package.json 의존성에 넣기' : '.mcp.json에 추가'}${env ? `\n   환경변수 ${env}=<여기에 직접 입력>` : ''}`; };
    const prompt = `아래 기술을 이 컴퓨터에 설치해 줘. 하나씩, 매번 나에게 확인받고 진행해. 비밀값은 <여기에 직접 입력> 자리에 내가 직접 넣을게.\n\n${ok.map(line).join('\n') || '(고른 기술이 없어요)'}\n\n(TechRadar가 정해진 틀로 만든 글이에요. 실행은 사용자가 확인하며 해요.)`;
    return `<h1 tabindex="-1">내 프로젝트</h1>${tabs('install')}<p class="muted">새 컴퓨터로 옮길 기술을 골라 Claude Code에 붙여 넣을 글을 만들어요. TechRadar는 설치하지 않아요.</p>
      <div class="cols"><div class="box"><h2>옮길 기술</h2><ul class="near">${list.map((c) => { const risky = c.t.grade === '위험', fx = risky && fixedFor(c.t);
        return `<li><label class="check"><input type="checkbox" data-pa="isel" value="${esc(c.t.id)}" ${sel.has(c.t.id) && (!risky || fx) ? 'checked' : ''} ${risky && !fx ? 'disabled' : ''}> <b>${esc(c.t.id)}</b> <span class="muted">${c.why}</span></label>
          ${risky ? `<div class="muted">${icon('danger', 14)} ${fx ? `위험한 버전 대신 고친 버전 ${fx}로 넣어요(보안 경고에서 고른 것)` : '위험한 버전이라 넣지 않아요. 고친 버전이 나오면 알림에서 고를 수 있어요'}</div>` : ''}</li>`; }).join('')}</ul></div>
        <div class="box"><h2>만든 글</h2><label class="sr" for="iprompt">설치 프롬프트</label><textarea id="iprompt" class="prompt" readonly rows="12">${esc(prompt)}</textarea>
          <div class="row"><button class="btn primary" data-pa="copy" data-target="iprompt">복사하기</button></div>
          ${out.length ? `<h3>넣지 못한 것 ${out.length}</h3><ul class="near">${out.map(([n, why]) => `<li><b>${esc(n)}</b> <span class="muted">${why}</span></li>`).join('')}</ul>` : ''}</div></div>`;
  }

  // ---- 내 컴퓨터 목록 가져오기 (IA-22 ②): 가져오기 글 → 붙여 넣기 → 미리보기 → 확인하고 저장. 비밀값처럼 보이는 줄은 저장하지 않음
  const IMPORT_PROMPT = '이 컴퓨터에 깐 MCP 서버와 Claude Code 스킬의 이름과 버전만 한 줄에 하나씩 "이름@버전" 꼴로 적어 줘. 설정값·토큰·비밀번호는 적지 마.';
  const SECRET = /(token|secret|password|passwd|api[_-]?key)\s*[:=]|sk-[a-z0-9]{8,}|ghp_[a-z0-9]{8,}/i;
  function parseImport(text) {
    return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      if (SECRET.test(l)) return { l, kind: 'secret' };
      const m = l.match(/^([\w@./:-]+?)(?:@([\w.-]+))?$/);
      if (!m) return { l, kind: 'bad' };
      const t = TR.radar.techs.find((x) => x.id.toLowerCase() === m[1].toLowerCase());
      return { l, kind: 'ok', name: m[1], version: m[2] || '', t };
    });
  }
  function importView() {
    const parsed = ui.importText ? parseImport(ui.importText) : null, ok = parsed ? parsed.filter((p) => p.kind === 'ok') : [];
    return `<h1 tabindex="-1">내 프로젝트</h1>${tabs('import')}<p class="muted">노트북에 전역으로 깐 것을 한 번에 "${OUT}" 칸으로 가져와요.</p>
      <div class="cols"><div class="box"><h2>1. 이 글을 내 Claude Code에 붙여 넣기</h2><label class="sr" for="iget">가져오기 글</label><textarea id="iget" class="prompt" readonly rows="4">${IMPORT_PROMPT}</textarea>
        <div class="row"><button class="btn" data-pa="copy" data-target="iget">가져오기 글 복사</button></div>
        <h2>2. 나온 목록을 여기에 붙여 넣기</h2><label class="sr" for="ipaste">가져온 목록</label><textarea id="ipaste" rows="6" placeholder="sample-mcp-9@0.4.1&#10;notion-mcp-266">${esc(ui.importText || '')}</textarea>
        <div class="row"><button class="btn" data-pa="preview">미리보기</button></div></div>
      <div class="box"><h2>3. 확인하고 저장</h2>${!parsed ? '<p class="muted">미리보기를 누르면 받을 줄과 뺄 줄을 나눠 보여 줘요. 저장하기 전에는 아무것도 바뀌지 않아요.</p>' : `
        <h3>받을 줄 ${ok.length}</h3><ul class="near">${ok.map((p) => `<li>${esc(p.name)}${p.version ? ' ' + esc(p.version) : ''} <span class="muted">${p.t ? '모은 기술과 맞음 · ' + p.t.grade : '이름만(등급 찾지 못함)'}</span></li>`).join('') || '<li class="muted">없어요</li>'}</ul>
        ${['bad', 'secret'].map((k) => { const l = parsed.filter((p) => p.kind === k); return l.length ? `<h3>${k === 'bad' ? '형식이 틀려 뺀 줄' : '비밀값처럼 보여 뺀 줄(저장 안 함)'} ${l.length}</h3><ul class="near">${l.map((p) => `<li class="muted">${k === 'secret' ? esc(p.l.slice(0, 12)) + '…' : esc(p.l)}</li>`).join('')}</ul>` : ''; }).join('')}
        <div class="row"><button class="btn primary" data-pa="importSave" ${ok.length ? '' : 'disabled'}>확인하고 "${OUT}"에 저장</button></div>`}</div></div>`;
  }

  // ---- 설정 (IA-19): 가입 때와 같은 문구(앱은 두 곳 문구가 달라 헷갈렸다)
  const settingsView = () => `<h1 tabindex="-1">설정</h1><form class="box narrow" data-pform="settings">
      <label for="nick">별명</label><input id="nick" value="${esc(P.nick || '하늘')}" minlength="2" required>
      <label class="check"><input type="checkbox" id="show" ${P.show ? 'checked' : ''}> 기술 상세의 "쓰고 있어요"에 내 별명 보이기</label>
      <p class="muted">켜 두면 내가 쓰는 기술의 상세에 "쓰고 있어요 n명"과 내 별명이 보여요. 끄면 수에서도 빠져요. 내 프로젝트·판단·기록 내용은 켜도 끄도 누구에게도 보이지 않아요.</p>
      <fieldset class="prefs"><legend>무엇을 만드세요? (추천에만 써요)</legend>${['웹 서비스', '데이터·AI', '자동화·업무', '디자인·콘텐츠'].map((p) => `<label class="check"><input type="checkbox" name="pref" value="${p}" ${P.prefs.includes(p) ? 'checked' : ''}> ${p}</label>`).join('')}</fieldset>
      <div class="row"><button class="btn primary">저장</button></div></form>`;

  // ---- 동작
  const say = (m) => TR.say(m), go = (h) => { location.hash = h; }, again = (sel) => { TR.render(); if (sel) document.querySelector(sel)?.focus(); };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-pa]'); if (!el) return;
    const a = el.dataset.pa;
    if (a === 'hide' || a === 'unhide') { const k = el.dataset.key; P.hidden = a === 'hide' ? [...P.hidden, k] : P.hidden.filter((x) => x !== k); keep(); say(a === 'hide' ? `${k}를 숨겼어요. 다시 읽어도 되살아나지 않아요. 지도에서도 내 기술에서 빠져요.` : `${k}를 되돌렸어요.`); again('[data-pa="showHidden"]'); }
    if (a === 'reread') { ui.reading = true; again(); setTimeout(() => { ui.reading = false; P.read = '방금'; P.runs.unshift({ at: '방금', by: '다시 읽기', st: '일부 실패', secs: '3.9초', n: 4 }); keep(); say('다시 읽었어요. .claude/skills/는 이번에도 읽지 못해 지난 값을 그대로 둬요.'); if (location.hash === '#project') again('[data-pa="reread"]'); }, 1500); }
    if (a === 'copy') { const ta = document.getElementById(el.dataset.target); ta.select(); (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).then(() => say('복사했어요. Claude Code에 붙여 넣으세요.'), () => { document.execCommand('copy'); say('복사했어요. 안 되면 글을 직접 골라 복사하세요.'); }); }
    if (a === 'preview') { ui.importText = document.getElementById('ipaste').value; again('[data-pa="importSave"]'); }
    if (a === 'importSave') { const ok = parseImport(ui.importText).filter((p) => p.kind === 'ok'); ok.forEach((p) => P.added.push({ id: p.t ? p.t.id : '', name: p.name, version: p.version, project: OUT, src: 'import' })); keep(); ui.importText = ''; say(`${ok.length}개를 "${OUT}"에 저장했어요. 비밀값처럼 보인 줄은 저장하지 않았어요.`); go('#project'); }
  });
  document.addEventListener('change', (e) => {
    const a = e.target.dataset.pa;
    if (a === 'showHidden') { ui.showHidden = e.target.checked; again('[data-pa="showHidden"]'); }
    if (a === 'isel') { const s = ui.installSel; if (e.target.checked) s.add(e.target.value); else s.delete(e.target.value); again(`[data-pa="isel"][value="${CSS.escape(e.target.value)}"]`); }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'addQ') { ui.addQ = e.target.value; clearTimeout(ui.addT); ui.addT = setTimeout(() => { again('#addQ'); const q = document.getElementById('addQ'); q.setSelectionRange(q.value.length, q.value.length); }, 250); } });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-pform]'); if (!f) return;
    e.preventDefault();
    const kind = f.dataset.pform, prefs = [...f.querySelectorAll('[name=pref]:checked')].map((x) => x.value);
    if (kind === 'name' || kind === 'settings') {
      const nick = f.querySelector('#nick').value.trim();
      if (nick.length < 2) return say('별명은 2자 이상이에요.');
      Object.assign(P, { nick, show: f.querySelector('#show').checked, prefs }); keep();
      if (kind === 'name') { try { sessionStorage.setItem('radar-login', '1'); } catch { /* 시안: 로그인한 척 */ } say(`반가워요, ${nick}님. 저장소를 등록하면 내 기술이 지도에 표시돼요.`); go('#start/repo'); } else say('저장했어요.');
    }
    if (kind === 'repo') {
      const v = f.querySelector('#repo').value.trim(), msg = f.querySelector('#repoMsg');
      if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(v)) { msg.textContent = '주소 형식이 맞지 않아요. https://github.com/소유자/저장소 꼴로 넣어 주세요.'; return; }
      if (/private|secret/i.test(v)) { msg.textContent = '비공개이거나 없는 저장소예요. 공개 저장소만 읽을 수 있어요(토큰은 받지 않아요).'; return; }
      go('#start/read');
    }
    if (kind === 'add') {
      const pick = f.querySelector('[name=pick]:checked')?.value ?? '', q = (ui.addQ || '').trim(), version = f.querySelector('#addVer').value.trim(), project = f.querySelector('#addTo').value;
      if (!pick && q.length < 2) return say('찾기 칸에 이름을 두 글자 이상 적어 주세요.');
      const t = pick && R(pick), name = t ? t.id : q;
      if (rows().some((r) => (r.id || r.name) === name && r.project === project)) return say(`${name}는 이미 ${project}에 있어요.`); // 같은 것 두 번 안 넣음(불변 3)
      P.added.push({ id: t ? t.id : '', name, version, project, src: 'manual' }); keep(); ui.addQ = '';
      say(t ? `넣었어요: ${name}. 지도에서도 내 기술로 보여요.` : `이름만 넣었어요: ${name}. 등급은 "찾지 못함"이고 관리자 분류 확인 뒤 지도에 올라가요.`); go('#project');
    }
  });

  Object.assign(TR.views ||= {}, { start: startView, project: projectView, settings: settingsView });
})();
