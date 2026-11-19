import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/safe-next";
import { getCurrentUser } from "@/lib/server/current-user";
import { readTaste } from "@/lib/server/taste-store";
import { getServerSupabase } from "@/lib/supabase/server";
import { TasteForm } from "./taste-form";
import "../alerts/alerts.css";

// 취향 질문(IA-1b, PRD-F32): 가입 직후(onboarding=1)와 나중에 고치기(IA-19) 모두 이 화면.
export default async function TastePage({ searchParams }: { searchParams: Promise<{ onboarding?: string; next?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/taste");
  const params = await searchParams;
  const supabase = (await getServerSupabase())!;
  const saved = await readTaste(supabase, user.id).catch((e) => { console.error("취향 조회 실패", e); return undefined; });
  return (
    <main className="alerts">
      <h1>취향 알려 주기</h1>
      <p className="muted">모두 건너뛸 수 있고, 나중에 여기서 고칠 수 있어요. 고른 관심 분야로 추천 목록을 만들어요(알림이 아니에요).</p>
      {saved === undefined ? (
        <div className="notice notice-error" role="alert"><strong>취향을 불러오지 못했어요.</strong> 잠시 뒤에 다시 열어 주세요.</div>
      ) : (
        <TasteForm initial={saved ?? { build: null, tools: [], interests: [] }} onboarding={params.onboarding === "1"} next={safeNext(params.next)} />
      )}
    </main>
  );
}
