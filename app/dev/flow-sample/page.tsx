// 개발 컴퓨터(next dev)에서만 열리는 샘플 화면: 그림이 제대로 그려지는지 눈으로 보는 용도.
// 실제 기록이 아니다. 배포(운영·미리보기)에서는 404.
import Link from "next/link";
import { notFound } from "next/navigation";
import flowJson from "@/flow/flow.json";
import { colorize } from "@/lib/flow/status";
import type { Flow, RunRow, StepRow } from "@/lib/flow/types";
import { FlowDiagram, Legend } from "../../admin/flow/flow-diagram";

const flow = flowJson as unknown as Flow;
const ok = (...names: string[]): StepRow[] => names.map((step_name) => ({ step_name, status: "succeeded" }));
const FETCH = ["fetch_osv", "fetch_registry", "fetch_github", "fetch_downloads"];
const TAIL = ["normalize", "compare", "grade", "is_event"];
const TO_NOTIFY = [...TAIL, "save_change", "summarize", "notify"];

const SCENES: { title: string; run: RunRow; steps: StepRow[] }[] = [
  { title: "① 수집 오류", run: { id: "s1", trigger: "manual", status: "partial" },
    steps: [{ step_name: "fetch_osv", status: "failed" }, ...ok("fetch_registry", "fetch_github", "fetch_downloads", ...TAIL, "no_change", "collect_error")] },
  { title: "② 사건 아님", run: { id: "s2", trigger: "manual", status: "succeeded" }, steps: ok(...FETCH, ...TAIL, "no_change") },
  { title: "③ 중복(변경 저장에서 멈춤)", run: { id: "s3", trigger: "simulator", status: "succeeded" }, steps: ok(...TAIL, "save_change") },
  { title: "④ 판단 대기", run: { id: "s4", trigger: "simulator", status: "running" },
    steps: [...ok(...TO_NOTIFY), { step_name: "human_judgment", status: "awaiting_judgment" }] },
  { title: "⑤ 저장 실패", run: { id: "s5", trigger: "simulator", status: "failed" },
    steps: [...ok(...TO_NOTIFY), { step_name: "human_judgment", status: "awaiting_judgment" }, { step_name: "action_record", status: "failed" }] },
];

export default async function FlowSamplePage({ searchParams }: { searchParams: Promise<{ scene?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { scene } = await searchParams;
  const i = Math.min(Math.max(Number(scene ?? 1) || 1, 1), SCENES.length) - 1;
  const s = SCENES[i];
  return (
    <main>
      <h1>흐름 그림 샘플 (실제 기록 아님)</h1>
      <p role="note" style={{ background: "#fff1d6", padding: "8px 12px", borderRadius: 8 }}>
        개발 컴퓨터에서만 보이는 화면이에요. 색은 아래 장면용 가짜 기록으로 칠했어요. 실제 화면은 <Link href="/admin/flow">/admin/flow</Link>입니다.
      </p>
      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        {SCENES.map((x, n) => (
          <Link key={x.title} href={`/dev/flow-sample?scene=${n + 1}`} style={{ fontWeight: n === i ? 700 : 400, textDecoration: n === i ? "underline" : "none" }}>{x.title}</Link>
        ))}
      </nav>
      <Legend />
      <FlowDiagram flow={flow} colored={colorize(flow, s.run, s.steps)} />
    </main>
  );
}
