// 사용기 신고(P-24 24b, PRD-F35, IA-23): 신고를 글별로 묶고 처리 전·처리함으로 거른다. 순수 함수만(읽기는 lib/server/moderation-edit.ts).
// 쓴 사람·신고한 사람은 입력에 없다(DB 권한상 읽지 못하고 화면에도 보이지 않는다).
export type ReportRow = { id: string; noteId: string; reason: string; createdAt: string; handledAt: string | null; handleReason: string | null };
export type NoteRow = { id: string; techId: string; usedFor: string; result: string; tip: string; helpfulCount: number; hiddenAt: string | null; createdAt: string };
export type TechRow = { id: string; name: string };
export type ReportFilter = "pending" | "handled" | "all";

export type ReasonView = { reason: string; at: string; handled: boolean };
export type ReportGroup = {
  noteId: string; techName: string | null; note: NoteRow | null; hidden: boolean; helpfulCount: number;
  pendingCount: number; handledCount: number; reasons: ReasonView[]; lastReportAt: string; handledAt: string | null; handleReason: string | null;
};
export type ReportCounts = { pending: number; handled: number; all: number };

const byNewest = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

export function groupReports(input: { reports: ReportRow[]; notes: NoteRow[]; techs: TechRow[]; filter: ReportFilter }): { groups: ReportGroup[]; counts: ReportCounts } {
  const notes = new Map(input.notes.map((n) => [n.id, n]));
  const techs = new Map(input.techs.map((t) => [t.id, t.name]));
  const byNote = new Map<string, ReportRow[]>();
  for (const r of input.reports) byNote.set(r.noteId, [...(byNote.get(r.noteId) ?? []), r]);

  const all = [...byNote.entries()].map(([noteId, rows]): ReportGroup => {
    const note = notes.get(noteId) ?? null; // 글을 못 찾아도 신고는 버리지 않는다(없는 것으로 단정하지 않음)
    const handled = rows.filter((r) => r.handledAt !== null).sort((a, b) => byNewest(a.handledAt!, b.handledAt!));
    return {
      noteId, note, techName: note ? techs.get(note.techId) ?? null : null,
      hidden: note?.hiddenAt != null, helpfulCount: note?.helpfulCount ?? 0,
      pendingCount: rows.length - handled.length, handledCount: handled.length,
      reasons: [...rows].sort((a, b) => byNewest(a.createdAt, b.createdAt)).map((r) => ({ reason: r.reason, at: r.createdAt, handled: r.handledAt !== null })),
      lastReportAt: rows.reduce((m, r) => (r.createdAt > m ? r.createdAt : m), ""),
      handledAt: handled[0]?.handledAt ?? null, handleReason: handled[0]?.handleReason ?? null,
    };
  });
  const pending = all.filter((g) => g.pendingCount > 0);
  const counts = { pending: pending.length, handled: all.length - pending.length, all: all.length };
  const shown = input.filter === "pending" ? pending : input.filter === "handled" ? all.filter((g) => g.pendingCount === 0) : all;
  shown.sort((a, b) => b.pendingCount - a.pendingCount || byNewest(a.lastReportAt, b.lastReportAt));
  return { groups: shown, counts };
}
