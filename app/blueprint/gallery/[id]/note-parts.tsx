"use client";
// 템플릿 사용기의 누르는 조각(P-12f 조각 G 화면, PRD-F48): 도움이 됐어요 · 신고 · 쓰기. 기술 사용기(app/projects/tech/[id]/usage-note-*)와 같은 모양 · 문구.
// 서버 액션(app/blueprint/actions.ts, DevAssi2)이 미리보기 · 로그인 · 길이를 다시 보고, DB(RLS)가 써 본 사람만 · 작가 · 자기 글 제외를 막는다(불변 5).
// 실패하면 화면 값을 그대로 두고 이유를 보인다(불변 4). 성공하면 서버 값으로 다시 그린다(router.refresh)
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NOTE_MAX, noteLength } from "@/lib/domain/usage-note";
import { markTemplateNoteHelpfulAction, reportTemplateNoteAction, saveTemplateNoteAction } from "../../actions";

const FAILED = "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
type Result = { ok: true } | { ok: false; error: string };
const safe = (p: Promise<Result>) => p.catch((): Result => ({ ok: false, error: FAILED }));

export function NoteButtons({ noteId, count, mine, voted, reported }: { noteId: string; count: number; mine: boolean; voted: boolean; reported: boolean }) {
  const router = useRouter();
  const [didHelp, setDidHelp] = useState(voted);
  const [didReport, setDidReport] = useState(reported);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  async function help() {
    setBusy(true); setError("");
    const r = await safe(markTemplateNoteHelpfulAction(noteId));
    setBusy(false);
    if (r.ok) { setDidHelp(true); router.refresh(); } else setError(r.error);
  }
  async function report() {
    setBusy(true); setError("");
    const r = await safe(reportTemplateNoteAction(noteId, reason));
    setBusy(false);
    if (r.ok) setDidReport(true); else setError(r.error);
  }
  return (
    <div className="muted">
      <button type="button" className="btn" disabled={mine || didHelp || busy} aria-pressed={didHelp} onClick={() => void help()}>
        도움이 됐어요 {count + (didHelp && !voted ? 1 : 0)}{mine ? " (내 글)" : didHelp ? " ✓" : ""}
      </button>
      {!mine && (didReport ? <span> 신고했어요</span> : (
        <details style={{ display: "inline-block", marginLeft: 8 }}>
          <summary>신고</summary>
          <form onSubmit={(e) => { e.preventDefault(); if (!busy) void report(); }}>
            <label>사유(200자까지)<input value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={400} autoComplete="off" /></label>
            <button type="submit" className="btn" disabled={busy}>{busy ? "보내는 중…" : "신고 보내기"}</button>
          </form>
        </details>
      ))}
      {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
    </div>
  );
}

export function NoteForm({ templateId }: { templateId: string }) {
  const router = useRouter();
  const [note, setNote] = useState({ usedFor: "", result: "", tip: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const left = NOTE_MAX - noteLength(note);
  async function send() {
    setBusy(true); setMsg(null);
    const r = await safe(saveTemplateNoteAction(templateId, note));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; } // 실패하면 쓴 글을 그대로 둔다(불변 4)
    setNote({ usedFor: "", result: "", tip: "" });
    setMsg({ ok: true, text: "사용기를 남겼어요." });
    router.refresh();
  }
  const field = (name: keyof typeof note, label: string) => (
    <label>{label}<textarea name={name} rows={2} required value={note[name]} onChange={(e) => setNote((n) => ({ ...n, [name]: e.target.value }))} /></label>
  );
  return (
    <form className="settings-form" onSubmit={(e) => { e.preventDefault(); if (!busy) void send(); }}>
      {field("usedFor", "무엇에 썼나요")}
      {field("result", "결과는 어땠나요")}
      {field("tip", "한 줄 팁")}
      <p className={left < 0 ? "notice notice-error" : "muted"}>세 칸 합쳐 {NOTE_MAX}자까지 · {left >= 0 ? `${left}자 남음` : `${-left}자 넘었어요`}</p>
      {msg ? <div className={`notice ${msg.ok ? "notice-ok" : "notice-error"}`} role={msg.ok ? "status" : "alert"}><strong>{msg.text}</strong></div> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "남기는 중…" : "사용기 남기기"}</button>
    </form>
  );
}
