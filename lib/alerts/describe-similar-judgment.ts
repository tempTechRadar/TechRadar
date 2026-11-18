// 알림 상세의 "비슷한 지난 판단" 한 줄을 화면에 찍을 글로 바꾼다(SPEC-4.5: 날짜, 기술, 판단 결과, 이유, 그때의 등급). 순수 함수.
import type { MatchKind, SimilarJudgment } from "./find-similar-judgments.ts";

const NOT_FOUND = "찾지 못함";
const MATCH_LABEL: Record<MatchKind, string> = { same_tech: "같은 기술", same_role: "같은 역할", same_category: "같은 갈래" };
const DECISION_LABEL = { candidate: "적용 후보", hold: "보류" };
const day = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

export function describeSimilarJudgment(judgment: SimilarJudgment): { title: string; detail: string; meta: string } {
  return {
    title: `${judgment.techName} · ${DECISION_LABEL[judgment.decision]}`,
    detail: judgment.decision === "hold" ? `이유: ${judgment.reason ?? NOT_FOUND}` : "적용 후보로 정했어요",
    meta: `${MATCH_LABEL[judgment.match]} · ${day.format(new Date(judgment.judgedAt))} · 그때 등급 ${judgment.grade ?? NOT_FOUND}`,
  };
}
