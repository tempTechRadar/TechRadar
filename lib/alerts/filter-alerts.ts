// 알림 목록 거르기와 판단 대기 수 세기(PRD-F14, IA-6). DB·화면을 모르는 순수 함수.
// 정렬은 하지 않는다: 순서는 조회(DB)가 정하고 여기서는 입력 순서를 지킨다.

export type AlertKind = "security" | "opportunity" | "model_eol";
export type AlertStatus = "pending" | "done";

export type AlertRow = {
  id: string;
  kind: AlertKind;
  status: AlertStatus;
  createdAt: string;
};

export type AlertFilter = {
  kind?: AlertKind;
  status?: AlertStatus;
  from?: string; // 이 시각 이상
  to?: string; // 이 시각 미만
};

function isInPeriod(createdAt: string, from?: string, to?: string): boolean {
  const time = new Date(createdAt).getTime();
  if (from !== undefined && time < new Date(from).getTime()) return false;
  if (to !== undefined && time >= new Date(to).getTime()) return false;
  return true;
}

/** 첫 화면 띠의 숫자. 목록의 거르기 조건과 상관없이 전체 판단 대기 수다(PRD-F14). */
export function countPending(alerts: AlertRow[]): number {
  return alerts.filter((alert) => alert.status === "pending").length;
}

export function filterAlerts(alerts: AlertRow[], filter: AlertFilter): AlertRow[] {
  return alerts.filter(
    (alert) =>
      (filter.kind === undefined || alert.kind === filter.kind) &&
      (filter.status === undefined || alert.status === filter.status) &&
      isInPeriod(alert.createdAt, filter.from, filter.to),
  );
}
