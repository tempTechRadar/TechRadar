// 블루프린트 시안: 단계 블록을 고르고(템플릿·추천·인터뷰), 끌어서 순서를 바꾸고, 같은 열에 나란히 놓아 갈래(병렬)를 만들고, 기술을 붙여 글로 내보낸다.
// 확정하면 "내 이력"에 쌓여 다음에 만들 때 자주 쓴 기술·조합을 보여 준다. 앱은 AI를 부르지 않는다(메타프롬프트는 사용자가 자기 Claude에 붙여 넣음).
(() => {
  const { TECH, byId, JN, stateOf, esc } = TR;
  // ---- 단계 지식(샘플): 단계마다 맞는 태그, 다음에 흔히 오는 단계, 나란히 하기 좋은 단계
  const STAGE_TAGS = { 문제정의: ["리서치", "문서"], 리서치: ["리서치"], "솔루션 후보": ["리서치"], 기획: ["문서"], 디자인: ["디자인", "프론트엔드"], 프론트엔드: ["프론트엔드", "디자인"], 백엔드: ["백엔드", "데이터베이스"], 개발: ["백엔드", "데이터베이스", "git", "프론트엔드"], 테스트: ["테스트"], "코드 리뷰": ["테스트", "git", "보안"], QA: ["테스트", "보안"], 문서화: ["문서"], 배포: ["배포", "git"], 모니터링: ["배포", "보안"], 회고: ["문서"] };
  const NEXT = { 문제정의: ["리서치", "기획"], 리서치: ["기획", "솔루션 후보"], "솔루션 후보": ["기획"], 기획: ["디자인", "개발", "백엔드"], 디자인: ["프론트엔드", "개발"], 프론트엔드: ["테스트", "QA"], 백엔드: ["테스트", "QA"], 개발: ["테스트", "코드 리뷰"], 테스트: ["QA", "배포"], "코드 리뷰": ["QA", "배포"], QA: ["배포", "문서화"], 문서화: ["배포"], 배포: ["모니터링", "회고"], 모니터링: ["회고"], 회고: [] };
  const SIDE = { 디자인: ["백엔드"], 프론트엔드: ["백엔드"], 백엔드: ["프론트엔드", "디자인"], 테스트: ["코드 리뷰"], "코드 리뷰": ["테스트"], QA: ["문서화"], 문서화: ["QA"], 개발: ["문서화"] };
  const TEMPLATES = [
    { name: "초보자 기본 개발 단계", desc: "처음이라면 이 순서를 추천해요", cols: [["문제정의"], ["기획"], ["디자인"], ["개발"], ["테스트"], ["배포"]] },
    { name: "빠른 시제품", desc: "아이디어를 빨리 만들어 볼 때", cols: [["기획"], ["개발"], ["배포"]] },
    { name: "팀 프로젝트(나란히)", desc: "디자인과 백엔드를 동시에", cols: [["문제정의"], ["기획"], ["디자인", "백엔드"], ["프론트엔드"], ["QA"], ["배포"]] },
  ];
  // ---- 내 이력(샘플): 확정한 블루프린트. 여기서 기술별 쓴 횟수·프로젝트를 센다
  const HISTORY = [
    { name: "TechRadar 1차", project: "TechRadar", at: "11월 10일", cols: [["문제정의"], ["기획"], ["개발"], ["QA"], ["배포"]], techs: { 개발: ["sample-mcp-2", "sample-pkg-1"], QA: ["sample-skill-1"], 배포: ["sample-svc-1"] } },
    { name: "사이드 프로젝트", project: "my-app", at: "11월 2일", cols: [["기획"], ["개발"], ["테스트"], ["배포"]], techs: { 개발: ["sample-mcp-2"], 테스트: ["sample-skill-1", "sample-skill-3"] } },
  ];
  let seq = 0;
  const S = (name, techs = []) => ({ id: `s${++seq}`, name, techs: [...techs] });
  const fromCols = (cols, techs = {}) => cols.map((c) => c.map((n) => S(n, techs[n] ?? [])));
  let bp = fromCols(TEMPLATES[0].cols);
  const ui = { tab: "tech", focus: null, undo: null, iv: null, out: "prompt" };
  const lanes = document.getElementById("lanes"), dlg = document.getElementById("dlg");
  let toastT;
  const say = (m) => { const t = document.getElementById("toast"); t.textContent = m; clearTimeout(toastT); toastT = setTimeout(() => (t.textContent = ""), 3500); };
  const all = () => bp.flat();
  const find = (id) => { for (let c = 0; c < bp.length; c++) { const r = bp[c].findIndex((s) => s.id === id); if (r >= 0) return { c, r, s: bp[c][r] }; } return null; };
  const usage = () => {
    const u = new Map();
    for (const h of HISTORY) for (const [stage, ids] of Object.entries(h.techs)) for (const id of ids) {
      const x = u.get(id) ?? { n: 0, projects: new Set(), stages: new Set() };
      x.n += 1; x.projects.add(h.project); x.stages.add(stage); u.set(id, x);
    }
    return u;
  };
  const tidy = () => { bp = bp.filter((c) => c.length); };

  // ---- 추천: 틈(gap i = i번째 열 앞)에 넣을 단계, 같은 열에 나란히 넣을 단계
  function recFor(gap) {
    const have = new Set(all().map((s) => s.name)), before = bp[gap - 1] ?? [], after = bp[gap] ?? [];
    const prevOf = (n) => Object.keys(NEXT).filter((k) => NEXT[k].includes(n));
    const pool = gap === 0 && !before.length ? ["문제정의", "기획", "리서치"] : [...before.flatMap((s) => NEXT[s.name] ?? []), ...after.flatMap((s) => prevOf(s.name))];
    return [...new Set(pool)].filter((n) => !have.has(n)).slice(0, 4);
  }
  const recSide = (c) => [...new Set(bp[c].flatMap((s) => SIDE[s.name] ?? []))].filter((n) => !all().some((s) => s.name === n)).slice(0, 3);

  // ---- 판 그리기
  function stageCard(s, c, r) {
    const chips = s.techs.map((id) => `<span class="chip">${id}<button data-act="untech" data-stage="${s.id}" data-val="${id}" aria-label="${s.name}에서 ${id} 빼기">✕</button></span>`).join("") || '<span class="muted">기술을 끌어 오거나 서랍에서 "넣기"</span>';
    return `<article class="stage" draggable="true" data-stage="${s.id}" aria-label="${c + 1}번째 단계 ${esc(s.name)}${bp[c].length > 1 ? `, ${bp[c].length}개와 나란히` : ""}">
      <header><button class="btn sm" data-act="focus" data-val="${s.id}" aria-pressed="${ui.focus === s.id}" title="이 단계에 맞는 기술만 서랍에">${c + 1}</button><b>${esc(s.name)}</b>
        <button class="btn sm" data-act="rename" data-val="${s.id}" aria-label="${esc(s.name)} 이름 바꾸기">✎</button><button class="btn sm" data-act="del" data-val="${s.id}" aria-label="${esc(s.name)} 빼기">✕</button></header>
      <div class="slots" data-stage="${s.id}">${chips}</div>
      <div class="moves" aria-label="끌지 않고 옮기기">
        <button class="btn sm" data-act="mv" data-val="${s.id}" data-d="-1" ${c === 0 && bp[c].length === 1 ? "disabled" : ""} aria-label="앞 단계로">←</button>
        <button class="btn sm" data-act="mv" data-val="${s.id}" data-d="1" ${c === bp.length - 1 && bp[c].length === 1 ? "disabled" : ""} aria-label="뒤 단계로">→</button>
        <button class="btn sm" data-act="ud" data-val="${s.id}" data-d="-1" ${r === 0 ? "disabled" : ""} aria-label="위로">↑</button>
        <button class="btn sm" data-act="ud" data-val="${s.id}" data-d="1" ${r === bp[c].length - 1 ? "disabled" : ""} aria-label="아래로">↓</button>
        ${bp[c].length > 1 ? `<button class="btn sm" data-act="split" data-val="${s.id}" title="나란히에서 떼어 바로 뒤 단계로">떼기</button>` : ""}</div></article>`;
  }
  function render() {
    const gap = (i) => `<div class="gap" data-gap="${i}"><button class="btn" data-act="gap" data-val="${i}" aria-label="${i}번째와 ${i + 1}번째 사이에 단계 넣기">+</button></div>`;
    lanes.innerHTML = `<svg class="wires" id="wires" aria-hidden="true"></svg><div class="start" id="nStart">시작</div>${gap(0)}${bp.map((col, c) => `<section class="col" data-col="${c}" aria-label="${c + 1}번째 열">${col.map((s, r) => stageCard(s, c, r)).join("")}
      <button class="btn sm addpar" data-act="par" data-val="${c}">+ 나란히</button></section>${gap(c + 1)}`).join("")}<div class="end" id="nEnd">끝</div>`;
    drawer(); requestAnimationFrame(wires);
    document.getElementById("undoBtn")?.toggleAttribute("hidden", !ui.undo);
  }
  // 열 사이 선: 앞 열의 모든 단계 → 다음 열의 모든 단계(나란히 갈라졌다 모이는 모양)
  function wires() {
    const svg = document.getElementById("wires"), base = lanes.getBoundingClientRect();
    const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left - base.left, r: r.right - base.left, y: r.top - base.top + r.height / 2 }; };
    const cols = [[document.getElementById("nStart")], ...bp.map((col) => col.map((s) => lanes.querySelector(`.stage[data-stage="${s.id}"]`))), [document.getElementById("nEnd")]];
    let d = "";
    for (let i = 0; i < cols.length - 1; i++) for (const a of cols[i]) for (const b of cols[i + 1]) {
      const p = box(a), q = box(b), m = (p.r + q.l) / 2;
      d += `M${p.r} ${p.y} C${m} ${p.y} ${m} ${q.y} ${q.l} ${q.y} `;
    }
    svg.setAttribute("width", lanes.scrollWidth); svg.setAttribute("height", lanes.scrollHeight);
    svg.innerHTML = `<path d="${d}"/>`;
  }

  // ---- 서랍: 기술(고른 단계에 맞는 것, 자주 쓴 순) / 내 이력(확정한 블루프린트·자주 쓴 기술)
  function drawer() {
    const el = document.getElementById("drawer"), u = usage();
    document.querySelectorAll('[data-act="tab"]').forEach((b) => b.setAttribute("aria-pressed", b.dataset.val === ui.tab));
    if (ui.tab === "hist") {
      el.innerHTML = `<h2>확정한 블루프린트 ${HISTORY.length}</h2><ul class="techs hist">${HISTORY.map((h, i) => `<li class="tech"><b>${esc(h.name)}</b> <span class="muted">${esc(h.project)} · ${h.at}</span>
        <div class="muted">${h.cols.map((c) => c.join(" + ")).join(" → ")}</div><button class="btn sm" data-act="load" data-val="${i}">불러오기</button></li>`).join("")}</ul>
        <h2 style="margin-top:14px">자주 쓴 기술</h2><ul class="techs hist">${[...u].sort((a, b) => b[1].n - a[1].n).map(([id, x]) => `<li class="tech"><b>${id}</b> <span class="muted">${x.n}번 · 프로젝트 ${x.projects.size}개 · ${[...x.stages].join(", ")}</span></li>`).join("")}</ul>`;
      return;
    }
    const focus = ui.focus ? find(ui.focus)?.s : null, tags = focus ? STAGE_TAGS[focus.name] : null, q = (document.getElementById("techQ")?.value ?? "").toLowerCase();
    const list = TECH.filter((t) => (!tags || t.tags.some((g) => tags.includes(g))) && (!q || t.id.includes(q) || t.tags.join(" ").includes(q)))
      .sort((a, b) => (u.get(b.id)?.n ?? 0) - (u.get(a.id)?.n ?? 0) || (a.id < b.id ? -1 : 1));
    el.innerHTML = `<label class="sr" for="techQ">기술 찾기</label><input type="search" id="techQ" placeholder="기술·태그 찾기" value="${esc(q)}">
      <p class="muted">${focus ? `<b>${esc(focus.name)}</b> 단계에 맞는 기술(${tags ? tags.map((g) => "#" + g).join(" ") : "모든 태그"}) · <button class="btn sm" data-act="focus" data-val="">모두 보기</button>` : "단계의 번호를 누르면 그 단계에 맞는 기술만 보여요. 기술은 단계로 끌어다 놓아요."}</p>
      <ul class="techs">${list.map((t) => { const x = u.get(t.id), risky = t.sec === "d";
        return `<li class="tech" ${risky ? "" : 'draggable="true"'} data-tech="${t.id}"><b>${t.id}</b> <span class="muted">${JN[stateOf(t)] ?? "아직 안 봄"}</span>
          <div class="muted">${t.desc}</div>${x ? `<div class="muted">내가 ${x.n}번 씀 · 프로젝트 ${x.projects.size}개</div>` : ""}
          ${risky ? '<div class="muted">위험한 버전은 넣지 않아요</div>' : `<button class="btn sm" data-act="puttech" data-val="${t.id}" ${focus ? "" : "disabled"}>${focus ? `${esc(focus.name)}에 넣기` : "단계를 먼저 고르세요"}</button>`}</li>`; }).join("")}</ul>`;
  }

  // ---- 바꾸기
  function snapshot() { ui.undo = JSON.stringify(bp); }
  function addColumn(at, name) { bp.splice(at, 0, [S(name)]); render(); say(`"${name}" 단계를 넣었어요.`); }
  function moveStage(id, toCol, asNewColumn) {
    const f = find(id); if (!f) return;
    bp[f.c].splice(f.r, 1);
    if (asNewColumn) bp.splice(toCol, 0, [f.s]); else (bp[toCol] ??= []).push(f.s);
    tidy(); render(); lanes.querySelector(`.stage[data-stage="${id}"] header .btn`)?.focus();
  }
  function putTech(stageId, techId) {
    const f = find(stageId), t = byId[techId];
    if (!f || !t) return;
    if (t.sec === "d") return say("위험한 버전은 블루프린트에 넣지 않아요.");
    if (!f.s.techs.includes(techId)) f.s.techs.push(techId);
    render(); say(`${f.s.name}에 ${techId}를 붙였어요.`);
  }
  function popover(anchor, html) {
    document.querySelector(".pop")?.remove();
    const p = document.createElement("div"); p.className = "pop"; p.innerHTML = html;
    const a = anchor.getBoundingClientRect(), base = document.getElementById("canvas").getBoundingClientRect(), cv = document.getElementById("canvas");
    p.style.left = `${a.left - base.left + cv.scrollLeft}px`; p.style.top = `${a.bottom - base.top + cv.scrollTop + 6}px`;
    cv.appendChild(p); p.querySelector("button, input")?.focus();
  }

  // ---- 내보내기: 프롬프트 / CLAUDE.md 글 / 다듬기용 메타프롬프트(사용자가 자기 Claude에 붙여 넣음)
  function exportText(kind) {
    const steps = bp.map((col, i) => `${i + 1}. ${col.map((s) => `${s.name}${s.techs.length ? `(${s.techs.join(", ")})` : ""}`).join(" + ")}${col.length > 1 ? " — 동시에 진행" : ""}`).join("\n");
    if (kind === "md") return `## 작업 단계와 쓸 도구\n\n| 순서 | 단계 | 쓸 도구 |\n|---|---|---|\n${bp.map((col, i) => col.map((s) => `| ${i + 1} | ${s.name} | ${s.techs.join(", ") || "-"} |`).join("\n")).join("\n")}\n\n같은 순서 번호의 단계는 동시에 진행한다.\n`;
    if (kind === "meta") return `너는 개발 작업 계획을 다듬는 도우미야. 아래 블루프린트를 검토해서 같은 형식으로 고쳐 줘.\n- 빠진 단계가 있으면 넣고, 필요 없는 단계는 빼 줘.\n- 순서와 동시에 할 단계(같은 번호)가 맞는지 봐 줘.\n- 단계마다 끝났다고 볼 기준을 한 줄 붙여 줘.\n- 각 도구가 그 단계에 맞는지, 더 나은 도구가 있으면 이유와 함께 알려 줘.\n- 바꾼 곳마다 이유를 한 줄로 적어 줘.\n\n<블루프린트 이름="${document.getElementById("bpName").value}">\n${steps}\n</블루프린트>\n`;
    return `아래 블루프린트대로 작업해 줘. 같은 번호의 단계는 동시에 진행해도 돼. 단계마다 괄호 안의 도구를 먼저 써 줘.\n\n${steps}\n`;
  }
  function openExport() {
    const kinds = [["prompt", "프롬프트"], ["md", "CLAUDE.md 글"], ["meta", "다듬기용 메타프롬프트"]];
    dlg.innerHTML = `<h2>내보내기</h2><div class="row" role="tablist">${kinds.map(([k, n]) => `<button class="btn" data-act="out" data-val="${k}" aria-pressed="${ui.out === k}">${n}</button>`).join("")}</div>
      <p class="muted">${ui.out === "meta" ? "이 글을 내 Claude에 붙여 넣으면 블루프린트를 한 번 더 다듬어 줘요. 앱은 AI를 부르지 않아요." : "글만 만들어요. 설치하거나 내 저장소를 바꾸지 않아요."}</p>
      <textarea readonly aria-label="내보낼 글">${esc(exportText(ui.out))}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn primary" data-act="copy">복사</button><button class="btn" data-act="close">닫기</button></div>`;
    if (!dlg.open) dlg.showModal();
  }

  // ---- 인터뷰로 만들기: 한 번에 한 질문, 첫 보기가 추천(grilling처럼), 끝나면 미리 보고 만든다
  const QS = [
    { id: "what", q: "무엇을 만드나요?", opts: [["web", "웹 서비스"], ["data", "데이터 분석·리서치"], ["auto", "자동화 도구"]] },
    { id: "team", q: "혼자 하나요, 팀으로 하나요?", opts: [["solo", "혼자"], ["team", "팀(2~4명)"]] },
    { id: "design", q: "화면 디자인이 중요한가요?", opts: [["yes", "중요해요"], ["light", "간단하면 돼요"]] },
    { id: "data", q: "데이터를 저장하나요?", opts: [["yes", "네(DB 필요)"], ["no", "아니요"]] },
    { id: "test", q: "검사는 어느 정도로 할까요?", opts: [["basic", "기본 테스트만"], ["full", "꼼꼼히(코드 리뷰·QA 따로)"]] },
    { id: "ship", q: "배포까지 하나요?", opts: [["yes", "네, 배포까지"], ["local", "내 컴퓨터에서만"]] },
  ];
  function buildFrom(a) {
    const cols = [["문제정의"]];
    if (a.what === "data") cols.push(["리서치"]);
    cols.push(["기획"]);
    if (a.what !== "data" && a.design === "yes" && a.team === "team" && a.data === "yes") cols.push(["디자인", "백엔드"], ["프론트엔드"]);
    else { if (a.what !== "data" && a.design === "yes") cols.push(["디자인"]); cols.push(["개발"]); }
    if (a.test === "full") cols.push(["테스트", "코드 리뷰"], ["QA"]); else cols.push(["테스트"]);
    if (a.ship === "yes") cols.push(["배포"]);
    return cols;
  }
  function interview() {
    const iv = ui.iv, q = QS[iv.step];
    if (!q) {
      const cols = buildFrom(iv.a);
      dlg.innerHTML = `<h2>이렇게 만들까요?</h2><p>${cols.map((c) => c.join(" + ")).join(" → ")}</p><p class="muted">만든 뒤에도 단계를 끌어서 바꾸거나 더하고 뺄 수 있어요.</p>
        <div class="row"><button class="btn primary" data-act="ivMake">이렇게 만들기</button><button class="btn" data-act="interview">처음부터 다시</button><button class="btn" data-act="close">닫기</button></div>`;
    } else {
      dlg.innerHTML = `<p class="muted">질문 ${iv.step + 1} / ${QS.length}</p><h2>${q.q}</h2><div class="opts">${q.opts.map(([v, n], i) => `<button class="btn opt" data-act="ivAns" data-val="${v}">${n}${i === 0 ? '<span class="rec">추천</span>' : ""}</button>`).join("")}</div>
        <div class="row">${iv.step ? '<button class="btn" data-act="ivBack">이전 질문</button>' : ""}<button class="btn" data-act="close">닫기</button></div>`;
    }
    if (!dlg.open) dlg.showModal();
    dlg.querySelector(".opt, .btn.primary")?.focus();
  }

  // ---- 누르기
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!e.target.closest(".pop") && !e.target.closest('[data-act="gap"], [data-act="par"]')) document.querySelector(".pop")?.remove();
    if (!b) return;
    const a = b.dataset.act, v = b.dataset.val;
    if (a === "tab") { ui.tab = v; drawer(); }
    if (a === "focus") { ui.focus = v || null; render(); }
    if (a === "gap") popover(b, `<b>여기에 넣을 단계</b><div class="row">${recFor(Number(v)).map((n) => `<button class="btn sm" data-act="addAt" data-val="${v}" data-name="${n}">${n}</button>`).join("") || '<span class="muted">추천이 없어요</span>'}</div>
      <form class="row" data-form="addAt" data-val="${v}"><input name="n" placeholder="직접 이름 쓰기" maxlength="20" aria-label="단계 이름"><button class="btn sm">넣기</button></form><span class="muted">추천은 앞뒤 단계를 보고 골라요</span>`);
    if (a === "addAt") { addColumn(Number(v), b.dataset.name); document.querySelector(".pop")?.remove(); }
    if (a === "par") popover(b, `<b>나란히 할 단계</b><div class="row">${recSide(Number(v)).map((n) => `<button class="btn sm" data-act="parAdd" data-val="${v}" data-name="${n}">${n}</button>`).join("") || '<span class="muted">추천이 없어요</span>'}</div>
      <form class="row" data-form="parAdd" data-val="${v}"><input name="n" placeholder="직접 이름 쓰기" maxlength="20" aria-label="단계 이름"><button class="btn sm">넣기</button></form>`);
    if (a === "parAdd") { bp[Number(v)].push(S(b.dataset.name)); document.querySelector(".pop")?.remove(); render(); say(`"${b.dataset.name}"을 나란히 넣었어요.`); }
    if (a === "del") { const f = find(v); snapshot(); bp[f.c].splice(f.r, 1); tidy(); if (ui.focus === v) ui.focus = null; render(); say(`"${f.s.name}" 단계를 뺐어요. 위 "되돌리기"로 돌릴 수 있어요.`); }
    if (a === "rename") { const f = find(v); const n = prompt("단계 이름", f.s.name); if (n && n.trim()) { f.s.name = n.trim().slice(0, 20); render(); } }
    // ← →: 혼자 있는 단계는 이웃 단계와 자리를 바꾸고, 나란히 있는 단계는 떼어서 바로 앞·뒤 새 단계로
    if (a === "mv") {
      const f = find(v), d = Number(b.dataset.d), t = f.c + d;
      if (bp[f.c].length > 1) moveStage(v, d < 0 ? f.c : f.c + 1, true);
      else if (t >= 0 && t < bp.length) { [bp[f.c], bp[t]] = [bp[t], bp[f.c]]; render(); lanes.querySelector(`.stage[data-stage="${v}"] header .btn`)?.focus(); }
    }
    if (a === "ud") { const f = find(v), d = Number(b.dataset.d); [bp[f.c][f.r], bp[f.c][f.r + d]] = [bp[f.c][f.r + d], bp[f.c][f.r]]; render(); }
    if (a === "split") { const f = find(v); moveStage(v, f.c + 1, true); say(`"${f.s.name}"을 떼어 바로 뒤 단계로 옮겼어요.`); }
    if (a === "untech") { const f = find(b.dataset.stage); f.s.techs = f.s.techs.filter((x) => x !== v); render(); }
    if (a === "puttech" && ui.focus) putTech(ui.focus, v);
    if (a === "tpl") { dlg.innerHTML = `<h2>템플릿으로 시작</h2><div class="opts">${TEMPLATES.map((t, i) => `<button class="btn opt" data-act="useTpl" data-val="${i}"><span><b>${t.name}</b><br><span class="muted">${t.desc}: ${t.cols.map((c) => c.join(" + ")).join(" → ")}</span></span>${i === 0 ? '<span class="rec">초보자 추천</span>' : ""}</button>`).join("")}</div><button class="btn" data-act="close">닫기</button>`; dlg.showModal(); }
    if (a === "useTpl") { snapshot(); bp = fromCols(TEMPLATES[Number(v)].cols); dlg.close(); render(); say(`"${TEMPLATES[Number(v)].name}"으로 바꿨어요. "되돌리기"로 이전 판을 되살릴 수 있어요.`); }
    if (a === "load") { snapshot(); const h = HISTORY[Number(v)]; bp = fromCols(h.cols, h.techs); render(); say(`"${h.name}"을 불러왔어요.`); }
    if (a === "undo" && ui.undo) { bp = JSON.parse(ui.undo); ui.undo = null; render(); say("되돌렸어요."); }
    if (a === "export") openExport();
    if (a === "out") { ui.out = v; openExport(); }
    if (a === "copy") { const t = dlg.querySelector("textarea").value; navigator.clipboard?.writeText(t).then(() => say("복사했어요."), () => say("복사하지 못했어요. 글을 직접 골라 복사해 주세요.")); }
    if (a === "close") dlg.close();
    if (a === "interview") { ui.iv = { step: 0, a: {} }; interview(); }
    if (a === "ivAns") { ui.iv.a[QS[ui.iv.step].id] = v; ui.iv.step += 1; interview(); }
    if (a === "ivBack") { ui.iv.step -= 1; interview(); }
    if (a === "ivMake") { snapshot(); bp = fromCols(buildFrom(ui.iv.a)); dlg.close(); render(); say("인터뷰 답으로 블루프린트를 만들었어요."); }
    if (a === "adopt") {
      const techs = {}; for (const s of all()) if (s.techs.length) techs[s.name] = [...s.techs];
      HISTORY.unshift({ name: document.getElementById("bpName").value.trim() || "이름 없는 블루프린트", project: "TechRadar", at: "방금", cols: bp.map((c) => c.map((s) => s.name)), techs });
      ui.tab = "hist"; render(); say("확정해서 내 이력에 남겼어요. 쓴 기술의 횟수에 더해져요.");
    }
  });
  document.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target, n = new FormData(f).get("n")?.toString().trim().slice(0, 20);
    if (!n) return;
    if (f.dataset.form === "addAt") addColumn(Number(f.dataset.val), n);
    if (f.dataset.form === "parAdd") { bp[Number(f.dataset.val)].push(S(n)); render(); }
    document.querySelector(".pop")?.remove();
  });
  document.addEventListener("input", (e) => { if (e.target.id === "techQ") { drawer(); const q = document.getElementById("techQ"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelector(".pop")?.remove(); });

  // ---- 끌어 놓기: 단계 → 열(나란히 붙이기) 또는 + 틈(새 단계로), 기술 → 단계
  document.addEventListener("dragstart", (e) => {
    const st = e.target.closest?.(".stage"), tc = e.target.closest?.(".tech[data-tech]");
    if (st) e.dataTransfer.setData("text/plain", `stage:${st.dataset.stage}`);
    else if (tc) e.dataTransfer.setData("text/plain", `tech:${tc.dataset.tech}`);
  });
  const zone = (t) => t.closest?.(".stage, .gap, .col");
  document.addEventListener("dragover", (e) => { const z = zone(e.target); if (z) { e.preventDefault(); document.querySelectorAll(".over, .drop").forEach((x) => x.classList.remove("over", "drop")); z.classList.add(z.classList.contains("stage") ? "drop" : "over"); } });
  document.addEventListener("drop", (e) => {
    const z = zone(e.target); if (!z) return;
    e.preventDefault(); document.querySelectorAll(".over, .drop").forEach((x) => x.classList.remove("over", "drop"));
    const [kind, id] = e.dataTransfer.getData("text/plain").split(":");
    if (kind === "tech") { const st = z.closest(".stage"); if (st) putTech(st.dataset.stage, id); else say("기술은 단계 블록 위에 놓아요."); return; }
    if (kind !== "stage") return;
    // 옮길 때 빈 열은 넣은 뒤에 치우므로(tidy) 열 번호는 원래 번호 그대로 쓴다
    if (z.classList.contains("gap")) { snapshot(); moveStage(id, Number(z.dataset.gap), true); }
    else { const col = Number((z.closest(".col") ?? z).dataset.col); if (find(id).c !== col) { snapshot(); moveStage(id, col, false); say("나란히 붙였어요(같은 열 = 동시에)."); } }
  });
  window.addEventListener("resize", () => requestAnimationFrame(wires));
  document.querySelector(".bar .grow").insertAdjacentHTML("afterend", '<button class="btn" id="undoBtn" data-act="undo" hidden>되돌리기</button>');
  render();
})();
