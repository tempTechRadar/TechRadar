// 환경변수를 읽는 곳은 여기 한 곳뿐이다(경계). 값은 각자 .env.local에 직접 넣는다.

type Env = Record<string, string | undefined>;

export type SupabasePublicConfig = { url: string; anonKey: string };

/** 브라우저에서도 쓰는 공개 설정. 없으면 null(아직 Supabase 연결 전). */
export function readSupabasePublicConfig(env: Env): SupabasePublicConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** 서버 전용 서비스 키. RLS를 건너뛰므로 브라우저 코드·판단 저장에는 쓰지 않는다. */
export function readServiceRoleKey(env: Env): string | null {
  return env.SUPABASE_SERVICE_ROLE_KEY || null;
}

/**
 * 개발용 이메일 테스트 로그인을 켤지. 운영 배포에서는 플래그가 켜져 있어도 끈다(ADR 0007 개정).
 * Vercel은 운영 배포에 VERCEL_ENV=production을 넣는다.
 */
export function isTestLoginEnabled(env: Env): boolean {
  if (env.VERCEL_ENV === "production") return false;
  return env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true";
}
