// 설치 프롬프트 · 내 컴퓨터 목록 가져오기(IA-22, PRD-F25·F33). 본인 기술만(RLS + 아래 조건, 불변 5).
import Link from "next/link";
import { redirect } from "next/navigation";
import type { MyTechRow } from "@/lib/install/from-my-tech";
import { PreviewOnly } from "@/app/dev/preview-only";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { getCurrentUser } from "@/lib/server/current-user";
import { readArchivedProjectIds } from "@/lib/server/project-edit";
import { getServerSupabase } from "@/lib/supabase/server";
import { ImportScreen } from "./import-screen";
import { InstallScreen } from "./install-screen";

const NOT_INSTALLABLE = new Set(["model", "service", "concept"]);
type JudgmentRow = { fixed_version: string | null; alerts: { my_technology_id: string | null } | null };

export default async function InstallPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isPreviewUser(user)) return <PreviewOnly title="설치 프롬프트" />; // 미리보기(개발용)는 DB를 부르지 않는다
  const db = await getServerSupabase();
  if (!db) return <main><h1>설치 프롬프트</h1><p>Supabase 연결 전이에요.</p></main>;
  const techRes = await db
    .from("my_technologies")
    .select("id, project_id, origin, version, grade, grade_reason, grade_evidence, hidden_at, technologies(tech_key, type, repo_url)")
    .eq("owner_id", user.id)
    .is("hidden_at", null);
  // 보안 경고에서 "고친 버전으로 올리기(적용 후보)"를 고른 것 → 그 버전으로 고정(ADR 0012, P-8)
  const pinRes = await db.from("judgments").select("fixed_version, alerts(my_technology_id)").eq("judged_by", user.id).eq("decision", "candidate");
  // DB 타입을 생성하기 전이라 다대일도 배열로 추론된다. 실제 응답은 한 줄 객체
  // 보관한 프로젝트의 도구는 넣지 않는다(내 기술 목록·지도에서 빠지는 것과 같은 기준). 못 읽으면 보관분을 빼지 못한 채 보이지 않게 오류로 알린다(불변 2).
  // 모델 · 연동 서비스 · 개념은 설치하는 것이 아니라서 옮길 목록에 넣지 않는다(PRD-F38 · F40)
  let archivedError: string | undefined;
  const archived = await readArchivedProjectIds(db, user.id).catch((e) => { archivedError = e instanceof Error ? e.message : String(e); return new Set<string>(); });
  const rows = ((techRes.data ?? []) as unknown as (MyTechRow & { project_id: string })[])
    .filter((r) => !archived.has(r.project_id)).filter((r) => !NOT_INSTALLABLE.has(r.technologies?.type ?? ""));
  const pins = ((pinRes.data ?? []) as unknown as JudgmentRow[])
    .filter((j) => j.fixed_version && j.alerts?.my_technology_id)
    .map((j) => [j.alerts!.my_technology_id!, j.fixed_version!] as [string, string]);
  const readError = techRes.error?.message ?? pinRes.error?.message ?? archivedError;

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
