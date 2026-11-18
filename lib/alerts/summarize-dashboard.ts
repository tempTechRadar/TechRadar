// 대시보드 숫자(PRD-F22, IA-5). DB·화면을 모르는 순수 함수.
// 숫자는 알림 목록과 같은 거르기 함수(filterAlerts)로 센다: 숫자를 눌러 가는 목록의 건수와 늘 같다.
import { filterAlerts, type AlertFilter, type AlertRow, type AlertStatus } from "./filter-alerts.ts";
import { parseAlertFilter } from "./parse-alert-filter.ts";

type Param = string | string[] | undefined;
export type DashboardParams = { kind?: Param; status?: Param; period?: Param; project?: Param };

export type DashboardSummary<A extends AlertRow> = {
  techCount: number;
  changeCount: number;
  pendingCount: number;
  doneCount: number;
  recent: A[];
  /** 숫자를 누르면 가는 곳. 알림 목록은 같은 거르기를 주소에 싣는다 */
  links: { techs: string; changes: string; pending: string; done: string };
};

const RECENT_LIMIT = 5;

// 링크에는 알아들은 조건만 싣는다(모르는 값은 목록에서도 걸리지 않는다)
function alertsLink(filter: AlertFilter, period: Param, status?: AlertStatus): string {
  const query = new URLSearchParams();
  if (filter.kind) query.set("kind", filter.kind);
  const shownStatus = status ?? filter.status;
  if (shownStatus) query.set("status", shownStatus);
  if (filter.from && typeof period === "string") query.set("period", period);
  if (filter.projectId) query.set("project", filter.projectId);
  const text = query.toString();
  return text ? `/alerts?${text}` : "/alerts";
}

export function summarizeDashboard<A extends AlertRow>(input: {
  alerts: A[];
  techs: { projectId: string | null }[];
  params: DashboardParams;
  now: Date;
}): DashboardSummary<A> {
  const filter = parseAlertFilter(input.params, input.now);
  const count = (status?: AlertStatus) => filterAlerts(input.alerts, status ? { ...filter, status } : filter).length;
  const shown = filterAlerts(input.alerts, filter);
  return {
    techCount: input.techs.filter((tech) => filter.projectId === undefined || tech.projectId === filter.projectId).length,
    changeCount: shown.length,
    pendingCount: count("pending"),
    doneCount: count("done"),
    recent: [...shown].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, RECENT_LIMIT),
    links: {
      techs: filter.projectId === undefined ? "/projects" : `/projects?${new URLSearchParams({ project: filter.projectId }).toString()}`, // 숫자와 같은 프로젝트로 거른 내 기술 목록(PRD-F22, P-11)
      changes: alertsLink(filter, input.params.period),
      pending: alertsLink(filter, input.params.period, "pending"),
      done: alertsLink(filter, input.params.period, "done"),
    },
  };
}
