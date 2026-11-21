// 옮긴 화면의 옛 주소(P-12f 앱 구조 개편, 사용자 결정): 보드(/views)는 지도 · 청사진으로 녹였고, 새 기술(/new)은 지도의 "이번 주" 보기다.
// 옛 링크 · 즐겨찾기가 막다른 길이 되지 않게 가장 가까운 새 자리로 보낸다.
const VIEWS_TAB: Record<string, string> = { gallery: "/dashboard", news: "/dashboard?tab=news" }; // 옛 갤러리 = 내 기술 카드 → 현황 개요의 "적용한 기술"

/** /views?tab=… → 새 자리. 갤러리(내 기술 카드) → 현황 개요, 소식판 → 현황 소식, 나머지(보드 · 쓰고 있어요) → 지도 */
export const viewsTarget = (tab: string | undefined): string => (tab && Object.hasOwn(VIEWS_TAB, tab) ? VIEWS_TAB[tab] : "/");
/** /new → 지도의 이번 주 새 기술 보기 */
export const NEW_TARGET = "/?t=week";
