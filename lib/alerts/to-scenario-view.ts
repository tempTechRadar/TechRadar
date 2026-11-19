// 알림 상세의 "적용 시나리오" 카드(IA-8, SPEC-4.2)가 보여 줄 값을 정한다. DB·화면을 모르는 순수 함수.
// 완료로 보이는 것은 본문이 정해진 모양일 때만이다: 깨진 값은 완료로 보이지 않고 실패(다시 요청)로 본다.
import { SCENARIO_PER_USER_PER_DAY } from "../ai/decide-ai-call.ts";
import type { ComparisonRow } from "./build-comparison.ts";
import { cellOf, type CellView } from "./to-alert-view.ts";

export type ScenarioRecord = { id: string; status: "generating" | "done" | "failed"; createdAt: string; body: unknown; sources: unknown };

export type ScenarioCard =
  | { state: "idle"; remaining: number }
  | { state: "limit" }
  | { state: "generating" }
  | { state: "failed"; canRetry: boolean }
  | {
      state: "done";
      createdAtLabel: string;
      comparison: { headers: { mine: string; theirs: string }; rows: { item: string; mine: CellView; theirs: CellView }[] } | null;
      steps: string[];
      risks: string[];
      sources: { text: string; isLink: boolean }[];
    };

const STALE_GENERATING_MS = 10 * 60 * 1000;
const time = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

const isLines = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every((line) => typeof line === "string");

type Body = { comparison: { techName: string; altName: string; rows: ComparisonRow[] } | null; steps: string[]; risks: string[] };

function readBody(raw: unknown): Body | null {
  const body = raw as { comparison?: any; steps?: unknown; risks?: unknown } | null;
  if (!body || typeof body !== "object" || !isLines(body.steps) || !isLines(body.risks)) return null;
  const c = body.comparison;
  const comparison = c && typeof c.techName === "string" && typeof c.altName === "string" && Array.isArray(c.rows) ? c : null;
  return { comparison, steps: body.steps, risks: body.risks };
}

export function toScenarioView(latest: ScenarioRecord | null, usedToday: number, now: Date): ScenarioCard {
  const remaining = Math.max(0, SCENARIO_PER_USER_PER_DAY - usedToday);
  if (!latest) return remaining === 0 ? { state: "limit" } : { state: "idle", remaining };
  const failed: ScenarioCard = { state: "failed", canRetry: remaining > 0 };
  if (latest.status === "failed") return failed;
  if (latest.status === "generating") return now.getTime() - new Date(latest.createdAt).getTime() > STALE_GENERATING_MS ? failed : { state: "generating" };
  const body = readBody(latest.body);
  if (!body) return failed;
  return {
    state: "done",
    createdAtLabel: time.format(new Date(latest.createdAt)),
    comparison: body.comparison && {
      headers: { mine: `내 기술 ${body.comparison.techName}`, theirs: `대체 ${body.comparison.altName}` },
      rows: body.comparison.rows.map((row) => ({ item: row.item, mine: cellOf(row.mine), theirs: cellOf(row.theirs) })),
    },
    steps: body.steps,
    risks: body.risks,
    sources: (Array.isArray(latest.sources) ? latest.sources : []).filter((s): s is string => typeof s === "string").map((text) => ({ text, isLink: /^https?:\/\//i.test(text) })),
  };
}
