"use client";

import { useState, type FormEvent } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

/** 개발·QA 환경에서만 보이는 이메일 테스트 로그인(ADR 0007 개정). 계정은 Supabase에서 미리 만든 테스트 계정. */
export default function TestLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setMessage("Supabase 연결 전이에요. .env.local을 확인해 주세요.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? `로그인하지 못했어요: ${error.message}` : "로그인했어요.");
  }

  return (
    <form onSubmit={onSubmit} aria-label="개발용 테스트 로그인">
      <p>
        <label htmlFor="email">테스트 계정 이메일</label>
        <br />
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </p>
      <p>
        <label htmlFor="password">비밀번호</label>
        <br />
        <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </p>
      <button type="submit">테스트 로그인</button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
