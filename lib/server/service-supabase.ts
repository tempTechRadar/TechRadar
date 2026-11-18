import { createClient } from "@supabase/supabase-js";
import { readServiceRoleKey, readSupabasePublicConfig } from "@/lib/env";

/**
 * 서비스 키 Supabase 클라이언트(서버 전용, RLS를 건너뜀). 주인: 김영식(A).
 * 수집·변경·알림·실행 기록처럼 erd에서 "쓰기는 서버"인 곳에만 쓴다.
 * 판단(judgments)에는 쓰지 않는다: 쓰려 해도 DB 트리거가 막는다(불변 1).
 */
export function getServiceSupabase() {
  if (typeof window !== "undefined") throw new Error("서비스 키 클라이언트는 서버에서만 쓴다");
  const config = readSupabasePublicConfig(process.env);
  const key = readServiceRoleKey(process.env);
  if (!config || !key) return null;
  return createClient(config.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
