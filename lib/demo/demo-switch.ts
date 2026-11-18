// 실패 시연 스위치(P-20c, docs/flow.md 4절). 주인: 차세일(C). 테스트 로그인(lib/env.ts)과 같은 방식.
// 개발·시연 환경에서만 켠다. 운영 배포(VERCEL_ENV=production)에서는 플래그가 켜져 있어도 끈다.
// 서버 전용 이름(NEXT_PUBLIC_ 없음): 브라우저 묶음에 들어가지 않는다.

type Env = Record<string, string | undefined>;

export function isDemoSwitchEnabled(env: Env): boolean {
  if (env.VERCEL_ENV === "production") return false;
  return env.ENABLE_FAIL_DEMO === "true";
}

/** ⑤ 저장 실패 시연의 1회용 쿠키. httpOnly·sameSite strict·10분. */
export const DEMO_FAIL_SAVE_COOKIE = "tr_demo_fail_save";
export const DEMO_FAIL_SAVE_MAX_AGE = 600;
export const DEMO_FAIL_SAVE_COOKIE_OPTIONS = { httpOnly: true, sameSite: "strict", path: "/", maxAge: DEMO_FAIL_SAVE_MAX_AGE } as const;

/** 이번 판단 저장을 일부러 실패시킬지: 스위치가 켜져 있고, 시연 계정이고, 쿠키가 있을 때만. 셋 중 하나라도 아니면 아무 일도 없다. */
export function shouldFailSave(input: { env: Env; isDemo: boolean; cookie: string | undefined }): boolean {
  return isDemoSwitchEnabled(input.env) && input.isDemo === true && input.cookie === "1";
}
