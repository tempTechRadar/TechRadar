"use client";
import { useActionState } from "react";
import { saveSettings, type SettingsState } from "./actions";

// 설정 폼(IA-19). 오류·저장 결과는 서버 동작이 돌려준 값으로만 보여 준다(주소에 글을 싣지 않음).
// 길이 검사는 서버가 한다(브라우저의 maxLength는 UTF-16 단위라 이모지 별명과 어긋남).
export function SettingsForm({ nickname, isPublic, welcome, next }: { nickname: string; isPublic: boolean; welcome: boolean; next: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, null);
  const shown = state ?? { nickname, isPublic };
  return (
    <form action={action} className="settings-form">
      {welcome ? <input type="hidden" name="welcome" value="1" /> : null}
      <input type="hidden" name="next" value={next} />
      <label>
        별명 <span className="muted">(2~30자, 다른 사용자에게 보여요)</span>
        <input name="nickname" defaultValue={shown.nickname} required autoComplete="off" aria-invalid={state?.error ? true : undefined} aria-describedby={state?.error ? "settings-error" : undefined} />
      </label>
      <label className="check">
        <input type="checkbox" name="isPublic" defaultChecked={shown.isPublic} />
        &apos;쓰고 있어요&apos;에 내 별명 보이기
      </label>
      {/* 가입 안내(settings/page.tsx welcome)와 같은 말을 쓴다(design.md 18절 설정 IA-19) */}
      <p className="muted">켜면 기술 상세의 &apos;쓰고 있어요 n명&apos;에 내 별명이 들어가요. 끄면 수에서도 빠져요. 프로젝트·판단·기록은 켜도 꺼도 다른 사용자에게 보이지 않아요.</p>
      {state?.error ? <div id="settings-error" className="notice notice-error" role="alert"><strong>{state.error}</strong></div> : null}
      {state?.saved && !pending ? <div className="notice notice-ok" role="status"><strong>저장했어요.</strong></div> : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "저장하는 중…" : "저장"}</button>
    </form>
  );
}
