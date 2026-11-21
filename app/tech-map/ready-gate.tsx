// 첫 화면 관문 "Ready to Catch?"(11-20 사용자 결정, design.md 17절 제안 A안 + 관문). 아무 키나 누르거나 화면을 누르면 사라지고 지도가 보인다.
// 관문은 이 작은 스크립트가 직접 만든다(React가 그리는 부분 밖): 스크립트가 꺼져 있거나 실패하면 관문이 없어 막다른 길이 되지 않고,
// 하이드레이션과도 부딪히지 않는다(뒤를 막는 것은 <dialog>.showModal()이 한다: React가 그린 요소에 inert를 달면 속성이 서버 HTML과 달라 경고가 난다). 뿌리 레이아웃에 두어 처음 열 때(새로 고침 포함) 한 번만 돈다(화면 안 이동에서는 React가 스크립트를 다시 안 돌림).
// 지도는 관문 뒤에서 이미 그려지고 있어 첫 표시 속도(PRD-NF3)를 늦추지 않는다. 보일지는 gateDecision(시험 있음)이 정한다.
// P-12f(사용자 결정 "덮개 = 로딩"): 지도가 그릴 준비가 되면(READY_MAP) 단추가 켜지고, 닫으면(GATE_CLOSED) 지도가 그때 첫 연출을 시작한다(introWaits).
// 지도를 못 그려도(조회 실패 · 빈 지도) 막다른 길이 되지 않게 8초 뒤에는 단추를 켠다.
import { closesGate, GATE_CLOSED, gateDecision, READY_MAP } from "@/lib/map/ready-gate";
import "./ready-gate.css";

const SCRIPT = `(function () {
  var KEY = "techradar-ready";
  var decide = ${gateDecision.toString()};
  var closes = ${closesGate.toString()};
  function remember() { try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* 저장을 막은 브라우저: 다음에 다시 보일 뿐 지도는 그대로 */ } }
  var seen = false;
  try { seen = sessionStorage.getItem(KEY) === "1"; } catch (e) { return; } // 읽을 수도 없으면 띄우지 않는다(닫은 걸 기억 못 해 매번 뜨지 않게)
  var d = decide(location.pathname, location.search, seen);
  if (d === "mark-seen") { remember(); return; }
  if (d !== "show") return;
  window.__techradarGate = "open"; // 지도 컨트롤러가 첫 연출을 미룬다
  var gate = document.createElement("dialog");
  gate.className = "ready-gate";
  gate.setAttribute("aria-labelledby", "ready-title");
  gate.setAttribute("aria-describedby", "ready-hint");
  var title = document.createElement("p");
  title.id = "ready-title"; title.className = "ready-title"; title.lang = "en"; title.textContent = "Ready to Catch?";
  var go = document.createElement("button");
  go.type = "button"; go.className = "ready-go"; go.textContent = "지도를 준비하는 중…"; go.disabled = true;
  var hint = document.createElement("p");
  hint.id = "ready-hint"; hint.className = "ready-hint"; hint.setAttribute("role", "status"); hint.textContent = "지도를 불러오고 있어요";
  gate.append(title, go, hint);
  var done = false, armed = false;
  function arm() {
    if (armed) return; armed = true;
    go.disabled = false; go.textContent = "지도 보기"; hint.textContent = "아무 키나 누르거나 화면을 누르세요";
    if (gate.open) go.focus();
  }
  window.addEventListener("${READY_MAP}", arm);
  setTimeout(arm, 8000);
  function enter(e) {
    if (!armed) { if (e && e.type === "cancel") e.preventDefault(); return; } // 준비 전에는 닫지 않는다(Esc도)
    if (e && e.type === "keydown") { if (!closes(e)) return; e.preventDefault(); } // 닫는 키는 여기서 끝(Tab이 포커스를 페이지 끝으로 보내지 않게)
    if (e && e.type === "cancel") e.preventDefault(); // Esc도 같은 길로
    if (done) return; done = true;
    remember();
    document.removeEventListener("keydown", enter, true);
    if (gate.open && gate.close) gate.close();
    gate.remove();
    window.__techradarGate = "closed";
    window.dispatchEvent(new Event("${GATE_CLOSED}")); // 지도: 이제 첫 연출
    var to = document.querySelector(".map-search input") || document.querySelector("main");
    if (to) { if (to.tagName === "MAIN") to.tabIndex = -1; to.focus({ preventScroll: true }); } // 지도 찾기 칸으로(없으면 본문)
  }
  function open() {
    document.body.append(gate);
    gate.addEventListener("click", enter);
    gate.addEventListener("cancel", enter);
    document.addEventListener("keydown", enter, true);
    try { gate.showModal(); } catch (e) { gate.setAttribute("open", ""); } // 모달: 뒤 화면은 브라우저가 막는다(화면 읽기 · Tab이 관문 뒤로 가지 않게)
    go.focus();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", open); else open();
})();`;

export function ReadyGate() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
