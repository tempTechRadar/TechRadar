// 관리자 화면 견본의 가짜 자료(I-admin-unify). 실제 기록이 아니다: 화면 배치를 눈으로 맞추려고 지어낸 값. DB를 읽지 않는다.
// 화면마다 본문(body.tsx)에 이 값을 넣어 그린다. 사용기 신고(reports)는 다른 팀원 화면이라 /dev/reports-sample을 쓴다.
import type { ReactNode } from "react";
import type { AdminAlert, RunRow, StepErrorRow } from "@/lib/admin/admin-summaries";
import type { AdminObservation } from "@/lib/server/admin-queries";
import type { RunListRow, StepDetail } from "@/lib/flow/types";
import { MembersBody } from "../../../admin/members/body";
import { ObservationsBody } from "../../../admin/observations/body";
import { AlertsBody } from "../../../admin/alerts/body";
import { RunsBody } from "../../../admin/runs/body";
import { FlowBody } from "../../../admin/flow/body";
import { ClassifyBody, type ClassifyData } from "../../../admin/classify/body";
import { SimulatorBody } from "../../../admin/simulator/body";
import { ChatBody } from "../../../admin/chat/body";
import { RunNowBody } from "../../../admin/run-now/body";
import { DemoBody } from "../../../admin/demo/body";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = id(1);

const MEMBERS = (
  <MembersBody meId={ME} adminCount={2} filter={{ member: "", period: "" }}
    memberOptions={[{ value: "", label: "모든 회원" }, { value: ME, label: "(가짜) 관리자 A" }, { value: id(2), label: "(가짜) 관리자 B" }, { value: id(3), label: "(가짜) 회원 C" }]}
    members={[
      { id: ME, nickname: "(가짜) 관리자 A", isAdmin: true, isDemo: false, projects: [{ name: "techradar", repoUrl: "https://github.com/example/techradar", kind: "repo", archived: false, techCount: 14 }], techCount: 14, lastReadAt: "2026-11-23T03:00:00Z", lastActivityAt: "2026-11-23T03:00:00Z" },
      { id: id(2), nickname: "(가짜) 관리자 B", isAdmin: true, isDemo: false, projects: [], techCount: 0, lastReadAt: null, lastActivityAt: "2026-11-22T03:00:00Z" },
      { id: id(3), nickname: "(가짜) 회원 C", isAdmin: false, isDemo: false, projects: [{ name: "side", repoUrl: null, kind: "local", archived: true, techCount: 3 }], techCount: 3, lastReadAt: "2026-11-21T03:00:00Z", lastActivityAt: "2026-11-21T03:00:00Z" },
      { id: id(4), nickname: "(가짜) 시연 계정", isAdmin: false, isDemo: true, projects: [{ name: "demo", repoUrl: "https://github.com/example/demo", kind: "repo", archived: false, techCount: 6 }], techCount: 6, lastReadAt: "2026-11-23T01:00:00Z", lastActivityAt: "2026-11-23T01:00:00Z" },
    ]} />
);

const OBS: AdminObservation[] = [
  { id: id(11), observedAt: "2026-11-23T03:00:00Z", source: "OSV", techName: "mcp-remote", metric: "vulns", prevValue: [], currValue: ["GHSA-xxxx"], changeSize: "large", isSimulated: true },
  { id: id(12), observedAt: "2026-11-23T02:00:00Z", source: "npm", techName: "@modelcontextprotocol/sdk", metric: "latest_version", prevValue: "1.2.0", currValue: "1.3.0", changeSize: "small", isSimulated: false },
  { id: id(13), observedAt: "2026-11-22T21:00:00Z", source: "GitHub", techName: "fastmcp", metric: "stars", prevValue: 1200, currValue: 1210, changeSize: "none", isSimulated: false },
];

const ALERTS: AdminAlert[] = [
  { id: id(21), kind: "security", status: "pending", createdAt: "2026-11-23T03:01:00Z", member: "(가짜) 시연 계정", techName: "mcp-remote", isSimulated: true, judgment: null },
  { id: id(22), kind: "opportunity", status: "done", createdAt: "2026-11-22T03:01:00Z", member: "(가짜) 회원 C", techName: "fastmcp", isSimulated: false, judgment: { decision: "hold", judgedBy: "(가짜) 회원 C", judgedAt: "2026-11-22T05:00:00Z" } },
];

