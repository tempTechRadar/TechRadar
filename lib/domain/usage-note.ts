// 사용기(PRD-F35) 입력 검사. 순수 함수만. DB의 check(세 칸 합쳐 500자, 빈 칸 금지)와 같은 규칙을 앱에서 먼저 막아 알기 쉬운 안내를 준다.
export const NOTE_MAX = 500;
export const REPORT_REASON_MAX = 200;

export type NoteInput = { usedFor: string; result: string; tip: string };
export type NoteCheck = { ok: true; note: NoteInput } | { ok: false; error: string };

// 글자 수는 DB의 char_length와 같게 코드 포인트로 센다(이모지 하나가 1, UTF-16 length는 2)
const chars = (s: string) => Array.from(s).length;
export const noteLength = (n: NoteInput) => chars(n.usedFor) + chars(n.result) + chars(n.tip);

export function validateUsageNote(input: NoteInput): NoteCheck {
  const note = { usedFor: input.usedFor.trim(), result: input.result.trim(), tip: input.tip.trim() };
  if (!note.usedFor || !note.result || !note.tip) return { ok: false, error: "세 칸(무엇에 썼나·결과·한 줄 팁)을 모두 적어 주세요" };
  const length = noteLength(note);
  if (length > NOTE_MAX) return { ok: false, error: `세 칸을 합쳐 ${NOTE_MAX}자까지예요 (지금 ${length}자)` };
  return { ok: true, note };
}

export type ReasonCheck = { ok: true; reason: string } | { ok: false; error: string };

export function validateReportReason(input: string): ReasonCheck {
  const reason = input.trim();
  if (!reason) return { ok: false, error: "신고 사유를 적어 주세요" };
  if (chars(reason) > REPORT_REASON_MAX) return { ok: false, error: `신고 사유는 ${REPORT_REASON_MAX}자까지예요` };
  return { ok: true, reason };
}
