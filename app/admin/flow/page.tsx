// 관리자 탭의 흐름 화면(IA-16). 실제 runs·run_steps 기록으로만 칠한다(불변 6). 관리자만(불변 5, DB는 RLS가 따로 막음).
import Link from "next/link";
import { redirect } from "next/navigation";
import flowJson from "@/flow/flow.json";
import { RUN_COLUMNS, STEP_COLUMNS } from "@/lib/flow/columns";
import type { Flow, RunListRow, StepDetail } from "@/lib/flow/types";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "../admin-shell";
import { RunView } from "./run-view";

const flow = flowJson as unknown as Flow;
const TITLE = "흐름 화면";
const LEAD = "앱이 실제로 돈 기록대로 칠해져요. 기록이 없는 상자는 회색으로 남아요.";

export default async function AdminFlowPage({ searchParams }: { searchParams: Promise<{ run?: string; node?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") return <AdminShell tab="flow" title={TITLE} blocked="forbidden" />;

  const supabase = await getServerSupabase();
  if (!supabase) return <AdminShell tab="flow" title={TITLE} blocked="no_db" />;

  const { run: wanted, node } = await searchParams;
  const runsRes = await supabase.from("runs").select(RUN_COLUMNS).order("created_at", { ascending: false }).limit(20);
  const runs = (runsRes.data ?? []) as RunListRow[];
  const picked = runs.find((r) => r.id === wanted) ?? runs[0] ?? null;
  const stepsRes = picked ? await supabase.from("run_steps").select(STEP_COLUMNS).eq("run_id", picked.id).order("created_at") : null;
  const steps = (stepsRes?.data ?? []) as StepDetail[];
  const readError = runsRes.error?.message ?? stepsRes?.error?.message;

  // 관리자 틀 안(P-12n R3-5: 탭 · 제목 · 읽기 실패 안내가 다른 관리자 탭과 같게). 못 읽으면 틀이 안내하고 그림은 그리지 않는다(회색 = "안 돎"으로 읽히지 않게, 불변 2)
  return (
    <AdminShell tab="flow" title={TITLE} lead={LEAD} error={readError ?? null}>
      <p className="admin-lead"><Link href="/admin/simulator">시뮬레이터</Link> · <Link href="/admin/run-now">지금 한 번 실행</Link> · <Link href="/admin/demo">실패 시연</Link></p>
      {!picked ? <p>아직 실행 기록이 없어요. 시뮬레이터나 지금 한 번 실행을 돌리면 여기에 생겨요.</p> : null}
      <RunView flow={flow} runs={runs} picked={picked} steps={steps} node={node} basePath="/admin/flow" />
    </AdminShell>
  );
}
