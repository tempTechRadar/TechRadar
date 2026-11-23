"use client";
// 다시 읽기 단추(design.md 18절): 누른 뒤 저장소를 읽는 동안 "읽는 중"을 보여 준다(몇 분 걸릴 수 있어 같은 단추를 또 누르지 않게).
import { useFormStatus } from "react-dom";

/** compact = 보드 레포 줄의 작은 ⟳(이름은 "다시 읽기") */
export function RereadButton({ compact = false }: { compact?: boolean }) {
  const { pending } = useFormStatus();
  if (compact) return <button className="btn btn-sm" type="submit" disabled={pending} aria-label="다시 읽기" title="다시 읽기">{pending ? <span role="status">읽는 중…</span> : "⟳"}</button>;
  return (
    <>
      <button className="btn" type="submit" disabled={pending}>{pending ? "읽는 중…" : "다시 읽기"}</button>
      {pending ? <span className="muted" role="status"> 저장소를 읽고 있어요. 몇 분 걸릴 수 있어요.</span> : null}
    </>
  );
}
