// 보류 회고(PRD-F41): 보류한 지 30일이 지난 판단을 찾는다. DB·화면을 모르는 순수 함수.
// 판단 대기 수에는 들어가지 않는다(이미 완료된 알림이라서). 보류는 고칠 수 없으니(SPEC-4.1) 카드는 상세로 안내만 한다.
export type ReviewCandidate = {
  id: string;
  change: { techName: string };
  judgment: { decision: "candidate" | "hold"; reason: string | null; judgedAt: string } | null;
};

/** judgedOn: 보류한 날(한국 시간) "10월 7일" */
export type ReviewDue = { id: string; techName: string; reason: string; judgedAt: string; judgedOn: string; daysAgo: number };

const koreanDay = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

export const REVIEW_AFTER_DAYS = 30;
// 정한 것(문서에 없어서): 닫기 표시를 저장할 칸이 없어서, 오래된 순으로 5건까지만 보여 준다.
const LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export function findReviewDue(alerts: ReviewCandidate[], now: Date): ReviewDue[] {
  return alerts
    .flatMap((alert) => {
      const { judgment } = alert;
      if (!judgment || judgment.decision !== "hold") return [];
      const daysAgo = Math.floor((now.getTime() - new Date(judgment.judgedAt).getTime()) / DAY_MS);
      if (daysAgo < REVIEW_AFTER_DAYS) return [];
      const judgedOn = koreanDay.format(new Date(judgment.judgedAt));
      return [{ id: alert.id, techName: alert.change.techName, reason: judgment.reason || "찾지 못함", judgedAt: judgment.judgedAt, judgedOn, daysAgo }];
    })
    .sort((a, b) => new Date(a.judgedAt).getTime() - new Date(b.judgedAt).getTime())
    .slice(0, LIMIT);
}
