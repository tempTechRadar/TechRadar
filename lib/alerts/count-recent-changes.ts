// 이번 주 요약 카드의 숫자(PRD-F43): 최근 7일에 생긴 내 알림 수. DB·화면을 모르는 순수 함수.
// 정한 것(문서에 없어서): "내 기술 변화"는 내 알림이 생긴 수로 센다(IA-5의 "변경 수"와 같은 뜻).
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function countRecentChanges(alerts: { createdAt: string }[], now: Date): number {
  const from = now.getTime() - WEEK_MS;
  return alerts.filter((alert) => new Date(alert.createdAt).getTime() >= from).length;
}
