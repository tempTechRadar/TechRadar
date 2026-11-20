// 설치 프롬프트 · 내 컴퓨터 목록 가져오기(IA-22, PRD-F25·F33). 본인 기술만(RLS + 아래 조건, 불변 5).
import Link from "next/link";
import { redirect } from "next/navigation";
import type { MyTechRow } from "@/lib/install/from-my-tech";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { ImportScreen } from "./import-screen";
import { InstallScreen } from "./install-screen";

type JudgmentRow = { fixed_version: string | null; alerts: { my_technology_id: string | null } | null };

export default async function InstallPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getServerSupabase();
  if (!db) return <main><h1>설치 프롬프트</h1><p>Supabase 연결 전이에요.</p></main>;
  const techRes = await db
    .from("my_technologies")
    .select("id, origin, version, grade, grade_reason, grade_evidence, hidden_at, technologies(tech_key, type, repo_url), projects!inner(archived_at)")
    .eq("owner_id", user.id)
    .is("hidden_at", null)
    .is("projects.archived_at", null); // 보관한 프로젝트의 기술은 빼고(PRD-F4)
  // 보안 경고에서 "고친 버전으로 올리기(적용 후보)"를 고른 것 → 그 버전으로 고정(ADR 0012, P-8)
  const pinRes = await db.from("judgments").select("fixed_version, alerts(my_technology_id)").eq("judged_by", user.id).eq("decision", "candidate");
  // DB 타입을 생성하기 전이라 다대일도 배열로 추론된다. 실제 응답은 한 줄 객체
  const rows = (techRes.data ?? []) as unknown as MyTechRow[];
  const pins = ((pinRes.data ?? []) as unknown as JudgmentRow[])
    .filter((j) => j.fixed_version && j.alerts?.my_technology_id)
    .map((j) => [j.alerts!.my_technology_id!, j.fixed_version!] as [string, string]);
  const readError = techRes.error?.message ?? pinRes.error?.message;

  return (
    <main>
      <p><Link href="/projects">← 내 프로젝트</Link></p>
      <h1>설치 프롬프트 · 내 컴퓨터 목록 가져오기</h1>
      {readError ? <p role="alert" style={{ color: "#b3261e" }}>내 기술 목록을 읽지 못했어요(없는 게 아니라 조회 실패). 잠시 뒤 새로 고쳐 주세요.</p> : null}
      <InstallScreen rows={rows} pins={pins} />
      <ImportScreen />
    </main>
  );
}