const RUNS: RunRow[] = [
  { id: id(31), trigger: "schedule", status: "partial", created_at: "2026-11-22T21:00:00Z", item_count: 51 },
  { id: id(32), trigger: "manual", status: "failed", created_at: "2026-11-22T10:00:00Z", item_count: 0 },
  { id: id(33), trigger: "simulator", status: "succeeded", created_at: "2026-11-22T09:00:00Z", item_count: 1 },
];
const ERRORS: StepErrorRow[] = [
  { run_id: id(31), step_name: "fetch_osv", error_kind: "http_status", error_message: "(가짜) OSV 503", created_at: "2026-11-22T21:00:10Z" },
  { run_id: id(32), step_name: "fetch_github", error_kind: "timeout", error_message: "(가짜) 10초 넘김", created_at: "2026-11-22T10:00:10Z" },
];

const FLOW_RUNS: RunListRow[] = [
  { id: id(41), trigger: "simulator", status: "running", created_at: "2026-11-23T03:00:00Z", started_at: "2026-11-23T03:00:00Z", finished_at: null, item_count: 1 },
  { id: id(42), trigger: "schedule", status: "partial", created_at: "2026-11-22T21:00:00Z", started_at: "2026-11-22T21:00:00Z", finished_at: "2026-11-22T21:02:00Z", item_count: 51 },
];
const ok = (...names: string[]): StepDetail[] => names.map((step_name) => ({ step_name, status: "succeeded" }));
const FLOW_STEPS: StepDetail[] = [...ok("normalize", "compare", "grade", "is_event", "save_change", "summarize", "notify"), { step_name: "human_judgment", status: "awaiting_judgment", count_in: 1 }];

const CLASSIFY: ClassifyData = {
  rules: [
    { id: id(51), kind: "allow_package", ecosystem: "npm", value: "@modelcontextprotocol/sdk", pattern_id: null, pattern_grade: null, enabled: true },
    { id: id(52), kind: "risk_pattern", ecosystem: null, value: "curl | sh", pattern_id: "p1", pattern_grade: "danger", enabled: false },
  ],
  relations: [{ id: id(53), a: "fastmcp", b: "mcp-framework", status: "candidate", madeBy: "ai", quote: "(가짜) 둘 다 MCP 서버를 만드는 틀", createdAt: "2026-11-22T00:00:00Z", confirmedAt: null }],
  unclassified: [{ id: id(54), name: "mcp-remote", type: "package", techKey: "npm:mcp-remote" }],
  manualNames: [{ name: "(가짜) 사내 도구", createdAt: "2026-11-21T00:00:00Z" }],
  audits: [{ at: "2026-11-22T06:00:00Z", action: "rule_disable", reason: "(가짜) 오탐이 많아 끔", actorId: ME }],
  categories: [{ id: id(55), name: "개발 도구", parent_id: null }, { id: id(56), name: "MCP 서버", parent_id: id(55) }],
  categorized: [{ id: id(57), name: "fastmcp", categoryId: id(56), categoryName: "MCP 서버", setBy: ME, setAt: "2026-11-22T06:00:00Z" }],
};

export const VIEWS: Record<string, () => ReactNode> = {
  members: () => MEMBERS,
  observations: () => <ObservationsBody rows={OBS} sources={[{ id: id(61), name: "OSV" }, { id: id(62), name: "npm" }]} filter={{ source: "", period: "" }} />,
  alerts: () => <AlertsBody counts={{ total: 2, pending: 1, done: 1, candidate: 0, hold: 1 }} rows={ALERTS} filter={{ status: "", kind: "", period: "" }} />,
  runs: () => <RunsBody runs={RUNS} errors={ERRORS} />,
  flow: () => <FlowBody runs={FLOW_RUNS} picked={FLOW_RUNS[0]} steps={FLOW_STEPS} asked={null} />,
  classify: () => <ClassifyBody data={CLASSIFY} meId={ME} info="(견본) 규칙을 껐어요." />,
  simulator: () => <SimulatorBody info="(견본) 가짜 변경 1건을 만들었어요. 시연 계정 알림 1건." run={id(41)} />,
  chat: () => <ChatBody usedToday={3} failedToday={1} recent={[{ id: id(71), created_at: "2026-11-23T02:00:00Z", question: "정기 실행은 언제 도나요?", answer: "(가짜 답) 매일 06:00(한국 시간)에 돌아요.", wiki_pages: ["운영.md"] }]} />,
  "run-now": () => <RunNowBody sources={["osv", "npm", "github", "downloads", "stars", "popularity", "registry"]} highlight={["github"]} last={{ id: id(32), status: "failed", created_at: "2026-11-22T10:00:00Z" }} />,
  demo: () => <DemoBody on={false} info="(견본) 다음 저장 1번을 실패시키도록 켰어요." />,
};
