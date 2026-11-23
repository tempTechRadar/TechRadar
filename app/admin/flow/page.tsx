// 관리자 탭의 흐름 화면(IA-16). 실제 runs·run_steps 기록으로만 칠한다(불변 6). 관리자만(불변 5, DB는 RLS가 따로 막음).
import Link from "next/link";
import { redirect } from "next/navigation";
import flowJson from "@/flow/flow.json";
import { RUN_COLUMNS, STEP_COLUMNS } from "@/lib/flow/columns";
import type { Flow, RunListRow, StepDetail } from "@/lib/flow/types";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "../admin-shell";
import { RunTable, RunView } from "./run-view";

const flow = flowJson as unknown as Flow;
const TITLE = "흐름 화면";
const LEAD = "앱이 실제로 돈 기록대로 칠해져요. 기록이 없는 상자는 회색으로 남아요. 그림 바탕만 밝은 종이색인 것은 상자 색과 글자 대비를 이 바탕에 맞춰 둔 그대로라서예요(관측소 테마 때 그대로 둠).";
const PROVES = "흐름이 미리 그린 그림이 아니라 실제 실행 기록(runs · run_steps)으로만 칠해진다는 것";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Supabase = NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>;
type Wanted = { run: RunListRow | null; error: string | null };

/** ?run= 실행이 최근 20개 밖이면 따로 읽는다. 없으면 null(최근 실행으로 대신 그리지 않는다: 다른 실행을 말없이 보여 주면 증거가 바뀜) */
async function readWanted(db: Supabase, wanted: string, recent: RunListRow[]): Promise<Wanted> {
  const inList = recent.find((r) => r.id === wanted);
  if (inList) return { run: inList, error: null };
  if (!UUID.test(wanted)) return { run: null, error: null };
  const res = await db.from("runs").select(RUN_COLUMNS).eq("id", wanted).maybeSingle();
  return { run: (res.data as RunListRow | null) ?? null, error: res.error?.message ?? null };
}

export default async function AdminFlowPage({ searchParams }: { searchParams: Promise<{ run?: string; node?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") return <AdminShell tab="flow" title={TITLE} blocked="forbidden" />;

  const supabase = await getServerSupabase();
  if (!supabase) return <AdminShell tab="flow" title={TITLE} blocked="no_db" />;

  const { run: wanted, node } = await searchParams;
  const runsRes = await supabase.from("runs").select(RUN_COLUMNS).order("created_at", { ascending: false }).limit(20);
  const recent = (runsRes.data ?? []) as RunListRow[];
  const asked = wanted ? await readWanted(supabase, wanted, recent) : null;
  const picked = asked ? asked.run : recent[0] ?? null;
  // 고른 실행이 최근 20개 밖이면 목록 맨 위에 붙여 어느 줄을 보고 있는지 보이게
  const runs = picked && !recent.some((r) => r.id === picked.id) ? [picked, ...recent] : recent;
  const stepsRes = picked ? await supabase.from("run_steps").select(STEP_COLUMNS).eq("run_id", picked.id).order("created_at") : null;
  const steps = (stepsRes?.data ?? []) as StepDetail[];

  // 관리자 틀 안(P-12n R3-5: 탭 · 제목 · 읽기 실패 안내가 다른 관리자 탭과 같게). 실행 목록을 못 읽으면 틀이 안내하고, 고른 실행의 단계만 못 읽으면 그림 자리에 안내 · 목록은 남김(불변 2)
  return (
    <AdminShell tab="flow" title={TITLE} lead={LEAD} proves={PROVES} error={runsRes.error?.message ?? null}>
      <p className="admin-actions"><Link className="admin-linkbtn" href="/admin/simulator">시뮬레이터</Link><Link className="admin-linkbtn" href="/admin/run-now">지금 한 번 실행</Link><Link className="admin-linkbtn" href="/admin/demo">실패 시연</Link></p>
      {asked?.error ? <p role="alert" className="admin-note danger">그 실행을 읽지 못했어요(없는 게 아니에요): {asked.error}</p> : null}
      {asked && !asked.run && !asked.error ? <p role="alert" className="admin-note warning">그 실행을 찾지 못했어요. 주소의 실행 id를 확인하거나 아래 목록에서 골라 주세요(다른 실행으로 대신 그리지 않아요).</p> : null}
      {!picked && !asked ? <p>아직 실행 기록이 없어요. 시뮬레이터나 지금 한 번 실행을 돌리면 여기에 생겨요.</p> : null}
      {picked ? <RunView flow={flow} runs={runs} picked={picked} steps={steps} node={node} basePath="/admin/flow" stepsError={stepsRes?.error?.message ?? null} /> : <RunList runs={runs} />}
    </AdminShell>
  );
}

/** 그릴 실행이 없을 때(못 찾음 · 기록 없음)도 목록은 남겨 고를 수 있게 */
function RunList({ runs }: { runs: RunListRow[] }) {
  if (runs.length === 0) return null;
  return <><h2>실행 목록</h2><RunTable flow={flow} runs={runs} picked={null} basePath="/admin/flow" /></>;
}
