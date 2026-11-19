// "+ 기술 넣기" 상자(시안): 쇼츠·글에서 본 기술을 잊기 전에 붙여 넣으면 모은 기술에서 찾아 관심에 넣는다(ADR 0025 제안의 "기억" 단계).
// v1은 붙여 넣기만: GitHub·npm·MCP 주소는 정확히 맞추고, 글은 이름으로 찾는다. 영상·SNS 링크는 주소만으로 이름을 알 수 없어 이름을 적어 달라고 한다.
// 스크린샷으로 찾기는 넣지 않는다(사용자 11-20). 휴대폰 공유하기(웹앱은 안드로이드만)는 다음 버전. 찾은 것도 자동으로 넣지 않고 사용자가 고른다.
(() => {
  const { TECH, byId, JN, judged, esc } = TR;
  const SNS = /(^|\.)(instagram\.com|youtube\.com|youtu\.be|tiktok\.com|x\.com|twitter\.com|threads\.net)$/;

  /** 붙여 넣은 한 줄 → 무엇인지(주소 종류)와 찾을 이름 */
  function parseLine(line) {
    const t = line.trim();
    if (!t) return null;
    let u = null;
    try { u = new URL(t); u.search = ''; u.hash = ''; } catch { /* 주소가 아니면 이름으로 찾는다 */ }
    if (!u) return { from: "이름", query: t };
    const host = u.hostname.replace(/^www\./, ""), parts = u.pathname.split("/").filter(Boolean);
    if (host === "github.com" && parts.length >= 2) return { from: "GitHub 저장소", query: parts[1] };
    if (host === "npmjs.com" && parts[0] === "package") return { from: "npm 패키지", query: parts.slice(1).join("/") };
    if (host.endsWith("modelcontextprotocol.io")) return { from: "MCP 레지스트리", query: parts[parts.length - 1] ?? "" };
    if (SNS.test(host)) return { from: "영상·SNS 링크", query: "", note: "링크만으로는 어떤 기술인지 알 수 없어요. 영상에서 본 이름을 적어 주세요." };
    return { from: "웹 링크", query: parts[parts.length - 1] ?? host };
  }
  // 지도와 같은 카탈로그 전체에서 찾는다(radar-data.js가 있으면). 이름 일부·설명도(usability-review U18)
  const catalog = () => (TR.radar ? TR.radar.techs : TECH);
  const find = (q) => (q ? catalog().filter((t) => (t.id + ' ' + t.desc).toLowerCase().includes(q.toLowerCase())).slice(0, 3) : []);

  function results(text) {
    // 같은 것을 두 번 넣어도 한 번만(주소는 www·?추적 값을 떼고 비교, Raindrop 중복 찾기 참고. 불변 3)
    const seen = new Set(), lines = text.split(/[\n,]/).map(parseLine).filter(Boolean).filter((p) => {
      const k = `${p.from}:${p.query}`.toLowerCase();
      return seen.has(k) ? false : seen.add(k);
    }).slice(0, 10);
    if (!lines.length) return '<p class="muted">주소나 이름을 붙여 넣어 주세요. 한 줄에 하나, 여러 개도 돼요.</p>';
    return `<ul class="list">${lines.map((p) => {
      const hits = find(p.query);
      const head = `<div><span class="tag">${p.from}</span> <b>${esc(p.query || "(이름 없음)")}</b>${p.note ? `<div class="muted">${p.note}</div>` : ""}</div>`;
      if (p.note) return `<li>${head}<div></div></li>`;
      if (!hits.length) return `<li>${head}<div class="muted">모은 기술에서 찾지 못했어요. 철자를 확인하거나 <button class="btn" data-act="stub">이름만 내 목록에 적어 두기</button></div></li>`;
      return hits.map((t) => `<li><div>${head}<div>→ <b>${esc(t.id)}</b> <span class="muted">${esc(t.desc)}</span></div></div>
        <div class="row"><a class="btn" href="#map/${t.id}" data-act="capClose">지도에서 보기</a>${t.mine ? '<span class="tag strong">이미 쓰는 중</span>' : `<button class="btn" data-judge="int" data-id="${t.id}" aria-pressed="${judged[t.id] === "int"}">${judged[t.id] === "int" ? "관심에 있음" : "관심에 넣기"}</button>`}</div></li>`).join("");
    }).join("")}</ul>`;
  }

  const dlg = document.createElement("dialog");
  dlg.className = "capture";
  dlg.setAttribute("aria-labelledby", "capTitle");
  dlg.innerHTML = `<h2 id="capTitle">기술 넣기</h2>
    <p class="muted">쇼츠·글에서 본 기술을 잊기 전에 붙여 넣으세요. 모은 기술에서 찾아 관심에 넣을 수 있어요. 아무것도 자동으로 넣지 않아요.</p>
    <label for="capText">주소나 이름(한 줄에 하나)</label>
    <textarea id="capText" rows="3" placeholder="https://github.com/sample/mcp-3&#10;sample-pkg-4"></textarea>
    <div class="row"><button class="btn primary" data-act="capFind">찾기</button><button class="btn" data-act="capClose">닫기</button></div>
    <div id="capOut" aria-live="polite"></div>`;
  document.body.appendChild(dlg);
  const btn = document.createElement("button");
  btn.className = "btn capture-open"; btn.type = "button"; btn.textContent = "+ 기술 넣기";
  document.getElementById("nav").insertBefore(btn, document.querySelector('[data-nav="start"]'));

  btn.addEventListener("click", () => { dlg.showModal(); document.getElementById("capText").focus(); });
  dlg.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]")?.dataset.act;
    if (a === "capFind") document.getElementById("capOut").innerHTML = results(document.getElementById("capText").value);
    if (a === "capClose") dlg.close();
    if (e.target.closest("[data-judge]")) setTimeout(() => { document.getElementById("capOut").innerHTML = results(document.getElementById("capText").value); }); // 관심에 넣은 뒤 단추 상태 다시 그림
  });
  TR.parseCaptureLine = parseLine; // 시험·명세에서 같은 규칙을 보려고
})();
