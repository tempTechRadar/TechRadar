// 보드 지도 · 소식 판 머리 "바뀐 것 n"(P-12k K4, 안내서 필수 "변경 수"): 내 알림 모든 종류, 숫자 띠의 [기간]을 따른다. DB · 화면을 모르는 순수 함수.
// 숫자는 알림 목록과 같은 거르기(summarizeDashboard → filterAlerts)라 누르면 가는 /alerts 목록의 행 수와 늘 같다. 알림을 못 읽었으면(null) n = null(0과 다르게, 불변 2).
import type { AlertRow } from "../alerts/filter-alerts.ts";
import { summarizeDashboard } from "../alerts/summarize-dashboard.ts";

export function changeCount(alerts: AlertRow[] | null, period: string, now: Date): { n: number | null; href: string } {
  if (!alerts) return { n: null, href: "/alerts" };
  const s = summarizeDashboard({ alerts, techs: [], params: { period }, now });
  return { n: s.changeCount, href: s.links.changes };
}
