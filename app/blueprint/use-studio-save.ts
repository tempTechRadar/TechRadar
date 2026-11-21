"use client";
// 스튜디오 확정(confirm_blueprint_v2): 검사 · 관문은 DB 함수가 한다. 템플릿 저장은 하단 패널 템플릿 탭(template-tab.tsx)이 맡는다.
// 같은 내용(단계 id · 이름 · 기술 + 연결선)이면 같은 id로 보내 두 번 눌러도 한 줄(불변 3), 위치만 옮긴 것은 같은 내용. 실패하면 판은 그대로(불변 4).
import { useRef, useState } from "react";
import type { Graph } from "@/lib/blueprint/graph";
import { confirmGraphAction } from "./actions";

const contentKey = (head: unknown[], g: Graph) => JSON.stringify([...head, g.stages.map((s) => [s.id, s.name, s.techs.map((t) => t.id)]), g.edges]);
/** 내용마다 id 하나(새 내용이면 새 id) */
function useStableId() {
  const last = useRef({ key: "", id: "" });
  return (key: string) => { if (key !== last.current.key) last.current = { key, id: crypto.randomUUID() }; return last.current.id; };
}

/** templateId = "이 템플릿으로 시작"한 템플릿(조합의 남의 기술은 이 id가 있어야 DB 관문을 지남) */
export function useConfirm(onDone: (id: string) => void) {
  const idFor = useStableId();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const confirm = async (name: string, projectId: string | null, graph: Graph, templateId: string | null) => {
    const id = idFor(contentKey([name, projectId, templateId], graph));
    setBusy(true); setError("");
    const r = await confirmGraphAction({ id, name, projectId, graph, templateId }).catch(() => ({ ok: false as const, message: "확정하지 못했어요. 판은 그대로 있어요. 잠시 뒤 다시 시도해 주세요." }));
    setBusy(false);
    if (r.ok) onDone(id); else setError(r.message);
  };
  return { confirm, busy, error, reset: () => setError("") };
}
