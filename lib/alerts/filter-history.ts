// 기록 찾기(PRD-F20, IA-9): 지난 판단을 기술 이름 · 이유 · 종류 · 판단 결과 · 기간으로 찾는다. DB·화면을 모르는 순수 함수.
// 알림 판단과 지도에서 남긴 판단(tech_mark_events, 관심 · 적용 후보 · 보류)을 함께 거른다.
// "본인 기록만"은 조회(user_id 조건과 RLS)가 맡는다: 여기는 이미 읽은 내 기록을 거르기만 한다.
import type { AlertKind } from "./filter-alerts.ts";
import { parseAlertFilter } from "./parse-alert-filter.ts";

type Param = string | string[] | undefined;
export type Decision = "candidate" | "hold";
/** 기록에서 거르는 판단: 알림 판단 둘 + 지도에서만 남기는 관심 */
export type HistoryDecision = Decision | "interest";

/** kind가 null이면 지도에서 남긴 판단(알림 없음), decision이 null이면 표시를 지운 기록 */
export type HistoryItem = { id: string; techName: string; kind: AlertKind | null; decision: HistoryDecision | null; judgedAt: string; reason?: string | null };
export type HistoryFilter = { query?: string; kind?: AlertKind; decision?: HistoryDecision; from?: string };

const DECISIONS: HistoryDecision[] = ["candidate", "hold", "interest"];

export function filterHistory<T extends HistoryItem>(items: T[], filter: HistoryFilter): T[] {
  const query = filter.query?.trim().toLowerCase();
  return items.filter(
    (item) =>
      (!query || item.techName.toLowerCase().includes(query) || Boolean(item.reason?.toLowerCase().includes(query))) &&
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
