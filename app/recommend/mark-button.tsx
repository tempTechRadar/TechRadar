"use client";
import { useActionState } from "react";
import { markUi, type MarkKind } from "@/lib/domain/recommend";
import { toggleInterest, type InterestState } from "./actions";

// 추천 한 줄의 관심 단추(IA-20). 이미 적용 후보·보류로 정했으면 그 판단만 글자로 보여 준다(바꾸기는 기술 상세에서).
export function MarkButton({ techId, mark }: { techId: string; mark: MarkKind | null }) {
  const [state, action, pending] = useActionState<InterestState, FormData>(toggleInterest, null);
  const ui = markUi(mark);
  if (ui.kind === "decided") return <p className="muted">내 판단: {ui.label}</p>;
  const interested = ui.kind === "interested";
  return (
    <form action={action}>
      <input type="hidden" name="techId" value={techId} />
      <input type="hidden" name="action" value={interested ? "clear" : "interest"} />
      <button type="submit" disabled={pending} aria-pressed={interested} style={{ minHeight: 44 }}>
        {pending ? "저장 중…" : interested ? "관심 표시함 · 지우기" : "관심 있어요"}
      </button>
      {state?.error ? <p role="alert" className="muted">{state.error}</p> : null}
    </form>
  );
}
