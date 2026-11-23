// 레이더 ⚙ 설정(P-12p 사용자: 처음 연출은 잔잔하게, 뒤에서 아주 옅은 선이 계속 돌고, 여운 · 속도 · 밝기 · 굵기를 바꿀 수 있게).
// 이 브라우저에만 기억(편의)하는 값이라 누구나 바꿀 수 있는 입력: 모양 · 범위를 고정한다. 옛 키(techradar-map-motion)의 "off"는 끄기, 그 밖은 파동.
export type RadarPrefs = {
  /** 처음 연출: 파동(점은 파동에 닿을 때 떠오름) · 끄기 */ intro: "ripple" | "off";
  /** 뒤에서 도는 옅은 선(꾸밈, 점을 켜지 않음) */ idle: boolean;
  /** 여운 길이(도) */ trail: number; /** 한 바퀴 초 */ speed: number; /** 밝기 0~1 */ alpha: number; /** 굵기 px */ width: number;
};
export const RADAR_DEFAULT: RadarPrefs = { intro: "ripple", idle: true, trail: 40, speed: 18, alpha: 0.08, width: 1 };
export const RADAR_RANGE = { trail: [10, 120], speed: [6, 60], alpha: [0.02, 0.3], width: [0.5, 3] } as const;
export const RADAR_KEY = "techradar-map-radar", LEGACY_MOTION_KEY = "techradar-map-motion";

const num = (v: unknown, [lo, hi]: readonly [number, number], d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** 저장값 읽기: 깨진 값 · 범위 밖은 기본(또는 끝값)으로. 새 키가 없으면 옛 키로 처음 연출만 */
export function readPrefs(raw: string | null, legacy: string | null = null): RadarPrefs {
  let v: Record<string, unknown> | null = null;
  try { const p = raw ? JSON.parse(raw) : null; v = p && typeof p === "object" && !Array.isArray(p) ? p : null; } catch { v = null; }
  if (!v) return { ...RADAR_DEFAULT, intro: legacy === "off" ? "off" : "ripple" };
  return {
    intro: v.intro === "off" ? "off" : "ripple",
    idle: typeof v.idle === "boolean" ? v.idle : RADAR_DEFAULT.idle,
    trail: num(v.trail, RADAR_RANGE.trail, RADAR_DEFAULT.trail), speed: num(v.speed, RADAR_RANGE.speed, RADAR_DEFAULT.speed),
    alpha: num(v.alpha, RADAR_RANGE.alpha, RADAR_DEFAULT.alpha), width: num(v.width, RADAR_RANGE.width, RADAR_DEFAULT.width),
  };
}
