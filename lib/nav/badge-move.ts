// 종 배지 숫자가 바뀔 때 한 번 움직일지(P-12g C3). 순수 함수: 보인 값과 새 값이 둘 다 숫자이고 보이는 글이 다를 때만 방향을 준다.
// 첫 그림 · 못 읽음(null)↔숫자 · 종을 펼쳐 바로잡은 값(animate = false)은 실제 사건이 아니라서 움직이지 않는다.
export type BadgeDir = "up" | "down";
export type Badge = { n: number | null; dir: BadgeDir | null };

/** 배지 글(0 · null이면 배지 없음). 99를 넘으면 "99+"라 수가 바뀌어도 글이 같을 수 있다 */
export const badgeLabel = (n: number | null): string | null => (n ? (n > 99 ? "99+" : String(n)) : null);

export function nextBadge(prev: Badge, n: number | null, animate: boolean): Badge {
  if (badgeLabel(prev.n) === badgeLabel(n)) return prev.n === n ? prev : { n, dir: prev.dir };
  const moved = animate && typeof prev.n === "number" && typeof n === "number" && badgeLabel(n) !== null;
  return { n, dir: moved ? (n > prev.n! ? "up" : "down") : null };
}
