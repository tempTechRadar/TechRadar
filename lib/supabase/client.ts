"use client";

import { createBrowserClient } from "@supabase/ssr";
import { readSupabasePublicConfig } from "@/lib/env";

/** 브라우저용 Supabase 클라이언트. 연결 전이면 null. */
export function getBrowserSupabase() {
  const config = readSupabasePublicConfig({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!config) return null;
  return createBrowserClient(config.url, config.anonKey);
}
