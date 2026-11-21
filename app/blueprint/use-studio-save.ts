"use client";
// 스튜디오 확정(confirm_blueprint_v2): 검사 · 관문은 DB 함수가 한다. 템플릿 저장은 하단 패널 템플릿 탭(template-tab.tsx)이 맡는다.
// 같은 내용(lib/blueprint/draft.ts contentKey)이면 같은 id로 보내 두 번 눌러도 한 줄(불변 3). 실패하면 판은 그대로(불변 4).
import { useRef, useState } from "react";
import { contentKey } from "@/lib/blueprint/draft";
import type { Graph } from "@/lib/blueprint/graph";
import { confirmGraphAction } from "./actions";

/** crypto.randomUUID는 보안 연결(HTTPS · localhost)에서만 있다. 휴대폰으로 http://내 컴퓨터 주소를 열어 시험할 때를 위해 같은 모양을 만든다 */
function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** templateId = "이 템플릿으로 시작"한 템플릿. onFail = 창을 닫았어도 실패를 알림으로 알린다 */
export function useConfirm(onDone: (id: string) => void, onFail: (message: string) => void) {
  const last = useRef({ key: "", id: "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const confirm = async (name: string, projectId: string | null, graph: Graph, templateId: string | null) => {
    const key = contentKey([name, projectId, templateId], graph);
    if (key !== last.current.key) last.current = { key, id: uuid() };
    const id = last.current.id;
    setBusy(true); setError("");
    const r = await confirmGraphAction({ id, name, projectId, graph, templateId }).catch(() => ({ ok: false as const, message: "확정하지 못했어요. 판은 그대로 있어요. 잠시 뒤 다시 시도해 주세요." }));
    setBusy(false);
    if (r.ok) onDone(id); else { setError(r.message); onFail(r.message); }
  };
  return { confirm, busy, error, reset: () => setError("") };
}
