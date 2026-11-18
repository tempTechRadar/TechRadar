import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readSupabasePublicConfig } from "@/lib/env";

/**
 * 서버(서버 컴포넌트·라우트)용 Supabase 클라이언트. 사용자 로그인 토큰(쿠키)으로 부르므로 RLS가 적용된다.
 * 서비스 키는 여기서 쓰지 않는다(판단 저장은 사용자 토큰으로만, spec 10-1).
 */
export async function getServerSupabase() {
  const config = readSupabasePublicConfig(process.env);
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts(lib/supabase/proxy.ts)가 한다.
        }
      },
    },
  });
}
