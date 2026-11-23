// 사용기 신고 카드 한 장(P-24 24b, IA-23): 기술 이름·글 내용(글자 그대로)·신고 사유·처리 상태·고치기 폼. 쓴 사람·신고한 사람은 데이터에 없다.
// page.tsx와 개발용 샘플 화면이 같이 쓴다.
import type { ReportGroup } from "@/lib/admin/report-groups";
import { when } from "../admin-shell";
import { HiddenNoteForm, VisibleNoteForm } from "./report-forms";

const line = { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } as const;

function NoteBody({ g }: { g: ReportGroup }) {
  if (!g.note) return <p className="muted">글을 찾지 못했어요(지워졌거나 불러오지 못했어요). 신고는 그대로 보여요.</p>;
  const body = (
    <div className="admin-notetext" style={line}>
      <div><b>무엇에 썼나</b> {g.note.usedFor}</div>
      <div><b>결과</b> {g.note.result}</div>
      <div><b>팁</b> {g.note.tip}</div>
    </div>
  );
  return g.hidden ? <details><summary style={{ minHeight: "var(--hit)", display: "flex", alignItems: "center", cursor: "pointer" }}>숨긴 글 내용 펼쳐 보기</summary>{body}</details> : body;
}

export function ReportCard({ g }: { g: ReportGroup }) {
  const heading = g.techName ?? "기술 이름을 읽지 못함";
  return (
    <article className="admin-card" aria-labelledby={`n-${g.noteId}`}>
      <h2 id={`n-${g.noteId}`} style={{ margin: 0 }}>{heading}</h2>
      <p className="muted">
        신고 {g.pendingCount + g.handledCount}건{g.pendingCount > 0 ? ` (처리 전 ${g.pendingCount})` : " (모두 처리함)"} · {g.hidden ? "숨긴 글" : "보이는 글"}
        {g.note ? ` · 도움이 됐어요 ${g.helpfulCount} · 글 ${when(g.note.createdAt)}` : ""}
      </p>
      <NoteBody g={g} />
      <div>
        <b>신고 사유</b> <span className="muted">(신고한 사람은 보이지 않아요)</span>
        <ul>{g.reasons.map((r, i) => <li key={i} style={line}>{r.reason} · {when(r.at)}{r.handled ? " · 처리함" : ""}</li>)}</ul>
      </div>
      {g.handledAt ? <p className="muted">처리: {when(g.handledAt)} · 사유 &quot;{g.handleReason ?? "—"}&quot;</p> : null}
      {g.note ? (g.hidden ? <HiddenNoteForm id={g.noteId} hasPending={g.pendingCount > 0} /> : <VisibleNoteForm id={g.noteId} hasPending={g.pendingCount > 0} />) : null}
    </article>
  );
}
