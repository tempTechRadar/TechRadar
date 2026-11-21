"use client";

// 관리자만 보이는 "숨기기"(ADR 0036 4). 관리자 확인은 DB 함수가 다시 한다(화면 단추만 믿지 않음, 불변 5).
// 숨긴 뒤에도 이 카드는 그대로 두고 결과와 "되돌리기"를 보인다(잘못 숨겨도 바로 되돌리게, 화면 읽기에도 결과가 전해지게).
// shortcut: 다시 들어오면 숨긴 템플릿은 갤러리에서 빠져 여기서 되돌릴 수 없다. 관리자 템플릿 목록이 생기면 거기서
import { useState, useTransition } from "react";
import { AskDialog } from "../../c-dialog";
import { hideTemplateAction } from "../actions";

export function HideButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const toggle = () => start(async () => {
    const r = await hideTemplateAction(id, !hidden);
    if (r.ok) setHidden(!hidden);
    setMessage(r.ok ? (hidden ? "다시 보이게 했어요." : "숨겼어요. 새로 고치면 갤러리에서 빠져요.") : r.message);
  });
  const label = pending ? "처리 중…" : hidden ? "되돌리기" : "숨기기";
  return (
    <>
      <button type="button" className="chip" onClick={hidden ? toggle : () => setAsking(true)} disabled={pending} aria-label={`${name} 템플릿 ${label}(관리자)`}>{label}</button>
      <span role="status" aria-live="polite" className="muted">{message}</span>
      {asking ? <AskDialog title="갤러리에서 숨길까요?" yes="숨기기" onYes={() => { setAsking(false); toggle(); }} onClose={() => setAsking(false)}>
        <p>&quot;{name}&quot; 템플릿을 갤러리에서 숨겨요. 만든 사람은 계속 볼 수 있어요.</p>
      </AskDialog> : null}
    </>
  );
}
