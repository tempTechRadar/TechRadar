// 비슷한 과거 판단 찾기(SPEC-4.5, PRD-F21). 규칙으로 찾는다(검색·임베딩 아님): 같은 입력에 같은 결과.
// DB·화면을 모른다. "내 판단만"은 읽는 쪽(user_id 조건과 RLS)이 맡는다.
import type { Decision } from "./filter-history.ts";

export type PastJudgment = {
  alertId: string;
  techId: string;
  techName: string;
  categoryId: string | null;
  decision: Decision;
  reason: string | null;
  /** 그때의 등급(한글). 모르면 null */
  grade: string | null;
  judgedAt: string;
};

export type CurrentContext = {
  alertId: string;
  techId: string;
  categoryId: string | null;
  /** 확정된 같은 역할 기술의 id들 */
  sameRoleTechIds: string[];
};

export type MatchKind = "same_tech" | "same_role" | "same_category";
export type SimilarJudgment = PastJudgment & { match: MatchKind };

// plan P-15: "같은 기술·같은 역할·같은 갈래 순으로 지난 판단 3개". spec의 "각 순서 안에서 3개까지"는 합쳐서 3개로 읽었다.
const LIMIT = 3;

function matchOf(current: CurrentContext, judgment: PastJudgment): MatchKind | null {
  if (judgment.techId === current.techId) return "same_tech";
  if (current.sameRoleTechIds.includes(judgment.techId)) return "same_role";
  if (current.categoryId !== null && judgment.categoryId === current.categoryId) return "same_category";
  return null;
}

const ORDER: MatchKind[] = ["same_tech", "same_role", "same_category"];
const newestFirst = (a: PastJudgment, b: PastJudgment) => new Date(b.judgedAt).getTime() - new Date(a.judgedAt).getTime();

export function findSimilarJudgments(current: CurrentContext, history: PastJudgment[]): SimilarJudgment[] {
  const matched = history
    .filter((judgment) => judgment.alertId !== current.alertId)
    .flatMap((judgment) => {
      const match = matchOf(current, judgment);
      return match ? [{ ...judgment, match }] : [];
    });
  return ORDER.flatMap((kind) => matched.filter((m) => m.match === kind).sort(newestFirst)).slice(0, LIMIT);
}
