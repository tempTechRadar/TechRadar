// 로그인 화면 미리보기(개발용, 11-21 사용자 결정): 개발 컴퓨터(next dev)에서만, 로그인 없이 가짜 계정 + 샘플 데이터로 로그인한 화면을 본다.
// 운영(배포)에서는 쿠키가 있어도 늘 꺼진다: 가짜 로그인이 운영에 새면 보안 사고라 시험으로 고정(login-preview.test.ts).
// DB·화면을 모르는 순수 함수만 둔다. 쿠키 읽기는 lib/server/current-user.ts

type Env = Record<string, string | undefined>;

export const LOGIN_PREVIEW_COOKIE = "techradar-preview-login";
/** 미리보기에서 판단·관심·확정·직접 추가 같은 저장을 누르면 돌려주는 말(불변 1·4: 아무것도 저장하지 않는다) */
export const PREVIEW_NO_SAVE = "미리보기에서는 저장하지 않아요.";
/** 가짜 계정. 일반 사용자라 관리자 화면은 열리지 않는다 */
export const PREVIEW_USER = { id: "00000000-0000-4000-8000-0000000000aa", nickname: "미리보기", role: "user", isDemo: false } as const;

/** 체크표시를 그려도 되는지: next dev에서만. 운영 빌드(NODE_ENV=production)나 Vercel 위에서는 늘 아니다 */
export function loginPreviewAllowed(env: Env): boolean {
  return env.NODE_ENV !== "production" && !env.VERCEL_ENV;
}

/** 이번 요청을 미리보기로 그릴지: 허용된 환경이고 쿠키가 "1"일 때만 */
export function loginPreviewOn(env: Env, cookie: string | undefined): boolean {
  return loginPreviewAllowed(env) && cookie === "1";
}

export const isPreviewUser = (user: { id: string } | null | undefined): boolean => user?.id === PREVIEW_USER.id;
