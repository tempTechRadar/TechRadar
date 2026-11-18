import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabasePublicConfig } from "@/lib/env";

/**
 * 요청마다 로그인 토큰을 새로 고쳐 쿠키에 다시 쓴다. 서버 컴포넌트는 쿠키를 쓸 수 없어서 여기서 한다.
 * Supabase 공식 Next.js 예제의 updateSession과 같은 모양.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = readSupabasePublicConfig(process.env);
  if (!config) return response;
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // 만들자마자 사용자를 읽어야 만료된 토큰이 갱신된다. 사이에 다른 코드를 넣지 않는다.
  await supabase.auth.getUser();
  return response;
}
