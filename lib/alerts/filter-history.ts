// 기록 찾기(PRD-F20, IA-9): 지난 판단을 기술 이름·종류·판단 결과·기간으로 찾는다. DB·화면을 모르는 순수 함수.
// "본인 기록만"은 조회(user_id 조건과 RLS)가 맡는다: 여기는 이미 읽은 내 기록을 거르기만 한다.
import type { AlertKind } from "./filter-alerts.ts";
import { parseAlertFilter } from "./parse-alert-filter.ts";

type Param = string | string[] | undefined;
export type Decision = "candidate" | "hold";

export type HistoryItem = { id: string; techName: string; kind: AlertKind; decision: Decision; judgedAt: string };
export type HistoryFilter = { query?: string; kind?: AlertKind; decision?: Decision; from?: string };

const DECISIONS: Decision[] = ["candidate", "hold"];

export function filterHistory<T extends HistoryItem>(items: T[], filter: HistoryFilter): T[] {
  const query = filter.query?.trim().toLowerCase();
  return items.filter(
    (item) =>
      (!query || item.techName.toLowerCase().includes(query)) &&
      (filter.kind === undefined || item.kind === filter.kind) &&
      (filter.decision === undefined || item.decision === filter.decision) &&
      (filter.from === undefined || new Date(item.judgedAt).getTime() >= new Date(filter.from).getTime()),
  );
}

export function parseHistoryFilter(params: { q?: Param; kind?: Param; decision?: Param; period?: Param }, now: Date): HistoryFilter {
  const { kind, from } = parseAlertFilter({ kind: params.kind, period: params.period }, now);
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const decision = DECISIONS.find((d) => d === params.decision);
  const filter: HistoryFilter = {};
  if (query) filter.query = query;
  if (kind) filter.kind = kind;
  if (decision) filter.decision = decision;
  if (from) filter.from = from;
  return filter;
}
