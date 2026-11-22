"use client";
import { useActionState, useState } from "react";
import { NOTE_MAX, noteLength } from "@/lib/domain/usage-note";
import { submitUsageNote, type NoteState } from "./usage-actions";

// 사용기 쓰기 폼(IA-4, PRD-F35). 세 칸 합쳐 500자. 길이 검사는 서버가 다시 한다(남은 글자는 안내일 뿐).
export function UsageNoteForm({ techId, pathId }: { techId: string; pathId: string }) {
  const [state, action, pending] = useActionState<NoteState, FormData>(submitUsageNote, null);
  const [used, setUsed] = useState({ usedFor: "", result: "", tip: "" });
  const left = NOTE_MAX - noteLength(used);
  const sent = state?.done && !pending;
  const shown = (name: "usedFor" | "result" | "tip") => (sent ? "" : state?.[name] ?? undefined);
  return (
    <form action={action} className="settings-form" onInput={(e) => { const t = e.target as HTMLTextAreaElement; setUsed((u) => ({ ...u, [t.name]: t.value })); }}>
      <input type="hidden" name="techId" value={techId} />
      <input type="hidden" name="pathId" value={pathId} />
      <label>무엇에 썼나요<textarea name="usedFor" rows={2} required defaultValue={shown("usedFor")} /></label>
      <label>결과는 어땠나요<textarea name="result" rows={2} required defaultValue={shown("result")} /></label>
      <label>한 줄 팁<textarea name="tip" rows={2} required defaultValue={shown("tip")} /></label>
      <p className={left < 0 ? "notice notice-error" : "muted"} aria-live="polite">세 칸 합쳐 {NOTE_MAX}자까지 · {left >= 0 ? `${left}자 남음` : `${-left}자 넘었어요`}</p>
      {state?.error ? <div className="notice notice-error" role="alert"><strong>{state.error}</strong></div> : null}
      {sent ? <div className="notice notice-ok" role="status"><strong>사용기를 남겼어요.</strong></div> : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "남기는 중…" : "사용기 남기기"}</button>
    </form>
  );
}
