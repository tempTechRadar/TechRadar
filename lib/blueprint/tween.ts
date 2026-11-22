// 청사진 캔버스 움직임(P-12h S3 반동 자동 정렬)의 순수 계산. 화면 · 시간을 모른다(부르는 쪽이 rAF로 t를 준다).
import type { Pos } from "./graph.ts";

/** 0→1, 끝에서 살짝 넘었다 돌아온다(c1 = 넘는 정도, 1.2면 약 3%). t는 0~1로 자른다 */
export function easeOutBack(t: number, c1 = 1.2): number {
  const u = Math.min(1, Math.max(0, t)) - 1;
  return 1 + (c1 + 1) * u ** 3 + c1 * u ** 2;
}

/** from → to 사이 k 지점(k가 1을 넘으면 넘어간 자리). from에 없는 id는 to 자리 그대로 */
export const tween = (from: Map<string, Pos>, to: Map<string, Pos>, k: number): Map<string, Pos> =>
  new Map([...to].map(([id, b]) => { const a = from.get(id) ?? b; return [id, { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }]; }));
