// 판단한 알림 카드의 [다음 판단 대기 →](P-12n R3-2): 지금 알림을 뺀 판단 대기 중 가장 최근 것. 목록 화면과 같은 차례(최신순)라 목록에서 위의 것부터 이어서 본다.
import type { AlertRecord } from "./to-alert-view.ts";

/** 다음 판단 대기 알림 id. 없으면 null(목록을 못 읽은 경우는 부르는 쪽이 "없음"과 다르게 다룬다, 불변 2) */
export function nextPendingId(alerts: Pick<AlertRecord, "id" | "status" | "createdAt">[], currentId: string): string | null {
  const pending = alerts.filter((a) => a.status === "pending" && a.id !== currentId);
  pending.sort((p, q) => Date.parse(q.createdAt) - Date.parse(p.createdAt));
  return pending[0]?.id ?? null;
}
