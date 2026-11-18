// 관리자 화면(P-18) 공용 거르기·정렬·건수. 순수 함수라 DB 없이 시험한다. 주인: 차세일(C).
// 주소 값(?member=&period=&source=…)은 사람이 바꿀 수 있으니, 모르는 값은 걸지 않는다(전체로 본다).

export type Param = string | string[] | undefined;

const DAY_MS = 24 * 60 * 60 * 1000;
export const PERIODS = { "7d": 7, "30d": 30 } as const;
export type PeriodKey = keyof typeof PERIODS;

/** 기간 값을 "이 시각 이후" ISO로. 모르는 값이나 없으면 null(전체 기간). */
export function periodStart(period: Param, now: Date): string | null {
  // `in`은 toString 같은 기본 속성도 참이라 주소 값으로 깨질 수 있다. 자기 속성만 본다.
  if (typeof period !== "string" || !Object.hasOwn(PERIODS, period)) return null;
  return new Date(now.getTime() - PERIODS[period as PeriodKey] * DAY_MS).toISOString();
}

/** 허용 목록에 있는 값 하나만 받는다. */
export function pickOne<T extends string>(value: Param, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** uuid 모양일 때만 받는다(주소에 엉뚱한 글자를 넣어 조건을 깨는 일을 막는다). */
export function pickId(value: Param): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : null;
}

// DB 시각은 "+00:00"·마이크로초가 붙어 글자 비교가 어긋날 수 있어 숫자로 비교한다. 못 읽으면 NaN.
const ms = (iso: string | null | undefined): number => (typeof iso === "string" ? Date.parse(iso) : NaN);

/** 시각이 기간 안인가. 기간이 없으면 항상 참, 시각이 없거나 못 읽으면 기간이 있을 때 거짓. */
export function withinPeriod(iso: string | null | undefined, from: string | null): boolean {
  if (from === null) return true;
  const t = ms(iso);
  return !Number.isNaN(t) && t >= ms(from);
}

/** 최신순(시각 없는 줄은 맨 뒤). 원래 배열은 바꾸지 않는다. */
export function newestFirst<T>(rows: readonly T[], at: (row: T) => string | null | undefined): T[] {
  const key = (row: T) => { const t = ms(at(row)); return Number.isNaN(t) ? -Infinity : t; };
  return [...rows].sort((a, b) => { const d = key(b) - key(a); return Number.isNaN(d) ? 0 : d; }); // 둘 다 시각 없음이면 -∞ - -∞ = NaN
}

/** 값별 건수. 값이 없으면 "(없음)"으로 센다. */
export function countBy<T>(rows: readonly T[], key: (row: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row) ?? "(없음)";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** 여러 시각 중 가장 늦은 것. 없으면 null. */
export function latest(values: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const v of values) if (!Number.isNaN(ms(v)) && (best === null || ms(v) > ms(best))) best = v as string;
  return best;
}
