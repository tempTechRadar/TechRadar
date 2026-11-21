// 첫 화면 관문 "Ready to Catch?"을 보일지 정하는 규칙(11-20 사용자 결정). DOM을 모르는 순수 함수라 시험할 수 있고,
// 같은 함수를 관문 스크립트(app/tech-map/ready-gate.tsx)에 글로 실어 브라우저에서 그대로 돌린다.
// - 기술 지도(/)에서만, 브라우저 세션당 한 번(이미 봤으면 seen)
// - 주소에 무엇이든 실린 링크(지도에서 보기 ?sel=, 보기 설정 공유)는 목적지가 분명해 건너뛴다
// - 다른 화면으로 처음 들어온 세션도 "이미 들어온 것"으로 친다: 나중에 지도를 새로 고칠 때 갑자기 관문이 뜨지 않게
export type GateDecision = "show" | "skip" | "mark-seen";

export function gateDecision(path: string, search: string, seen: boolean): GateDecision {
  if (seen) return "skip";
  if (path !== "/") return "mark-seen";
  return search.length > 1 ? "mark-seen" : "show";
}

/** 키 하나로 관문을 닫을지: 새로 고침 · 탭 이동 같은 단축키(Ctrl · ⌘ · Alt 조합)는 닫지 않는다 */
export const closesGate = (key: { ctrlKey: boolean; metaKey: boolean; altKey: boolean }) => !(key.ctrlKey || key.metaKey || key.altKey);

/** 관문(덮개) 상태: 스크립트가 window.__techradarGate에 남긴다. 없음 = 관문을 띄우지 않음(이미 봄 · 다른 주소 · 스크립트 실패) */
export type GateState = "open" | "closed" | undefined;
/** 지도 첫 연출을 미룰지(P-12f 사용자 결정 "덮개 = 로딩"): 덮개가 떠 있는 동안만. 움직임이 꺼져 있으면(움직임 줄이기 · 끄기) 기다리지 않고 바로 다 보인다 */
export const introWaits = (gate: GateState, moving: boolean): boolean => gate === "open" && moving;
/** 지도가 첫 장을 그리면 보내는 신호(관문 단추를 켬). 관문을 닫은 것은 window.__techradarGate = "closed"로 알린다(지도가 매 장 봄) */
export const READY_MAP = "techradar:map-ready";
