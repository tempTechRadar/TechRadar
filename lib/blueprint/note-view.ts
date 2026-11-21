// 템플릿 사용기 보이기 순서(P-12f 조각 G 화면, PRD-F48): "도움이 됐어요" 많은 순 → 새것 순. 위 몇 개만 보이고 나머지는 "모두 보기".
import type { UsageNoteView } from "../server/usage-notes.ts";

export const TOP_NOTES = 3;

/** all이 아니면 위 TOP_NOTES개만. 원본 목록은 바꾸지 않는다 */
export function orderNotes(notes: UsageNoteView[], all: boolean): UsageNoteView[] {
  const sorted = [...notes].sort((a, b) => b.helpfulCount - a.helpfulCount || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return all ? sorted : sorted.slice(0, TOP_NOTES);
}
