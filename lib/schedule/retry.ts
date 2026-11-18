// 재시도와 연속 실패(SPEC-8): 실행 단위로 2·4·8분 뒤 최대 3번, 같은 출처가 3번 연속 수집 오류면 관리자 강조. 순수 함수.

/** n번째 시도가 실패했을 때 다음 시도까지 기다릴 분(1번째 실패 → 2분, 2번째 → 4분, 3번째 → 8분) */
export const RETRY_DELAYS_MIN = [2, 4, 8] as const;
/** runs.attempt는 1–3(DB 제약). 3번째 시도가 실패하면 더 하지 않는다 */
export const MAX_ATTEMPT = 3;
export const HIGHLIGHT_AFTER = 3;

export type RetryPlan = { attempt: number; at: string } | null;

/** 실패한 시도 번호와 시각 → 다음 시도 번호와 시각. 마지막 시도였으면 null. */
export function nextRetry(failedAttempt: number, failedAtMs: number): RetryPlan {
  if (!Number.isInteger(failedAttempt) || failedAttempt < 1 || failedAttempt >= MAX_ATTEMPT) return null;
  const minutes = RETRY_DELAYS_MIN[failedAttempt - 1];
  return { attempt: failedAttempt + 1, at: new Date(failedAtMs + minutes * 60_000).toISOString() };
}

/** 출처 하나의 결과 한 번: 어느 실행에서(시각), 실패였는지 */
export type SourceResult = { source: string; at: string; failed: boolean };

/** 출처마다 가장 최근부터 끊기지 않고 이어진 실패 횟수 */
export function consecutiveFailures(results: SourceResult[]): Map<string, number> {
  const bySource = new Map<string, SourceResult[]>();
  for (const r of results) bySource.set(r.source, [...(bySource.get(r.source) ?? []), r]);
  const streaks = new Map<string, number>();
  for (const [source, list] of bySource) {
    const newestFirst = [...list].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    let n = 0;
    while (n < newestFirst.length && newestFirst[n].failed) n++;
    streaks.set(source, n);
  }
  return streaks;
}

/** 관리자 화면에서 강조할 출처(3번 연속 수집 오류), 이름순 */
export function sourcesToHighlight(results: SourceResult[], threshold = HIGHLIGHT_AFTER): string[] {
  return [...consecutiveFailures(results)].filter(([, n]) => n >= threshold).map(([s]) => s).sort();
}
