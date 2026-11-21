// 관리자 탭의 흐름 화면(IA-16). 실제 runs·run_steps 기록으로만 칠한다(불변 6). 관리자만(불변 5, DB는 RLS가 따로 막음).
// Link는 시뮬레이터 링크 줄(PR #40)이 쓴다. 두 PR이 합쳐질 때 import가 빠지지 않게 남겨 둔다.
import Link from "next/link";
import { redirect } from "next/navigation";
import flowJson from "@/flow/flow.json";
import { RUN_COLUMNS, STEP_COLUMNS } from "@/lib/flow/columns";
import type { Flow, RunListRow, StepDetail } from "@/lib/flow/types";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { RunView } from "./run-view";

const flow = flowJson as unknown as Flow;

export default async function AdminFlowPage({ searchParams }: { searchParams: Promise<{ run?: string; node?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") return <main><h1>흐름 화면</h1><p>관리자만 볼 수 있어요.</p></main>;

  const supabase = await getServerSupabase();
  if (!supabase) return <main><h1>흐름 화면</h1><p>Supabase 연결 전이에요. .env.local을 확인해 주세요.</p></main>;

  const { run: wanted, node } = await searchParams;
  const runsRes = await supabase.from("runs").select(RUN_COLUMNS).order("created_at", { ascending: false }).limit(20);
  const runs = (runsRes.data ?? []) as RunListRow[];
  const picked = runs.find((r) => r.id === wanted) ?? runs[0] ?? null;
  const stepsRes = picked ? await supabase.from("run_steps").select(STEP_COLUMNS).eq("run_id", picked.id).order("created_at") : null;
  const steps = (stepsRes?.data ?? []) as StepDetail[];
  const readError = runsRes.error?.message ?? stepsRes?.error?.message;

  return (
    <main>
      <p><Link href="/admin/simulator">시뮬레이터</Link> · <Link href="/admin/run-now">지금 한 번 실행</Link> · <Link href="/admin/demo">실패 시연</Link></p>
      <h1>흐름 화면</h1>
      <p>앱이 실제로 돈 기록(`runs`·`run_steps`)대로 칠해집니다. 기록이 없는 상자는 회색으로 남습니다.</p>
      {readError ? (
        <p role="alert" style={{ color: "var(--ink-danger)" }}>기록을 읽지 못했어요(없는 게 아니라 조회 실패): {readError}</p>
      ) : !picked ? (
        <p>아직 실행 기록이 없어요. 시뮬레이터(P-5)나 지금 실행(P-17)을 한 번 돌리면 여기에 생겨요.</p>
      ) : null}
      <RunView flow={flow} runs={runs} picked={picked} steps={steps} node={node} basePath="/admin/flow" />
    </main>
  );
}
