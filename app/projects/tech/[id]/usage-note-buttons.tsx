"use client";
import { useActionState } from "react";
import { pressHelpful, sendReport, type NoteState } from "./usage-actions";

// 도움이 됐어요 / 신고(PRD-F35). 이미 눌렀거나 신고했으면 눌린 상태로 보이고, 내 글이면 누를 수 없다.
export function UsageNoteButtons({ noteId, pathId, count, mine, voted, reported }: { noteId: string; pathId: string; count: number; mine: boolean; voted: boolean; reported: boolean }) {
  const [help, helpAction, helpPending] = useActionState<NoteState, FormData>(pressHelpful, null);
  const [rep, repAction, repPending] = useActionState<NoteState, FormData>(sendReport, null);
  const didHelp = voted || (help?.done ?? false);
  const didReport = reported || (rep?.done ?? false);
  return (
    <div className="muted">
      <form action={helpAction} style={{ display: "inline" }}>
        <input type="hidden" name="noteId" value={noteId} />
        <input type="hidden" name="pathId" value={pathId} />
        <button type="submit" className="btn" disabled={mine || didHelp || helpPending} aria-pressed={didHelp}>
          도움이 됐어요 {count}{mine ? " (내 글)" : didHelp ? " ✓" : ""}
        </button>
      </form>
      {!mine && (didReport ? (
        <span> 신고했어요</span>
      ) : (
        <details style={{ display: "inline-block", marginLeft: 8 }}>
          <summary>신고</summary>
          <form action={repAction}>
            <input type="hidden" name="noteId" value={noteId} />
            <input type="hidden" name="pathId" value={pathId} />
            <label>사유(200자까지)<input name="reason" required maxLength={400} autoComplete="off" /></label>
            <button type="submit" className="btn" disabled={repPending}>{repPending ? "보내는 중…" : "신고 보내기"}</button>
          </form>
        </details>
      ))}
      {help?.error ? <p className="notice notice-error" role="alert">{help.error}</p> : null}
      {rep?.error ? <p className="notice notice-error" role="alert">{rep.error}</p> : null}
    </div>
  );
}
