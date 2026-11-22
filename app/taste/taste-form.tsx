"use client";
import Link from "next/link";
import { useActionState } from "react";
import { BUILD_OPTIONS, INTEREST_MAX, INTEREST_OPTIONS, TOOL_OPTIONS, type Taste } from "@/lib/domain/taste";
import { saveTasteAction, type TasteState } from "./actions";

// 취향 질문 3개(IA-1b). 모두 건너뛸 수 있다. 개수 검사는 서버가 한다(브라우저는 안내만).
export function TasteForm({ initial, onboarding, next }: { initial: Taste; onboarding: boolean; next: string }) {
  const [state, action, pending] = useActionState<TasteState, FormData>(saveTasteAction, null);
  const shown = state ?? initial;
  return (
    <form action={action} className="settings-form">
      {onboarding ? <input type="hidden" name="onboarding" value="1" /> : null}
      <input type="hidden" name="next" value={next} />
      <fieldset>
        <legend>1. 무엇을 만드나요?</legend>
        {BUILD_OPTIONS.map((o) => (
          <label key={o.value} className="check"><input type="radio" name="build" value={o.value} defaultChecked={shown.build === o.value} /> {o.label}</label>
        ))}
      </fieldset>
      <fieldset>
        <legend>2. 쓰는 도구 <span className="muted">(여러 개)</span></legend>
        {TOOL_OPTIONS.map((o) => (
          <label key={o.value} className="check"><input type="checkbox" name="tools" value={o.value} defaultChecked={shown.tools.includes(o.value)} /> {o.label}</label>
        ))}
      </fieldset>
      <fieldset>
        <legend>3. 관심 분야 <span className="muted">(최대 {INTEREST_MAX}개)</span></legend>
        {INTEREST_OPTIONS.map((name) => (
          <label key={name} className="check"><input type="checkbox" name="interests" value={name} defaultChecked={shown.interests.includes(name)} /> {name}</label>
        ))}
      </fieldset>
      <p className="muted">추천에는 3번 관심 분야만 써요. 1·2번은 저장만 하고 아직 추천에 쓰지 않아요. 내 취향은 나만 볼 수 있어요(관리자도 못 봐요).</p>
      {state?.error ? <div className="notice notice-error" role="alert"><strong>{state.error}</strong></div> : null}
      {state?.saved && !pending ? <div className="notice notice-ok" role="status"><strong>저장했어요.</strong> <Link href="/recommend">추천 보기</Link></div> : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "저장하는 중…" : onboarding ? "저장하고 시작" : "저장"}</button>
      {onboarding ? <Link href={next} className="muted"> 건너뛰기</Link> : null}
    </form>
  );
}
