// 구글 로그인에서 돌아오는 주소(PRD-F1, P-12). 받은 코드를 세션(쿠키)으로 바꾸고 원래 가려던 곳으로 보낸다.
// 실패하면 로그인 화면에 이유를 알린다(조용히 첫 화면으로 보내지 않음).
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/safe-next";
import { maskSecrets } from "@/lib/domain/redact";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, url.origin));

  if (url.searchParams.get("error") || !code) return fail("google"); // 사용자가 취소했거나 구글이 거절함
  const supabase = await getServerSupabase();
  if (!supabase) return fail("config");
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("구글 로그인 세션을 만들지 못함", maskSecrets(error.message));
    return fail("google");
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
