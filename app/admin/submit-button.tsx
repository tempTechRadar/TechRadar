"use client";
// 시연 · 실행 단추(P-12g C6): 서버가 실제로 일하는 동안(useFormStatus().pending)만 글자를 바꾸고 다시 누르지 못하게 한다(겹쳐 누름 방지, 불변 3 보조).
// 진행률은 알 수 없어 막대 · 도는 표시는 넣지 않는다. 단추 글자만으로는 화면 읽기가 잘 안 읽어서 옆에 늘 있는 status 줄로 알린다.
import type { CSSProperties } from "react";
import { useFormStatus } from "react-dom";

const PENDING = "실행 중… 기록을 남기는 중";

/** className: "primary"(주 행동, 청록 채움) · "danger"(위험한 일, 빨강 테두리) · 없음(보조) — P-12n 단추 규칙 */
export function SubmitButton({ label, pendingNote, disabled = false, style, className }: { label: string; pendingNote?: string; disabled?: boolean; style?: CSSProperties; className?: string }) {
  const { pending } = useFormStatus();
  const busy = pending ? (pendingNote ? `${PENDING}(${pendingNote})` : PENDING) : "";
  return (
    <>
      <button type="submit" className={className} style={{ minHeight: "var(--hit)", ...style }} disabled={disabled || pending} aria-busy={pending || undefined}>{pending ? busy : label}</button>
      <span role="status" className="sr-only">{busy}</span>
    </>
  );
}
