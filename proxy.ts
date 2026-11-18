import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next 16에서 middleware 대신 proxy. 로그인 세션 갱신만 한다(화면 접근 막기는 각 화면과 RLS가 맡는다).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
