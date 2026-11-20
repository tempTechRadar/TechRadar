// 알림 목록의 빠른 거르기 칩(design.md 19절): 지금 거르기에서 값 하나만 바꾼 주소와, 지금 고른 값(모르는 값은 "전체"로 본다).
export type AlertParams = { kind?: string; status?: string; period?: string; project?: string };
const KEYS = ["kind", "status", "period", "project"] as const;

/** 지금 거르기에서 key만 value로 바꾼 주소. 빈 값은 싣지 않고, 아는 칸만 싣는다 */
export function chipHref(params: AlertParams, key: keyof AlertParams, value: string): string {
  const q = new URLSearchParams();
  for (const k of KEYS) { const v = k === key ? value : params[k]; if (typeof v === "string" && v) q.set(k, v); }
  return q.toString() ? `/alerts?${q}` : "/alerts";
}

/** 칩이 "지금"인지: 칩에 없는 값(모르는 값 등)은 빈 값(전체)으로 본다 */
export function currentOf(value: string | undefined, known: readonly string[]): string {
  return value && known.includes(value) ? value : "";
}
