// 알림 목록 주소의 값(?kind=&status=&period=)을 거르기 조건으로 바꾼다. 모르는 값은 걸지 않는다(전체).
import type { AlertFilter, AlertKind, AlertStatus } from "./filter-alerts.ts";

type Param = string | string[] | undefined;

const KINDS: AlertKind[] = ["security", "opportunity", "model_eol"];
const STATUSES: AlertStatus[] = ["pending", "done"];
const PERIOD_DAYS: Record<string, number> = { "1d": 1, "7d": 7, "30d": 30 } // 1d = 보드 숫자 띠 "오늘"(P-12k);
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseAlertFilter(params: { kind?: Param; status?: Param; period?: Param; project?: Param }, now: Date): AlertFilter {
  const filter: AlertFilter = {};
  const kind = KINDS.find((k) => k === params.kind);
  const status = STATUSES.find((s) => s === params.status);
  const days = typeof params.period === "string" ? PERIOD_DAYS[params.period] : undefined;
  if (kind) filter.kind = kind;
  if (status) filter.status = status;
  if (typeof params.project === "string" && params.project !== "") filter.projectId = params.project;
  if (days) filter.from = new Date(now.getTime() - days * DAY_MS).toISOString();
  return filter;
}
