// 관리자 탭의 흐름 화면(IA-16). 실제 runs·run_steps 기록으로만 칠한다(불변 6). 관리자만(불변 5, DB는 RLS가 따로 막음).
// 페이지는 역할 확인 · 읽기만, 그림은 body.tsx(I-admin-unify).
import { redirect } from "next/navigation";
import { RUN_COLUMNS, STEP_COLUMNS } from "@/lib/flow/columns";
import type { RunListRow, StepDetail } from "@/lib/flow/types";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { AdminShell } from "../admin-shell";
import { FlowBody, TITLE } from "./body";

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

  // 실행 목록을 못 읽으면 틀이 안내하고, 고른 실행의 단계만 못 읽으면 그림 대신 안내 · 목록은 남김(불변 2)
  return <FlowBody runs={runs} picked={picked} steps={steps} node={node} asked={asked} runsError={runsRes.error?.message ?? null} stepsError={stepsRes?.error?.message ?? null} />;
}
