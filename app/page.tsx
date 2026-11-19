import { readSupabasePublicConfig } from "@/lib/env";

export default function Home() {
  const connected = readSupabasePublicConfig(process.env) !== null;
  return (
    <main>
      <h1>TechRadar</h1>
      <p>내가 깐 AI 코딩 도구를 지키고(보안), 고르고(판단), 옮긴다(설치 프롬프트).</p>
      {connected ? null : <p>Supabase 연결 전이에요. .env.local에 주소와 키를 넣어 주세요.</p>}
    </main>
  );
}
