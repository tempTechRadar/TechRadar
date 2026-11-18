// 관리자 탭의 흐름 화면(IA-16). 실제 runs·run_steps 기록으로만 칠한다(불변 6). 관리자만(불변 5, DB는 RLS가 따로 막음).
import Link from "next/link";
import { redirect } from "next/navigation";
import flowJson from "@/flow/flow.json";
import { colorize } from "@/lib/flow/status";
import type { Flow, RunRow, StepRow } from "@/lib/flow/types";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { FlowDiagram, Legend } from "./flow-diagram";

const flow = flowJson as unknown as Flow;
const STATUS_KO: Record<string, string> = { queued: "대기", running: "실행 중", succeeded: "성공", failed: "실패", partial: "일부 실패" };
const triggerName = (t: string) => flow.nodes.find((n) => n.run_trigger === t)?.name ?? t;
const when = (iso: string) => new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });

type RunListRow = RunRow & { created_at: string; item_count: number };

export default async function AdminFlowPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") return <main><h1>흐름 화면</h1><p>관리자만 볼 수 있어요.</p></main>;

  const supabase = await getServerSupabase();
  if (!supabase) return <main><h1>흐름 화면</h1><p>Supabase 연결 전이에요. .env.local을 확인해 주세요.</p></main>;

  const { run: wanted } = await searchParams;
  const runsRes = await supabase.from("runs").select("id, trigger, status, created_at, item_count").order("created_at", { ascending: false }).limit(20);
  const runs = (runsRes.data ?? []) as RunListRow[];
  const picked = runs.find((r) => r.id === wanted) ?? runs[0] ?? null;
  const stepsRes = picked ? await supabase.from("run_steps").select("step_name, status").eq("run_id", picked.id) : null;
  const colored = colorize(flow, picked, (stepsRes?.data ?? []) as StepRow[]);
  const readError = runsRes.error?.message ?? stepsRes?.error?.message;

  return (
    <main>
      <p><Link href="/admin/simulator">시뮬레이터</Link></p>
      <h1>흐름 화면</h1>
      <p>앱이 실제로 돈 기록(`runs`·`run_steps`)대로 칠해집니다. 기록이 없는 상자는 회색으로 남습니다.</p>
      {readError ? (
        <p role="alert" style={{ color: "#b3261e" }}>기록을 읽지 못했어요(없는 게 아니라 조회 실패): {readError}</p>
      ) : !picked ? (
        <p>아직 실행 기록이 없어요. 시뮬레이터(P-5)나 지금 실행(P-17)을 한 번 돌리면 여기에 생겨요.</p>
      ) : null}
      <Legend />
      <FlowDiagram flow={flow} colored={colored} />
      <h2>실행 목록</h2>
      <ul style={{ paddingLeft: 18 }}>
        {runs.map((r) => (
          <li key={r.id} style={{ fontWeight: r.id === picked?.id ? 700 : 400 }}>
            <Link href={`/admin/flow?run=${r.id}`}>{when(r.created_at)}</Link> · {triggerName(r.trigger)} · {STATUS_KO[r.status] ?? r.status} · {r.item_count}건
          </li>
        ))}
      </ul>
    </main>
  );
}
