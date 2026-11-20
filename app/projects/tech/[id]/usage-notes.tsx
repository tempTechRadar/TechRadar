import type { UsageNoteView } from "@/lib/server/usage-notes";
import { UsageNoteButtons } from "./usage-note-buttons";
import { UsageNoteForm } from "./usage-note-form";

// 사용기 목록과 쓰기(IA-4, PRD-F35). 글은 React가 글자 그대로 그린다(HTML로 해석하지 않음). 줄바꿈만 살린다.
// 쓴 사람은 보여 주지 않는다(다른 사람의 별명은 DB 권한상 읽을 수 없고, 공개 여부(F34)도 있다).
// 신고는 쌓이기만 하고 숨기는 화면은 아직 없다(24b).
const day = (iso: string) => iso.slice(0, 10);
const line = { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } as const;

export function UsageNotes({ techId, pathId, notes }: { techId: string; pathId: string; notes: UsageNoteView[] | null }) {
  return (
    <article className="card" aria-labelledby="notes-title">
      <h2 id="notes-title">사용기{notes ? ` (${notes.length})` : ""}</h2>
      <p className="muted">써 본 사람이 남긴 글이에요. 보안 등급에는 영향이 없고, 글 내용은 확인된 사실이 아니에요.</p>
      {notes === null ? (
        <p className="notice notice-error" role="alert">사용기를 불러오지 못했어요. 없는 게 아니에요. 잠시 뒤 새로 고쳐 주세요.</p>
      ) : notes.length === 0 ? (
        <p className="notice notice-empty">아직 사용기가 없어요. 첫 사용기를 남겨 보세요.</p>
      ) : (
        <ul className="alert-list">
          {notes.map((n) => (
            <li key={n.id}>
              <p className="muted">사용자 · {day(n.createdAt)}{n.mine ? " · 내 글" : ""}</p>
              <p style={line}><strong>무엇에 썼나</strong> {n.usedFor}</p>
              <p style={line}><strong>결과</strong> {n.result}</p>
              <p style={line}><strong>팁</strong> {n.tip}</p>
              <UsageNoteButtons noteId={n.id} pathId={pathId} count={n.helpfulCount} mine={n.mine} voted={n.voted} reported={n.reported} />
            </li>
          ))}
        </ul>
      )}
      <h3>사용기 남기기</h3>
      <UsageNoteForm techId={techId} pathId={pathId} />
    </article>
  );
}
