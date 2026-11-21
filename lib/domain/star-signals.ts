// technologies.signals에서 별 수·의심 표시를 읽는다(SPEC-3.2 조건 4, ADR 0030). DB를 모르는 순수 함수.
// signals는 수집기마다 다른 키를 덧붙이는 JSON이라 모양을 믿지 않는다: 못 읽은 값은 "모름"(null)이지 "낮음"이 아니다(불변 2).
const record = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** 유한한 0 이상의 수만 별 수로 본다. 없음·문자열·NaN·음수·무한은 null(모름) */
export function starsOfSignals(signals: unknown): number | null {
  const stars = record(signals)?.stars;
  return typeof stars === "number" && Number.isFinite(stars) && stars >= 0 ? stars : null;
}

/** candidate_flags(의심 표시: new_spike·clone_cluster)가 비어 있지 않은 배열이면 true. 없거나 배열이 아니면 의심 없음 */
export function isFlaggedSignals(signals: unknown): boolean {
  const flags = record(signals)?.candidate_flags;
  return Array.isArray(flags) && flags.length > 0;
}
