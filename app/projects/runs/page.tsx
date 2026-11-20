// 내 실행 기록(IA-11, PRD-F26): 본인이 시작한 처음 읽기·다시 읽기 실행만, 관리자 흐름 화면과 같은 그림.
// DB는 RLS가 이미 막고(runs_select), 화면도 같은 조건으로 한 번 더 거른다(불변 5).
import Link from "next/link";
import { redirect } from "next/navigation";
import flowJson from "@/flow/flow.json";
import { RUN_COLUMNS, STEP_COLUMNS } from "@/lib/flow/columns";
import { isUserRun, USER_TRIGGERS } from "@/lib/flow/run-list";
import type { Flow, RunListRow, StepDetail } from "@/lib/flow/types";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { RunView } from "../../admin/flow/run-view";

const flow = flowJson as unknown as Flow;

export default async function MyRunsPage({ searchParams }: { searchParams: Promise<{ run?: string; node?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await getServerSupabase();
  if (!supabase) return <main><h1>내 실행 기록</h1><p>Supabase 연결 전이에요.</p></main>;

  const { run: wanted, node } = await searchParams;
  const runsRes = await supabase.from("runs").select(`${RUN_COLUMNS}, started_by`)
    .eq("started_by", user.id).in("trigger", [...USER_TRIGGERS]).order("created_at", { ascending: false }).limit(20);
  const runs = ((runsRes.data ?? []) as (RunListRow & { started_by: string | null })[]).filter((r) => isUserRun(r, user.id));
  const picked = runs.find((r) => r.id === wanted) ?? runs[0] ?? null;
  const stepsRes = picked ? await supabase.from("run_steps").select(STEP_COLUMNS).eq("run_id", picked.id).order("created_at") : null;
  const readError = runsRes.error?.message ?? stepsRes?.error?.message;

  return (
    <main>
      <p><Link href="/projects">← 내 프로젝트</Link></p>
      <h1>내 실행 기록</h1>
      <p>내 저장소를 읽은 실행(처음 등록 읽기·다시 읽기)만 보여요. 실제로 실행한 기록대로 칠해지고, 기록이 없는 상자는 회색이에요.</p>
      {readError ? <p role="alert" style={{ color: "var(--danger)" }}>기록을 읽지 못했어요(없는 게 아니라 조회 실패): {readError}</p> : null}
      {!readError && !picked ? <p>아직 실행 기록이 없어요. 프로젝트를 등록하거나 다시 읽기를 누르면 생겨요.</p> : null}
      <RunView flow={flow} runs={runs} picked={picked} steps={(stepsRes?.data ?? []) as StepDetail[]} node={node} basePath="/projects/runs" />
    </main>
  );
}
