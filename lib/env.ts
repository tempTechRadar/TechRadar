// 환경변수를 읽는 곳은 여기 한 곳뿐이다(경계). 값은 각자 .env.local에 직접 넣는다.

type Env = Record<string, string | undefined>;

export type SupabasePublicConfig = { url: string; anonKey: string };

/** 브라우저에서도 쓰는 공개 설정. 없으면 null(아직 Supabase 연결 전). */
export function readSupabasePublicConfig(env: Env): SupabasePublicConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  // 주소는 프로젝트 주소(origin)만 쓴다. `…supabase.co/rest/v1`처럼 경로를 붙여 넣으면 클라이언트가 /rest/v1·/auth/v1을 또 붙여
  // 로그인(/rest/v1/auth/v1/authorize → 401)과 조회가 깨진다(debug-note 11-18·11-19, 두 번 일어남). 주소가 아니면 연결 전으로 본다.
  let origin: string;
  try {
    origin = new URL(url.trim()).origin;
  } catch {
    return null;
  }
  return { url: origin, anonKey };
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
