// 현황 · 일지 판단 대기의 "새로 옴"(P-12g B5, status-2): 지난번에 판단 대기를 본 시각보다 뒤에 온 알림. DB를 모르는 순수 함수.
// 기준 시각은 쿠키 status-seen-at = "<프로필 id 앞 8자>|<ISO 시각>". 서버가 알림을 읽기 직전에 잡은 시각을 쓴다(기기 시계가 아니라).
// 처음 왔거나(쿠키 없음) · 다른 사람 것 · 깨진 값 · 미래 시각이면 아무것도 "새로 옴"으로 보이지 않는다(모르는 것을 단정하지 않음).
export const SEEN_COOKIE = "status-seen-at";
/** 쿠키에 쓸 값. 프로필 id는 앞 8자만(다른 계정으로 바꿔 로그인하면 기준을 쓰지 않으려고, 전체 id는 남기지 않음) */
export const seenValue = (userId: string, at: Date): string => `${userId.slice(0, 8)}|${at.toISOString()}`;

/** 쿠키 값 → 지난번에 본 시각(ms). 쓸 수 없으면 null */
export function parseSeen(raw: string | undefined, userId: string, now: Date): number | null {
  if (!raw) return null;
  let text = raw;
  try { text = decodeURIComponent(raw); } catch { return null; }
  const [who, iso, extra] = text.split("|");
  if (extra !== undefined || who !== userId.slice(0, 8) || !iso) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) && at <= now.getTime() ? at : null;
}

/** 기준보다 늦게 온 것만(같은 시각은 이미 본 것) */
export const isNew = (createdAt: string, seen: number | null): boolean => seen !== null && Date.parse(createdAt) > seen;

/** 판단 대기 중 새로 온 수. 화면에 보이는 줄(개요는 5줄) 밖의 것도 센다 */
export const countNew = (alerts: { status: string; createdAt: string }[], seen: number | null): number =>
  alerts.filter((a) => a.status === "pending" && isNew(a.createdAt, seen)).length;
