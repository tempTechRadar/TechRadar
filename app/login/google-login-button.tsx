"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { safeNext } from "@/lib/auth/safe-next";

/** 구글로 계속하기(PRD-F1). 구글 화면으로 갔다가 /auth/callback으로 돌아온다. 받는 정보는 이름·이메일·프로필뿐(기본 범위). */
export default function GoogleLoginButton({ next }: { next?: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onClick() {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setMessage("Supabase 연결 전이에요. .env.local을 확인해 주세요.");
      return;
    }
    setBusy(true);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) {
      setBusy(false);
      setMessage(`구글 로그인을 시작하지 못했어요: ${error.message}`);
    }
  }

  return (
    <div>
      <button type="button" onClick={onClick} disabled={busy} style={{ minHeight: 44, padding: "8px 16px" }}>
        {busy ? "구글로 이동하는 중…" : "구글로 계속하기"}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
