// 개발 컴퓨터(next dev)에서만 열리는 샘플 화면: 그림이 제대로 그려지는지 눈으로 보는 용도.
// 실제 기록이 아니다. 배포(운영·미리보기)에서는 404.
import Link from "next/link";
import { notFound } from "next/navigation";
import flowJson from "@/flow/flow.json";
import { edgeLabels } from "@/lib/flow/counts";
import { nodeDetail } from "@/lib/flow/detail";
import { colorize } from "@/lib/flow/status";
import type { Flow, RunRow, StepDetail, StepRow } from "@/lib/flow/types";
import { FlowDiagram, Legend } from "../../admin/flow/flow-diagram";
import { DetailPanel } from "../../admin/flow/run-view";

const flow = flowJson as unknown as Flow;
const ok = (...names: string[]): StepRow[] => names.map((step_name) => ({ step_name, status: "succeeded" }));
const FETCH = ["fetch_osv", "fetch_registry", "fetch_github", "fetch_downloads", "fetch_stars", "fetch_popularity"];
const TAIL = ["normalize", "compare", "grade", "is_event"];
const TO_NOTIFY = [...TAIL, "save_change", "summarize", "notify"];

// ⑥ 건수·상세: 화살표 위 숫자와 상자 누르기 상세가 보이는 장면(가짜 값, 비밀값 없음)
const COUNTED: StepDetail[] = [
  { step_name: "fetch_osv", status: "failed", count_in: 12, count_out: 11, branch_counts: { ok: 11, collect_error: 1 }, api_url: "https://api.osv.dev/v1/querybatch", http_status: 503, duration_ms: 2400, error_kind: "http_status", error_message: "OSV가 잠시 응답하지 않음(503)" },
  { step_name: "fetch_registry", status: "succeeded", count_in: 1, count_out: 40, api_url: "https://registry.modelcontextprotocol.io/v0/servers", http_status: 200, duration_ms: 900 },
  { step_name: "collect_error", status: "succeeded", count_in: 1, count_out: 1 },
  { step_name: "normalize", status: "succeeded", count_in: 51, count_out: 51 },
  { step_name: "compare", status: "succeeded", count_in: 51, count_out: 12 },
  { step_name: "grade", status: "succeeded", count_in: 12, count_out: 12, branch_counts: { pass: 8, caution: 1, danger: 3 } },
  { step_name: "is_event", status: "succeeded", count_in: 12, branch_counts: { event: 3, no_change: 9, collect_error: 0 } },
  { step_name: "no_change", status: "succeeded", count_in: 9 },
  { step_name: "save_change", status: "succeeded", count_in: 3, count_out: 3, output_summary: "새 변경 3건" },
  { step_name: "summarize", status: "succeeded", count_in: 3, count_out: 3 },
  { step_name: "notify", status: "succeeded", count_in: 3, count_out: 4, output_summary: "알림 4건 만듦" },
  { step_name: "human_judgment", status: "awaiting_judgment", count_in: 4 },
];

// ③ 중복(docs/flow.md 4절): 시뮬레이터를 같은 시나리오로 두 번째 누른 실행. 변경 저장은 "이미 있는 변경", 알림 함수는 새 알림 0건으로
// 알림 단계를 성공으로 남긴다(lib/server/alerts.ts의 recordStep: 들어온 수=쓰는 사람 수, 나간 수=새 알림 수, 요약 "알림 N건 만듦"). 그래서 알림 상자는 초록, 사람 판단은 켜지지 않는다.
const DUPLICATE: StepDetail[] = [
  ...ok(...TAIL),
  { step_name: "save_change", status: "succeeded", count_in: 1, count_out: 1, output_summary: "이미 있는 변경(새로 만들지 않음)" },
  { step_name: "notify", status: "succeeded", count_in: 1, count_out: 0, output_summary: "알림 0건 만듦" },
];

const SCENES: { title: string; run: RunRow; steps: StepDetail[]; node?: string }[] = [
  { title: "① 수집 오류", run: { id: "s1", trigger: "manual", status: "partial" },
    steps: [{ step_name: "fetch_osv", status: "failed" }, ...ok("fetch_registry", "fetch_github", "fetch_downloads", "fetch_stars", "fetch_popularity", ...TAIL, "no_change", "collect_error")] },
  { title: "② 사건 아님", run: { id: "s2", trigger: "manual", status: "succeeded" }, steps: ok(...FETCH, ...TAIL, "no_change") },
  { title: "③ 중복(새 변경 없음, 알림 0건)", run: { id: "s3", trigger: "simulator", status: "succeeded" }, steps: DUPLICATE, node: "save_change" },
  { title: "④ 판단 대기", run: { id: "s4", trigger: "simulator", status: "running" },
    steps: [...ok(...TO_NOTIFY), { step_name: "human_judgment", status: "awaiting_judgment" }] },
  { title: "⑤ 저장 실패", run: { id: "s5", trigger: "simulator", status: "failed" },
    steps: [...ok(...TO_NOTIFY), { step_name: "human_judgment", status: "awaiting_judgment" }, { step_name: "action_record", status: "failed" }] },
  { title: "⑥ 건수·상세", run: { id: "s6", trigger: "manual", status: "partial" }, steps: COUNTED, node: "fetch_osv" },
];

export default async function FlowSamplePage({ searchParams }: { searchParams: Promise<{ scene?: string; node?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { scene, node } = await searchParams;
  const i = Math.min(Math.max(Number(scene ?? 1) || 1, 1), SCENES.length) - 1;
  const s = SCENES[i];
  const picked = flow.nodes.find((n) => n.id === (node ?? s.node));
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
      <FlowDiagram flow={flow} colored={colorize(flow, s.run, s.steps)} edgeLabels={edgeLabels(flow, s.steps)}
        nodeHref={(id) => `/dev/flow-sample?scene=${i + 1}&node=${id}`} selected={picked?.id} />
      {picked ? <DetailPanel detail={nodeDetail(picked, s.steps)} /> : null}
    </main>
  );
}
